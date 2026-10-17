# Cloudflare Workers

This page describes the Workers version of Meowcord. It is three Workers: the router in `workers/router`, which also serves the CDN and the web client, the API Worker in `workers/api` and the gateway Worker in `workers/gateway`. Nothing here has been deployed yet. Everything below was checked with `wrangler dev` on one machine. The Bun server is still the supported way to host an instance, and nothing here changes how it runs.

## Routing

`workers/router` is the Worker the instance's domain points at. Cloudflare first looks for a static asset that matches the path and serves it without running any code. Every other request runs `workers/router/src/index.ts`, which picks a target in this order:

1. A request with `Upgrade: websocket` goes to the `GATEWAY` service binding, whatever its path. The client opens the gateway at `/?v=9&encoding=json`.
2. `/_meowcord/*` returns 404. These are files the router reads through its `ASSETS` binding and never serves directly.
3. `/` and every path whose first segment is one of `api`, `.well-known`, `healthz`, `readyz`, `_spacebar`, `__development`, `error-reporting-proxy`, `federation`, `imageproxy`, `external`, `klipy`, `terms`, `tos`, `privacy`, `guidelines`, `widget`, `rtc` or `remote-auth`, and `/static/email/*`, go to the `API` service binding. These are the routes in `src/api/routes` and `src/api/routes_toplevel` that read the database.
4. Media paths go to the CDN code in `workers/cdn/src/media.ts`, described below.
5. `clan-badges`, `embed`, `federation-media`, `federation-upload`, `detectables`, `changelogs`, `bad-domains` and the rest of `media` go to the `API` binding, because they read the database or the cached client.
6. Everything else goes to the web client code in `workers/router/src/client.ts`, and a request that code doesn't answer, such as a `POST` to an unknown path, goes to the `API` binding.

The bindings are declared in `workers/router/wrangler.jsonc` as `API` for the service `meowcord-api` and `GATEWAY` for `meowcord-gateway`. When a binding is missing, or the Worker behind it throws, the router answers 503 with a JSON body. In `wrangler dev`, a binding whose Worker isn't running locally answers 503 by itself. Start the other two Workers with `wrangler dev` in their own directories and the router connects to them through the local dev registry.

## CDN

The CDN runs inside the router, so media is served from the same origin as the client, which is what `GLOBAL_ENV.CDN_HOST` tells the client. `workers/cdn/wrangler.jsonc` deploys the same code on its own as `meowcord-cdn` for an instance that puts its CDN on a separate host.

Files are stored in an R2 bucket bound as `MEDIA`, under the same keys the Bun server's file and S3 storage use, such as `avatars/<user_id>/<hash>` and `attachments/<channel_id>/<attachment_id>/<filename>`. A bucket filled by copying the Bun server's `files` directory works as it is. Uploads store the type sniffed from the file's first bytes as the object's `Content-Type`. An object without one, such as a copied file, has its first 512 bytes read once more on each request to sniff it.

What the CDN Worker does:

- `GET` and `HEAD` for avatars, guild member avatars and banners, icons, banners, splashes, discovery splashes, channel icons, role icons, team icons, app icons and assets, guild event covers, guild space banners, emojis, stickers, soundboard sounds, badge icons, content assets, avatar decoration presets, Krisp models, media channel assets, collectibles shop images and attachments. Each response has the same `Cache-Control`, `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff` headers as the Bun CDN. `Range` requests return 206, and `If-None-Match` returns 304 from R2's ETag.
- Attachments keep the Bun CDN's rules for content types. A sniffed media type is served when it is in the inline list, and HTML, SVG, XML and script files are served as `text/plain` or `application/octet-stream`. When `cdnSignUrls` is on, an attachment needs a valid `ex`, `is` and `hm` signature or the `signature` header. The signature is the same HMAC SHA-256 over the path, the issue time, the expiry, the client IP from `cf-connecting-ip` and the user agent, so a URL signed by the Bun API is accepted by the Worker. This was checked by signing a URL with `getUrlSignature` from `dist/util/Signing` and fetching it from `wrangler dev`: the signed URL returned 200, and the unsigned URL, a different user agent and a changed hash returned 404.
- Signed `POST` uploads with a multipart `file` field to `/attachments/<channel>/<message>`, `/avatars/<user>`, the hash-based prefixes, `/guild-events/<event>`, `/role-icons/<role>`, `/guilds/<guild>/users/<user>/avatars` or `banners`, `/emojis/<id>`, `/stickers/<id>` and `/soundboard-sounds/<id>`. The request needs the `signature` header and gets the same JSON reply as the Bun CDN. Signed `DELETE` removes the object.
- When `externalRequests.discordAssetFallback` is on, or `CDN_UPSTREAM` is `true`, missing content assets, badge icons, default soundboard sounds, avatar decoration presets, Krisp models and media channel assets are fetched once from `cdn.discordapp.com` and written to R2.
- Bundled badge icons from `assets/badge-icons` are uploaded with the static assets under `/_meowcord/badge-icons` and served when R2 has no badge with that name.

