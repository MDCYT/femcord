const { test } = require("node:test");
const assert = require("node:assert/strict");

const { entity, In, load } = require("./federation-fake-orm.cjs");
const protocol = require("../../src/util/util/federation/Protocol.ts");
const hostErrors = require("../../src/util/util/federation/HostErrors.ts");

const host = "host.example";
const user = "1290000000000000001";
const mirror = "1290000000000000500";

test("a conversation on an instance that is down answers 502 with the reason, not 500", async () => {
    const db = { Channel: entity("Channel"), User: entity("User") };
    db.User.rows.push({ id: user, username: "cat" });
    const relay = load("src/api/util/utility/federationRelay.ts", {
        express: {},
        multer: Object.assign(() => ({}), { memoryStorage: () => ({}) }),
        typeorm: { In },
        "@spacebar/database": db,
        "@spacebar/schemas": { PublicUserProjection: ["id", "username"], RelationshipType: { FRIEND: 1 } },
        "@spacebar/util": {
            Config: { get: () => ({ federation: { enabled: true } }) },
            FederationRequestError: protocol.FederationRequestError,
            SNOWFLAKE: /^\d{15,20}$/,
            translatePath: (path) => path,
        },
        "./instanceAutomod": {},
        "./quarantine": {},
        "./federationIds": { canonicalIds: async (ids) => new Map([...ids].map((id) => [id, `@${id}@home.example`])), toWire: async (value) => value },
        "./federationMirrors": { mirrorInstance: async (kind, id) => (kind === "channel" && id === mirror ? host : null) },
        "./federationMedia": {},
        "./federationNetwork": {
            ownInstance: () => "home.example",
            signedFetch: async () => {
                throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), { code: "ECONNREFUSED" });
            },
            hostTransportError: hostErrors.describeHostFailure,
        },
        "./federationShadows": { profileOf: () => ({}) },
    });
    let answer = null;
    let passed = null;
    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            answer = { status: this.statusCode, body };
            return this;
        },
    };
    const req = { user_id: user, method: "GET", path: `/channels/${mirror}/messages`, query: { limit: "50" }, is: () => false, body: {} };
    await relay.homeRelay(req, res, (error) => {
        passed = error ?? "next";
    });
    assert.equal(passed, null, "the error doesn't fall through to the generic handler");
    assert.equal(answer?.status, 502);
    assert.match(answer.body.message, new RegExp(host.replace(".", "\\.")));
});
