import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
};
const port = flag("port", process.env.PORT || "3001");
const runs = Number(flag("runs", "30"));
const concurrency = Number(flag("concurrency", "8"));
const only = flag("only");
const trace = args.includes("--trace");
const api = `http://localhost:${port}/api/v9`;
const logPath = process.env.SERVER_LOG || new URL("../../server.log", import.meta.url).pathname;
const countQueries = args.includes("--queries");
const pid = execFileSync("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"])
    .toString()
    .trim()
    .split("\n")[0];
const cpuMs = () => {
    const [rest, fraction] = execFileSync("ps", ["-o", "time=", "-p", pid]).toString().trim().split(".");
    return (
        (rest
            .split(":")
            .map(Number)
            .reduce((a, b) => a * 60 + b, 0) +
            Number(`0.${fraction}`)) *
        1000
    );
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fixture = JSON.parse(readFileSync(new URL("./.perf-fixture.json", import.meta.url), "utf8"));
const userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const call = async (method, path, token, body) => {
    for (;;) {
        const started = performance.now();
        const res = await fetch(`${api}${path}`, {
            method,
            headers: { ...(body && { "content-type": "application/json" }), authorization: token },
            body: body && JSON.stringify(body),
        });
        const text = await res.text();
        if (res.status === 429) {
            await sleep(Math.ceil((JSON.parse(text).retry_after ?? 1) * 1000) + 50);
            continue;
        }
        if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
        return performance.now() - started;
    }
};

const connect = (token) =>
    new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}/?encoding=json&v=9`, { headers: { "user-agent": userAgent } });
        const waiters = [];
        const socket = {
            ws,
            wait: (predicate, timeout = 15000) =>
                new Promise((res, rej) => {
                    const waiter = { predicate, res };
                    waiters.push(waiter);
                    setTimeout(() => {
                        const i = waiters.indexOf(waiter);
                        if (i === -1) return;
                        waiters.splice(i, 1);
                        rej(new Error("gateway wait timed out"));
                    }, timeout);
                }),
            send: (payload) => ws.send(JSON.stringify(payload)),
            close: () => ws.close(1000),
        };
        let started;
        ws.on("message", (raw) => {
            const payload = JSON.parse(raw.toString());
            if (payload.op === 10) {
                const beat = setInterval(() => ws.readyState === 1 && socket.send({ op: 1, d: null }), payload.d.heartbeat_interval * 0.8);
                ws.on("close", () => clearInterval(beat));
                started = performance.now();
                socket.send({
                    op: 2,
                    d: {
                        token,
                        capabilities: 30717,
                        properties: { os: "Linux", browser: "Chrome" },
                        presence: { status: "online", activities: [], afk: false, since: 0 },
                        compress: false,
                        client_state: { guild_versions: {} },
                    },
                });
            }
            if (payload.t === "READY") {
                socket.readyMs = performance.now() - started;
                socket.readyBytes = raw.length;
                resolve(socket);
            }
            if (payload.op === 9) reject(new Error("invalid session"));
            for (const waiter of [...waiters])
                if (waiter.predicate(payload)) {
                    waiters.splice(waiters.indexOf(waiter), 1);
                    waiter.res(payload);
                }
        });
        ws.on("error", reject);
        setTimeout(() => reject(new Error("identify timed out")), 20000);
    });

const logSize = () => (existsSync(logPath) ? statSync(logPath).size : 0);
const readLog = (from) => {
    const size = logSize();
    const buffer = Buffer.alloc(size - from);
    const fd = openSync(logPath, "r");
    readSync(fd, buffer, 0, buffer.length, from);
    closeSync(fd);
    return buffer.toString("utf8");
};
const settle = async () => {
    let size = logSize();
    for (;;) {
        await sleep(countQueries ? 200 : 20);
        const next = logSize();
        if (next === size) return;
        size = next;
    }
};
const queriesIn = (text) => text.split("\n").filter((line) => /^query( failed)?:/.test(line));

const { tester, friend, general, guild, channels } = fixture;
const read = async (path) => (await fetch(`${api}${path}`, { headers: { authorization: friend.token } })).json();
const history = await read(`/channels/${general}/messages?limit=100`);
const middle = (await read(`/channels/${general}/messages?limit=100&before=${history.at(-1).id}`)).at(-1).id;
let n = 0;
const author = () => fixture.users[n % fixture.users.length].token;
const socket = await connect(friend.token);
const watcher = await connect(tester.token);
{
    const listed = watcher.wait((p) => p.t === "GUILD_MEMBER_LIST_UPDATE" && p.d.guild_id === guild);
    watcher.send({ op: 14, d: { guild_id: guild, channels: { [general]: [[0, 99]] } } });
    await listed;
}
const presencePool = await Promise.all(fixture.users.slice(-12).map((user) => connect(user.token).then((s) => Object.assign(s, { user_id: user.id }))));

const scenarios = {
    "GET history latest": () => call("GET", `/channels/${general}/messages?limit=50`, friend.token),
    "GET history before": () => call("GET", `/channels/${general}/messages?limit=50&before=${middle}`, friend.token),
    "GET history around": () => call("GET", `/channels/${general}/messages?limit=50&around=${middle}`, friend.token),
    "POST message": () => call("POST", `/channels/${general}/messages`, author(), { content: `hot path ${++n}`, nonce: `${Date.now()}${n}` }),
    "POST message mention": () =>
        call("POST", `/channels/${general}/messages`, author(), {
            content: `hot path <@${tester.id}> <@&${fixture.roles[1]}> ${++n}`,
            nonce: `${Date.now()}${n}`,
        }),
    "POST message reply": () =>
        call("POST", `/channels/${general}/messages`, author(), {
            content: `hot reply ${++n}`,
            message_reference: { message_id: middle, channel_id: general },
        }),
    "POST message heavy author": async () => {
        await sleep(750);
        return call("POST", `/channels/${general}/messages`, friend.token, { content: `heavy author ${++n}`, nonce: `${Date.now()}${n}` });
    },
    "POST typing": () => call("POST", `/channels/${general}/typing`, author()),
    "POST ack": () => call("POST", `/channels/${general}/messages/${history[n++ % 50].id}/ack`, friend.token, { token: null }),
    "GET channel": () => call("GET", `/channels/${channels[n++ % channels.length]}`, friend.token),
    "GET guild channels": () => call("GET", `/guilds/${guild}/channels`, friend.token),
    "GET members 1000": () => call("GET", `/guilds/${guild}/members?limit=1000`, friend.token),
    "GW identify": async () => {
        const s = await connect(fixture.users[n++ % fixture.users.length].token);
        s.close();
        return s.readyMs;
    },
    "GW lazy request": async () => {
        const channel = channels[n++ % channels.length];
        const reply = socket.wait((p) => p.t === "GUILD_MEMBER_LIST_UPDATE" && p.d.guild_id === guild);
        socket.send({ op: 14, d: { guild_id: guild, channels: { [channel]: [[0, 99]] }, typing: true, activities: true, threads: true } });
        await reply;
    },
    "GW presence": async () => {
        const target = presencePool[n++ % presencePool.length];
        const status = (target.status = target.status === "idle" ? "online" : "idle");
        const seen = watcher.wait((p) => p.t === "PRESENCE_UPDATE" && p.d.user?.id === target.user_id && p.d.status === status);
        target.send({ op: 3, d: { status, since: 0, activities: [], afk: false } });
        await seen;
    },
};

const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
};

const errors = {};
const attempt = async (name, fn) => {
    try {
        return await fn();
    } catch (error) {
        errors[name] = (errors[name] ?? 0) + 1;
        if (errors[name] === 1) console.error(`${name}: ${error.message}`);
        return null;
    }
};
for (const [name, fn] of Object.entries(scenarios)) if (!only || name.includes(only)) await attempt(name, fn);
await settle();

const rows = [];
for (const [name, fn] of Object.entries(scenarios)) {
    if (only && !name.includes(only)) continue;
    const counts = [];
    const times = [];
    let sample;
    const cpuBefore = cpuMs();
    for (let i = 0; i < runs; i++) {
        await settle();
        const from = logSize();
        const started = performance.now();
        const measured = await attempt(name, fn);
        if (measured === null) continue;
        times.push(typeof measured === "number" ? measured : performance.now() - started);
        if (!countQueries) continue;
        await settle();
        const lines = queriesIn(readLog(from));
        counts.push(lines.length);
        sample ??= lines;
    }
    const cpu = (cpuMs() - cpuBefore) / runs;
    let throughput;
    if (!countQueries && concurrency > 1 && /^(GET|POST typing|POST ack)/.test(name)) {
        const started = performance.now();
        await Promise.all(
            Array.from({ length: concurrency }, async () => {
                for (let i = 0; i < Math.ceil(runs / concurrency) * 2; i++) await attempt(name, fn);
            }),
        );
        throughput = (concurrency * Math.ceil(runs / concurrency) * 2) / ((performance.now() - started) / 1000);
    }
    rows.push({
        name,
        queries: counts.length ? percentile(counts, 0.5) : null,
        p50: percentile(times, 0.5),
        p95: percentile(times, 0.95),
        cpu,
        throughput,
        errors: errors[name] ?? 0,
    });
    if (trace && sample) {
        console.log(`\n${name}: ${sample.length} queries`);
        sample.forEach((line, i) => console.log(`${String(i + 1).padStart(3)} ${line.replace(/ -- PARAMETERS: .*/, "").slice(0, 300)}`));
    }
}
socket.close();
watcher.close();
for (const s of presencePool) s.close();

console.log(
    `\n${"scenario".padEnd(22)} ${"queries".padStart(8)} ${"p50 ms".padStart(8)} ${"p95 ms".padStart(8)} ${"cpu ms".padStart(8)} ${"req/s".padStart(8)} ${"errors".padStart(7)}`,
);
for (const r of rows)
    console.log(
        `${r.name.padEnd(22)} ${String(r.queries ?? "-").padStart(8)} ${(r.p50 ?? NaN).toFixed(1).padStart(8)} ${(r.p95 ?? NaN).toFixed(1).padStart(8)} ${r.cpu.toFixed(1).padStart(8)} ${(r.throughput ? r.throughput.toFixed(0) : "-").padStart(8)} ${String(r.errors).padStart(7)}`,
    );
console.log(`\n${runs} runs per scenario${countQueries ? `, queries from ${logPath}` : `, throughput at concurrency ${concurrency}`}`);
process.exit(0);
