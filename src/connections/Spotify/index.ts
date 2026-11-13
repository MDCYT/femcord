import wretch from "wretch";
import { ConnectedAccount } from "@spacebar/database";
import { ApiError, ConnectionLoader, DiscordApiErrors, RefreshableConnection } from "@spacebar/util";
import { ConnectedAccountCommonOAuthTokenResponse, ConnectionCallbackSchema } from "@spacebar/schemas";
import { GenericOAuthSettings as SpotifySettings } from "../GenericOAuthSettings";

export interface UserResponse {
    display_name?: string | null;
    id: string;
}

export interface TokenErrorResponse {
    error: string;
    error_description: string;
}

export interface ErrorResponse {
    error: {
        status: number;
        message: string;
    };
}

async function extractErrorMessage(e: any, defaultMsg: string): Promise<string> {
    try {
        let text = "";
        if (e?.response && typeof e.response.clone === "function") {
            text = await e.response.clone().text();
        } else if (e?.message) {
            text = e.message;
        }
        if (text) {
            try {
                const json = JSON.parse(text);
                if (json.error_description) return json.error_description;
                if (json.error?.message) return json.error.message;
                if (json.error && typeof json.error === "string") return json.error;
                if (json.message) return json.message;
            } catch {
                if (text.length < 200 && !text.startsWith("<")) return text;
            }
        }
    } catch {}
    return defaultMsg;
}

export default class SpotifyConnection extends RefreshableConnection {
    public readonly id = "spotify";
    public friendlyName = "Spotify";
    public setupUrl = "https://developer.spotify.com";
    public requiredScopes = ["Requires instance admin to have spotify premium"];

    public readonly authorizeUrl = "https://accounts.spotify.com/authorize";
    public readonly tokenUrl = "https://accounts.spotify.com/api/token";
    public readonly userInfoUrl = "https://api.spotify.com/v1/me";
    public readonly scopes = ["user-read-private", "user-read-playback-state", "user-modify-playback-state", "user-read-currently-playing"];
    settings: SpotifySettings = new SpotifySettings();

    init(): void {
        this.refreshEnabled = true;

        this.settings = ConnectionLoader.getConnectionConfig<SpotifySettings>(this.id, this.settings);

        const envId = process.env.SPOTIFY_CLIENT_ID?.trim();
        const envSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
        if (envId && envSecret) {
            this.settings.clientId = envId;
            this.settings.clientSecret = envSecret;
            this.settings.enabled = true;
            ConnectionLoader.setConnectionConfig(this.id, {
                enabled: true,
                clientId: envId,
                clientSecret: envSecret,
            }).catch((e) => console.error(`[Connections/Spotify] Failed to persist env settings:`, e));
        }

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
        url.searchParams.append("scope", this.scopes.join(" "));
        url.searchParams.append("state", state);
        return url.toString();
    }

    getTokenUrl(): string {
        return this.tokenUrl;
    }

    async exchangeCode(state: string, code: string): Promise<ConnectedAccountCommonOAuthTokenResponse> {
        if (state && this.states.has(state)) {
            this.states.delete(state);
        }

        const url = this.getTokenUrl();

        return wretch(url.toString())
            .headers({
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${Buffer.from(`${this.settings.clientId as string}:${this.settings.clientSecret as string}`).toString("base64")}`,
            })
            .body(
                new URLSearchParams({
                    grant_type: "authorization_code",
                    code: code,
                    redirect_uri: this.getRedirectUri(),
                }),
            )
            .post()
            .json<ConnectedAccountCommonOAuthTokenResponse>()
            .catch(async (e) => {
                const details = await extractErrorMessage(e, "Error al autenticar con Spotify");
                console.error(`[Spotify/exchangeCode] Error exchanging code with Spotify:`, details, e);
                throw new ApiError(details, e.status || 400);
            });
    }

    async refreshToken(connectedAccount: ConnectedAccount): Promise<ConnectedAccountCommonOAuthTokenResponse> {
        if (!connectedAccount.token_data?.refresh_token) throw new Error("No refresh token available.");
        const refresh_token = connectedAccount.token_data.refresh_token;
        const url = this.getTokenUrl();

        return wretch(url.toString())
            .headers({
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${Buffer.from(`${this.settings.clientId as string}:${this.settings.clientSecret as string}`).toString("base64")}`,
            })
            .body(
                new URLSearchParams({
                    grant_type: "refresh_token",
                    refresh_token,
                }),
            )
            .post()
            .unauthorized(async () => {
                // assume the token was revoked
                await connectedAccount.revoke();
                throw DiscordApiErrors.CONNECTION_REVOKED;
            })
            .json<ConnectedAccountCommonOAuthTokenResponse>()
            .catch(async (e) => {
                const details = await extractErrorMessage(e, "Error al refrescar token de Spotify");
                console.error(`[Spotify/refreshToken] Error refreshing Spotify token:`, details, e);
                throw new ApiError(details, e.status || 400);
            });
    }

    async getUser(token: string): Promise<UserResponse> {
        const url = new URL(this.userInfoUrl);

        return wretch(url.toString())
            .headers({
                Authorization: `Bearer ${token}`,
            })
            .get()
            .json<UserResponse>()
            .catch(async (e) => {
                const details = await extractErrorMessage(e, "Error al obtener perfil de Spotify");
                console.error(`[Spotify/getUser] Error fetching Spotify profile:`, details, e);
                throw new ApiError(details, e.status || 400);
            });
    }

    async handleCallback(params: ConnectionCallbackSchema, explicitUserId?: string): Promise<ConnectedAccount | null> {
        const { state, code } = params;
        const rawCode = code || (params as Record<string, any>).token;
        if (!rawCode) throw new ApiError("No se recibió el código de autorización", 400);

        let userId = explicitUserId;
        if (!userId && state && this.states.has(state)) {
            userId = this.getUserId(state);
        }
        if (!userId) {
            throw DiscordApiErrors.INVALID_OAUTH_STATE;
        }

        const tokenData = await this.exchangeCode(state, rawCode);
        const userInfo = await this.getUser(tokenData.access_token);

        const externalId = userInfo.id;
        const displayName = userInfo.display_name?.trim() || userInfo.id;

        const existing = await ConnectedAccount.findOne({
            where: {
                user_id: userId,
                type: this.id,
                external_id: externalId,
            },
        });

        if (existing) {
            existing.name = displayName;
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
            name: displayName,
            type: this.id,
            verified: true,
            visibility: 1,
        });
    }
}