### Image resizing

The Bun CDN doesn't resize anything. It ignores `?size=` and serves the stored bytes whatever extension the URL asks for. The Worker resizes with the [Images binding](https://developers.cloudflare.com/images/transform-images/bindings/), bound as `IMAGES`:

- `?size=N` sets both sides, and `?width=` and `?height=` set one each. Every value is clamped to 16 to 4096 pixels and the image is only ever scaled down.
- The extension in the URL or `?format=` picks the output: `.webp`, `.png`, `.jpg` or `.avif`. A `.gif` request for an animated GIF is served as stored unless a size is given, in which case it becomes an animated WebP. `?quality=` sets the quality and `?animated=false` takes the first frame.
- Only PNG, JPEG, WebP, AVIF, GIF and APNG files up to 20 MB are transformed, which is the binding's input limit. Anything else, or a failed transform, is served as stored.
- Transformed images are written to the Workers cache under their full URL, so a repeat request doesn't run the transform again. Cloudflare bills each unique transformation once per calendar month.

The Images binding was chosen over the `cf.image` option on `fetch`, because `cf.image` only transforms images fetched from a URL on a zone with Image Transformations turned on, and the source images here are R2 objects read through a binding. In `wrangler dev` the binding runs an offline version that resizes and converts formats. `/avatars/123/<hash>.png?size=128` returned a 128x128 PNG and `.webp?size=64` returned a WebP.

The PWA icons at `/assets/pwa/icon-180.png`, `icon-192.png` and `icon-512.png` are resized from the instance icon with the same binding. A custom icon is padded onto the app theme colour, as `appIconPng` does with Jimp on the Bun server.

### What the CDN Worker doesn't do

- Video preview frames: the Bun CDN extracts a frame with ffmpeg when an attachment is requested with `?format=`. workerd can't run ffmpeg, so the Worker serves the video as stored.
- Server tag badges at `/clan-badges` read the guild from the database and the badge templates from the cached client, so the router sends them to the API Worker.
- Standard stickers that aren't in R2 yet: the Bun CDN looks the sticker up in the database before fetching it from Discord. Provision them into R2 instead, see [stickers.md](stickers.md).
- Cloud attachment uploads (`/attachments/<channel>/<id>/<filename>` with `PUT`) and the old attachment path migration. Uploads through the API Worker should go to R2 directly or through the signed `POST` above.
- A request body on Workers is capped at 100 MB on the Free and Pro plans, so an attachment upload through the Worker can't be larger than that.

## Web client

`src/bundle/TestClient.ts` serves Discord's web client from `assets/cache`. It is about 470 MB in 15,924 files and must never be committed, so the Workers version uploads it only at deploy time.

`scripts/workers/prepare-assets.mjs` builds `workers/router/.deploy/public`, which `.gitignore` covers, from the local cache:

```sh
bun scripts/workers/prepare-assets.mjs
```

In a git worktree, point it at the main checkout with `CLIENT_CACHE_PATH=<checkout>/assets/cache VENCORD_PATH=<checkout>/assets/vencord`. The script:

- checks the cache against `client/release.json` with `scripts/client-release.js`, the same check the Bun server runs before serving the client, and stops when it fails,
- hardlinks every file instead of copying it, so the directory takes no extra disk space on the same volume, and falls back to copying across volumes,
- leaves out `index.html`, source maps and every `.js`, `.css` and `.wasm` file that isn't in `release-manifest.json`, which the Bun server answers with 404, and the seven Discord images the Bun server replaces with the instance's branding,
- lays out `assets/public` at `/assets`, Equicord at `/assets/vencord`, Monaco at `/vendor/monaco`, the admin and developer portal scripts at `/admin` and `/developers`, and the two service workers at `/e2ee-sw.js` and `/notifications-sw.js`,
- writes `_meowcord/client.json` with Discord's `index.html` already stripped of its Sentry script, nonces, preconnect links, SEO block and icon links, the base `GLOBAL_ENV` with the endpoint keys removed, the client patch scripts in name order, the Equicord hash, the client's route roots and the version hash,
- copies the page templates for `/admin`, `/status`, `/developers`, `/appeal`, `/verify-email` and the 404 page, and `assets/icon.png`,
- writes a `_headers` file that marks `/assets/*` as immutable for a year with `Access-Control-Allow-Origin: *`, and detaches that for the unhashed paths, which get `no-cache` like they do on the Bun server.

