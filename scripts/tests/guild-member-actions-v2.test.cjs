const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const load = (file, modules) => {
    const routes = [];
    const router = Object.fromEntries(
        ["get", "post", "patch", "put", "delete"].map((method) => [
            method,
            (path, options, handler) => {
                routes.push({ method, path, options, handler });
            },
        ]),
    );
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(file, "utf8"), {
        module,
        exports: module.exports,
        BigInt,
        Date,
        Number,
        String,
        Math,
        Promise,
        require: (name) => {
            if (name === "express") return { Router: () => router };
            if (name === "@spacebar/api/middlewares") return { route: (options) => options };
            if (name in modules) return modules[name];
            throw new Error(`unexpected import ${name}`);
        },
    });
    return routes;
};

const respond = () => {
    const res = { status: 200 };
    res.sendStatus = (status) => {
        res.status = status;
        return res;
    };
    res.json = (body) => {
        res.body = body;
        return res;
    };
    res.send = res.json;
    return res;
};

test("the prune estimate v2 answers 204 and sends the count as GUILD_PRUNE_UPDATE to the requester", async () => {
    const events = [];
    const old = new Date(Date.now() - 40 * 86400000);
    const member = (id, roles) => ({ id, joined_at: old, roles: roles.map((role) => ({ id: role, position: role === "g" ? 0 : 1 })) });
    const routes = load("dist/api/routes/guilds/#guild_id/prune.js", {
        typeorm: { IsNull: () => null, LessThan: (value) => value },
        "@spacebar/database": {
            Member: {
                find: async () => [member("a", ["g"]), member("b", ["g", "r1"]), member("c", ["g", "r2"])],
                findOneOrFail: async () => member("owner", ["g"]),
            },
            Guild: { findOneOrFail: async () => ({ id: "g", owner_id: "owner" }) },
            AuditLog: { log: async () => {} },
        },
        "@spacebar/schemas": { AuditLogEvents: {} },
        "@spacebar/util": { Snowflake: { EPOCH: 1420070400000 }, emitEvent: async (event) => events.push(event) },
    });
    const route = routes.find((r) => r.method === "get" && r.path === "/v2");
    assert.ok(route, "GET /v2 is registered");
    assert.equal(route.options.permission, "KICK_MEMBERS");

    const res = respond();
    await route.handler({ params: { guild_id: "g" }, query: { days: "7", include_roles: ["r1"] }, user_id: "owner" }, res);
    assert.equal(res.status, 204);
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "GUILD_PRUNE_UPDATE");
    assert.equal(events[0].user_id, "owner");
    assert.equal(events[0].guild_id, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(events[0].data)), {
        guild_id: "g",
        prune: { is_preview: true, is_finished: true, days: 7, prune_count: 2, include_roles: ["r1"] },
    });
});
