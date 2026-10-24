export interface ConnectionCallbackSchema {
    /**
     * @maxLength 2048
     */
    code?: string;
    token?: string;
    /**
     * @maxLength 512
     */
    state: string;
    insecure?: boolean;
    friend_sync?: boolean;
    openid_params?: unknown; // TODO: types
    iss?: string;
}
