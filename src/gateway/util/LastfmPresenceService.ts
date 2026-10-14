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
    };
}

export class LastfmPresenceService {
    private static running = false;
    private static lastTrackMap = new Map<string, string>(); // userId -> trackIdentifier

    public static start() {
        if (serviceTimer || isStopping) return;
        // Check every 15 seconds
        serviceTimer = setInterval(() => {
            void LastfmPresenceService.tick().catch((e) => console.error("[LastfmPresence] Tick error:", e));
        }, 15_000).unref();
        console.log("[LastfmPresence] Background sync service started");
    }

    public static stop() {
        isStopping = true;
        if (serviceTimer) {
            clearInterval(serviceTimer);
            serviceTimer = undefined;
        }
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
                select: { id: true, user_id: true, status: true, activities: true, session_id: true, last_seen: true },
            });

            const activeUserIds = [
                ...new Set(onlineSessions.filter((s) => s.status && s.status !== "offline" && Date.now() - (s.last_seen?.getTime() ?? 0) < 60_000).map((s) => s.user_id)),
            ];

            if (!activeUserIds.length) return;

            // Find connected accounts for these active users with show_activity = 1
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

        const tracks = res?.recenttracks?.track;
        const currentTrack: RecentTrack | null = Array.isArray(tracks) ? (tracks[0] ?? null) : (tracks ?? null);

        const isNowPlaying = currentTrack?.["@attr"]?.nowplaying === "true";

        const trackName = currentTrack?.name?.trim() || "";
        const artistName = (typeof currentTrack?.artist === "string" ? currentTrack.artist : currentTrack?.artist?.["#text"])?.trim() || "";
        const albumName = currentTrack?.album?.["#text"]?.trim() || "";
        const trackId = isNowPlaying ? `${artistName} - ${trackName}` : "";

        const previousTrackId = this.lastTrackMap.get(userId) || "";

        if (trackId === previousTrackId) {
            // No status change
            return;
        }

        this.lastTrackMap.set(userId, trackId);

        // Fetch user sessions
        const userSessions = await Session.find({
            where: { user_id: userId, is_admin_session: false },
        });

        if (!userSessions.length) return;

        let sessionsChanged = false;

        for (const session of userSessions) {
            const currentActivities: Activity[] = (session.activities || []).filter((a) => a.name !== "Spotify" && a.name !== "Last.fm" && (a as any).sync_id !== "lastfm");

            if (isNowPlaying && trackName && artistName) {
                // Find image
                const images = currentTrack?.image || [];
                const img = images.find((i) => i.size === "extralarge")?.["#text"] || images[images.length - 1]?.["#text"] || "";

                const lastfmActivity: Activity = {
                    name: "Spotify",
                    type: 2, // LISTENING
                    details: trackName,
                    state: artistName,
                    session_id: session.session_id,
                    flags: "48", // 16 | 32 (PLAY | SYNC)
                    sync_id: "lastfm",
                    created_at: Date.now(),
                    timestamps: {
                        start: Date.now(),
                        end: 0,
                    },
                    assets: {
                        large_image: img ? `mp:${img}` : undefined,
                        large_text: albumName || trackName,
                    },
                    metadata: {
                        type: "track",
                        context_uri: `spotify:track:lastfm`,
                    },
                };

                currentActivities.push(lastfmActivity);
            }

            session.activities = currentActivities;
            await session.save();
            sessionsChanged = true;
        }

        if (sessionsChanged) {
            await broadcastPresence(userId);
            await emitSessionsReplace(userId);
        }
    }
}
