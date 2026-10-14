import { Request, Response, Router } from "express";
import { route } from "@spacebar/api/middlewares";
import { Member, Role } from "@spacebar/database";
import { emitEvent, GuildRoleUpdateEvent } from "@spacebar/util";

const router = Router({ mergeParams: true });

router.get("/", route({}), async (req: Request, res: Response) => {
    const { guild_id, role_id } = req.params as { [key: string]: string };
    await Member.IsInGuildOrFail(req.user_id, guild_id);
    const role = await Role.findOneOrFail({ where: { id: role_id, guild_id } });
    res.json(role.connection_configurations || []);
});

router.put("/", route({ permission: "MANAGE_ROLES" }), async (req: Request, res: Response) => {
    const { guild_id, role_id } = req.params as { [key: string]: string };
    const role = await Role.findOneOrFail({ where: { id: role_id, guild_id } });

    const configs = Array.isArray(req.body) ? req.body : [];
    role.connection_configurations = configs.length > 0 ? configs : undefined;

    if (configs.length > 0) {
        role.tags = { ...(role.tags || {}), guild_connections: null };
    } else if (role.tags) {
        const { guild_connections, ...rest } = role.tags;
        role.tags = Object.keys(rest).length > 0 ? rest : undefined;
    }

    await role.save();

    await emitEvent({
        event: "GUILD_ROLE_UPDATE",
        guild_id,
        data: {
            guild_id,
            role,
        },
    } satisfies GuildRoleUpdateEvent);

    res.json(configs);
});

export default router;
