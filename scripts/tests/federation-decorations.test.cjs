const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    DECORATION_ART_MAX_BYTES,
    decorationKey,
    localizeDecorations,
    readDecoration,
    readRemoteDecoration,
    remoteDecorationSku,
} = require("../../dist/util/util/federation/Decorations.js");
const { rewriteIncoming, rewriteOutgoing } = require("../../dist/util/util/federation/Ids.js");
const { federatedMediaKind, federatedMediaMaxBytes } = require("../../dist/util/util/federation/Media.js");

const SENDER = "cat.example";
const ASSET = "a_0123456789abcdef0123456789abcdef";
const SKU = "1300000000000000777";
const NOW = Date.parse("2026-10-15T12:00:00Z");

const resolverOf =
    (table, calls = []) =>
    async (wanted) => {
        calls.push(wanted);
        return new Map(wanted.flatMap((ref) => (table[ref.sku] ? [[decorationKey(ref), table[ref.sku]]] : [])));
    };

test("a decoration keeps only its asset, SKU and expiry", () => {
    assert.deepEqual(readDecoration({ asset: ASSET, sku_id: SKU, expires_at: null, url: "https://evil.example/x.png", label: "x" }, NOW), {
        asset: ASSET,
        sku_id: SKU,
        expires_at: null,
    });
    assert.deepEqual(readDecoration({ asset: "0123456789abcdef0123456789abcdef", sku_id: SKU }, NOW)?.expires_at, null);
});

test("assets that aren't a 32 character hex hash are refused", () => {
    for (const asset of [
        "../../etc/passwd",
        "a_0123456789ABCDEF0123456789ABCDEF",
        "a_0123456789abcdef0123456789abcde",
        "a_0123456789abcdef0123456789abcdef0",
        "https://evil.example/a.png",
        "a_0123456789abcdef0123456789abcdef.png",
        "nameplates/custom/1/",
        "",
        42,
        null,
    ])
        assert.equal(readDecoration({ asset, sku_id: SKU, expires_at: null }, NOW), null, String(asset));
});

test("SKUs that aren't snowflakes are refused", () => {
    for (const sku_id of ["", "abc", "123456789012345678901", "-1", "1e5", 1300000000, null, "@1@cat.example"])
        assert.equal(readDecoration({ asset: ASSET, sku_id, expires_at: null }, NOW), null, String(sku_id));
    for (const value of [null, undefined, "decoration", [ASSET, SKU], 5]) assert.equal(readDecoration(value, NOW), null);
});

test("expired decorations are dropped and live ones keep their expiry", () => {
    const seconds = Math.floor(NOW / 1000);
    assert.equal(readDecoration({ asset: ASSET, sku_id: SKU, expires_at: seconds - 1 }, NOW), null);
    assert.equal(readDecoration({ asset: ASSET, sku_id: SKU, expires_at: NOW - 1 }, NOW), null);
    assert.equal(readDecoration({ asset: ASSET, sku_id: SKU, expires_at: "2020-01-01T00:00:00Z" }, NOW), null);
    assert.equal(readDecoration({ asset: ASSET, sku_id: SKU, expires_at: "soon" }, NOW), null);
    assert.equal(readDecoration({ asset: ASSET, sku_id: SKU, expires_at: seconds + 60 }, NOW)?.expires_at, seconds + 60);
    assert.equal(readDecoration({ asset: ASSET, sku_id: SKU, expires_at: "2030-01-01T00:00:00Z" }, NOW)?.expires_at, "2030-01-01T00:00:00Z");
});

test("a remote SKU is a plain snowflake or a canonical id of the sender only", () => {
    assert.equal(remoteDecorationSku(SKU, SENDER), SKU);
    assert.equal(remoteDecorationSku(`@${SKU}@${SENDER}`, SENDER), SKU);
    assert.equal(remoteDecorationSku(`@${SKU}@dog.example`, SENDER), null);
    assert.equal(remoteDecorationSku(`@${SKU}@`, SENDER), null);
    assert.equal(remoteDecorationSku(undefined, SENDER), null);
    assert.deepEqual(readRemoteDecoration({ asset: ASSET, sku_id: `@${SKU}@${SENDER}`, expires_at: null }, SENDER, NOW), { asset: ASSET, sku_id: SKU, expires_at: null });
    assert.equal(readRemoteDecoration({ asset: ASSET, sku_id: `@${SKU}@dog.example`, expires_at: null }, SENDER, NOW), null);
});

