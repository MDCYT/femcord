export interface DmChannelCreateSchema {
    /**
     * @maxLength 100
     */
    name?: string;
    /**
     * @maxItems 1000
     * @items.type string
     * @items.maxLength 64
     */
    recipients?: string[];
    /**
     * @maxLength 64
     */
    recipient_id?: string;
    /**
     * @maxItems 100
     * @items.type string
     * @items.maxLength 512
     */
    access_tokens?: string[]; //Ignored in Spacebar for now, but makes bots happy
}