With the cache from build 633029 that is 12,543 files: 12,342 under `/assets`, of which 3,582 unreviewed scripts were left out. That is under the Workers Free limit of 20,000 files per version. Workers Paid allows 100,000. No file is larger than the 25 MiB per-file limit, and the script leaves out and lists any file that is, and fails when the total goes over 100,000. Cloudflare compresses assets with Brotli or gzip itself, so `assets/cache_compressed` isn't uploaded.

The HTML is built by the router, because `GLOBAL_ENV` depends on the instance's settings. `src/bundle/ClientHtml.ts` holds the code that both `TestClient.ts` and the router use: it strips the downloaded page, builds the `GLOBAL_ENV` script and inserts the title and app tags. The router renders the page once per isolate and settings, and answers `If-None-Match` with 304. Rendering `/app` from the refactored `TestClient.ts` and from the one on `main` with the same config gave byte-identical pages apart from `HTML_TIMESTAMP`. The router's page differs from the Bun server's in the `?v=` of the touch icon, which is hashed from the icon URL instead of the file.

The router also answers `/favicon.svg`, `/favicon.ico`, `/manifest.webmanifest`, `/static/logo.png`, `/static/wordmark`, the branded images under `/assets`, `/assets/version.<channel>.json`, `/gift/<code>` and the 404 page for paths outside the client's route roots, as `TestClient.ts` does.

Not ported:

- Invite pages (`/invite/<code>`) get the client page without the invite's Open Graph preview, because the preview reads the invite from the database.
- `/add/<name>` serves the client page instead of the add friend card, because the card checks that the user exists.
- Discord images missing from the cache are not fetched from discord.com at request time. The Bun server does that when `externalRequests.discordClientAssets` is on.
- `ActivityHost`, which serves application activities by host name.
- An instance icon or logo configured as a file path. On Workers they must be `http` or `https` URLs.

### Settings

The router reads the instance's settings, in increasing order of precedence, from:

1. `CONFIG_JSON`, the whole instance config as JSON, the same variable the API and gateway Workers read. The router uses `client`, `general.instanceName`, `general.image`, `general.serverName`, `api.endpointPublic`, `cdn.endpointPublic`, `limits.channel`, `limits.e2ee`, `register` and `security`.
2. `CLIENT_SETTINGS`, a JSON object with any of `instanceName`, `instanceId`, `iconUrl`, `logoUrl`, `helpUrl`, `activityApplicationHost`, `loadingTips`, `loadingSvg`, `allowSlowmodeBypass`, `e2eeTrustServer`, `maxGroupDmRecipients`, `emailRequired`, `joinReason` and `cdnEndpoint`.
3. `INSTANCE_NAME`.
4. When `CLIENT_SETTINGS_PATH` is set, the JSON the API Worker returns for that path, fetched through the `API` binding at most once a minute per isolate.

The CDN reads `REQUEST_SIGNATURE`, `CDN_SIGNATURE_KEY`, `CDN_SIGN_URLS`, `CDN_SIGNATURE_INCLUDE_IP`, `CDN_SIGNATURE_INCLUDE_USER_AGENT`, `CDN_ENDPOINT_PUBLIC` and `CDN_UPSTREAM`, and falls back to the matching `security`, `cdn` and `externalRequests` values in `CONFIG_JSON`. Set the two secrets with `wrangler secret put`, or in `workers/router/.dev.vars` for local development.

## Local development

```sh
bun scripts/workers/prepare-assets.mjs
cd workers/router
wrangler types
CHOKIDAR_USEPOLLING=1 CHOKIDAR_INTERVAL=600000 wrangler dev --port 8815
```

`wrangler dev` watches the assets directory, and with 12,543 files its watcher opens so many file descriptors that starting workerd fails with `spawn EBADF`. It worked with 8,000 files and failed with the full directory, on wrangler 4.79.0 and 4.151.1. `CHOKIDAR_USEPOLLING=1` makes the watcher poll instead, and the long interval keeps the polling from using CPU. Rerun the prepare script and restart `wrangler dev` after changing the client.

`wrangler dev` simulates the R2 bucket and the Images binding locally and keeps the bucket in `workers/router/.wrangler/state`. `workers/router/tsconfig.json` typechecks the router and the CDN against the types `wrangler types` writes to `worker-configuration.d.ts`:

```sh
cd workers/router && ../../node_modules/.bin/tsc -p .
```

`scripts/tests/workers-edge.test.mjs` tests the routing table, the upload type sniffing and the client page preparation, and runs with `bun run test`.

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