test("decorations on users and members get this instance's SKU, with one lookup per SKU", async () => {
    const calls = [];
    const body = {
        author: { id: "1", username: "cat", avatar_decoration_data: { asset: ASSET, sku_id: SKU, expires_at: null } },
        member: { nick: "kit", avatar_decoration_data: { asset: ASSET, sku_id: `@${SKU}@${SENDER}`, expires_at: null } },
        mentions: [{ id: "2", username: "dog", avatar_decoration_data: { asset: ASSET, sku_id: "1144058522808614923", expires_at: null } }],
    };
    await localizeDecorations(body, SENDER, resolverOf({ [SKU]: "1560000000000000001", "1144058522808614923": "1144058522808614923" }, calls), NOW);
    assert.deepEqual(body.author.avatar_decoration_data, { asset: ASSET, sku_id: "1560000000000000001", expires_at: null });
    assert.deepEqual(body.member.avatar_decoration_data, { asset: ASSET, sku_id: "1560000000000000001", expires_at: null });
    assert.deepEqual(body.mentions[0].avatar_decoration_data, { asset: ASSET, sku_id: "1144058522808614923", expires_at: null });
    assert.equal(calls.length, 1);
    assert.deepEqual(
        calls[0].map((ref) => ref.sku),
        [SKU, "1144058522808614923"],
    );
});

test("junk, foreign, unmapped and expired decorations become null without a lookup for them", async () => {
    const calls = [];
    const body = {
        a: { avatar_decoration_data: { asset: "../x", sku_id: SKU } },
        b: { avatar_decoration_data: { asset: ASSET, sku_id: `@${SKU}@dog.example` } },
        c: { avatar_decoration_data: { asset: ASSET, sku_id: "1300000000000000999" } },
        d: { avatar_decoration_data: { asset: ASSET, sku_id: SKU, expires_at: 1 } },
        e: { avatar_decoration_data: "a_0123456789abcdef0123456789abcdef" },
        f: { avatar_decoration_data: null },
    };
    await localizeDecorations(body, SENDER, resolverOf({ [SKU]: "1560000000000000001" }, calls), NOW);
    for (const key of Object.keys(body)) assert.equal(body[key].avatar_decoration_data, null, key);
    assert.deepEqual(
        calls.flat().map((ref) => ref.sku),
        ["1300000000000000999"],
    );
});

test("a resolver that fails or answers with junk leaves no decoration", async () => {
    const failing = { avatar_decoration_data: { asset: ASSET, sku_id: SKU } };
    await localizeDecorations(failing, SENDER, async () => Promise.reject(new Error("quota")), NOW);
    assert.equal(failing.avatar_decoration_data, null);
    const junk = { avatar_decoration_data: { asset: ASSET, sku_id: SKU } };
    await localizeDecorations(junk, SENDER, async (wanted) => new Map(wanted.map((ref) => [decorationKey(ref), "../../x"])), NOW);
    assert.equal(junk.avatar_decoration_data, null);
});

test("payloads without decorations are left alone and never call the resolver", async () => {
    const body = { id: "1", content: "avatar_decoration_data", nested: [{ avatar: null }] };
    await localizeDecorations(body, SENDER, () => assert.fail("no lookup expected"), NOW);
    assert.deepEqual(body, { id: "1", content: "avatar_decoration_data", nested: [{ avatar: null }] });
});

test("the id rewriter leaves decoration SKUs alone in both directions", () => {
    const decoration = { asset: ASSET, sku_id: "1144058522808614923", expires_at: null };
    const outgoing = rewriteOutgoing({ user: { id: "1144058522808614000", username: "cat", avatar: null, avatar_decoration_data: decoration } }, new Map(), "home.example");
    assert.equal(outgoing.user.id, "@1144058522808614000@home.example");
    assert.deepEqual(outgoing.user.avatar_decoration_data, decoration);
    const incoming = rewriteIncoming(outgoing, new Map([["@1144058522808614000@home.example", "555"]]), "away.example");
    assert.equal(incoming.user.id, "555");
    assert.deepEqual(incoming.user.avatar_decoration_data, decoration);
});

test("decoration art by SKU is federated media, other shop art isn't", () => {
    for (const path of ["/media/v1/collectibles-shop/1300000000000000777/animated", "/media/v1/collectibles-shop/1300000000000000777/static"])
        assert.equal(federatedMediaKind(path), "image", path);
    for (const path of [
        "/media/v1/collectibles-shop/1300000000000000777/effect",
        "/media/v1/collectibles-shop/1300000000000000777/video",
        "/media/v1/collectibles-shop/nameplates/custom/1/static.png",
        "/media/v1/collectibles-shop/abc/animated",
        "/media/v1/collectibles-shop/1/../../../api/v9/users/@me",
        "/media/v1/collectibles-shop/1%2fanimated",
        "/media/v1/collectibles-shop/1/animated/",
    ])
        assert.equal(federatedMediaKind(path), null, path);
});

test("decoration art has its own size cap under the media proxy limit", () => {
    assert.equal(federatedMediaMaxBytes("/media/v1/collectibles-shop/1/animated", 50 * 1024 * 1024), DECORATION_ART_MAX_BYTES);
    assert.equal(federatedMediaMaxBytes(`/avatar-decoration-presets/${ASSET}.png`, 50 * 1024 * 1024), DECORATION_ART_MAX_BYTES);
    assert.equal(federatedMediaMaxBytes("/media/v1/collectibles-shop/1/animated", 4096), 4096);
    assert.equal(federatedMediaMaxBytes("/avatars/1/abc", 50 * 1024 * 1024), 50 * 1024 * 1024);
});
