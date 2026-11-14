import wretch from "wretch";
import { ConnectedAccount } from "@spacebar/database";
import { ApiError, Connection, ConnectionLoader, DiscordApiErrors } from "@spacebar/util";
import { ConnectionCallbackSchema } from "@spacebar/schemas";

export class MinecraftSettings {
    enabled = true;
}

export interface MojangProfileResponse {
    id: string;
    name: string;
}

export default class MinecraftConnection extends Connection {
    public readonly id = "minecraft";
    public readonly friendlyName = "Minecraft";
    public readonly setupUrl = "https://minecraft.net";
    public readonly requiredScopes: string[] = [];
    settings: MinecraftSettings = new MinecraftSettings();

    init(): void {
        this.settings = ConnectionLoader.getConnectionConfig<MinecraftSettings>(this.id, this.settings);
    }

    public get isConfigured(): boolean {
        return true;
    }

    getAuthorizationUrl(userId: string): string {
        const state = this.createState(userId);
        return `${this.getRedirectUri()}?state=${state}`;
    }

    async handleCallback(params: ConnectionCallbackSchema, explicitUserId?: string): Promise<ConnectedAccount | null> {
        const { state } = params;
        const rawUsername = (params.code || params.token || (params as unknown as Record<string, unknown>).username || "").toString().trim();

        if (!rawUsername) {
            throw new ApiError("No se proporcionó el nombre de usuario de Minecraft", 400);
        }

        if (!/^[a-zA-Z0-9_]{1,16}$/.test(rawUsername)) {
            throw new ApiError("Nombre de usuario de Minecraft inválido (debe tener entre 1 y 16 caracteres alfanuméricos o guiones bajos)", 400);
        }

        let userId = explicitUserId;
        if (!userId && state && this.states.has(state)) {
            userId = this.getUserId(state);
        }
        if (!userId) {
            throw DiscordApiErrors.INVALID_OAUTH_STATE;
        }

        if (state && this.states.has(state)) {
            this.states.delete(state);
        }

        const mojangUrl = `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(rawUsername)}`;
        const profile = await wretch(mojangUrl)
            .headers({
                Accept: "application/json",
                "User-Agent": "FemCord/1.0",
            })
            .get()
            .json<MojangProfileResponse>()
            .catch(async (e) => {
                if (e.status === 404 || e.status === 204) {
                    throw new ApiError(`No se encontró ningún jugador de Minecraft con el nombre "${rawUsername}"`, 404);
                }
                console.error("[Minecraft/handleCallback] Error al verificar perfil con Mojang:", e);
                throw new ApiError("No se pudo verificar el usuario con los servidores de Mojang. Inténtalo más tarde.", 502);
            });

        if (!profile?.id || !profile?.name) {
            throw new ApiError(`No se encontró ningún jugador de Minecraft con el nombre "${rawUsername}"`, 404);
        }

        const externalId = profile.id;
        const mcName = profile.name;

        const existing = await ConnectedAccount.findOne({
            where: {
                user_id: userId,
                type: this.id,
            },
        });

        if (existing) {
            existing.name = mcName;
            existing.external_id = externalId;
            existing.metadata_ = { uuid: externalId };
            existing.revoked = false;
            existing.visibility = 1;
            existing.verified = true;
            await existing.save();
            return existing;
        }

        return await this.createConnection({
            user_id: userId,
            external_id: externalId,
            name: mcName,
            type: this.id,
            verified: true,
            visibility: 1,
            metadata_: { uuid: externalId },
        });
    }
}
