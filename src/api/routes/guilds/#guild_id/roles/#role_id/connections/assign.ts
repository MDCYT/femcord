import { Request, Response, Router } from "express";
import { route } from "@spacebar/api/middlewares";
import { ConnectedAccount, Member, Role } from "@spacebar/database";
import { DiscordApiErrors } from "@spacebar/util";

const router = Router({ mergeParams: true });

router.post("/", route({}), async (req: Request, res: Response) => {
    const { guild_id, role_id } = req.params as { [key: string]: string };
    await Member.IsInGuildOrFail(req.user_id, guild_id);

    const role = await Role.findOneOrFail({ where: { id: role_id, guild_id } });
    if (!role.connection_configurations || role.connection_configurations.length === 0) {
        throw DiscordApiErrors.INVALID_ROLE;
    }

    const userConnections = await ConnectedAccount.find({
        where: { user_id: req.user_id, revoked: false },
    });

    const flatRules = role.connection_configurations.flat();
    const eligible = flatRules.every((rule) => {
        if (!rule.connection_type) return true;
        return userConnections.some((c) => c.type.toLowerCase() === rule.connection_type!.toLowerCase());
    });

    if (!eligible) {
        throw DiscordApiErrors.INVALID_FORM_BODY;
    }

    await Member.addRole(req.user_id, guild_id, role_id);
    res.sendStatus(204);
});

export default router;
