import { DisplayNameColorList } from "@spacebar/schemas";

export interface MemberChangeSchema {
    /**
     * @maxItems 1000
     * @items.type string
     * @items.maxLength 64
     */
    roles?: string[];
    /**
     * @maxLength 32
     */
    nick?: string | null;
    avatar?: string | null;
    /**
     * @maxLength 190
     */
    bio?: string;
    /**
     * @maxLength 64
     */
    communication_disabled_until?: string | null;
    /**
     * @maxLength 64
     */
    channel_id?: string | null;
    /**
     * @maxLength 1024
     */
    avatar_description?: string | null;
    /**
     * @maxLength 64
     */
    avatar_id?: string | null;
    /**
     * @maxLength 64
     */
    avatar_decoration_sku_id?: string | null;
    collectibles?: { nameplate: { sku_id: string } | null } | null;
    display_name_font_id?: number | null;
    display_name_effect_id?: number | null;
    display_name_colors?: DisplayNameColorList | null;
    vad_colors?: DisplayNameColorList | null;
    mute?: boolean;
    deaf?: boolean;
}
