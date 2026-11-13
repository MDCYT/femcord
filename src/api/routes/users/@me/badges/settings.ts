import { Request, Response, Router } from "express";
import { route } from "@spacebar/api/middlewares";
import { badgeSettings, mergeBadgeSettings } from "@spacebar/api/util/utility/badgeSettings";
import { loadBadgeOwner, localProfileBadges, normalizeBadgeSettings } from "@spacebar/api/util/utility/profileBadges";
import { User } from "@spacebar/database";

const router: Router = Router({ mergeParams: true });

router.patch(
    "/",
    route({
        description: "Reorder the badges on your profile and hide some of them. Staff badges always show first, and staff and pride badges can't be hidden.",
    }),
    async (req: Request, res: Response) => {
        const { user } = await loadBadgeOwner(req.user_id, req.user_id);
        const badges = await localProfileBadges(user);
        const normalizedInput = normalizeBadgeSettings(
            {
                display_order: Array.isArray(req.body?.display_order) ? req.body.display_order.map(String) : [],
                hidden_badges: Array.isArray(req.body?.hidden_badges) ? req.body.hidden_badges.map(String) : [],
            },
            badges,
        );
        const settings = mergeBadgeSettings(
            normalizeBadgeSettings(badgeSettings(user), badges),
            badges.map((badge) => ({ id: badge.settings_id })),
            {
                display_order: req.body?.display_order !== undefined ? normalizedInput.display_order : undefined,
                hidden_badges: req.body?.hidden_badges !== undefined ? normalizedInput.hidden_badges : undefined,
            },
        );
        await User.setAccountPreferences(user.id, { badge_settings: settings });
        const formatId = (id: string) => {
            const num = Number(id);
            return Number.isSafeInteger(num) && String(num) === id && num < 1_000_000 ? num : id;
        };
        res.json({
            display_order: settings.display_order.map(formatId),
            hidden_badges: settings.hidden_badges.map(formatId),
        });
    },
);

export default router;
