import { Request, Response, Router } from "express";
import { route } from "@spacebar/api/middlewares";
import { Member, Role } from "@spacebar/database";

const router = Router({ mergeParams: true });

router.get("/", route({}), async (req: Request, res: Response) => {
    const { guild_id } = req.params as { [key: string]: string };
    await Member.IsInGuildOrFail(req.user_id, guild_id);

    const roles = await Role.find({ where: { guild_id } });
    const result = roles
        .filter((r) => r.connection_configurations && r.connection_configurations.length > 0)
        .map((r) => ({
            role_id: r.id,
            rules: r.connection_configurations,
            applications: {},
        }));

    res.json(result);
});

export default router;
