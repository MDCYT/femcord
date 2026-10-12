import { spawn, spawnSync } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
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
for (const instance of instances) {
    instance.id = `localhost:${instance.port}`;
    instance.api = `http://localhost:${instance.port}/api/v9`;
    instance.dir = path.join(runDir, instance.name);
}
const [A, B] = instances;

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
            instances: [],
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
    const origin = `http://localhost:${instance.port}`;
    writeFileSync(
        path.join(instance.dir, "config.json"),
        JSON.stringify(
            {
                general: { serverName: origin },
                api: { endpointPublic: `${origin}/api/v9` },
                cdn: { endpointPublic: `${origin}/`, endpointPrivate: `${origin}/` },
                gateway: { endpointPublic: `ws://localhost:${instance.port}/` },
                security: { allowPrivateNetworkRequests: true, captcha: { blockAutomatedBrowsers: false } },
                register: { requireCaptcha: false },
                federation: {
                    enabled: true,
                    announce: false,
                    allowUnlistedPeers: true,
                    peers: [other.id],
                    registry: { url: `http://localhost:${registryPort}`, publicKey: registryPublic },
                },
                limits: { rate: { enabled: false, routes: { auth: { register: { count: 100, window: 60 } } } } },
            },
            null,
            2,
        ),
    );
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
            PUBLIC_FETCH_PROXY: "direct",
            PION_SFU_BIN: "",
        },
        stdio: ["ignore", log, log],
    });
    servers.push(child);
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

function gateway(account) {
    const ws = new WebSocket(`ws://localhost:${account.instance.port}/?v=9&encoding=json`, { headers: { origin: `http://localhost:${account.instance.port}` } });
    const events = [];
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
    return { ready, waitFor, send, close, events };
}

