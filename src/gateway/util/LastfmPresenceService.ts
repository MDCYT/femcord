import wretch from "wretch";
import { ConnectedAccount, Session } from "@spacebar/database";
import { broadcastPresence, emitSessionsReplace } from "@spacebar/util";
import { Activity } from "@spacebar/util/interfaces/Activity";
import { ConnectionLoader } from "@spacebar/util/connections/ConnectionLoader";
import LastfmConnection, { LastfmSettings } from "../../connections/Lastfm";

let serviceTimer: NodeJS.Timeout | undefined;
let isStopping = false;

interface RecentTrack {
    name: string;
    artist: {
        "#text": string;
        name?: string;
    };
    album: {
        "#text": string;
    };
    image?: {
        size: string;
        "#text": string;
    }[];
    "@attr"?: {
        nowplaying?: string;
    };
}

interface RecentTracksResponse {
    recenttracks?: {
        track?: RecentTrack[] | RecentTrack;
        "@attr"?: {
            total?: string;
            user?: string;
        };
    };
}

interface SpotifyTrackResult {
    id: string;
    name: string;
    artist: string;
    album: string;
    albumId?: string;
    artistIds?: string[];
    durationMs: number;
    imageHash?: string;
}

interface UserTrackState {
    trackKey: string;
    startTime: number;
    durationMs: number;
    spotifyInfo: SpotifyTrackResult | null;
    trackName: string;
    artistName: string;
    albumName: string;
    lastfmImg?: string;
}

export class LastfmPresenceService {
    private static running = false;
    private static trackStateMap = new Map<string, UserTrackState>(); // userId -> state
    private static spotifyToken: string | null = null;
    private static spotifyTokenExpiresAt = 0;

    public static start() {
        if (serviceTimer || isStopping) return;
        // Check every 12 seconds
        serviceTimer = setInterval(() => {
            void LastfmPresenceService.tick().catch((e) => console.error("[LastfmPresence] Tick error:", e));
        }, 12_000).unref();
        console.log("[LastfmPresence] Background sync service started");
    }

    public static stop() {
        isStopping = true;
        if (serviceTimer) {
            clearInterval(serviceTimer);
            serviceTimer = undefined;
        }
    }

