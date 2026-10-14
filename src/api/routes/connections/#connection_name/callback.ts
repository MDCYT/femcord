import { route } from "@spacebar/api/middlewares";
import { ConnectionStore, DiscordApiErrors, emitEvent, FieldErrors } from "@spacebar/util";
import { Request, Response, Router } from "express";
import { ConnectionCallbackSchema } from "@spacebar/schemas";

const router = Router({ mergeParams: true });

const handoffCache = new Map<string, { timestamp: number }>();

const cleanHandoffCache = () => {
    const now = Date.now();
    for (const [key, val] of handoffCache.entries()) {
        if (now - val.timestamp > 10 * 60 * 1000) {
            handoffCache.delete(key);
        }
    }
};

const handleCallback = async (req: Request, res: Response, isHandoff = false) => {
    const { connection_name } = req.params as { [key: string]: string };
    const connection = ConnectionStore.connections.get(connection_name);
    if (!connection)
        throw FieldErrors({
            provider_id: {
                code: "BASE_TYPE_CHOICES",
                message: req.t("common:field.BASE_TYPE_CHOICES", {
                    types: Array.from(ConnectionStore.connections.keys()).join(", "),
                }),
            },
        });

    if (!connection.settings.enabled)
        throw FieldErrors({
            provider_id: {
                message: "This connection has been disabled server-side.",
            },
        });

    const body = req.body as ConnectionCallbackSchema;

    // If already processed for this state, treat as success idempotently
    if (body.state && handoffCache.has(body.state)) {
        if (isHandoff) {
            return res.status(200).json({ handoff_status: 2, success_redirect: null });
        }
        return res.sendStatus(204);
    }

    let userId: string | null = null;
    if (body.state && connection.states.has(body.state)) {
        userId = connection.getUserId(body.state);
    } else if (req.user_id) {
        userId = req.user_id;
    } else if (body.state) {
        userId = connection.getUserId(body.state);
    } else {
        throw DiscordApiErrors.INVALID_OAUTH_STATE;
    }

    const connectedAccnt = await connection.handleCallback(body, userId);

    if (body.state) {
        handoffCache.set(body.state, { timestamp: Date.now() });
        cleanHandoffCache();
    }

    // whether we should emit a connections update event, only used when a connection doesnt already exist
    if (connectedAccnt)
        await emitEvent({
            event: "USER_CONNECTIONS_UPDATE",
            data: { ...connectedAccnt, token_data: undefined },
            user_id: userId,
        });

    if (isHandoff) {
        return res.status(200).json({ handoff_status: 2, success_redirect: null });
    }
    return res.sendStatus(204);
};

router.post(
    "/",
    route({
        requestBody: "ConnectionCallbackSchema",
        authentication: "never",
    }),
    async (req: Request, res: Response) => {
        return handleCallback(req, res, false);
    },
);

router.post(
    "/session-handoff",
    route({
        requestBody: "ConnectionCallbackSchema",
        authentication: "never",
    }),
    async (req: Request, res: Response) => {
        return handleCallback(req, res, true);
    },
);

router.get(
    "/session-handoff",
    route({
        authentication: "never",
    }),
    async (_req: Request, res: Response) => {
        res.status(200).json({
            handoff_status: 2,
            success_redirect: null,
        });
    },
);

export default router;
