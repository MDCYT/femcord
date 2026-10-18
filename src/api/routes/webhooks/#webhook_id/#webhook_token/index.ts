import { Request, Response, Router } from "express";
import multer from "multer";
import { HTTPError } from "lambert-server/HTTPError";
import { route, parsePayloadJson } from "@spacebar/api/middlewares";
import { Webhook } from "@spacebar/database";
import { Config, DiscordApiErrors, emitEvent, WebhooksUpdateEvent } from "@spacebar/util";
import { applyWebhookUpdate, executeWebhook, webhookToJSON } from "@spacebar/api/util/handlers/Webhook";
import type { WebhookUpdateSchema } from "@spacebar/schemas";

const router = Router({ mergeParams: true });

router.get(
    "/",
    route({
        description: "Returns a webhook object for the given id and token.",
        responses: {
            200: {
                body: "WebhookResponse",
            },
            404: {},
        },
        authentication: "never",
    }),
    async (req: Request, res: Response) => {
        const { webhook_id, webhook_token } = req.params as { [key: string]: string };
        const webhook = await Webhook.findOne({
            where: {
                id: webhook_id,
            },
            relations: {
                user: true,
                channel: true,
                source_channel: true,
                guild: true,
                source_guild: true,
                application: true,
            },
        });

        if (!webhook) {
            throw DiscordApiErrors.UNKNOWN_WEBHOOK;
        }

        if (webhook.token !== webhook_token) {
            throw DiscordApiErrors.INVALID_WEBHOOK_TOKEN_PROVIDED;
        }

        return res.json(webhookToJSON(webhook, { withToken: true }));
    },
);

const uploadBytes = new WeakMap<Request, number>();
const uploadStorage: multer.StorageEngine = {
    _handleFile(req, file, callback) {
        let chunks: Buffer[] = [];
        let size = 0;
        let failed = false;
        const fail = (error: Error) => {
            if (failed) return;
            failed = true;
            chunks = [];
            callback(error);
        };
        file.stream.on("data", (chunk: Buffer) => {
            if (failed) return;
            const total = (uploadBytes.get(req) ?? 0) + chunk.length;
            uploadBytes.set(req, total);
            if (total > 100 * 1024 * 1024) return fail(new multer.MulterError("LIMIT_FILE_SIZE", file.fieldname));
            size += chunk.length;
            chunks.push(chunk);
        });
        file.stream.on("error", fail);
        file.stream.on("limit", () => fail(new multer.MulterError("LIMIT_FILE_SIZE", file.fieldname)));
        file.stream.on("end", () => {
            if (!failed) callback(null, { buffer: Buffer.concat(chunks), size });
        });
    },
    _removeFile(_req, file, callback) {
        delete (file as Partial<Express.Multer.File>).buffer;
        callback(null);
    },
};
const messageUpload = (req: Request, res: Response, next: import("express").NextFunction) => {
    const limits = Config.get().limits.message;
    return multer({
        limits: {
            fileSize: Math.min(limits.maxAttachmentSize, 25 * 1024 * 1024),
            files: Math.min(limits.maxAttachments, 10),
            fields: 10,
            parts: 20,
            fieldSize: 1024 * 1024,
        },
        storage: uploadStorage,
    }).any()(req, res, (error) => next(error instanceof multer.MulterError ? new HTTPError(error.message, 413) : error));
};

// https://discord.com/developers/docs/resources/webhook#execute-webhook
router.post(
    "/",
    async (req, _res, next) => {
        const { webhook_id, webhook_token } = req.params as { [key: string]: string };
        const webhook = await Webhook.findOne({
            where: { id: webhook_id },
            select: { id: true, token: true },
        });
        if (!webhook) throw DiscordApiErrors.UNKNOWN_WEBHOOK;
        if (webhook.token !== webhook_token) throw DiscordApiErrors.INVALID_WEBHOOK_TOKEN_PROVIDED;
        next();
    },
    messageUpload,
    parsePayloadJson,
    route({
        requestBody: "WebhookExecuteSchema",
        stripNulls: true,
        query: {
            wait: {
                type: "boolean",
                required: false,
                description: "waits for server confirmation of message send before response, and returns the created message body",
            },
            thread_id: {
                type: "string",
                required: false,
                description: "Send a message to the specified thread within a webhook's channel.",
            },
            with_components: {
                type: "boolean",
                required: false,
                description: "Whether to respect the components field of the request.",
            },
        },
        responses: {
            204: {},
            400: {
                body: "APIErrorResponse",
            },
            404: {},
        },
        authentication: "never",
    }),
    executeWebhook,
);

router.delete(
    "/",
    route({
        responses: {
            204: {},
            400: {
                body: "APIErrorResponse",
            },
            404: {},
        },
        authentication: "never",
    }),
    async (req: Request, res: Response) => {
        const { webhook_id, webhook_token } = req.params as { [key: string]: string };

        const webhook = await Webhook.findOne({
            where: {
                id: webhook_id,
            },
            relations: { channel: true, guild: true, application: true },
        });

        if (!webhook) throw DiscordApiErrors.UNKNOWN_WEBHOOK;
        if (webhook.token !== webhook_token) throw DiscordApiErrors.INVALID_WEBHOOK_TOKEN_PROVIDED;

        const channel_id = webhook.channel_id;
        await Webhook.delete({ id: webhook_id });

        await emitEvent({
            event: "WEBHOOKS_UPDATE",
            channel_id,
            data: {
                channel_id,
                guild_id: webhook.guild_id!, // TODO: is this even the right fix?
            },
        } satisfies WebhooksUpdateEvent);

        res.sendStatus(204);
    },
);

router.patch(
    "/",
    route({
        requestBody: "WebhookUpdateSchema",
        responses: {
            200: {},
            400: {
                body: "APIErrorResponse",
            },
            403: {},
            404: {},
        },
        authentication: "never",
    }),
    async (req: Request, res: Response) => {
        const { webhook_id, webhook_token } = req.params as { [key: string]: string };
        const body = req.body as WebhookUpdateSchema;

        const webhook = await Webhook.findOne({
            where: { id: webhook_id },
            relations: {
                user: true,
                channel: true,
                source_channel: true,
                guild: true,
                source_guild: true,
                application: true,
            },
        });

        if (!webhook) throw DiscordApiErrors.UNKNOWN_WEBHOOK;
        if (webhook.token != webhook_token) throw DiscordApiErrors.INVALID_WEBHOOK_TOKEN_PROVIDED;

        const channel_id = webhook.channel_id;
        await applyWebhookUpdate(webhook, body, false);

        await Promise.all([
            webhook.save(),
            emitEvent({
                event: "WEBHOOKS_UPDATE",
                channel_id,
                data: {
                    channel_id,
                    guild_id: webhook.guild_id!, //TODO: is this even the right fix?
                },
            } satisfies WebhooksUpdateEvent),
        ]);
        res.json(webhookToJSON(webhook, { withToken: true }));
    },
);

export default router;