    private static async getSpotifyToken(): Promise<string | null> {
        if (this.spotifyToken && Date.now() < this.spotifyTokenExpiresAt) {
            return this.spotifyToken;
        }
        const clientId = process.env.SPOTIFY_CLIENT_ID;
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
        if (!clientId || !clientSecret) return null;

        try {
            const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
            const res = await wretch("https://accounts.spotify.com/api/token")
                .headers({
                    Authorization: `Basic ${authHeader}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                })
                .body("grant_type=client_credentials")
                .post()
                .json<{ access_token: string; expires_in: number }>()
                .catch(() => null);

            if (res?.access_token) {
                this.spotifyToken = res.access_token;
                this.spotifyTokenExpiresAt = Date.now() + (res.expires_in - 60) * 1000;
                return this.spotifyToken;
            }
        } catch (e) {
            console.error("[LastfmPresence] Spotify token error:", e);
        }
        return null;
    }

    private static async searchSpotifyTrack(trackName: string, artistName: string): Promise<SpotifyTrackResult | null> {
        const token = await this.getSpotifyToken();
        if (!token) return null;

        try {
            const query = `${trackName} ${artistName}`;
            const res = await wretch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`)
                .headers({
                    Authorization: `Bearer ${token}`,
                })
                .get()
                .json<any>()
                .catch(() => null);

            const item = res?.tracks?.items?.[0];
            if (item) {
                const images = item.album?.images || [];
                const imgUrl = images[0]?.url || "";
                const imgHash = imgUrl.split("/").pop() || "";

                return {
                    id: item.id,
                    name: item.name,
                    artist: item.artists?.[0]?.name || artistName,
                    album: item.album?.name || "",
                    albumId: item.album?.id,
                    artistIds: (item.artists || []).map((a: any) => a.id),
                    durationMs: Number(item.duration_ms) || 180_000,
                    imageHash: imgHash || undefined,
                };
            }
        } catch (e) {
            console.error("[LastfmPresence] Spotify search error:", e);
        }
        return null;
    }

    private static async getLastfmTrackDuration(trackName: string, artistName: string, apiKey: string): Promise<number> {
        try {
            const url = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${apiKey}&artist=${encodeURIComponent(artistName)}&track=${encodeURIComponent(trackName)}&format=json`;
            const res = await wretch(url)
                .headers({ Accept: "application/json", "User-Agent": "FemCord/1.0" })
                .get()
                .json<any>()
                .catch(() => null);

            const durationRaw = parseInt(res?.track?.duration, 10);
            if (!isNaN(durationRaw) && durationRaw > 0) {
                return durationRaw; // Last.fm track.getInfo returns duration in milliseconds
            }
        } catch {}
        return 180_000; // default 3 minutes
    }

    private static async tick() {
        if (this.running || isStopping) return;
        this.running = true;

        try {
            const settings = ConnectionLoader.getConnectionConfig<LastfmSettings>("lastfm");
            if (!settings?.enabled || !settings?.apiKey) return;

            // Find all active sessions where status != offline
            const onlineSessions = await Session.find({
                where: { is_admin_session: false },
                select: { user_id: true, status: true, activities: true, session_id: true, last_seen: true },
            });

            const now = Date.now();
            const activeUserIds = [
                ...new Set(onlineSessions.filter((s) => s.status && s.status !== "offline" && now - (s.last_seen?.getTime() ?? 0) < 120_000).map((s) => s.user_id)),
            ];

            if (!activeUserIds.length) {
                // If no active users, clear any lingering states
                this.trackStateMap.clear();
                return;
            }

            // Find connected accounts for these active users with show_activity != 0
            const lastfmAccounts = await ConnectedAccount.find({
                where: {
                    type: "lastfm",
                    revoked: false,
                },
                select: {
                    id: true,
                    user_id: true,
                    name: true,
                    show_activity: true,
                    metadata_: true,
                },
            });

            const accountsByUserId = new Map<string, ConnectedAccount>();
            for (const acc of lastfmAccounts) {
                if (acc.show_activity !== 0 && activeUserIds.includes(acc.user_id)) {
                    accountsByUserId.set(acc.user_id, acc);
                }
            }

            // Clean up states for users that disconnected or logged off
            for (const trackedUserId of this.trackStateMap.keys()) {
                if (!accountsByUserId.has(trackedUserId)) {
                    this.trackStateMap.delete(trackedUserId);
                }
            }

            for (const [userId, account] of accountsByUserId) {
                await this.pollUser(userId, account, settings.apiKey).catch((e) => console.error(`[LastfmPresence] Error polling user ${userId}:`, e));
            }
        } finally {
            this.running = false;
        }
    }

    private static async pollUser(userId: string, account: ConnectedAccount, apiKey: string) {
        const username = account.name;
        if (!username) return;

        const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(username)}&api_key=${apiKey}&format=json&limit=1`;
        const res = await wretch(url)
            .headers({
                Accept: "application/json",
                "User-Agent": "FemCord/1.0",
            })
            .get()
            .json<RecentTracksResponse>()
            .catch(() => null);

        // Auto-update scrobbles count in metadata if changed
        const totalScrobblesStr = res?.recenttracks?.["@attr"]?.total;
        if (totalScrobblesStr) {
            const totalScrobbles = parseInt(totalScrobblesStr, 10);
            if (!isNaN(totalScrobbles) && account.metadata_?.scrobbles !== totalScrobbles) {
                account.metadata_ = {
                    ...(account.metadata_ || {}),
                    scrobbles: totalScrobbles,
                };
                await ConnectedAccount.update({ id: account.id }, { metadata_: account.metadata_ });
            }
        }

        const tracks = res?.recenttracks?.track;
        const currentTrack: RecentTrack | null = Array.isArray(tracks) ? (tracks[0] ?? null) : (tracks ?? null);

        const isNowPlaying = currentTrack?.["@attr"]?.nowplaying === "true";
        const trackName = currentTrack?.name?.trim() || "";
        const artistName = (typeof currentTrack?.artist === "string" ? currentTrack.artist : currentTrack?.artist?.["#text"])?.trim() || "";
        const albumName = currentTrack?.album?.["#text"]?.trim() || "";
        const currentTrackKey = isNowPlaying && trackName && artistName ? `${artistName} - ${trackName}` : "";

        // Fetch user sessions
        const userSessions = await Session.find({
            where: { user_id: userId, is_admin_session: false },
        });

        if (!userSessions.length) return;

        if (!currentTrackKey) {
            // User stopped listening
            if (this.trackStateMap.has(userId)) {
                this.trackStateMap.delete(userId);
                let sessionsChanged = false;
                for (const session of userSessions) {
                    const originalCount = session.activities?.length || 0;
                    session.activities = (session.activities || []).filter((a) => a.name !== "Spotify" && a.name !== "Last.fm" && (a as any).id !== "spotify:1");
                    if ((session.activities?.length || 0) !== originalCount) {
                        await session.save();
                        sessionsChanged = true;
                    }
                }
                if (sessionsChanged) {
                    await broadcastPresence(userId);
                    await emitSessionsReplace(userId);
                }
            }
            return;
        }

        // Current track is playing
        let state = this.trackStateMap.get(userId);
        let isNewTrack = false;

        if (!state || state.trackKey !== currentTrackKey) {
            isNewTrack = true;
            const spotifyInfo = await this.searchSpotifyTrack(trackName, artistName);
            let durationMs = spotifyInfo?.durationMs;
            if (!durationMs) {
                durationMs = await this.getLastfmTrackDuration(trackName, artistName, apiKey);
            }

            const images = currentTrack?.image || [];
            const lastfmImg = images.find((i) => i.size === "extralarge")?.["#text"] || images[images.length - 1]?.["#text"] || "";

            state = {
                trackKey: currentTrackKey,
                startTime: Date.now(),
                durationMs,
                spotifyInfo,
                trackName,
                artistName,
                albumName,
                lastfmImg: lastfmImg || undefined,
            };
            this.trackStateMap.set(userId, state);
        } else {
            // Same track still playing
            // If track exceeded duration + 10s grace, roll over start time (loop/repeat)
            if (Date.now() - state.startTime > state.durationMs + 10_000) {
                state.startTime = Date.now();
            }
        }

        const spotifyTrackId = state.spotifyInfo?.id || "lastfm";
        let sessionsChanged = false;

        for (const session of userSessions) {
            const hasActivity = (session.activities || []).some((a) => (a as any).id === "spotify:1" && (a as any).sync_id === spotifyTrackId);

            if (isNewTrack || !hasActivity) {
                const currentActivities: Activity[] = (session.activities || []).filter((a) => a.name !== "Spotify" && a.name !== "Last.fm" && (a as any).id !== "spotify:1");

                const largeImage = state.spotifyInfo?.imageHash
                    ? `spotify:${state.spotifyInfo.imageHash}`
                    : state.lastfmImg
                      ? state.lastfmImg.startsWith("http")
                          ? state.lastfmImg
                          : `mp:${state.lastfmImg}`
                      : undefined;

                const lastfmActivity: Activity = {
                    id: "spotify:1",
                    name: "Spotify",
                    type: 2, // LISTENING
                    details: state.spotifyInfo?.name || state.trackName,
                    state: state.spotifyInfo?.artist || state.artistName,
                    session_id: session.session_id,
                    flags: "48", // 16 | 32 (PLAY | SYNC)
                    sync_id: spotifyTrackId,
                    created_at: Date.now(),
                    party: {
                        id: `spotify:${userId}`,
                    },
                    timestamps: {
                        start: state.startTime,
                        end: state.startTime + state.durationMs,
                    },
                    assets: {
                        large_image: largeImage,
                        large_text: state.spotifyInfo?.album || state.albumName || state.trackName,
                    },
                    metadata: {
                        type: "track",
                        context_uri: `spotify:track:${spotifyTrackId}`,
                        album_id: state.spotifyInfo?.albumId,
                        artist_ids: state.spotifyInfo?.artistIds,
                    },
                };

                currentActivities.push(lastfmActivity);
                session.activities = currentActivities;
                await session.save();
                sessionsChanged = true;
            }
        }

        if (sessionsChanged) {
            await broadcastPresence(userId);
            await emitSessionsReplace(userId);
        }
    }
}
