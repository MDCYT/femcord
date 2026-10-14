import crypto from "node:crypto";
import wretch from "wretch";
import { ConnectedAccount } from "@spacebar/database";
import { Connection, ConnectionLoader, DiscordApiErrors } from "@spacebar/util";
import { ConnectionCallbackSchema } from "@spacebar/schemas";

export class LastfmSettings {
    enabled = false;
    apiKey: string | null = null;
    apiSecret: string | null = null;
}

export interface LastfmUserGetInfoResponse {
    user: {
        name: string;
        realname?: string;
        image?: { size: string; "#text": string }[];
        url: string;
        playcount: string;
        registered: { unixtime: string; "#text": number };
    };
}

export interface LastfmSessionResponse {
    session: {
        name: string;
        key: string;
        subscriber: number;
    };
}

export default class LastfmConnection extends Connection {
    public readonly id = "lastfm";
    public friendlyName = "Last.fm";
    public setupUrl = "https://www.last.fm/api/account/create";
    public requiredScopes: string[] = [];

    public readonly authorizeUrl = "https://www.last.fm/api/auth/";
    public readonly apiUrl = "https://ws.audioscrobbler.com/2.0/";

    settings: LastfmSettings = new LastfmSettings();

    init(): void {
        this.settings = ConnectionLoader.getConnectionConfig<LastfmSettings>(this.id, this.settings);

        const envKey = (process.env.LASTFM_API_KEY || process.env.LAST_FM_API_KEY)?.trim();
        const envSecret = (process.env.LASTFM_API_SECRET || process.env.LASTFM_SHARED_SECRET || process.env.LAST_FM_API_SECRET)?.trim();

        if (envKey && envSecret) {
            this.settings.apiKey = envKey;
            this.settings.apiSecret = envSecret;
            this.settings.enabled = true;
            ConnectionLoader.setConnectionConfig(this.id, {
                enabled: true,
                apiKey: envKey,
                apiSecret: envSecret,
            }).catch((e) => console.error(`[Connections/Lastfm] Failed to persist env settings:`, e));
        }

        if (this.settings.enabled && (!this.settings.apiKey || !this.settings.apiSecret)) {
            throw new Error(`Invalid settings for connection ${this.id}`);
        }
    }

    public get isConfigured(): boolean {
        return !!this.settings.apiKey && !!this.settings.apiSecret;
    }

    /**
     * Last.fm signature generation:
     * Sort all parameters alphabetically (except api_sig itself), concatenate key + value, append secret, and MD5.
     */
    public sign(params: Record<string, string>): string {
        const secret = this.settings.apiSecret || "";
        const keys = Object.keys(params)
            .filter((k) => k !== "format" && k !== "api_sig")
            .sort();
        let str = "";
        for (const k of keys) {
            str += `${k}${params[k]}`;
        }
        str += secret;
        return crypto.createHash("md5").update(str, "utf8").digest("hex");
    }

    getAuthorizationUrl(userId: string): string {
        const state = this.createState(userId);
        const url = new URL(this.authorizeUrl);

        url.searchParams.append("api_key", (this.settings.apiKey as string) || "");
        url.searchParams.append("cb", `${this.getRedirectUri()}?state=${state}`);
        return url.toString();
    }

    async exchangeToken(token: string): Promise<LastfmSessionResponse["session"]> {
        const params: Record<string, string> = {
            method: "auth.getSession",
            api_key: this.settings.apiKey || "",
            token,
        };
        params.api_sig = this.sign(params);
        params.format = "json";

        const url = new URL(this.apiUrl);
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.append(k, v);
        }

        const res = await wretch(url.toString())
            .headers({
                Accept: "application/json",
                "User-Agent": "FemCord/1.0",
            })
            .get()
            .json<LastfmSessionResponse>()
            .catch((e) => {
                console.error("[Lastfm/exchangeToken] Error getting session:", e);
                throw DiscordApiErrors.GENERAL_ERROR;
            });

        if (!res?.session?.name || !res?.session?.key) {
            throw new Error("Invalid session response from Last.fm");
        }

        return res.session;
    }

    async getUserInfo(username: string): Promise<LastfmUserGetInfoResponse["user"] | null> {
        const url = new URL(this.apiUrl);
        url.searchParams.append("method", "user.getInfo");
        url.searchParams.append("user", username);
        url.searchParams.append("api_key", this.settings.apiKey || "");
        url.searchParams.append("format", "json");

        const res = await wretch(url.toString())
            .headers({
                Accept: "application/json",
                "User-Agent": "FemCord/1.0",
            })
            .get()
            .json<LastfmUserGetInfoResponse>()
            .catch((e) => {
                console.error("[Lastfm/getUserInfo] Error getting user info:", e);
                return null;
            });

        return res?.user ?? null;
    }

    async handleCallback(params: ConnectionCallbackSchema, explicitUserId?: string): Promise<ConnectedAccount | null> {
        const { state, code } = params;
        const rawToken = code || (params as Record<string, any>).token;

        if (!rawToken) throw new Error("No token provided");

        let userId = explicitUserId;
        if (!userId && state && this.states.has(state)) {
            userId = this.getUserId(state);
        }
        if (!userId) {
            throw DiscordApiErrors.INVALID_OAUTH_STATE;
        }

        const session = await this.exchangeToken(rawToken);
        const username = session.name;
        const externalId = username.toLowerCase();

        // Fetch user stats for metadata & linked roles
        const userInfo = await this.getUserInfo(username);
        const playcount = userInfo?.playcount ? parseInt(userInfo.playcount, 10) : 0;
        const registered = userInfo?.registered?.unixtime ? parseInt(userInfo.registered.unixtime, 10) : 0;

        const metadata = {
            scrobbles: playcount,
            registered_at: registered,
            created_at: registered ? new Date(registered * 1000).toISOString() : undefined,
            username: username,
            subscriber: session.subscriber ? 1 : 0,
        };

        const existing = await ConnectedAccount.findOne({
            where: {
                user_id: userId,
                type: this.id,
                external_id: externalId,
            },
        });

        if (existing) {
            existing.name = username;
            existing.token_data = {
                access_token: session.key,
                session_key: session.key,
                fetched_at: Date.now(),
            } as any;
            existing.metadata_ = metadata;
            existing.revoked = false;
            existing.visibility = 1;
            existing.metadata_visibility = 1;
            existing.verified = true;
            existing.show_activity = 1; // Default to showing listening activity
            await existing.save();
            return existing;
        }

        return await this.createConnection({
            token_data: {
                access_token: session.key,
                session_key: session.key,
                fetched_at: Date.now(),
            } as any,
            metadata_: metadata,
            user_id: userId,
            external_id: externalId,
            friend_sync: params.friend_sync,
            name: username,
            type: this.id,
            verified: true,
            visibility: 1,
            metadata_visibility: 1,
            show_activity: 1,
        });
    }
}
