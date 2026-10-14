import { Request, Response, Router } from "express";
import { route } from "@spacebar/api/middlewares";
import { ConnectedAccount, Member, Role } from "@spacebar/database";
import { DiscordApiErrors } from "@spacebar/util";

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

    const isEligible = role.connection_configurations.some((group) =>
        group.every((rule) => checkRuleResult(rule, userConnections)),
    );

    if (!isEligible) {
        throw DiscordApiErrors.INVALID_FORM_BODY;
    }

    await Member.addRole(req.user_id, guild_id, role_id);
    res.sendStatus(204);
});

export default router;
