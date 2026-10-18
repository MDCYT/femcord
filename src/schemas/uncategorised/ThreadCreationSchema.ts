import { GuildIdList } from "./GuildCappedLists";
import { BaseMessageComponents, ChannelType, Embed } from "@spacebar/schemas/api";
import { MessageActivity } from "./MessageActivity";
import { MessageCreateAttachment, MessageCreateCloudAttachment } from "./MessageCreateSchema";

export interface ThreadCreationSchema {
    auto_archive_duration?: number;
    rate_limit_per_user?: number;
    /**
     * @minLength 1
     * @maxLength 100
     */
    name: string;
    type?: ChannelType.GUILD_PUBLIC_THREAD | ChannelType.GUILD_PRIVATE_THREAD | ChannelType.GUILD_NEWS_THREAD;
    invitable?: boolean;
    /**
     * @maxItems 5
     */
    applied_tags?: GuildIdList;
    /**
     * @maxLength 100
     */
    location?: string; //Ignore it
    message?: {
        content?: string;
        embeds?: Embed[];
        allowed_mentions?: {
            parse?: string[];
            roles?: string[];
            users?: string[];
            replied_user?: boolean;
        };
        components?: BaseMessageComponents[] | null;
        sticker_ids?: string[];
        activity?: MessageActivity;
        application_id?: string;
        flags?: number;
        attachments?: (MessageCreateAttachment | MessageCreateCloudAttachment)[];
    };
}
