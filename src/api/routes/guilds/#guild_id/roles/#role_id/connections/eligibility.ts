import { Request, Response, Router } from "express";
import { route } from "@spacebar/api/middlewares";
import { Application, ConnectedAccount, Member, Role } from "@spacebar/database";

const router = Router({ mergeParams: true });

function checkRuleResult(
    rule: {
        connection_type?: string;
        connection_metadata_field?: string;
        operator?: number;
        value?: string;
    },
    connections: ConnectedAccount[],
): boolean {
    if (!rule.connection_type) return true;
    const conn = connections.find(
        (c) => c.type.toLowerCase() === rule.connection_type!.toLowerCase(),
    );
    if (!conn) return false;
    if (conn.verified === false) return false;

    if (!rule.connection_metadata_field || rule.operator == null) {
        return true;
    }

    const metadata = conn.metadata_ || {};
    const val = metadata[rule.connection_metadata_field];
    if (val === undefined || val === null) return false;

    const targetVal = rule.value;
    switch (rule.operator) {
        case 1: // EQUAL
            return String(val) === String(targetVal);
        case 2: // NOT_EQUAL
            return String(val) !== String(targetVal);
        case 3: // LESS_THAN
            return Number(val) < Number(targetVal);
        case 4: // GREATER_THAN
            return Number(val) > Number(targetVal);
        default:
            return true;
    }
}

router.get("/", route({}), async (req: Request, res: Response) => {
    const { guild_id, role_id } = req.params as { [key: string]: string };
    await Member.IsInGuildOrFail(req.user_id, guild_id);
    const role = await Role.findOneOrFail({ where: { id: role_id, guild_id } });

    if (!role.connection_configurations || role.connection_configurations.length === 0) {
        return res.json([]);
    }

    const userConnections = await ConnectedAccount.find({
        where: { user_id: req.user_id, revoked: false },
    });

    // Cache applications if any rules reference application_id
    const appIds = [
        ...new Set(
            role.connection_configurations
                .flat()
                .map((r) => r.application_id)
                .filter((id): id is string => Boolean(id)),
        ),
    ];
    const appMap = new Map<string, any>();
    if (appIds.length > 0) {
        const apps = await Application.find({
            where: appIds.map((id) => ({ id })),
            relations: { bot: true },
        });
        for (const app of apps) {
            appMap.set(app.id, {
                id: app.id,
                name: app.name,
                icon: app.icon,
                description: app.description,
                bot: app.bot,
            });
        }
    }

    const result = role.connection_configurations.map((group) =>
        group.map((rule) => {
            const hasResult = checkRuleResult(rule, userConnections);
            return {
                ...rule,
                application: rule.application_id ? appMap.get(rule.application_id) || null : undefined,
                result: hasResult,
            };
        }),
    );

    res.json(result);
});

export default router;
