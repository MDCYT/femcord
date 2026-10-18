const { test } = require("node:test");
const assert = require("node:assert/strict");
const { StubError, loadRoutes, response } = require("./helpers/route-harness.cjs");

function legacyCodesRoute({ recentMfa }) {
    const issued = [];
    const routes = loadRoutes("src/api/routes/users/@me/mfa/codes.ts", {
        bcrypt: { compare: async (password) => password === "correct" },
        "@spacebar/api/util": {
            requireMfa: async () => {
                if (!recentMfa) throw new StubError("Two factor is required for this operation", 401);
            },
        },
        "@spacebar/database": {
            User: { findOneOrFail: async () => ({ data: { hash: "hash" } }) },
            BackupCode: {
                update: async () => undefined,
                find: async () => {
                    issued.push("existing");
                    return [{ code: "abcdef12", consumed: false, expired: false }];
                },
            },
            generateMfaBackupCodes: () => {
                issued.push("fresh");
                return [{ code: "12345678", consumed: false, expired: false, save: async () => undefined }];
            },
        },
        "@spacebar/util": { FieldErrors: (fields) => new StubError(JSON.stringify(fields)) },
    });
    return { handler: routes["POST /"], issued };
}

test("the legacy backup codes route needs a second factor on top of the password", async () => {
    for (const regenerate of [false, true]) {
        const { handler, issued } = legacyCodesRoute({ recentMfa: false });
        const res = response();
        await assert.rejects(handler({ user_id: "1", body: { password: "correct", regenerate }, t: (key) => key }, res), /Two factor is required/);
        assert.deepEqual(issued, []);
        assert.equal(res.body, undefined);
    }
    const { handler, issued } = legacyCodesRoute({ recentMfa: true });
    const res = response();
    await handler({ user_id: "1", body: { password: "correct", regenerate: false }, t: (key) => key }, res);
    assert.deepEqual(issued, ["existing"]);
    assert.equal(res.body.backup_codes[0].code, "abcdef12");
});
