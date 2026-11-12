import { User } from "@spacebar/database";
import { Config, DiscordApiErrors } from "@spacebar/util";
import { arrangeBadges, badgeSettings, isStaffBadge } from "./badgeSettings";
import { localProfileBadges, ProfileBadgeItem } from "./remoteBadges";

export const DIRECTORY_STAFF_BADGE_ID = 22;

type ProfileBadge = ProfileBadgeItem;
type BadgeOwner = Pick<User, "id" | "badge_ids" | "badge_obtained_at" | "federated_instance" | "pride_badges" | "account_preferences"> & { created_at?: Date | string };

const iconUrl = (icon: string) => `${(Config.get().cdn.endpointPublic || Config.get().api.endpointPublic || "").replace(/\/$/, "")}/badge-icons/${icon}.png`;

export const directoryBadge = (badge: ProfileBadge, hidden: boolean, user?: BadgeOwner) => {
    let obtainedAt: string | null = null;
    const userObtained = user?.badge_obtained_at?.[badge.id];
    if (userObtained) {
        const d = new Date(userObtained);
        obtainedAt = !Number.isNaN(d.getTime()) ? d.toISOString() : userObtained;
    } else if (user?.created_at) {
        const d = new Date(user.created_at);
        obtainedAt = !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    }

    return {
        badge_id: isStaffBadge(badge) ? DIRECTORY_STAFF_BADGE_ID : badge.id,
        name: badge.name || badge.description,
        description: badge.details || badge.description,
        info_label: badge.tagline || null,
        rarity: badge.rarity ?? null,
        is_legacy: Boolean(badge.is_legacy),
        owned: true,
        hidden,
        is_earnable: false,
        simple_icon_url: iconUrl(badge.icon),
        simple_icon_raster_url: iconUrl(badge.icon),
        complex_icon_static_url: iconUrl(badge.icon),
        ...(badge.icon?.endsWith(".gif") ? { complex_icon_animated_url: iconUrl(badge.icon) } : {}),
        link: badge.link ?? null,
        tiers: [],
        current_tier: null,
        next_tier: null,
        requirements: [],
        progress: [],
        obtained_at: obtainedAt,
        tier_obtained_at: null,
    };
};

export async function badgeDirectory(user: BadgeOwner, includeHidden: boolean) {
    const { visible, hidden } = arrangeBadges(await localProfileBadges(user), badgeSettings(user));
    return [
        ...visible.map((badge) => directoryBadge(badge, false, user)),
        ...(includeHidden ? hidden.map((badge) => directoryBadge(badge, true, user)) : []),
    ];
}

export async function loadBadgeOwner(userId: string, viewerId: string) {
    const id = userId === "@me" ? viewerId : userId;
    if (!/^\d{1,20}$/.test(id)) throw DiscordApiErrors.UNKNOWN_USER;
    const user = await User.findOne({
        where: { id },
        select: { id: true, badge_ids: true, badge_obtained_at: true, federated_instance: true, pride_badges: true, account_preferences: true, created_at: true },
    });
    if (!user) throw DiscordApiErrors.UNKNOWN_USER;
    return { user, self: user.id === viewerId };
}
