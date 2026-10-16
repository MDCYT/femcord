/* SPDX-License-Identifier: AGPL-3.0-only */
import { In } from "typeorm";
import { Guild, Member } from "@spacebar/database";
import { Config, emitEvent, fetchPublicUrl, GuildDeleteEvent } from "@spacebar/util";
import { emitGuildCreate } from "./federationMirrors";
import { instanceBaseUrl } from "./federationNetwork";
import { ProcessLifecycle } from "../../../util/util/ProcessLifecycle";

const instanceFailures = new Map<string, number>();
const unavailableInstances = new Set<string>();
const FAILURE_THRESHOLD = 2;
const PROBE_INTERVAL = 30_000;
let probeTimer: NodeJS.Timeout | undefined;
let stopping = false;

export const isInstanceUnavailable = (instance: string) => unavailableInstances.has(instance);
export const getUnavailableInstances = () => new Set(unavailableInstances);
export const getInstanceFailures = (instance: string) => instanceFailures.get(instance) ?? 0;
export const resetFederationAvailability = () => {
    instanceFailures.clear();
    unavailableInstances.clear();
};

export async function markInstanceUnavailable(instance: string, reason?: unknown) {
    if (!instance || unavailableInstances.has(instance)) return;
    unavailableInstances.add(instance);
    const guilds = await Guild.find({
        where: { federated_instance: instance, unavailable: false },
        select: { id: true },
    });
    if (!guilds.length) return;
    const guildIds = guilds.map((guild) => guild.id);
    await Guild.update({ id: In(guildIds) }, { unavailable: true });
    for (const guildId of guildIds) {
        await emitEvent({
            event: "GUILD_DELETE",
            data: { id: guildId, unavailable: true },
            guild_id: guildId,
        } satisfies GuildDeleteEvent);
    }
}

export async function markInstanceAvailable(instance: string) {
    if (!instance) return;
    instanceFailures.delete(instance);
    if (!unavailableInstances.has(instance)) return;
    unavailableInstances.delete(instance);
    const guilds = await Guild.find({
        where: { federated_instance: instance, unavailable: true },
        select: { id: true },
    });
    if (!guilds.length) return;
    const guildIds = guilds.map((guild) => guild.id);
    await Guild.update({ id: In(guildIds) }, { unavailable: false });
    for (const guildId of guildIds) {
        const members = await Member.find({ where: { guild_id: guildId }, select: { id: true } });
        for (const member of members) {
            await emitGuildCreate(guildId, member.id).catch((error) =>
                console.warn(`[Federation] Failed to emit guild create for ${guildId} to ${member.id}:`, (error as Error).message),
            );
        }
    }
}

export function recordInstanceSuccess(instance: string) {
    if (!instance) return;
    instanceFailures.delete(instance);
    if (unavailableInstances.has(instance)) {
        void markInstanceAvailable(instance);
    }
}

export function recordInstanceFailure(instance: string, error?: unknown) {
    if (!instance) return;
    const current = (instanceFailures.get(instance) ?? 0) + 1;
    instanceFailures.set(instance, current);
    if (current >= FAILURE_THRESHOLD && !unavailableInstances.has(instance)) {
        void markInstanceUnavailable(instance, error);
    }
}

export async function probeInstance(instance: string): Promise<boolean> {
    try {
        const base = instanceBaseUrl(instance);
        const response = await fetchPublicUrl(`${base}/.well-known/meowcord`, { headers: { accept: "application/json" }, redirect: "error" }, 0, {
            maxBytes: 128 * 1024,
            timeoutMs: 5000,
        });
        return response.ok;
    } catch {
        return false;
    }
}

export async function checkFederatedInstancesHealth() {
    if (stopping || !Config.get().federation.enabled) return;
    const rows = await Guild.createQueryBuilder("guild")
        .select("DISTINCT guild.federated_instance", "instance")
        .where("guild.federated_instance IS NOT NULL")
        .getRawMany<{ instance: string }>();
    for (const { instance } of rows) {
        if (!instance || stopping) continue;
        const healthy = await probeInstance(instance);
        if (healthy) {
            recordInstanceSuccess(instance);
        } else {
            recordInstanceFailure(instance, "Health check probe failed");
        }
    }
}

export async function initializeFederationAvailability() {
    const rows = await Guild.createQueryBuilder("guild")
        .select("DISTINCT guild.federated_instance", "instance")
        .where("guild.federated_instance IS NOT NULL")
        .andWhere("guild.unavailable = :unav", { unav: true })
        .getRawMany<{ instance: string }>();
    for (const { instance } of rows) {
        if (instance) unavailableInstances.add(instance);
    }
}

export function startFederationAvailability() {
    void initializeFederationAvailability().catch((error) => console.warn("[Federation] Could not initialize unavailable instances:", (error as Error).message));
    probeTimer = setInterval(() => {
        void checkFederatedInstancesHealth().catch((error) => console.warn("[Federation] Health probe error:", (error as Error).message));
    }, PROBE_INTERVAL);
    probeTimer.unref?.();

    ProcessLifecycle.eventEmitter.once("stopping", () => {
        stopping = true;
        if (probeTimer) clearInterval(probeTimer);
    });
}
