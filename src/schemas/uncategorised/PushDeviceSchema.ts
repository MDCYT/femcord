export interface PushDeviceSchema {
    provider: string;
    token: string;
    voip_provider?: string | null;
    voip_token?: string | null;
    bypass_server_throttling_supported?: boolean;
    bundle_id?: string | null;
}

export interface PushDeviceSyncSchema {
    provider: string;
    token: string;
    push_sync_tokens?: string[];
}

export interface PushDeviceSyncTokenResponse {
    token: string;
}

export interface PushDeviceSyncResponse {
    invalid_push_sync_tokens: string[];
}
