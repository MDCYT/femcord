# Cloudflare Workers

This page covers running Meowcord on Cloudflare Workers instead of the Bun server. The Bun server is still the supported way to host an instance, and nothing here changes how it runs.

## Gateway

The gateway Worker is in `workers/gateway`. It runs the same code as `src/gateway`, compiled into `dist`, inside one Durable Object that holds every websocket. It speaks the json and etf encodings, zlib-stream and zstd-stream compression, heartbeats, RESUME, lazy member lists (op 14), member requests (op 8) and the remote auth handshake at `/remote-auth`. Voice (`src/webrtc`) is not part of it.

### Design

Every websocket goes to one Durable Object of the class `GatewayHub`, named `gateway`. The hub accepts sockets with `ctx.acceptWebSocket`, wraps each in a small class that behaves like a `ws` socket, and hands it to the unchanged `Connection` and `Message` handlers.

The gateway keeps shared state in module scope: lazy member list subscriptions, resumable sessions, the guild cache, presence timers and the in-process event emitter that `listenEvent` subscribes to. workerd can run several Durable Object instances of one class in the same isolate, so they would share those modules, and it refuses to let one instance use an I/O object such as a database connection that another instance opened. Splitting sessions or guilds across many objects would mean rewriting that state and rebuilding permissions from the database every time an object wakes. One hub keeps the gateway code as it is.

The limits of one hub are those of one Durable Object: 32,768 hibernatable websockets and one thread of CPU. A larger instance needs more gateway Worker scripts with the API sending each event to all of them, which this Worker does not do yet.

### Hibernation

Each socket stores its encoding, compression, sequence number, user id and session id with `serializeAttachment`. The hub does not hibernate while sockets are open, because the heartbeat timeouts, the resume window and the 15 second presence sweep are timers. If the hub restarts anyway, for example after a deploy, its constructor finds the sockets it no longer knows about, sends each one op 7 RECONNECT in the socket's own encoding and compression, and closes it with code 4000. The client then tries to resume, gets op 9 because the session lived in memory, and identifies again. This path was not tested, because `wrangler dev` drops sockets when it reloads.

### Compression

workerd has `node:zlib`. The Bun server keeps one deflate stream per socket. The Worker compresses each message on its own with `deflateRawSync` and a sync flush instead, and sends the 2 byte zlib header `78 9c` before the first message. Clients decode it the same way as a shared stream, and the socket keeps no compressor state that a restart would lose.

workerd 1.20260329.1, which ships with wrangler 4.79.0, has `zstdCompressSync`, but it fails with "Unexpected end of file" once the compressed output is larger than about 40,950 bytes. Compressing 41,000 random bytes failed and 40,000 succeeded. This is workerd issue 6769. The Worker splits each message into 32 KiB pieces and sends one complete zstd frame per piece, concatenated in the same websocket message. Zstd decoders read concatenated frames as one stream, and the probe checks a 60,000 byte dispatch this way. When a runtime has no `zstdCompressSync`, the gateway closes `compress=zstd-stream` sockets with code 4002 and the reason "zstd-stream is not supported here, use zlib-stream."

### Sending events

The Worker's fetch handler takes events from the API:

| Request                                                      | Response                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| `POST` to any path with one event or an array of events      | 202 with `{"delivered": true}`, or `false` with no socket |
| An event without `event`, or without any of the four ids     | 400                                                       |
| `EVENT_SECRET` set and `x-event-secret` missing or different | 401                                                       |
| `GET /`                                                      | 200 `Online`                                              |
| A websocket upgrade                                          | The gateway, or remote auth under `/remote-auth`          |

An event is the object `emitEvent` passes to `transmit` on the Bun server: `event`, `data`, and one of `guild_id`, `channel_id`, `user_id` or `session_id`. The hub routes it to the first id in that order, as `emitEvent` does. The guild cache invalidation that `emitEvent` sends as `SB_GUILD_CACHE_INVALIDATE` with `channel_id` `sb-guild-cache` must be sent too, or the hub keeps stale guild data.

The API Worker reaches the gateway through a service binding named `GATEWAY`:

```jsonc
"services": [{ "binding": "GATEWAY", "service": "meowcord-gateway" }]
```

