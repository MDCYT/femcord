import { Request, Response, Router } from "express";
import { route } from "@spacebar/api/middlewares";
import { ConnectedAccount } from "@spacebar/database";
import { ConnectionStore, DiscordApiErrors, emitEvent } from "@spacebar/util";

const router = Router({ mergeParams: true });

router.post("/", route({}), async (req: Request, res: Response) => {
    const { connection_name, connection_id } = req.params as { [key: string]: string };

    const account = await ConnectedAccount.findOne({
        where: {
            user_id: req.user_id,
            external_id: connection_id,
            type: connection_name,
        },
    });

    if (!account) throw DiscordApiErrors.UNKNOWN_CONNECTION;

    const connection = ConnectionStore.connections.get(connection_name);

    if (connection_name === "lastfm" && connection) {
        try {
            const userInfo = await (connection as any).getUserInfo?.(account.name);
            if (userInfo) {
                const playcount = userInfo.playcount ? parseInt(userInfo.playcount, 10) : (account.metadata_?.scrobbles ?? 0);
                const registered = userInfo.registered?.unixtime ? parseInt(userInfo.registered.unixtime, 10) : (account.metadata_?.registered_at ?? 0);
                account.metadata_ = {
                    ...(account.metadata_ || {}),
                    scrobbles: playcount,
                    registered_at: registered,
                    created_at: registered ? new Date(registered * 1000).toISOString() : undefined,
                    username: account.name,
                };
                account.metadata_visibility = 1;
                account.visibility = 1;
                await account.save();
            }
        } catch (e) {
            console.error(`[Connections/Lastfm] Failed to refresh metadata for ${account.name}:`, e);
        }
    }

    await emitEvent({
        event: "USER_CONNECTIONS_UPDATE",
        data: { ...account.toJSON(), token_data: undefined },
        user_id: req.user_id,
    });

    return res.json(account.toJSON());
});

export default router;
