export interface PushDeviceSchema {
    /**
     * @maxLength 32
     */
    provider: string;
    /**
     * @maxLength 4096
     */
    token: string;
    /**
     * @maxLength 32
     */
    voip_provider?: string | null;
    /**
     * @maxLength 4096
     */
    voip_token?: string | null;
    bypass_server_throttling_supported?: boolean;
    /**
     * @maxLength 256
     */
    bundle_id?: string | null;
}

export interface PushDeviceSyncSchema {
    /**
     * @maxLength 32
     */
    provider: string;
    /**
     * @maxLength 4096
     */
    token: string;
    /**
     * @maxItems 20
     * @items.type string
     * @items.maxLength 512
     */
    push_sync_tokens?: string[];
}

export interface PushDeviceSyncTokenResponse {
    token: string;
}

export interface PushDeviceSyncResponse {
    invalid_push_sync_tokens: string[];
}
