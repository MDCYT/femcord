import { Request, Response, Router } from "express";
import { route } from "@spacebar/api/middlewares";
import { BulkBanSchema } from "@spacebar/schemas";
import { Config, DiscordApiErrors, FieldErrors } from "@spacebar/util";
import { banDeleteSeconds, bannableUsers, banUsers } from "@spacebar/api/util";
import { auditLogReason } from "@spacebar/api/util/utility/fieldCaps";

const router: Router = Router({ mergeParams: true });

router.post(
    "/",
    route({
        requestBody: "BulkBanSchema",
        permission: ["BAN_MEMBERS", "MANAGE_GUILD"],
        responses: {
            200: {
                body: "Ban",
            },
            400: {
                body: "APIErrorResponse",
            },
            403: {
                body: "APIErrorResponse",
            },
        },
    }),
    async (req: Request, res: Response) => {
        const { guild_id } = req.params as { [key: string]: string };
        const body = (req.body ?? {}) as BulkBanSchema;
        const userIds = Array.isArray(body.user_ids) ? [...new Set(body.user_ids.map(String))] : null;
        const max = Config.get().limits.guild.maxBulkBanUsers;
        if (!userIds?.length || userIds.length > max)
            throw FieldErrors({
                user_ids: {
                    code: "BASE_TYPE_BAD_LENGTH",
                    message: `Must be between 1 and ${max} in length.`,
                },
            });
        const delete_message_seconds = banDeleteSeconds(body);
        const reason = auditLogReason(req.headers["x-audit-log-reason"]);
        const valid = userIds.filter((user_id) => /^\d{1,20}$/.test(user_id));
        const allowed = await bannableUsers(guild_id, req.user_id, valid);
        const { banned } = await banUsers({
            guild_id,
            user_ids: allowed,
            executor_id: req.user_id,
            reason,
            delete_message_seconds,
        });
        const banned_users = userIds.filter((user_id) => banned.includes(user_id));
        const failed_users = userIds.filter((user_id) => !banned.includes(user_id));

        if (!banned_users.length) throw DiscordApiErrors.BULK_BAN_FAILED;
        return res.json({ banned_users, failed_users });
    },
);

export default router;
