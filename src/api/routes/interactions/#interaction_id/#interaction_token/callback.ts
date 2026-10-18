import { Request, Response, Router } from "express";
import multer from "multer";
import { route, parsePayloadJson } from "@spacebar/api/middlewares";
import { InteractionCallbacksSchema } from "@spacebar/schemas";
import { ApiError, Config, DiscordApiErrors, pendingInteractions } from "@spacebar/util";
import { processInteractionCallback } from "@spacebar/api/util/handlers/Interaction";

const router = Router({ mergeParams: true });

const upload = multer({
    limits: { fileSize: Config.get().limits.message.maxAttachmentSize, fields: 10 },
    storage: multer.memoryStorage(),
});

router.post(
    "/",
    upload.any(),
    parsePayloadJson,
    route({
        stripNulls: true,
        requestBody: "InteractionCallbacksSchema",
        authentication: "never",
        query: {
            with_response: {
                type: "boolean",
                required: false,
                description: "Whether to return the interaction callback response",
            },
        },
    }),
    async (req: Request, res: Response) => {
        const interaction = pendingInteractions.get(req.params.interaction_id as string);
        if (!interaction || interaction.token !== req.params.interaction_token) throw DiscordApiErrors.UNKNOWN_INTERACTION;
        if (interaction.acknowledged) throw new ApiError("Interaction has already been acknowledged.", 40060, 400);
        const response = await processInteractionCallback(interaction, req.body as InteractionCallbacksSchema, (req.files as Express.Multer.File[]) ?? []);
        if (req.query.with_response !== "true") return res.sendStatus(204);
        return res.json(response);
    },
);

export default router;
