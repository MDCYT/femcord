const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/route-harness.cjs");

function harness() {
    const files = new Map();
    const preferences = {};
    let next = 0;
    const background = [];
    const harvest = loadModule(
        "src/api/util/utility/harvest.ts",
        {
            typeorm: { In: (value) => value, LessThan: (value) => value },
            "@spacebar/cdn/util/Storage": {
                storage: {
                    set: async (path, data, principal) => {
                        assert.equal(principal, "user:1");
                        files.set(path, data);
                    },
                    delete: async (path) => {
                        files.delete(path);
                    },
                },
            },
            "@spacebar/database": {
                User: {
                    findOneOrFail: async () => ({ id: "1", email: "", username: "tester", account_preferences: { ...preferences } }),
                    setAccountPreferences: async (_id, value) => Object.assign(preferences, value),
                },
            },
            "@spacebar/util": {
                Config: { get: () => ({ general: { instanceName: "Meowcord" }, api: { endpointPublic: "http://localhost" } }) },
                Email: {},
                Snowflake: { generate: () => String(100 + next++) },
                escapeHtml: (value) => value,
                trackBackground: (promise) => background.push(promise),
            },
            "@spacebar/schemas": { PrivateUserProjection: [] },
            "./mfa": { signTicket: () => "ticket" },
        },
        { setImmediate },
    );
    return {
        files,
        preferences,
        request: async () => {
            const created = await harvest.createHarvest("1", ["Zendesk"]);
            await Promise.all(background.splice(0));
            return created;
        },
    };
}

test("a new data package replaces the previous one instead of piling up in the account's storage", async () => {
    const { files, preferences, request } = harness();
    const first = await request();
    assert.deepEqual([...files.keys()], [`harvests/1/${first.harvest_id}.zip`]);
    const second = await request();
    assert.notEqual(second.harvest_id, first.harvest_id);
    assert.deepEqual([...files.keys()], [`harvests/1/${second.harvest_id}.zip`]);
    assert.equal(preferences.harvest.harvest_id, second.harvest_id);
    assert.equal(preferences.harvest.status, 3);
});
