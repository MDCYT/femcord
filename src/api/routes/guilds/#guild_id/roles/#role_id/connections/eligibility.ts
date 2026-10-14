import { Request, Response, Router } from "express";
import { route } from "@spacebar/api/middlewares";
import { Member, Role } from "@spacebar/database";

const router = Router({ mergeParams: true });

router.get("/", route({}), async (req: Request, res: Response) => {
    const { guild_id, role_id } = req.params as { [key: string]: string };
    await Member.IsInGuildOrFail(req.user_id, guild_id);
    const role = await Role.findOneOrFail({ where: { id: role_id, guild_id } });

    if (!role.connection_configurations || role.connection_configurations.length === 0) {
        return res.json([]);
    }

    res.json(role.connection_configurations.flat());
});

export default router;
