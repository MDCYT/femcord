import { spawn, spawnSync } from "node:child_process";
import { createCipheriv, createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const args = new Set(process.argv.slice(2));
const root = path.resolve(new URL("../..", import.meta.url).pathname);
const registryPort = Number(process.env.FED_REGISTRY_PORT || 3100);
const instances = [
    { name: "a", port: Number(process.env.FED_PORT_A || 3101), db: process.env.FED_DB_A || "meowcord_fed_a" },
    { name: "b", port: Number(process.env.FED_PORT_B || 3102), db: process.env.FED_DB_B || "meowcord_fed_b" },
];
const runDir = process.env.FED_DIR || path.join(tmpdir(), "meowcord-federation-probe");
const reuse = args.has("--reuse");
const keep = args.has("--keep") || reuse;
const drop = args.has("--drop");
const publicMode = args.has("--public");
const fetchProxy = process.env.FED_FETCH_PROXY || "direct";
let registryUrl = `http://localhost:${registryPort}`;
for (const instance of instances) {
    instance.id = `localhost:${instance.port}`;
    instance.origin = `http://localhost:${instance.port}`;
    instance.api = `http://localhost:${instance.port}/api/v9`;
    instance.dir = path.join(runDir, instance.name);
}
const [A, B] = instances;
const tunnels = [];
process.on("exit", () => {
    for (const child of tunnels) if (child.exitCode === null) child.kill("SIGTERM");
});

async function openTunnel(name, port) {
    mkdirSync(runDir, { recursive: true, mode: 0o700 });
    const file = path.join(runDir, `tunnel-${name}.log`);
    writeFileSync(file, "");
    const child = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], { stdio: ["ignore", openSync(file, "a"), openSync(file, "a")] });
    tunnels.push(child);
    for (let attempt = 0; attempt < 120; attempt++) {
        if (child.exitCode !== null) throw new Error(`cloudflared for ${name} exited, see ${file}`);
        const host = readFileSync(file, "utf8").match(/https:\/\/([a-z0-9-]+\.trycloudflare\.com)/)?.[1];
        if (host) return host;
        await sleep(500);
    }
    throw new Error(`cloudflared for ${name} printed no address, see ${file}`);
}

async function waitForEdge(host) {
    for (let attempt = 0; attempt < 90; attempt++) {
        const status = await fetch(`https://${host}/`, { redirect: "manual" }).then(
            (response) => response.status,
            () => 0,
        );
        if (status && status !== 530) return;
        await sleep(2000);
    }
    throw new Error(`${host} never answered through Cloudflare`);
}

function instanceKey(instance) {
    mkdirSync(instance.dir, { recursive: true, mode: 0o700 });
    const file = path.join(instance.dir, "federation.key");
    if (!existsSync(file)) writeFileSync(file, generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
    return createPublicKey(createPrivateKey(readFileSync(file))).export({ format: "jwk" }).x;
}

let passed = 0;
let failed = 0;
const failures = [];
const check = (name, ok, detail = "") => {
    if (ok) passed++;
    else {
        failed++;
        failures.push(name);
    }
    console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`);
    return ok;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn, timeout = 8000) => {
    const deadline = Date.now() + timeout;
    for (;;) {
        if (await fn()) return true;
        if (Date.now() > deadline) return false;
        await sleep(200);
    }
};

const registryKey = generateKeyPairSync("ed25519");
const registryPublic = registryKey.publicKey.export({ format: "jwk" }).x;
const registryDocument = () => {
    const payload = Buffer.from(
        JSON.stringify({
            version: 1,
            sequence: Date.now(),
            issued_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 86_400_000).toISOString(),
            min_protocol: 1,
            instances: publicMode
                ? instances.map((instance) => ({
                      id: instance.id,
                      name: `Probe ${instance.name}`,
                      description: "",
                      icon_url: null,
                      url: instance.origin,
                      source_url: null,
                      public_key: instance.publicKey,
                      protocol: 2,
                      registration: "open",
                      state: "active",
                      listed_at: new Date().toISOString(),
                  }))
                : [],
            blocked: { instances: [], guilds: [], users: [] },
            discovery: [],
        }),
    );
    return { payload: payload.toString("base64url"), signature: sign(null, payload, registryKey.privateKey).toString("base64url"), key_id: "registry-1" };
};

const registry = createServer((req, res) => {
    if (req.url === "/v1/registry") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(registryDocument()));
    }
    res.writeHead(202, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "pending" }));
});

const servers = [];

function psql(db, sql) {
    const result = spawnSync("psql", ["--host=localhost", "--port=5432", `--username=${process.env.USER}`, db, "-Atc", sql], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`psql ${db}: ${result.stderr}`);
    return result.stdout.trim();
}

async function startInstance(instance) {
    mkdirSync(instance.dir, { recursive: true, mode: 0o700 });
    const exists = psql("postgres", `SELECT 1 FROM pg_database WHERE datname = '${instance.db}'`);
    if (exists && args.has("--fresh")) {
        spawnSync("dropdb", ["--host=localhost", "--port=5432", `--username=${process.env.USER}`, instance.db], { stdio: "inherit" });
    }
    if (!exists || args.has("--fresh")) spawnSync("createdb", ["--host=localhost", "--port=5432", `--username=${process.env.USER}`, instance.db], { stdio: "inherit" });
    const other = instances.find((entry) => entry !== instance);
    const origin = instance.origin;
    writeFileSync(
        path.join(instance.dir, "config.json"),
        JSON.stringify(
            {
                general: { serverName: origin },
                api: { endpointPublic: `${origin}/api/v9` },
                cdn: { endpointPublic: `${origin}/`, endpointPrivate: `http://localhost:${instance.port}/` },
                gateway: { endpointPublic: `${origin.replace(/^http/, "ws")}/` },
                security: { allowPrivateNetworkRequests: !publicMode, captcha: { blockAutomatedBrowsers: false } },
                register: { requireCaptcha: false },
                federation: {
                    enabled: true,
                    announce: false,
                    allowUnlistedPeers: !publicMode,
                    peers: publicMode ? [] : [other.id],
                    registry: { url: registryUrl, publicKey: registryPublic },
                },
                limits: { rate: { enabled: false, routes: { auth: { register: { count: 100, window: 60 } } } } },
            },
            null,
            2,
        ),
    );
    await spawnInstance(instance);
}

async function spawnInstance(instance) {
    const origin = `http://localhost:${instance.port}`;
    const log = openSync(path.join(instance.dir, "server.log"), "a");
    const child = spawn("bun", [path.join(root, "dist/bundle/start.js")], {
        cwd: instance.dir,
        env: {
            ...process.env,
            DATABASE: `postgres://${process.env.USER}@localhost:5432/${instance.db}`,
            CONFIG_PATH: path.join(instance.dir, "config.json"),
            PORT: String(instance.port),
            WRTC_WS_PORT: String(instance.port + 1000),
            NODE_ENV: "development",
            PUBLIC_FETCH_PROXY: fetchProxy,
            PION_SFU_BIN: "",
        },
        stdio: ["ignore", log, log],
    });
    servers.push(child);
    instance.child = child;
    for (let attempt = 0; attempt < 120; attempt++) {
        if (child.exitCode !== null) throw new Error(`instance ${instance.name} exited, see ${path.join(instance.dir, "server.log")}`);
        const ok = await fetch(`${origin}/api/ping`)
            .then((response) => response.ok)
            .catch(() => false);
        if (ok) return;
        await sleep(1000);
    }
    throw new Error(`instance ${instance.name} did not start, see ${path.join(instance.dir, "server.log")}`);
}