async function cleanup() {
    for (const child of servers) child.kill("SIGTERM");
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

    const gA = gateway(alice);
    const gB = gateway(bob);
    const gC = gateway(carol);
    const gD = gateway(dave);
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

    const deleted = await call(B, "DELETE", `/channels/${mirrorText?.id}/messages/${sent.body?.id}`, bob.token);
    check("bob deletes his message", deleted.status === 204, `${deleted.status}`);
    check("alice sees the delete", !!(await gA.waitFor("MESSAGE_DELETE", (d) => d.channel_id === text.id)));
    await call(
        A,
        "DELETE",
        `/channels/${text.id}/messages/${fromA?.id ? (await call(A, "GET", `/channels/${text.id}/messages?limit=5`, alice.token)).body.find((m) => m.content === "hello from a")?.id : ""}`,
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

    const dm = await call(A, "POST", "/users/@me/channels", alice.token, { recipients: [lookup.body?.id] });
    check("alice opens a DM with bob", dm.status === 200, `${dm.status} ${JSON.stringify(dm.body)}`);
    await call(A, "POST", `/channels/${dm.body?.id}/messages`, alice.token, { content: "dm from a" });
    const dmCreate = await gB.waitFor("CHANNEL_CREATE", (d) => d.type === 1);
    check("bob gets the DM channel", !!dmCreate);
    const dmMessage = await gB.waitFor("MESSAGE_CREATE", (d) => d.content === "dm from a");
    check("bob gets the DM message", !!dmMessage && dmMessage.channel_id === dmCreate?.id);
    const reply = await call(B, "POST", `/channels/${dmCreate?.id}/messages`, bob.token, { content: "dm reply from b" });
    check("bob replies in the DM", reply.status === 200, `${reply.status} ${JSON.stringify(reply.body).slice(0, 200)}`);
    check("alice gets bob's DM reply", !!(await gA.waitFor("MESSAGE_CREATE", (d) => d.content === "dm reply from b" && d.channel_id === dm.body?.id)));

    const carolDm = await call(B, "POST", "/users/@me/channels", carol.token, { recipients: [aliceOnBForCarol] });
    check("carol opens a DM with alice on her own instance", carolDm.status === 200, `${carolDm.status} ${JSON.stringify(carolDm.body)}`);
    await call(B, "POST", `/channels/${carolDm.body?.id}/messages`, carol.token, { content: "dm from b" });
    const carolDmCreate = await gA.waitFor("CHANNEL_CREATE", (d) => d.type === 1 && d.recipients?.some((user) => user.id === carolOnA));
    check("alice gets carol's DM channel", !!carolDmCreate);
    check("alice gets carol's DM message", !!(await gA.waitFor("MESSAGE_CREATE", (d) => d.content === "dm from b")));
    await call(A, "POST", `/channels/${carolDmCreate?.id}/messages`, alice.token, { content: "dm reply from a" });
    check("carol gets alice's reply", !!(await gC.waitFor("MESSAGE_CREATE", (d) => d.content === "dm reply from a")));

    const group = await call(A, "POST", "/users/@me/channels", alice.token, { recipients: [lookup.body?.id, carolOnA] });
    check("alice creates a group DM with bob and carol", group.status === 200 && group.body?.type === 3, `${group.status} ${JSON.stringify(group.body).slice(0, 200)}`);
    const groupB = await gB.waitFor("CHANNEL_CREATE", (d) => d.type === 3);
    const groupC = await gC.waitFor("CHANNEL_CREATE", (d) => d.type === 3);
    check("bob and carol get the group DM", !!groupB && !!groupC && groupB.id === groupC.id);
    await call(A, "POST", `/channels/${group.body?.id}/messages`, alice.token, { content: "group from a" });
    check("bob gets the group message", !!(await gB.waitFor("MESSAGE_CREATE", (d) => d.content === "group from a")));
    check("carol gets the group message", !!(await gC.waitFor("MESSAGE_CREATE", (d) => d.content === "group from a")));
    const groupReply = await call(B, "POST", `/channels/${groupC?.id}/messages`, carol.token, { content: "group from c" });
    check("carol posts in the group DM", groupReply.status === 200, `${groupReply.status} ${JSON.stringify(groupReply.body).slice(0, 200)}`);
    check("alice gets carol's group message", !!(await gA.waitFor("MESSAGE_CREATE", (d) => d.content === "group from c")));
    check("bob gets carol's group message", !!(await gB.waitFor("MESSAGE_CREATE", (d) => d.content === "group from c")));

    const bobGroup = await call(B, "POST", "/users/@me/channels", bob.token, { recipients: [aliceOnB, dave.id] });
    check(
        "bob creates a group DM on his instance with alice and dave",
        bobGroup.status === 200 && bobGroup.body?.type === 3,
        `${bobGroup.status} ${JSON.stringify(bobGroup.body).slice(0, 200)}`,
    );
    const bobGroupOnA = await gA.waitFor("CHANNEL_CREATE", (d) => d.type === 3 && d.id !== group.body?.id);
    check("alice gets bob's group DM", !!bobGroupOnA);
    await call(A, "POST", `/channels/${bobGroupOnA?.id}/messages`, alice.token, { content: "group reply from a" });
    check("bob gets alice's reply in his group DM", !!(await gB.waitFor("MESSAGE_CREATE", (d) => d.content === "group reply from a" && d.channel_id === bobGroup.body?.id)));
    check("dave gets alice's reply in bob's group DM", !!(await gD.waitFor("MESSAGE_CREATE", (d) => d.content === "group reply from a")));

    const profile = await call(B, "GET", `/users/${aliceOnB}/profile`, bob.token);
    check(
        "bob fetches alice's profile from her instance",
        profile.status === 200 && profile.body?.user?.username === `${alice.username}@${A.id}`,
        `${profile.status} ${JSON.stringify(profile.body).slice(0, 300)}`,
    );

    const objects = await call(B, "GET", `/federation/objects?ids=${aliceOnB}`, bob.token);
    check("canonical ids resolve", objects.body?.[aliceOnB] === `@${alice.id}@${A.id}`, JSON.stringify(objects.body));

    const gAdmin = await call(A, "POST", "/admin/federation/blocks", admin.token, { kind: "instance", target: B.id, reason: "probe" });
    check("an admin blocks the other instance", gAdmin.status === 200 || gAdmin.status === 201, `${gAdmin.status} ${JSON.stringify(gAdmin.body)}`);
    await call(A, "POST", `/channels/${dm.body?.id}/messages`, alice.token, { content: "after the block" });
    check("blocking an instance stops delivery", !(await gB.waitFor("MESSAGE_CREATE", (d) => d.content === "after the block", 5000)));
    const blockedRelay = await call(B, "POST", `/channels/${dmCreate?.id}/messages`, bob.token, { content: "blocked relay" });
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
    else registry.close();
    process.exit(failed ? 1 : 0);
}
