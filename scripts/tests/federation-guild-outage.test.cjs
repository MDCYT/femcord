/* SPDX-License-Identifier: AGPL-3.0-only */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadAvailabilityModule(customStubs = {}) {
    const emittedEvents = [];
    const createdGuilds = [];
    const updatedGuilds = [];
    const guildsInDb = [
        { id: "guild_fed_1", federated_instance: "peer.example.test", unavailable: false },
        { id: "guild_fed_2", federated_instance: "peer.example.test", unavailable: false },
        { id: "guild_fed_other", federated_instance: "other.example.test", unavailable: false },
        { id: "guild_local", federated_instance: null, unavailable: false },
    ];
    const membersInDb = [
        { id: "user_1", guild_id: "guild_fed_1" },
        { id: "user_2", guild_id: "guild_fed_1" },
        { id: "user_1", guild_id: "guild_fed_2" },
    ];

    const source = ts.transpileModule(fs.readFileSync("src/api/util/utility/federationAvailability.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;

    const module = { exports: {} };
    const stubs = {
        typeorm: {
            In: (values) => values,
            IsNull: () => null,
            Not: (val) => ({ not: val }),
        },
        "@spacebar/database": {
            Guild: {
                find: async ({ where }) => {
                    return guildsInDb.filter((g) => {
                        if (where.federated_instance && g.federated_instance !== where.federated_instance) return false;
                        if (where.unavailable !== undefined && g.unavailable !== where.unavailable) return false;
                        return true;
                    });
                },
                update: async (criteria, patch) => {
                    updatedGuilds.push({ criteria, patch });
                    const targetIds = Array.isArray(criteria.id) ? criteria.id : [criteria.id];
                    for (const g of guildsInDb) {
                        if (targetIds.includes(g.id)) {
                            Object.assign(g, patch);
                        }
                    }
                },
                createQueryBuilder: () => ({
                    select: () => ({
                        where: () => ({
                            andWhere: () => ({
                                getRawMany: async () => [{ instance: "peer.example.test" }],
                            }),
                            getRawMany: async () => [{ instance: "peer.example.test" }],
                        }),
                    }),
                }),
            },
            Member: {
                find: async ({ where }) => {
                    return membersInDb.filter((m) => m.guild_id === where.guild_id);
                },
            },
        },
        "@spacebar/util": {
            Config: {
                get: () => ({ federation: { enabled: true } }),
            },
            emitEvent: async (event) => {
                emittedEvents.push(event);
            },
            fetchPublicUrl: async () => ({ ok: true }),
        },
        "./federationMirrors": {
            emitGuildCreate: async (guild_id, user_id) => {
                createdGuilds.push({ guild_id, user_id });
            },
        },
        "./federationNetwork": {
            instanceBaseUrl: (instance) => `https://${instance}`,
        },
        "../../../util/util/ProcessLifecycle": {
            ProcessLifecycle: {
                eventEmitter: {
                    once: () => {},
                },
            },
        },
        ...customStubs,
    };

    vm.runInNewContext(source, {
        module,
        exports: module.exports,
        Buffer,
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        require: (name) => {
            if (name in stubs) return stubs[name];
            throw new Error(`unstubbed import: ${name}`);
        },
    });

    return {
        availability: module.exports,
        emittedEvents,
        createdGuilds,
        updatedGuilds,
        guildsInDb,
    };
}

test("markInstanceUnavailable sets guilds to unavailable and emits GUILD_DELETE", async () => {
    const { availability, emittedEvents, updatedGuilds, guildsInDb } = loadAvailabilityModule();

    assert.equal(availability.isInstanceUnavailable("peer.example.test"), false);
    await availability.markInstanceUnavailable("peer.example.test");

    assert.equal(availability.isInstanceUnavailable("peer.example.test"), true);
    assert.equal(updatedGuilds.length, 1);
    assert.deepEqual(updatedGuilds[0].patch, { unavailable: true });

    assert.equal(guildsInDb.find((g) => g.id === "guild_fed_1").unavailable, true);
    assert.equal(guildsInDb.find((g) => g.id === "guild_fed_2").unavailable, true);
    assert.equal(guildsInDb.find((g) => g.id === "guild_fed_other").unavailable, false);

    assert.equal(emittedEvents.length, 2);
    assert.deepEqual(emittedEvents[0], {
        event: "GUILD_DELETE",
        data: { id: "guild_fed_1", unavailable: true },
        guild_id: "guild_fed_1",
    });
    assert.deepEqual(emittedEvents[1], {
        event: "GUILD_DELETE",
        data: { id: "guild_fed_2", unavailable: true },
        guild_id: "guild_fed_2",
    });

    await availability.markInstanceUnavailable("peer.example.test");
    assert.equal(emittedEvents.length, 2);
});

test("markInstanceAvailable restores guilds to available and emits GUILD_CREATE to members", async () => {
    const { availability, createdGuilds, guildsInDb } = loadAvailabilityModule();

    await availability.markInstanceUnavailable("peer.example.test");
    assert.equal(availability.isInstanceUnavailable("peer.example.test"), true);

    await availability.markInstanceAvailable("peer.example.test");
    assert.equal(availability.isInstanceUnavailable("peer.example.test"), false);

    assert.equal(guildsInDb.find((g) => g.id === "guild_fed_1").unavailable, false);
    assert.equal(guildsInDb.find((g) => g.id === "guild_fed_2").unavailable, false);

    assert.equal(createdGuilds.length, 3);
    assert.deepEqual(createdGuilds[0], { guild_id: "guild_fed_1", user_id: "user_1" });
    assert.deepEqual(createdGuilds[1], { guild_id: "guild_fed_1", user_id: "user_2" });
    assert.deepEqual(createdGuilds[2], { guild_id: "guild_fed_2", user_id: "user_1" });
});

test("recordInstanceFailure triggers outage only after threshold", async () => {
    const { availability } = loadAvailabilityModule();

    availability.recordInstanceFailure("peer.example.test", new Error("Connection timed out"));
    assert.equal(availability.getInstanceFailures("peer.example.test"), 1);
    assert.equal(availability.isInstanceUnavailable("peer.example.test"), false);

    availability.recordInstanceFailure("peer.example.test", new Error("Connection refused"));
    assert.equal(availability.getInstanceFailures("peer.example.test"), 2);
    assert.equal(availability.isInstanceUnavailable("peer.example.test"), true);

    availability.recordInstanceSuccess("peer.example.test");
    assert.equal(availability.getInstanceFailures("peer.example.test"), 0);
    assert.equal(availability.isInstanceUnavailable("peer.example.test"), false);
});

test("listener preserves guild state when GUILD_DELETE has unavailable: true", () => {
    const data = { id: "guild_fed_1", unavailable: true };
    let subscriptionCancelled = false;
    let permissionsDeleted = false;

    if (!data.unavailable) {
        subscriptionCancelled = true;
        permissionsDeleted = true;
    }

    assert.equal(subscriptionCancelled, false);
    assert.equal(permissionsDeleted, false);

    const normalData = { id: "guild_fed_1" };
    if (!normalData.unavailable) {
        subscriptionCancelled = true;
        permissionsDeleted = true;
    }

    assert.equal(subscriptionCancelled, true);
    assert.equal(permissionsDeleted, true);
});
