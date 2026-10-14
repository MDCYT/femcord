import { Request, Response, Router } from "express";
import { route } from "@spacebar/api/middlewares";
import { Application, Member, Role } from "@spacebar/database";

const router = Router({ mergeParams: true });

router.get("/", route({}), async (req: Request, res: Response) => {
    const { guild_id } = req.params as { [key: string]: string };
    await Member.IsInGuildOrFail(req.user_id, guild_id);

    const roles = await Role.find({ where: { guild_id } });
    const linkedRoles = roles.filter(
        (r) => r.connection_configurations && r.connection_configurations.length > 0,
    );

    const allAppIds = [
        ...new Set(
            linkedRoles
                .flatMap((r) => r.connection_configurations || [])
                .flat()
                .map((rule) => rule.application_id)
                .filter((id): id is string => Boolean(id)),
        ),
    ];

    const applications: Record<string, any> = {};
    if (allAppIds.length > 0) {
        const apps = await Application.find({
            where: allAppIds.map((id) => ({ id })),
            relations: { bot: true },
        });
        for (const app of apps) {
            applications[app.id] = {
                id: app.id,
                name: app.name,
                icon: app.icon,
                description: app.description,
                bot: app.bot,
            };
        }
    }

    const result = linkedRoles.map((r) => ({
        role_id: r.id,
        rules: r.connection_configurations,
        applications,
    }));

    res.json(result);
});

export default router;
