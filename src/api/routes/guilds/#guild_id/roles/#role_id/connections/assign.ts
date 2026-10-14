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

    let numVal: number = Number(val);
    if (rule.connection_metadata_field === "created_at") {
        const createdMs = typeof val === "number" ? (val < 10000000000 ? val * 1000 : val) : new Date(val).getTime();
        numVal = Math.floor((Date.now() - createdMs) / (1000 * 60 * 60 * 24));
    }

    const targetVal = rule.value;
    switch (rule.operator) {
        case 1: { // EQUAL
            if (typeof val === "boolean" || targetVal === "1" || targetVal === "0" || targetVal === "true" || targetVal === "false") {
                const bVal = val === true || val === 1 || val === "1" || val === "true";
                const bTarget = targetVal === "1" || targetVal === "true";
                if (bTarget || targetVal === "0" || targetVal === "false") {
                    return bVal === bTarget;
                }
            }
            return String(val).toLowerCase() === String(targetVal).toLowerCase();
        }
        case 2: { // NOT_EQUAL
            if (typeof val === "boolean" || targetVal === "1" || targetVal === "0" || targetVal === "true" || targetVal === "false") {
                const bVal = val === true || val === 1 || val === "1" || val === "true";
                const bTarget = targetVal === "1" || targetVal === "true";
                if (bTarget || targetVal === "0" || targetVal === "false") {
                    return bVal !== bTarget;
                }
            }
            return String(val).toLowerCase() !== String(targetVal).toLowerCase();
        }
        case 3: // LESS_THAN
            return !isNaN(numVal) && targetVal != null ? numVal < Number(targetVal) : false;
        case 4: // GREATER_THAN
            return !isNaN(numVal) && targetVal != null ? numVal > Number(targetVal) : false;
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
