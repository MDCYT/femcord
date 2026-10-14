export interface ConnectionCallbackSchema {
    code?: string;
    token?: string;
    state?: string;
    insecure?: boolean;
    friend_sync?: boolean;
    openid_params?: unknown; // TODO: types
    iss?: string;
}
