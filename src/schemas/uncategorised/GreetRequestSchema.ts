import { GuildIdList } from "./GuildCappedLists";
import { AllowedMentions } from "@spacebar/schemas";

export interface GreetRequestSchema {
    /**
     * @maxItems 3
     */
    sticker_ids: GuildIdList;
    allowed_mentions?: AllowedMentions;
    message_reference?: {
        message_id: string;
        channel_id?: string;
        guild_id?: string;
        fail_if_not_exists?: boolean;
    };
}