async function stopInstance(instance) {
    const child = instance.child;
    if (!child || child.exitCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await Promise.race([exited, sleep(15000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    servers.splice(servers.indexOf(child), 1);
}

async function call(instance, method, route, token, body) {
    const isForm = body instanceof FormData;
    const response = await fetch(route.startsWith("http") ? route : `${instance.api}${route}`, {
        method,
        headers: { ...(body && !isForm && { "content-type": "application/json" }), ...(token && { authorization: token }) },
        body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    const text = await response.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = text.slice(0, 300);
    }
    return { status: response.status, body: json };
}

async function register(instance, username) {
    const email = `${username}-${randomBytes(3).toString("hex")}@fed.test`;
    const response = await call(instance, "POST", "/auth/register", null, {
        email,
        username: `${username}${randomBytes(2).toString("hex")}`,
        password: randomBytes(12).toString("hex"),
        date_of_birth: "2000-01-01",
        consent: true,
    });
    if (!response.body?.token) throw new Error(`register ${username} on ${instance.name}: ${response.status} ${JSON.stringify(response.body)}`);
    const me = await call(instance, "GET", "/users/@me", response.body.token);
    return { token: response.body.token, id: me.body.id, username: me.body.username, instance };
}

const b64u = (bytes) => Buffer.from(bytes).toString("base64url");
const rawKey = (key) => key.export({ format: "jwk" }).x;
const signText = (privateKey, text) => b64u(sign(null, Buffer.from(text), privateKey));
const sorted = (value) =>
    Array.isArray(value)
        ? value.map(sorted)
        : value && typeof value === "object"
          ? Object.fromEntries(
                Object.keys(value)
                    .sort()
                    .map((key) => [key, sorted(value[key])]),
            )
          : value;
const sameJson = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

async function addDevice(account) {
    const device = generateKeyPairSync("ed25519");
    const prekey = generateKeyPairSync("x25519");
    const signingKey = rawKey(device.publicKey);
    const deviceId = b64u(createHash("sha256").update(Buffer.from(signingKey, "base64url")).digest().subarray(0, 16));
    const prekeyPublic = rawKey(prekey.publicKey);
    const response = await call(account.instance, "POST", "/users/@me/e2ee/devices", account.token, {
        device_id: deviceId,
        signing_key: signingKey,
        name: "probe",
        prekey: { id: 1, public_key: prekeyPublic, signature: signText(device.privateKey, `fosscord-e2ee/v1/prekey\n${deviceId}\n1\n${prekeyPublic}`) },
        identity_signature: signText(account.identity.privateKey, `fosscord-e2ee/v1/device\n${account.id}\n${deviceId}\n${signingKey}`),
    });
    if (response.status !== 200) throw new Error(`device for ${account.username}: ${response.status} ${JSON.stringify(response.body)}`);
    account.device = { id: deviceId, privateKey: device.privateKey };
    return deviceId;
}

async function setupE2ee(account) {
    account.identity = generateKeyPairSync("ed25519");
    account.identityKey = rawKey(account.identity.publicKey);
    const identity = await call(account.instance, "PUT", "/users/@me/e2ee/identity", account.token, { public_key: account.identityKey });
    if (identity.status !== 200) throw new Error(`identity for ${account.username}: ${identity.status} ${JSON.stringify(identity.body)}`);
    await addDevice(account);
}

async function encrypt(account, channelId, text, { mid, version, skip } = {}) {
    const query = await call(account.instance, "POST", "/e2ee/keys/query", account.token, { channel_id: channelId });
    const members = query.body?.channel_members ?? [];
    const ids = (await call(account.instance, "GET", `/federation/objects?ids=${[channelId, ...members, ...(mid ? [mid] : [])].join(",")}`, account.token)).body ?? {};
    const local = `@${account.instance.id}`;
    const federated = [channelId, ...members].some((id) => !ids[id]?.endsWith(local));
    const v = version ?? (federated ? 2 : 1);
    const name = (id) => (v === 2 ? ids[id] : id);
    const nonce = mid ? undefined : String((BigInt(Date.now()) - 1420070400000n) << 22n);
    const bind = mid ? `m:${name(mid)}` : `n:${nonce}`;
    const contentKey = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", contentKey, iv);
    cipher.setAAD(Buffer.from(`fosscord-e2ee/v1/msg\n${name(channelId)}\n${name(account.id)}\n${account.device.id}\n${bind}`));
    const ct = b64u(Buffer.concat([cipher.update(JSON.stringify({ content: text })), cipher.final(), cipher.getAuthTag()]));
    const keys = members.flatMap((id) =>
        (query.body.users?.[id]?.devices ?? [])
            .filter((device) => device.status === "active" && device.device_id !== skip)
            .map((device) => ({ user_id: name(id), device_id: device.device_id, prekey_id: device.prekey.id, enc: b64u(randomBytes(32)), wrapped: b64u(randomBytes(48)) })),
    );
    const unsigned = { v, alg: "x25519-hpke-aes256gcm-ed25519", sender_device: account.device.id, ...(mid && { mid: name(mid) }), iv: b64u(iv), ct, keys };
    const signed = [
        "fosscord-e2ee/v1/sig",
        name(channelId),
        name(account.id),
        bind,
        unsigned.v,
        unsigned.alg,
        unsigned.sender_device,
        unsigned.mid ?? null,
        unsigned.iv,
        unsigned.ct,
        [...keys].sort((a, b) => (a.device_id < b.device_id ? -1 : 1)).map((k) => [k.user_id, k.device_id, k.prekey_id, k.enc, k.wrapped]),
    ];
    const encrypted = { ...unsigned, sig: signText(account.device.privateKey, JSON.stringify(signed)) };
    return { body: { content: "🔒 Encrypted message", ...(nonce && { nonce }), encrypted }, contentKey: b64u(contentKey), members, query: query.body };
}

const sendEncrypted = async (account, channelId, text, options) => {
    const sealed = await encrypt(account, channelId, text, options);
    const response = await call(account.instance, "POST", `/channels/${channelId}/messages`, account.token, sealed.body);
    return { ...sealed, response };
};

function gateway(account) {
    const ws = new WebSocket(`ws://localhost:${account.instance.port}/?v=9&encoding=json`, { headers: { origin: `http://localhost:${account.instance.port}` } });
    const events = [];
    const all = [];
    const waiters = [];
    let seq = null;
    let heartbeat;
    const ready = new Promise((resolve, reject) => {
        ws.on("message", (raw) => {
            const message = JSON.parse(raw.toString());
            if (message.s) seq = message.s;
            if (message.op === 10) {
                heartbeat = setInterval(() => ws.send(JSON.stringify({ op: 1, d: seq })), message.d.heartbeat_interval);
                ws.send(JSON.stringify({ op: 2, d: { token: account.token, capabilities: 0, properties: { os: "Mac OS X", browser: "Chrome", device: "" } } }));
            }
            if (message.op !== 0) return;
            events.push(message);
            all.push(message);
            if (message.t === "READY") resolve(message.d);
            for (const waiter of [...waiters])
                if (waiter.predicate(message)) {
                    waiters.splice(waiters.indexOf(waiter), 1);
                    waiter.resolve(message.d);
                }
        });
        ws.on("error", reject);
        ws.on("close", (code) => reject(new Error(`gateway closed ${code}`)));
    });
    const waitFor = (type, predicate = () => true, timeout = 8000) => {
        const found = events.find((message) => message.t === type && predicate(message.d));
        if (found) {
            events.splice(events.indexOf(found), 1);
            return Promise.resolve(found.d);
        }
        return new Promise((resolve) => {
            const waiter = {
                predicate: (message) => message.t === type && predicate(message.d),
                resolve: (data) => {
                    clearTimeout(timer);
                    resolve(data);
                },
            };
            const timer = setTimeout(() => {
                waiters.splice(waiters.indexOf(waiter), 1);
                resolve(null);
            }, timeout);
            waiters.push(waiter);
        });
    };
    const send = (op, d) => ws.send(JSON.stringify({ op, d }));
    const close = () => {
        clearInterval(heartbeat);
        ws.removeAllListeners("close");
        ws.close();
    };
    return { ready, waitFor, send, close, events, all };
}

async function cleanup() {
    for (const child of servers) child.kill("SIGTERM");
    for (const child of tunnels) child.kill("SIGTERM");
    registry.close();
    if (drop) {
        await sleep(2000);
        for (const instance of instances)
            spawnSync("dropdb", ["--host=localhost", "--port=5432", `--username=${process.env.USER}`, "--if-exists", instance.db], { stdio: "inherit" });
    }
}

async function main() {
    if (!existsSync(path.join(root, "dist/bundle/start.js"))) throw new Error("Build first with bun run build:src");
    await new Promise((resolve) => registry.listen(registryPort, "127.0.0.1", resolve));
    if (publicMode) {
        const [registryHost, hostA, hostB] = await Promise.all([openTunnel("registry", registryPort), openTunnel("a", A.port), openTunnel("b", B.port)]);
        registryUrl = `https://${registryHost}`;
        for (const [instance, host] of [
            [A, hostA],
            [B, hostB],
        ]) {
            instance.id = host;
            instance.origin = `https://${host}`;
            instance.publicKey = instanceKey(instance);
        }
        console.log(`public addresses: registry ${registryUrl}, a ${A.origin}, b ${B.origin}, fetch proxy ${fetchProxy}`);
        await Promise.all([registryHost, hostA, hostB].map(waitForEdge));
    }
    if (!reuse) await Promise.all(instances.map(startInstance));

    const alice = await register(A, "alice");
    const admin = await register(A, "admin");
    const bob = await register(B, "bob");
    const carol = await register(B, "carol");
    const dave = await register(B, "dave");
    psql(A.db, `UPDATE users SET rights = '1' WHERE id = '${admin.id}'`);

    for (let attempt = 0; attempt < 40; attempt++) {
        const ready = await Promise.all(
            [
                [A, alice],
                [B, bob],
            ].map(async ([instance, account]) => (await call(instance, "GET", "/federation/discovery", account.token)).body?.available === true),
        );
        if (ready.every(Boolean)) break;
        await sleep(1000);
    }
    check("both instances accepted the local registry document", (await call(A, "GET", "/federation/discovery", alice.token)).body?.available === true);

    let gA = gateway(alice);
    let gB = gateway(bob);
    let gC = gateway(carol);
    let gD = gateway(dave);
    await Promise.all([gA.ready, gB.ready, gC.ready, gD.ready]);
    check("all four gateways are ready", true);

    const guild = await call(A, "POST", "/guilds", alice.token, { name: "Federated cats" });
    const channels = await call(A, "GET", `/guilds/${guild.body.id}/channels`, alice.token);
    const text = channels.body.find((channel) => channel.type === 0);
    const hidden = await call(A, "POST", `/guilds/${guild.body.id}/channels`, alice.token, {
        name: "staff-only",
        type: 0,
        permission_overwrites: [{ id: guild.body.id, type: 0, allow: "0", deny: "1024" }],
    });
    const invite = await call(A, "POST", `/channels/${text.id}/invites`, alice.token, { max_age: 0 });

    const refused = await call(B, "POST", `/federation/invites/${A.id}/${invite.body.code}`, bob.token);
    check("joining is refused while Show on other instances is off", refused.status === 403, `${refused.status} ${JSON.stringify(refused.body)}`);

    const discovery = await call(A, "PATCH", `/guilds/${guild.body.id}/global-discovery`, alice.token, { enabled: true });
    check("the owner turns on Show on other instances", discovery.status === 200, `${discovery.status} ${JSON.stringify(discovery.body)}`);

    const preview = await call(B, "GET", `/federation/invites/${A.id}/${invite.body.code}`, bob.token);
    check(
        "bob previews the remote invite",
        preview.status === 200 && preview.body?.guild?.name === "Federated cats",
        `${preview.status} ${JSON.stringify(preview.body).slice(0, 300)}`,
    );

    const join = await call(B, "POST", `/federation/invites/${A.id}/${invite.body.code}`, bob.token);
    check("bob joins the server on the other instance", join.status === 200 && !!join.body?.guild_id, `${join.status} ${JSON.stringify(join.body).slice(0, 300)}`);
    const mirror = join.body?.guild_id;
    const created = await gB.waitFor("GUILD_CREATE", (d) => d.id === mirror);
    check("bob's gateway gets GUILD_CREATE for the mirror", !!created && created.properties?.name === "Federated cats");
    check("the mirror's GUILD_CREATE names its instance", created?.federated_instance === A.id, String(created?.federated_instance));
    const mirrorText = created?.channels?.find((channel) => channel.name === text.name);
    check("the mirror has the text channel", !!mirrorText);
    check("the mirror leaves out the channel bob can't see", !created?.channels?.some((channel) => channel.name === "staff-only"));
    check("the remote member is listed with a handle", !!created?.members?.some((member) => member.user?.username === `${alice.username}@${A.id}`));
    const aliceAdd = await gA.waitFor("GUILD_MEMBER_ADD", (d) => d.user?.username === `${bob.username}@${B.id}`);
    check("alice sees bob join with his handle", !!aliceAdd);

    const gB2 = gateway(bob);
    const ready = await gB2.ready;
    check(
        "a new session of bob gets the mirror guild in READY",
        ready.guilds.some((g) => g.id === mirror),
    );
    const readyMirror = ready.guilds.find((g) => g.id === mirror);
    check("the mirror in READY names its instance", readyMirror?.federated_instance === A.id, String(readyMirror?.federated_instance));
    gB2.close();

    const remoteChannels = await call(B, "GET", `/guilds/${mirror}/channels`, bob.token);
    check("bob lists the channels through the relay", remoteChannels.status === 200 && remoteChannels.body.some((channel) => channel.id === mirrorText?.id));

    await call(A, "POST", `/channels/${text.id}/messages`, alice.token, { content: "hello from a" });
    const fromA = await gB.waitFor("MESSAGE_CREATE", (d) => d.content === "hello from a");
    check("bob gets alice's message", !!fromA && fromA.channel_id === mirrorText?.id && fromA.author?.username === `${alice.username}@${A.id}`);
    const aliceOnB = fromA?.author?.id;

    const history = await call(B, "GET", `/channels/${mirrorText?.id}/messages?limit=10`, bob.token);
    check("bob reads the history", history.status === 200 && history.body.some?.((message) => message.content === "hello from a"), `${history.status}`);

    const fileForm = (content, name, bytes) => {
        const form = new FormData();
        form.append("payload_json", JSON.stringify({ content }));
        form.append("files[0]", new Blob([bytes], { type: "text/plain" }), name);
        return form;
    };
    const bytesOf = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());
    const fromAliceBytes = Buffer.from(`a file that lives on ${A.id} ${randomBytes(8).toString("hex")}`);
    await call(A, "POST", `/channels/${text.id}/messages`, alice.token, fileForm("file from a", "from-a.txt", fromAliceBytes));
    const fileOnB = await gB.waitFor("MESSAGE_CREATE", (d) => d.content === "file from a");
    const proxied = fileOnB?.attachments?.[0]?.url ?? "";
    check("bob's copy of an attachment points at his instance's media proxy", proxied.startsWith(`${B.origin}/federation-media/${A.id}/attachments/`), proxied);
    check("bob's instance fetches the attachment from alice's instance", proxied && (await bytesOf(proxied)).equals(fromAliceBytes));
    const fromBobBytes = Buffer.from(`a file bob uploads through ${B.id} ${randomBytes(8).toString("hex")}`);
    const sentFile = await call(B, "POST", `/channels/${mirrorText?.id}/messages`, bob.token, fileForm("file from b", "from-b.txt", fromBobBytes));
    check("bob sends a file into the remote channel", sentFile.status === 200, `${sentFile.status} ${JSON.stringify(sentFile.body).slice(0, 200)}`);
    const fileOnA = await gA.waitFor("MESSAGE_CREATE", (d) => d.content === "file from b");
    const hosted = fileOnA?.attachments?.[0]?.url ?? "";
    check("alice's instance stores bob's file on its own CDN", hosted.startsWith(`${A.origin}/attachments/`) && (await bytesOf(hosted)).equals(fromBobBytes), hosted);

    const sent = await call(B, "POST", `/channels/${mirrorText?.id}/messages`, bob.token, { content: `hello from b <@${aliceOnB}>` });
    check("bob sends a message with a mention", sent.status === 200, `${sent.status} ${JSON.stringify(sent.body).slice(0, 300)}`);
    const fromB = await gA.waitFor("MESSAGE_CREATE", (d) => d.content?.startsWith("hello from b"));
    check(
        "alice gets bob's message with her mention in her own ids",
        !!fromB && fromB.content === `hello from b <@${alice.id}>` && fromB.mentions?.some((user) => user.id === alice.id),
    );
    const bobOnA = fromB?.author?.id;
    const echo = await gB.waitFor("MESSAGE_CREATE", (d) => d.id === sent.body?.id);
    check("bob's own gateway gets his message back with the same id", !!echo);

    const edited = await call(B, "PATCH", `/channels/${mirrorText?.id}/messages/${sent.body?.id}`, bob.token, { content: "hello from b, edited" });
    check("bob edits his message", edited.status === 200, `${edited.status}`);
    check("alice sees the edit", !!(await gA.waitFor("MESSAGE_UPDATE", (d) => d.content === "hello from b, edited")));

    const react = await call(B, "PUT", `/channels/${mirrorText?.id}/messages/${fromA?.id}/reactions/${encodeURIComponent("👍")}/@me`, bob.token);
    check("bob reacts to alice's message", react.status === 204, `${react.status} ${JSON.stringify(react.body)}`);
    check("alice sees the reaction", !!(await gA.waitFor("MESSAGE_REACTION_ADD", (d) => d.emoji?.name === "👍" && d.user_id === bobOnA)));

    const typing = await call(B, "POST", `/channels/${mirrorText?.id}/typing`, bob.token);
    check("bob types", typing.status === 204 || typing.status === 200, `${typing.status}`);
    check("alice sees bob typing", !!(await gA.waitFor("TYPING_START", (d) => d.user_id === bobOnA)));
    await call(A, "POST", `/channels/${text.id}/typing`, alice.token);
    check("bob sees alice typing", !!(await gB.waitFor("TYPING_START", (d) => d.user_id === aliceOnB)));

    const members = await call(B, "GET", `/guilds/${mirror}/members?limit=10`, bob.token);
    check("bob lists the members through the relay", members.status === 200 && members.body.some?.((member) => member.user?.id === aliceOnB), `${members.status}`);
    gB.send(8, { guild_id: mirror, query: "", limit: 10 });
    const chunk = await gB.waitFor("GUILD_MEMBERS_CHUNK", (d) => d.guild_id === mirror);
    check("a guild member request on bob's gateway lists alice", !!chunk?.members?.some((member) => member.user?.id === aliceOnB));

    const mentionCount = (instance, user, channel) =>
        Number(psql(instance.db, `SELECT COALESCE(MAX(mention_count), 0) FROM read_states WHERE user_id = '${user}' AND channel_id = '${channel}'`) || 0);
    await call(A, "POST", `/channels/${text.id}/messages`, alice.token, { content: `ping <@${bobOnA}>` });
    const ping = await gB.waitFor("MESSAGE_CREATE", (d) => d.content?.startsWith("ping"));
    check("bob's copy of the ping names him with his own id", ping?.content === `ping <@${bob.id}>` && !!ping.mentions?.some((user) => user.id === bob.id));
    check(
        "a mention from the other instance counts on bob's read state",
        await until(() => mentionCount(B, bob.id, mirrorText?.id) === 1),
        String(mentionCount(B, bob.id, mirrorText?.id)),
    );
    await call(A, "POST", `/channels/${text.id}/messages`, alice.token, { content: "@everyone wake up" });
    await gB.waitFor("MESSAGE_CREATE", (d) => d.content === "@everyone wake up");
    check("@everyone from the other instance counts", await until(() => mentionCount(B, bob.id, mirrorText?.id) === 2), String(mentionCount(B, bob.id, mirrorText?.id)));
    const role = await call(A, "POST", `/guilds/${guild.body.id}/roles`, alice.token, { name: "cats", mentionable: true });
    await call(A, "PUT", `/guilds/${guild.body.id}/members/${bobOnA}/roles/${role.body?.id}`, alice.token);
    await call(A, "POST", `/channels/${text.id}/messages`, alice.token, { content: `<@&${role.body?.id}> dinner` });
    await gB.waitFor("MESSAGE_CREATE", (d) => d.content?.endsWith(" dinner"));
    check("a role mention from the other instance counts", await until(() => mentionCount(B, bob.id, mirrorText?.id) === 3), String(mentionCount(B, bob.id, mirrorText?.id)));
    const suppress = await call(B, "PATCH", `/users/@me/guilds/${mirror}/settings`, bob.token, { suppress_everyone: true });
    check("bob suppresses @everyone in the mirror", suppress.status === 200, `${suppress.status} ${JSON.stringify(suppress.body).slice(0, 200)}`);
    await call(A, "POST", `/channels/${text.id}/messages`, alice.token, { content: "@everyone again" });
    const again = await gB.waitFor("MESSAGE_CREATE", (d) => d.content === "@everyone again");
    await sleep(1000);
    check("a suppressed @everyone doesn't count", !!again && mentionCount(B, bob.id, mirrorText?.id) === 3, String(mentionCount(B, bob.id, mirrorText?.id)));
    const ack = await call(B, "POST", `/channels/${mirrorText?.id}/messages/${again?.id}/ack`, bob.token, {});
    check("bob's ack clears the count", ack.status === 200 && mentionCount(B, bob.id, mirrorText?.id) === 0, `${ack.status} ${mentionCount(B, bob.id, mirrorText?.id)}`);

    const { signRequest } = require(path.join(root, "dist/util/util/federation/Protocol.js"));
    const keyA = createPrivateKey(readFileSync(path.join(A.dir, "federation.key")));
    const duplicateId = String((BigInt(Date.now()) - 1420070400000n) << 22n);
    const wire = {
        id: `probe-${randomBytes(6).toString("hex")}`,
        event: "MESSAGE_CREATE",
        guild_id: `@${guild.body.id}@${A.id}`,
        channel_id: `@${text.id}@${A.id}`,
        recipients: [`@${bob.id}@${B.id}`],
        data: {
            id: `@${duplicateId}@${A.id}`,
            guild_id: `@${guild.body.id}@${A.id}`,
            channel_id: `@${text.id}@${A.id}`,
            content: "delivered twice",
            author: { id: `@${alice.id}@${A.id}`, username: alice.username, discriminator: "0", avatar: null },
            type: 0,
            flags: 0,
            mentions: [],
            mention_roles: [],
            attachments: [],
            embeds: [],
            timestamp: new Date().toISOString(),
        },
    };
    const postInbox = () => {
        const body = Buffer.from(JSON.stringify({ events: [wire] }));
        const headers = signRequest({ method: "POST", path: "/federation/v2/inbox", target: B.id, sender: A.id, body, privateKey: keyA });
        return fetch(`http://localhost:${B.port}/federation/v2/inbox`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body }).then((r) => r.status);
    };
    const posts = [await postInbox(), await postInbox()];
    await sleep(1500);
    check(
        "the inbox applies an event id only once",
        posts.every((status) => status === 200) && gB.all.filter((m) => m.t === "MESSAGE_CREATE" && m.d.content === "delivered twice").length === 1,
        `${posts.join(",")} ${gB.all.filter((m) => m.t === "MESSAGE_CREATE" && m.d.content === "delivered twice").length}`,
    );

    const outbox = () => Number(psql(A.db, `SELECT count(*) FROM federation_outbox WHERE instance = '${B.id}'`));
    for (const socket of [gB, gC, gD]) socket.close();
    await stopInstance(B);
    const queuedTexts = ["queued one", "queued two", "queued three"];
    for (const content of queuedTexts) await call(A, "POST", `/channels/${text.id}/messages`, alice.token, { content });
    check("events for a stopped instance wait in the outbox", await until(() => outbox() >= 3), String(outbox()));
    const depth = await call(A, "GET", "/admin/federation/delivery", admin.token);
    check("the admin page shows the queue depth", (depth.body?.instances?.find((entry) => entry.instance === B.id)?.queued ?? 0) >= 3, JSON.stringify(depth.body).slice(0, 300));
    gA.close();
    await stopInstance(A);
    check("the outbox survives a restart of the sender", outbox() >= 3, String(outbox()));
    await spawnInstance(B);
    gB = gateway(bob);
    gC = gateway(carol);
    gD = gateway(dave);
    await Promise.all([gB.ready, gC.ready, gD.ready]);
    await spawnInstance(A);
    gA = gateway(alice);
    await gA.ready;
    const arrived = [];
    for (const content of queuedTexts) arrived.push(await gB.waitFor("MESSAGE_CREATE", (d) => d.content === content, 60000));
    check("the queued events arrive after both instances restarted", arrived.every(Boolean), arrived.map((m) => !!m).join(","));
    const order = queuedTexts.map((content) => gB.all.findIndex((m) => m.t === "MESSAGE_CREATE" && m.d.content === content));
    check(
        "they arrive in the order they were sent",
        order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1])),
        order.join(","),
    );
    check("the outbox is empty after delivery", await until(() => outbox() === 0), String(outbox()));

    const deleted = await call(B, "DELETE", `/channels/${mirrorText?.id}/messages/${sent.body?.id}`, bob.token);
    check("bob deletes his message", deleted.status === 204, `${deleted.status}`);
    check("alice sees the delete", !!(await gA.waitFor("MESSAGE_DELETE", (d) => d.channel_id === text.id)));
    await call(
        A,
        "DELETE",
        `/channels/${text.id}/messages/${fromA?.id ? (await call(A, "GET", `/channels/${text.id}/messages?limit=50`, alice.token)).body.find((m) => m.content === "hello from a")?.id : ""}`,
        alice.token,
    );
    check("bob sees alice's delete", !!(await gB.waitFor("MESSAGE_DELETE", (d) => d.id === fromA?.id)));

    const reported = await call(A, "POST", `/channels/${text.id}/messages`, alice.token, { content: "report me" });
    const reportedOnB = await gB.waitFor("MESSAGE_CREATE", (d) => d.content === "report me");
    const menu = (await call(B, "GET", "/reporting/menu/message", bob.token)).body;
    const breadcrumbs = (() => {
        const queue = [[menu?.root_node_id]];
        const seen = new Set();
        while (queue.length) {
            const candidate = queue.shift();
            const id = candidate.at(-1);
            if (seen.has(id)) continue;
            seen.add(id);
            const node = menu?.nodes?.[id];
            if (node?.button?.type === "submit") return candidate;
            for (const child of node?.children ?? []) queue.push([...candidate, child[1]]);
            if (node?.button?.type === "next" && node.button.target != null) queue.push([...candidate, node.button.target]);
        }
        return null;
    })();
    const report = await call(B, "POST", "/reporting/message", bob.token, {
        version: menu?.version,
        variant: menu?.variant,
        language: "en",
        breadcrumbs,
        elements: {},
        name: "message",
        channel_id: mirrorText?.id,
        message_id: reportedOnB?.id,
    });
    check("bob reports a message in the mirror", report.status === 200, `${report.status} ${JSON.stringify(report.body).slice(0, 200)}`);
    check(
        "the report reaches the host about the original message",
        psql(A.db, `SELECT count(*) FROM reports WHERE message_id = '${reported.body?.id}' AND channel_id = '${text.id}'`) === "1",
    );

    const hiddenRelay = await call(B, "GET", `/channels/${hidden.body?.id}/messages`, bob.token);
    check("a channel id of the host means nothing on bob's instance", hiddenRelay.status === 404 || hiddenRelay.status === 403, `${hiddenRelay.status}`);

    const leave = await call(B, "DELETE", `/users/@me/guilds/${mirror}`, bob.token);
    check("bob leaves the remote server", leave.status === 204, `${leave.status} ${JSON.stringify(leave.body)}`);
    check("bob's gateway gets GUILD_DELETE", !!(await gB.waitFor("GUILD_DELETE", (d) => d.id === mirror)));
    check("alice sees bob leave", !!(await gA.waitFor("GUILD_MEMBER_REMOVE", (d) => d.user?.id === bobOnA)));
    check("the mirror is gone on bob's instance", (await call(B, "GET", `/guilds/${mirror}`, bob.token)).status >= 400);

    const lookup = await call(A, "GET", `/federation/users/lookup?handle=${encodeURIComponent(`${bob.username}@${B.id}`)}`, alice.token);
    check("alice looks up bob's handle", lookup.status === 200 && lookup.body?.username === `${bob.username}@${B.id}`, `${lookup.status} ${JSON.stringify(lookup.body)}`);
    const request = await call(A, "POST", "/users/@me/relationships", alice.token, { username: `${bob.username}@${B.id}` });
    check("alice sends bob a friend request", request.status === 204, `${request.status} ${JSON.stringify(request.body)}`);
    const incoming = await gB.waitFor("RELATIONSHIP_ADD", (d) => d.type === 3 && d.user?.username === `${alice.username}@${A.id}`);
    check("bob gets the incoming request", !!incoming);
    const accept = await call(B, "PUT", `/users/@me/relationships/${incoming?.id}`, bob.token, {});
    check("bob accepts", accept.status === 204, `${accept.status} ${JSON.stringify(accept.body)}`);
    check("alice sees the friendship", !!(await gA.waitFor("RELATIONSHIP_ADD", (d) => d.type === 1 && d.id === lookup.body?.id)));
    gA.send(3, { status: "dnd", since: 0, activities: [], afk: false });
    check("bob sees alice's status change", !!(await gB.waitFor("PRESENCE_UPDATE", (d) => d.user?.id === aliceOnB && d.status === "dnd")));

    const carolRequest = await call(B, "POST", "/users/@me/relationships", carol.token, { username: `${alice.username}@${A.id}` });
    check("carol sends alice a friend request", carolRequest.status === 204, `${carolRequest.status} ${JSON.stringify(carolRequest.body)}`);
    const carolIncoming = await gA.waitFor("RELATIONSHIP_ADD", (d) => d.type === 3 && d.user?.username === `${carol.username}@${B.id}`);
    check("alice gets carol's request", !!carolIncoming);
    await call(A, "PUT", `/users/@me/relationships/${carolIncoming?.id}`, alice.token, {});
    const carolFriend = await gC.waitFor("RELATIONSHIP_ADD", (d) => d.type === 1);
    check("carol sees the friendship", !!carolFriend);
    const carolOnA = carolIncoming?.id;
    const aliceOnBForCarol = carolFriend?.id;

    for (const account of [alice, bob, carol, dave]) await setupE2ee(account);
    const bobKeys = await call(A, "POST", "/e2ee/keys/query", alice.token, { user_ids: [bobOnA] });
    check(
        "alice's instance serves bob's keys as his instance has them",
        bobKeys.body?.users?.[bobOnA]?.identity_key === bob.identityKey && bobKeys.body.users[bobOnA].devices.some((d) => d.device_id === bob.device.id && d.status === "active"),
        JSON.stringify(bobKeys.body).slice(0, 300),
    );

    const dm = await call(A, "POST", "/users/@me/channels", alice.token, { recipients: [bobOnA] });
    check("alice opens a DM with bob", dm.status === 200, `${dm.status} ${JSON.stringify(dm.body)}`);
    check("the DM with a user of another instance is encrypted", !!dm.body?.e2ee_enabled_at, JSON.stringify(dm.body?.e2ee_enabled_at));
    const plain = await call(A, "POST", `/channels/${dm.body?.id}/messages`, alice.token, { content: "dm from a" });
    check("a plaintext DM to bob is refused", plain.status === 400 && plain.body?.code === 90002, `${plain.status} ${JSON.stringify(plain.body)}`);
    const v1 = await sendEncrypted(alice, dm.body?.id, "local ids", { version: 1 });
    check("a version 1 envelope is refused in a DM across instances", v1.response.status === 400 && v1.response.body?.code === 90003, `${v1.response.status}`);
    const skipped = await sendEncrypted(alice, dm.body?.id, "missing bob", { skip: bob.device.id });
    check("an envelope that skips bob's device is refused", skipped.response.status === 409, `${skipped.response.status}`);
    const first = await sendEncrypted(alice, dm.body?.id, "dm from a");
    check(
        "alice sends a version 2 envelope with canonical ids",
        first.response.status === 200 && first.body.encrypted.v === 2 && first.body.encrypted.keys.some((k) => k.user_id === `@${bob.id}@${B.id}`),
        `${first.response.status} ${JSON.stringify(first.response.body).slice(0, 200)}`,
    );
    const dmCreate = await gB.waitFor("CHANNEL_CREATE", (d) => d.type === 1);
    check("bob gets the DM channel", !!dmCreate);
    check("bob's mirror of the DM is encrypted", !!dmCreate?.e2ee_enabled_at);
    const dmMessage = await gB.waitFor("MESSAGE_CREATE", (d) => d.encrypted?.ct === first.body.encrypted.ct);
    check("bob gets the DM message with the fallback text", !!dmMessage && dmMessage.channel_id === dmCreate?.id && dmMessage.content === "🔒 Encrypted message");
    check("the envelope reaches bob's instance unchanged", sameJson(dmMessage?.encrypted, first.body.encrypted));
    const names = await call(B, "GET", `/federation/objects?ids=${dmCreate?.id},${dmMessage?.id}`, bob.token);
    check(
        "bob's instance names the DM and the message with their canonical ids",
        names.body?.[dmCreate?.id] === `@${dm.body?.id}@${A.id}` && names.body?.[dmMessage?.id] === `@${first.response.body?.id}@${A.id}`,
        JSON.stringify(names.body),
    );
    const keysOnB = await call(B, "POST", "/e2ee/keys/query", bob.token, { channel_id: dmCreate?.id });
    check(
        "bob's instance serves alice's keys for the DM",
        keysOnB.body?.channel_members?.includes(aliceOnB) && keysOnB.body?.users?.[aliceOnB]?.identity_key === alice.identityKey,
        JSON.stringify(keysOnB.body).slice(0, 300),
    );

    const reply = await sendEncrypted(bob, dmCreate?.id, "dm reply from b");
    check("bob replies in the DM through the relay", reply.response.status === 200, `${reply.response.status} ${JSON.stringify(reply.response.body).slice(0, 200)}`);
    const replyOnA = await gA.waitFor("MESSAGE_CREATE", (d) => d.encrypted?.ct === reply.body.encrypted.ct && d.channel_id === dm.body?.id);
    check("alice gets bob's reply with the envelope unchanged", !!replyOnA && sameJson(replyOnA.encrypted, reply.body.encrypted));

    const edit = await encrypt(alice, dm.body?.id, "dm from a, edited", { mid: first.response.body?.id });
    const dmEdited = await call(A, "PATCH", `/channels/${dm.body?.id}/messages/${first.response.body?.id}`, alice.token, edit.body);
    check("alice edits her encrypted DM", dmEdited.status === 200, `${dmEdited.status} ${JSON.stringify(dmEdited.body).slice(0, 200)}`);
    const editOnB = await gB.waitFor("MESSAGE_UPDATE", (d) => d.encrypted?.ct === edit.body.encrypted.ct);
    check("bob sees the edit bound to the canonical message id", editOnB?.encrypted?.mid === `@${first.response.body?.id}@${A.id}`, JSON.stringify(editOnB?.encrypted?.mid));
    const moved = await encrypt(alice, dm.body?.id, "moved", { mid: replyOnA?.id });
    const movedEdit = await call(A, "PATCH", `/channels/${dm.body?.id}/messages/${first.response.body?.id}`, alice.token, moved.body);
    check("an edit bound to another message is refused", movedEdit.status === 400, `${movedEdit.status}`);
    const bobEdit = await encrypt(bob, dmCreate?.id, "dm reply from b, edited", { mid: reply.response.body?.id });
    const bobEdited = await call(B, "PATCH", `/channels/${dmCreate?.id}/messages/${reply.response.body?.id}`, bob.token, bobEdit.body);
    check("bob edits his reply through the relay", bobEdited.status === 200, `${bobEdited.status} ${JSON.stringify(bobEdited.body).slice(0, 200)}`);
    check("alice sees bob's edit", !!(await gA.waitFor("MESSAGE_UPDATE", (d) => d.encrypted?.ct === bobEdit.body.encrypted.ct)));

    const secondDevice = await addDevice(bob);
    check("alice hears about bob's new device", !!(await gA.waitFor("E2EE_DEVICES_UPDATE", (d) => d.user_id === bobOnA)));
    const refreshed = await call(A, "POST", "/e2ee/keys/query", alice.token, { user_ids: [bobOnA] });
    check("alice's instance lists bob's new device", !!refreshed.body?.users?.[bobOnA]?.devices?.some((d) => d.device_id === secondDevice && d.status === "active"));
    const fromNew = await sendEncrypted(bob, dmCreate?.id, "from bob's new device");
    check("bob sends from his new device", fromNew.response.status === 200, `${fromNew.response.status} ${JSON.stringify(fromNew.response.body).slice(0, 200)}`);
    const toBoth = await sendEncrypted(alice, dm.body?.id, "to both of bob's devices");
    check("alice encrypts to both of bob's devices", toBoth.response.status === 200 && toBoth.body.encrypted.keys.filter((k) => k.user_id === `@${bob.id}@${B.id}`).length === 2);

    const dmReport = await call(B, "POST", "/reporting/message", bob.token, {
        version: menu?.version,
        variant: menu?.variant,
        language: "en",
        breadcrumbs,
        elements: {},
        name: "message",
        channel_id: dmCreate?.id,
        message_id: dmMessage?.id,
        e2ee_content_key: edit.contentKey,
        e2ee_context_keys: { [reply.response.body?.id]: bobEdit.contentKey },
    });
    check("bob reports alice's encrypted DM", dmReport.status === 200, `${dmReport.status} ${JSON.stringify(dmReport.body).slice(0, 200)}`);
    const stored = JSON.parse(psql(A.db, `SELECT snapshot FROM reports WHERE message_id = '${first.response.body?.id}'`) || "{}");
    check(
        "alice's instance verifies the reported text",
        stored.encrypted?.verified === true && stored.content === "dm from a, edited",
        JSON.stringify(stored.encrypted ?? stored).slice(0, 300),
    );
    check(
        "the report keeps bob's verified reply as context",
        !!stored.context?.some((entry) => entry.content === "dm reply from b, edited" && entry.encrypted?.verified === true),
        JSON.stringify(stored.context ?? []).slice(0, 300),
    );

    const backupKeys = generateKeyPairSync("x25519");
    const backupPublic = rawKey(backupKeys.publicKey);
    const backup = await call(B, "PUT", "/users/@me/e2ee/backup", bob.token, {
        version: 0,
        mode: "recovery",
        kdf: { name: "hkdf-sha256" },
        salt: b64u(randomBytes(16)),
        wrapped_secret: b64u(randomBytes(60)),
        identity_key: bob.identityKey,
        wrapped_identity: b64u(randomBytes(60)),
        backup_public_key: backupPublic,
        backup_key_signature: signText(bob.identity.privateKey, `fosscord-e2ee/v1/backup-key\n${bob.id}\n${backupPublic}`),
        wrapped_backup_key: b64u(randomBytes(60)),
    });
    check("bob creates a key backup", backup.status === 200, `${backup.status} ${JSON.stringify(backup.body).slice(0, 200)}`);
    const unknownMessage = String((BigInt(Date.now()) - 1420070400000n) << 22n);
    const upload = await call(B, "POST", "/users/@me/e2ee/backup/keys", bob.token, {
        keys: [dmMessage?.id, unknownMessage].map((message_id) => ({ message_id, enc: b64u(randomBytes(32)), wrapped: b64u(randomBytes(48)) })),
    });
    const backedUp = await call(B, "POST", "/users/@me/e2ee/backup/keys/query", bob.token, { message_ids: [dmMessage?.id, unknownMessage] });
    check(
        "bob's instance keeps a backup key for a message hosted on alice's instance, under its local id",
        upload.status === 204 && backedUp.body?.keys?.length === 1 && backedUp.body.keys[0].message_id === dmMessage?.id,
        `${upload.status} ${JSON.stringify(backedUp.body)}`,
    );

    const carolDm = await call(B, "POST", "/users/@me/channels", carol.token, { recipients: [aliceOnBForCarol] });
    check(
        "carol opens an encrypted DM with alice on her own instance",
        carolDm.status === 200 && !!carolDm.body?.e2ee_enabled_at,
        `${carolDm.status} ${JSON.stringify(carolDm.body)}`,
    );
    const carolFirst = await sendEncrypted(carol, carolDm.body?.id, "dm from b");
    check("carol sends an encrypted DM", carolFirst.response.status === 200, `${carolFirst.response.status} ${JSON.stringify(carolFirst.response.body).slice(0, 200)}`);
    const carolDmCreate = await gA.waitFor("CHANNEL_CREATE", (d) => d.type === 1 && d.recipients?.some((user) => user.id === carolOnA));
    check("alice gets carol's DM channel", !!carolDmCreate);
    check("alice gets carol's DM message", !!(await gA.waitFor("MESSAGE_CREATE", (d) => d.encrypted?.ct === carolFirst.body.encrypted.ct)));
    const aliceToCarol = await sendEncrypted(alice, carolDmCreate?.id, "dm reply from a");
    check("alice replies in carol's DM through the relay", aliceToCarol.response.status === 200, `${aliceToCarol.response.status}`);
    check("carol gets alice's reply", !!(await gC.waitFor("MESSAGE_CREATE", (d) => d.encrypted?.ct === aliceToCarol.body.encrypted.ct)));

    const group = await call(A, "POST", "/users/@me/channels", alice.token, { recipients: [bobOnA, carolOnA] });
    check("alice creates a group DM with bob and carol", group.status === 200 && group.body?.type === 3, `${group.status} ${JSON.stringify(group.body).slice(0, 200)}`);
    const groupB = await gB.waitFor("CHANNEL_CREATE", (d) => d.type === 3);
    const groupC = await gC.waitFor("CHANNEL_CREATE", (d) => d.type === 3);
    check("bob and carol get the group DM", !!groupB && !!groupC && groupB.id === groupC.id);
    const groupFirst = await sendEncrypted(alice, group.body?.id, "group from a");
    check(
        "alice encrypts to every device in the group",
        groupFirst.response.status === 200 && groupFirst.body.encrypted.keys.length === 4,
        `${groupFirst.response.status} ${groupFirst.body.encrypted.keys.length}`,
    );
    check("bob gets the group message", !!(await gB.waitFor("MESSAGE_CREATE", (d) => d.encrypted?.ct === groupFirst.body.encrypted.ct)));
    check("carol gets the group message", !!(await gC.waitFor("MESSAGE_CREATE", (d) => d.encrypted?.ct === groupFirst.body.encrypted.ct)));
    const groupReply = await sendEncrypted(carol, groupC?.id, "group from c");
    check("carol posts in the group DM", groupReply.response.status === 200, `${groupReply.response.status} ${JSON.stringify(groupReply.response.body).slice(0, 200)}`);
    check("alice gets carol's group message", !!(await gA.waitFor("MESSAGE_CREATE", (d) => d.encrypted?.ct === groupReply.body.encrypted.ct)));
    check("bob gets carol's group message", !!(await gB.waitFor("MESSAGE_CREATE", (d) => d.encrypted?.ct === groupReply.body.encrypted.ct)));

    const erin = await register(B, "erin");
    const erinLookup = await call(A, "GET", `/federation/users/lookup?handle=${encodeURIComponent(`${erin.username}@${B.id}`)}`, alice.token);
    const erinOnA = erinLookup.body?.id;
    const noKeys = await call(A, "PUT", `/channels/${group.body?.id}/recipients/${erinOnA}`, alice.token);
    check(
        "adding a remote user without keys to the encrypted group is refused",
        noKeys.status === 400 && noKeys.body?.code === 90007,
        `${noKeys.status} ${JSON.stringify(noKeys.body)}`,
    );
    await setupE2ee(erin);
    const strangers = await call(A, "PUT", `/channels/${group.body?.id}/recipients/${erinOnA}`, alice.token);
    check("erin's instance keeps her keys from an instance she shares nothing with", strangers.status === 400, `${strangers.status} ${JSON.stringify(strangers.body)}`);
    await call(B, "POST", "/users/@me/relationships", erin.token, { username: `${alice.username}@${A.id}` });
    const erinIncoming = await gA.waitFor("RELATIONSHIP_ADD", (d) => d.type === 3 && d.id === erinOnA);
    await call(A, "PUT", `/users/@me/relationships/${erinIncoming?.id}`, alice.token, {});
    await sleep(500);
    const added = await call(A, "PUT", `/channels/${group.body?.id}/recipients/${erinOnA}`, alice.token);
    check("alice adds erin once her keys are available", added.status < 300, `${added.status} ${JSON.stringify(added.body)}`);
    const withErin = await sendEncrypted(alice, group.body?.id, "group with erin");
    check(
        "alice encrypts to erin too",
        withErin.response.status === 200 && withErin.body.encrypted.keys.some((k) => k.user_id === `@${erin.id}@${B.id}`),
        `${withErin.response.status}`,
    );

    const bobGroup = await call(B, "POST", "/users/@me/channels", bob.token, { recipients: [aliceOnB, dave.id] });
    check(
        "bob creates a group DM on his instance with alice and dave",
        bobGroup.status === 200 && bobGroup.body?.type === 3,
        `${bobGroup.status} ${JSON.stringify(bobGroup.body).slice(0, 200)}`,
    );
    const bobGroupOnA = await gA.waitFor("CHANNEL_CREATE", (d) => d.type === 3 && d.id !== group.body?.id);
    check("alice gets bob's group DM", !!bobGroupOnA);
    const aliceInBobGroup = await sendEncrypted(alice, bobGroupOnA?.id, "group reply from a");
    check(
        "alice posts in bob's group DM",
        aliceInBobGroup.response.status === 200,
        `${aliceInBobGroup.response.status} ${JSON.stringify(aliceInBobGroup.response.body).slice(0, 200)}`,
    );
    check(
        "bob gets alice's reply in his group DM",
        !!(await gB.waitFor("MESSAGE_CREATE", (d) => d.encrypted?.ct === aliceInBobGroup.body.encrypted.ct && d.channel_id === bobGroup.body?.id)),
    );
    check("dave gets alice's reply in bob's group DM", !!(await gD.waitFor("MESSAGE_CREATE", (d) => d.encrypted?.ct === aliceInBobGroup.body.encrypted.ct)));

    const profile = await call(B, "GET", `/users/${aliceOnB}/profile`, bob.token);
    check(
        "bob fetches alice's profile from her instance",
        profile.status === 200 && profile.body?.user?.username === `${alice.username}@${A.id}`,
        `${profile.status} ${JSON.stringify(profile.body).slice(0, 300)}`,
    );

    const objects = await call(B, "GET", `/federation/objects?ids=${aliceOnB}`, bob.token);
    check("canonical ids resolve", objects.body?.[aliceOnB] === `@${alice.id}@${A.id}`, JSON.stringify(objects.body));
    const reverse = await call(B, "GET", `/federation/objects?canonical=${encodeURIComponent(`@${alice.id}@${A.id}`)},${encodeURIComponent(`@${bob.id}@${B.id}`)}`, bob.token);
    check(
        "canonical ids resolve back to local ids",
        reverse.body?.[`@${alice.id}@${A.id}`] === aliceOnB && reverse.body?.[`@${bob.id}@${B.id}`] === bob.id,
        JSON.stringify(reverse.body),
    );
    const strangerEmoji = `@${String((BigInt(Date.now()) - 1420070400000n) << 22n)}@${A.id}`;
    const fresh = await call(
        B,
        "GET",
        `/federation/objects?canonical=${encodeURIComponent(strangerEmoji)},${encodeURIComponent("@123456789012345678@unknown.example")}`,
        bob.token,
    );
    check(
        "an unknown canonical id gets a local id only for an instance this one federates with",
        /^\d+$/.test(fresh.body?.[strangerEmoji] ?? "") && !fresh.body?.["@123456789012345678@unknown.example"],
        JSON.stringify(fresh.body),
    );

    const gAdmin = await call(A, "POST", "/admin/federation/blocks", admin.token, { kind: "instance", target: B.id, reason: "probe" });
    check("an admin blocks the other instance", gAdmin.status === 200 || gAdmin.status === 201, `${gAdmin.status} ${JSON.stringify(gAdmin.body)}`);
    const afterBlock = await sendEncrypted(alice, dm.body?.id, "after the block");
    check("blocking an instance stops delivery", !(await gB.waitFor("MESSAGE_CREATE", (d) => d.encrypted?.ct === afterBlock.body.encrypted.ct, 5000)));
    const blockedRelay = await call(B, "POST", `/channels/${dmCreate?.id}/messages`, bob.token, (await encrypt(bob, dmCreate?.id, "blocked relay")).body);
    check("relays from the blocked instance are refused", blockedRelay.status >= 400, `${blockedRelay.status}`);
    const delivery = await call(A, "GET", "/admin/federation/delivery", admin.token);
    check("the admin page lists delivery state", delivery.status === 200 && Array.isArray(delivery.body?.instances), `${delivery.status}`);

    for (const socket of [gA, gB, gC, gD]) socket.close();
}

try {
    await main();
} catch (error) {
    failed++;
    failures.push(String(error?.message ?? error));
    console.error(error);
} finally {
    console.log(`\n${passed} passed, ${failed} failed${failures.length ? `\nfailed: ${failures.join("; ")}` : ""}`);
    if (!keep) await cleanup();
    else {
        registry.close();
        for (const child of tunnels) child.kill("SIGTERM");
    }
    process.exit(failed ? 1 : 0);
}
