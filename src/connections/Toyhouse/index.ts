import wretch from "wretch";
import { ConnectedAccount } from "@spacebar/database";
import { Connection, ConnectionLoader, DiscordApiErrors } from "@spacebar/util";
import { ConnectedAccountCommonOAuthTokenResponse, ConnectionCallbackSchema } from "@spacebar/schemas";
import { GenericOAuthSettings as ToyhouseSettings } from "../GenericOAuthSettings";

export interface ToyhouseUserResponse {
    id: number | string;
    username: string;
    avatar?: string;
    email?: string;
}

export default class ToyhouseConnection extends Connection {
    public readonly id = "toyhouse";
    public friendlyName = "Toyhouse";
    public setupUrl = "https://toyhou.se/~developer/apps";
    public requiredScopes: string[] = [];

    public readonly authorizeUrl = "https://toyhou.se/~oauth/authorize";
    public readonly tokenUrl = "https://toyhou.se/~oauth/token";
    public readonly userInfoUrl = "https://toyhou.se/~api/v1/me";
    public readonly scopes: string[] = [];
    settings: ToyhouseSettings = new ToyhouseSettings();

    init(): void {
        this.settings = ConnectionLoader.getConnectionConfig<ToyhouseSettings>(this.id, this.settings);

        if (this.settings.enabled && (!this.settings.clientId || !this.settings.clientSecret)) throw new Error(`Invalid settings for connection ${this.id}`);
    }

    public get isConfigured(): boolean {
        return !!this.settings.clientId && !!this.settings.clientSecret;
    }

    getAuthorizationUrl(userId: string): string {
        const state = this.createState(userId);
        const url = new URL(this.authorizeUrl);

        url.searchParams.append("client_id", this.settings.clientId as string);
        url.searchParams.append("redirect_uri", this.getRedirectUri());
        url.searchParams.append("response_type", "code");
        if (this.scopes.length > 0) {
            url.searchParams.append("scope", this.scopes.join(" "));
        }
        url.searchParams.append("state", state);
        return url.toString();
    }

    getTokenUrl(): string {
        return this.tokenUrl;
    }

    async exchangeCode(state: string, code: string): Promise<ConnectedAccountCommonOAuthTokenResponse> {
        this.validateState(state);

        const url = this.getTokenUrl();

        return wretch(url.toString())
            .headers({
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) FemCord/1.0",
            })
            .body(
                new URLSearchParams({
                    grant_type: "authorization_code",
                    client_id: this.settings.clientId as string,
                    client_secret: this.settings.clientSecret as string,
                    redirect_uri: this.getRedirectUri(),
                    code: code,
                }).toString(),
            )
            .post()
            .json<ConnectedAccountCommonOAuthTokenResponse>()
            .catch(async (e) => {
                console.error("[Toyhouse/exchangeCode] Error exchanging code:", e);
                if (e.response) {
                    try {
                        const errBody = await e.response.text();
                        console.error("[Toyhouse/exchangeCode] Response body:", errBody);
                    } catch {}
                }
                throw DiscordApiErrors.GENERAL_ERROR;
            });
    }

    async getUser(token: string): Promise<ToyhouseUserResponse> {
        const url = new URL(this.userInfoUrl);

        return wretch(url.toString())
            .headers({
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) FemCord/1.0",
            })
            .get()
            .json<ToyhouseUserResponse>()
            .catch(async (e) => {
                console.error("[Toyhouse/getUser] Error fetching user:", e);
                if (e.response) {
                    try {
                        const errBody = await e.response.text();
                        console.error("[Toyhouse/getUser] Response body:", errBody);
                    } catch {}
                }
                throw DiscordApiErrors.GENERAL_ERROR;
            });
    }

    async handleCallback(params: ConnectionCallbackSchema): Promise<ConnectedAccount | null> {
        const { state, code } = params;
        if (!code) throw new Error("No code provided");

        const userId = this.getUserId(state);
        const tokenData = await this.exchangeCode(state, code);
        const userInfo = await this.getUser(tokenData.access_token);

        const name = userInfo.username || "Toyhouse User";
        const externalId = (userInfo.id ?? "").toString();

        const existing = await ConnectedAccount.findOne({
            where: {
                user_id: userId,
                external_id: externalId,
            },
        });

        if (existing) {
            existing.name = name;
            existing.token_data = { ...tokenData, fetched_at: Date.now() };
            existing.revoked = false;
            existing.visibility = 1;
            existing.verified = true;
            await existing.save();
            return existing;
        }

        return await this.createConnection({
            token_data: { ...tokenData, fetched_at: Date.now() },
            user_id: userId,
            external_id: externalId,
            friend_sync: params.friend_sync,
            name: name,
            type: this.id,
            verified: true,
            visibility: 1,
        });
    }
}