```ts
await env.GATEWAY.fetch("https://gateway/events", {
    method: "POST",
    headers: { "content-type": "application/json", "x-event-secret": env.EVENT_SECRET },
    body: JSON.stringify(event),
});
```

### Configuration

| Name                           | Kind               | Use                                                                                                                                           |
| ------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `HYPERDRIVE`                   | Hyperdrive binding | The PostgreSQL database. Replace the placeholder id in `wrangler.jsonc` with the id from `wrangler hyperdrive create`.                         |
| `CONFIG_JSON`                  | Secret             | The instance configuration as one JSON object, the same shape as `config.json`. Set `gateway.endpointPublic` to the gateway Worker's URL.      |
| `JWT_PRIVATE_KEY`              | Secret             | The PEM private key from `jwt.key`. Tokens only verify when the API signs them with the same pair.                                           |
| `JWT_PUBLIC_KEY`               | Secret             | The PEM public key from `jwt.key.pub`.                                                                                                        |
| `EVENT_SECRET`                 | Secret, optional   | Required in `x-event-secret` on event POSTs when set. Requests that arrive over the service binding never leave Cloudflare, so it is optional. |
| `DB_POOL_SIZE`                 | Variable, optional | PostgreSQL connections the hub opens, 5 by default.                                                                                          |
| `DB_LOGGING`                   | Variable, optional | `true` logs every query.                                                                                                                      |

With `CONFIG_JSON` set, the configuration is read only. Changes from the admin dashboard don't reach the gateway until the secret changes. The hub never runs migrations, so the database must already be migrated by the Bun server or the API Worker.

### Bundle

Wrangler bundles the compiled `dist`, because the TypeORM entities need the decorator metadata that `tsc` emits. `workers/gateway/tsconfig.json` maps `@spacebar/*` to `../../dist/*`. Without it, esbuild follows the root `tsconfig.json` into `src` and bundles a second copy of every module, and `instanceof` checks fail between them. The bundle is 18,061,625 bytes, 3,347,030 gzipped, with 1,353 modules from `node_modules`. TypeORM is the largest at 295 modules.

`wrangler.jsonc` points `ws` and `@hpke/core` at their Node builds, because the browser builds that esbuild picks don't work. It replaces `@aws-sdk/client-s3`, `bun:sqlite`, `bcrypt` and `node-unix-socket` with `src/unavailable.ts`, whose exports throw when called, because the gateway never uses them and they don't build for workerd. It defines `__dirname` as `/bundle`. Files are written under `/tmp/meowcord-files`.

### Local development

```sh
bun run build:src
cd workers/gateway
wrangler types
../../node_modules/.bin/tsc -p tsconfig.json
```

Put the secrets in `workers/gateway/.dev.vars`, which git ignores. Wrap `CONFIG_JSON` in single quotes so the double quotes inside stay as they are, and write the keys with `\n` line breaks inside double quotes:

```
CONFIG_JSON='{"gateway":{"endpointPublic":"ws://127.0.0.1:3312"},...}'
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
```

Point Hyperdrive at a local database with an environment variable. The URL needs a password even when PostgreSQL trusts local connections:

```sh
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://user:password@localhost:5432/meowcord wrangler dev --port 3312 --ip 127.0.0.1
```

The probe needs the Bun server on the same database for logins and the seeded accounts in `scripts/dev/.test-account`:

```sh
PORT=3311 GATEWAY=ws://127.0.0.1:3312 bun scripts/dev/workers-gateway-probe.mjs
```

It runs every encoding and compression pair through HELLO, READY, a heartbeat ACK, a posted MESSAGE_CREATE, a 60,000 byte dispatch and RESUME, then a lazy member list, a member request, the remote auth handshake and a POST without an id. A cold start of the hub took about 6 seconds and READY took 29 to 150 ms afterwards on a loaded laptop.

### What doesn't work

- Voice. `src/webrtc` needs UDP and the SFU process, which Workers don't have.
- `/_spacebar/gateway/admin/introspect` is not served.
- One hub per Worker script, so at most 32,768 sockets.
- Sessions live in the hub's memory, so a restart makes every client identify again.
