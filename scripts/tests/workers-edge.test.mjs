import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { route } from "../../workers/router/src/index.ts";
import { sniffMediaType, attachmentMediaType } from "../../workers/cdn/src/sniff.ts";
import { imageDimensions } from "../../workers/cdn/src/dimensions.ts";
import { CLIENT_INJECT_MARKER, finishClientHtml, prepareClientHtml } from "../../src/bundle/ClientHtml.ts";

const icon = new Uint8Array(fs.readFileSync(path.join(import.meta.dirname, "..", "..", "assets", "icon.png")));

test("the router sends websockets to the gateway and api paths to the api", () => {
    assert.equal(route("/", true), "gateway");
    assert.equal(route("/", false), "api");
    assert.equal(route("/api/v9/users/@me", false), "api");
    assert.equal(route("/.well-known/spacebar", false), "api");
    assert.equal(route("/static/email/icon.png", false), "api");
    assert.equal(route("/static/logo.png", false), "edge");
    assert.equal(route("/_meowcord/client.json", false), "hidden");
    assert.equal(route("/avatars/1/2.png", false), "edge");
    assert.equal(route("/channels/@me", false), "edge");
});

test("uploads are typed from their bytes, not their names", () => {
    assert.equal(sniffMediaType(icon), "image/png");
    assert.deepEqual(imageDimensions(icon), { width: 512, height: 512 });
    assert.equal(sniffMediaType(new TextEncoder().encode("<html><script>")), null);
    assert.equal(attachmentMediaType(null, "page.html"), "text/plain; charset=utf-8");
    assert.equal(attachmentMediaType("text/html", "page.html"), "application/octet-stream");
    assert.equal(attachmentMediaType(null, "notes.txt"), "text/plain; charset=utf-8");
});

test("the client page keeps one injection point and gets its title at render time", () => {
    const source =
        '<html><head><title>Discord</title><link rel="icon" href="/x.ico"><script nonce="abc">window.GLOBAL_ENV = {"A":1}</script></head><body><script src="/assets/sentry.0123abcd.js"></script></body></html>';
    const prepared = prepareClientHtml(source);
    assert.ok(prepared.includes(CLIENT_INJECT_MARKER));
    assert.ok(!prepared.includes("GLOBAL_ENV"));
    assert.ok(!prepared.includes("nonce="));
    assert.ok(!prepared.includes("sentry"));
    assert.ok(!prepared.includes('rel="icon"'));
    const page = finishClientHtml(prepared, "<script>$&</script>", "Purr", "<meta>");
    assert.ok(page.includes("<script>$&</script>"));
    assert.ok(page.includes("<title>Purr</title>"));
    assert.ok(page.includes('id="meowcord-credit"'));
});
