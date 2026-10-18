import { GuildIdList } from "./GuildCappedLists";

export interface ApplicationEmojiModifySchema {
    name?: string;
}

export interface EmojiModifySchema {
    /**
     * @maxLength 32
     */
    name?: string;
    /**
     * @maxItems 1000
     */
    roles?: GuildIdList;
}
