# Cloudflare Workers

Meowcord can run as three Cloudflare Workers instead of the Bun server. Nobody has deployed this yet. It was tested with `wrangler dev` on one machine, and the Bun server described in [setup.md](setup.md) is still the supported way to host an instance. Voice doesn't run on Workers.

| Worker             | Directory          | What it does                                                                                       |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------------- |
| `meowcord`         | `workers/router`   | Takes every request for the instance's domain. Serves the web client and the CDN, and forwards the rest. |
| `meowcord-api`     | `workers/api`      | The REST API from `src/api`, and the background jobs on a Cron Trigger.                             |
| `meowcord-gateway` | `workers/gateway`  | The gateway from `src/gateway`, in one Durable Object.                                              |
| `meowcord-cdn`     | `workers/cdn`      | Optional. The router's CDN code on its own, for an instance with its CDN on a separate host.         |

The router binds the other two as `API` and `GATEWAY`, and the API binds the gateway as `GATEWAY`. The router answers 503 when a binding is missing or its Worker throws. The API and gateway reach PostgreSQL through a Hyperdrive binding named `HYPERDRIVE`. The router and CDN store files in the R2 bucket `meowcord-media`, bound as `MEDIA`, and resize images with the Images binding `IMAGES`.

The background jobs need Workers Paid. A Cron Trigger on Workers Free gets 10 ms of CPU time, which isn't enough to start the API.

## Deploy

Run these from the repository root. `bunx wrangler@4.79.0` is the version the Workers were tested with.

1. Build the server and migrate the database. The Workers never run migrations.

    ```sh
    bun install
    bun run build:src
    DATABASE=postgres://user:password@db.example:5432/meowcord bun run apply:migrations
    ```

2. Create the keys, unless you are moving an instance that already has `jwt.key`, `jwt.key.pub` and `federation.key`. Every Worker and any Bun server on the same database need the same JWT pair. `event.secret` is the shared secret the API sends with every event it posts to the gateway. `.gitignore` covers `jwt.key*` and `federation.key*` but not `event.secret` or the `instance.json` from the next step, so don't commit those.

    ```sh
    openssl ecparam -name secp521r1 -genkey -noout -out jwt.key
    openssl ec -in jwt.key -pubout -out jwt.key.pub
    openssl genpkey -algorithm ed25519 -out federation.key
    openssl rand -hex 32 > event.secret
    ```

3. Create the Hyperdrive config and the R2 bucket. Put the Hyperdrive id that the first command prints in place of the placeholder id in `workers/api/wrangler.jsonc` and `workers/gateway/wrangler.jsonc`.

    ```sh
    bunx wrangler@4.79.0 hyperdrive create meowcord --connection-string="postgres://user:password@db.example:5432/meowcord"
    bunx wrangler@4.79.0 r2 bucket create meowcord-media
    ```

4. Write the instance configuration as one JSON file in the shape of `config.json`, here `instance.json`. Set at least `general.serverName`, `api.endpointPublic`, `cdn.endpointPublic` and `gateway.endpointPublic` to the instance's address. The router forwards websocket upgrades on any path to the gateway, so `gateway.endpointPublic` can be the instance's own `wss://` address. Also set `security.requestSignature` and `security.cdnSignatureKey`, because the router reads them from this file and they have to match what the API uses.

5. Deploy the gateway, then give it its secrets.

    ```sh
    cd workers/gateway
    bunx wrangler@4.79.0 deploy
    bunx wrangler@4.79.0 secret put JWT_PRIVATE_KEY < ../../jwt.key
    bunx wrangler@4.79.0 secret put JWT_PUBLIC_KEY < ../../jwt.key.pub
    bunx wrangler@4.79.0 secret put CONFIG_JSON < ../../instance.json
    bunx wrangler@4.79.0 secret put EVENT_SECRET < ../../event.secret
    cd ../..
    ```

6. Deploy the API. Its `build.command` runs `bun build.ts`, which bundles the compiled `dist`, so rebuild `dist` before every deploy. Leave out `FEDERATION_KEY` if federation is off.

    ```sh
    cd workers/api
    bun install
    bunx wrangler@4.79.0 deploy
    bunx wrangler@4.79.0 secret put JWT_PRIVATE_KEY < ../../jwt.key
    bunx wrangler@4.79.0 secret put JWT_PUBLIC_KEY < ../../jwt.key.pub
    bunx wrangler@4.79.0 secret put CONFIG_JSON < ../../instance.json
    bunx wrangler@4.79.0 secret put EVENT_SECRET < ../../event.secret
    bunx wrangler@4.79.0 secret put FEDERATION_KEY < ../../federation.key
    cd ../..
    ```

7. Prepare the client assets and deploy the router. Add the instance's domain to `workers/router/wrangler.jsonc` first, as `"routes": [{ "pattern": "meow.example", "custom_domain": true }]`.

    ```sh
    bun run generate:client
    bun scripts/workers/prepare-assets.mjs
    cd workers/router
    bunx wrangler@4.79.0 deploy
    bunx wrangler@4.79.0 secret put CONFIG_JSON < ../../instance.json
    ```

Keep `EVENT_SECRET` set on both. Without it the gateway accepts event posts from anyone, and `wrangler deploy` also publishes it on a `workers.dev` address.

## Configuration

The API and gateway Workers keep the configuration in the database's `config` table, so the admin dashboard can change it. When the table is empty, the first isolate writes `CONFIG_JSON` merged over the defaults into it. Once the table has rows, `CONFIG_JSON` is ignored by both. `CONFIG_OVERRIDE` is merged over the table on every load. Each isolate reloads the table after `CONFIG_TTL_SECONDS`. A save in the admin dashboard makes the gateway reload at once, and other API isolates pick it up within the TTL.

### API Worker

| Name                 | Kind               | Use                                                                                         |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| `HYPERDRIVE`         | Hyperdrive binding | The PostgreSQL database.                                                                     |
| `GATEWAY`            | Service binding    | `meowcord-gateway`. Without it, events are dropped.                                          |
| `JWT_PRIVATE_KEY`    | Secret             | The PEM private key from `jwt.key`.                                                          |
| `JWT_PUBLIC_KEY`     | Secret             | The PEM public key from `jwt.key.pub`.                                                       |
| `CONFIG_JSON`        | Secret, optional   | The configuration that fills an empty `config` table.                                       |
| `CONFIG_OVERRIDE`    | Secret, optional   | A JSON object merged over the table on every load.                                          |
| `CONFIG_TTL_SECONDS` | Variable, optional | How old an isolate's configuration can get before a request reloads it, 30 by default.     |
| `EVENT_SECRET`       | Secret             | Sent as `x-event-secret` with every event posted to the gateway. Set the same value there.  |
| `FEDERATION_KEY`     | Secret, optional   | The PEM Ed25519 key from `federation.key`. Without it the federation jobs do nothing.       |
| `DB_POOL_SIZE`       | Variable, optional | Database connections per request, 5 by default. Hyperdrive does the real pooling.           |
| `JOBS_BUDGET_MS`     | Variable, optional | How long one cron run keeps starting jobs, 25000 by default.                                |
| `STORAGE_LOCATION`   | Variable, optional | Where API routes write files, `/tmp/files` by default. `/tmp` lasts for one request.       |

### Gateway Worker

The gateway takes `HYPERDRIVE`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `CONFIG_JSON`, `CONFIG_OVERRIDE`, `CONFIG_TTL_SECONDS` and `DB_POOL_SIZE` with the same meaning as the API. `EVENT_SECRET`, when set, has to arrive in `x-event-secret` on every event post, or the gateway answers 401. `DB_LOGGING` set to `true` logs every query.

### Router and CDN

The router never reads the database. It takes the instance's settings from these, each one overriding the ones before it:

1. `CONFIG_JSON`. The router reads `client`, `general`, `api.endpointPublic`, `cdn.endpointPublic`, `limits.channel`, `limits.e2ee`, `register` and `security` from it.
2. `CLIENT_SETTINGS`, a JSON object with any of `instanceName`, `instanceId`, `iconUrl`, `logoUrl`, `helpUrl`, `activityApplicationHost`, `loadingTips`, `loadingSvg`, `allowSlowmodeBypass`, `e2eeTrustServer`, `maxGroupDmRecipients`, `emailRequired`, `joinReason` and `cdnEndpoint`.
3. `INSTANCE_NAME`.
4. With `CLIENT_SETTINGS_PATH` set, the JSON the API Worker returns for that path, fetched at most once a minute per isolate.

The instance icon and logo have to be `http` or `https` URLs on Workers, not file paths.

The CDN code reads `REQUEST_SIGNATURE`, `CDN_SIGNATURE_KEY`, `CDN_SIGN_URLS`, `CDN_SIGNATURE_INCLUDE_IP`, `CDN_SIGNATURE_INCLUDE_USER_AGENT`, `CDN_ENDPOINT_PUBLIC` and `CDN_UPSTREAM`, and falls back to the matching `security`, `cdn` and `externalRequests` values in `CONFIG_JSON`.

## Web client

`scripts/workers/prepare-assets.mjs` builds `workers/router/.deploy/public` from `assets/cache` and `assets/vencord`. It stops when the cache fails the same release check the Bun server runs, hardlinks files instead of copying them, and leaves out the scripts the Bun server wouldn't serve. In a git worktree, point it at the main checkout with `CLIENT_CACHE_PATH=<checkout>/assets/cache VENCORD_PATH=<checkout>/assets/vencord`. Rerun it after downloading a new client or changing Equicord.

Discord build 633029 gave 12,551 files, under the Workers Free limit of 20,000 files per version. Workers Paid allows 100,000. The script lists and leaves out any file over 25 MiB and fails above 100,000 files.

The router builds the client page itself, with the same `GLOBAL_ENV` and branding as the Bun server. These aren't ported:

- the Open Graph preview on invite pages and the add friend card at `/add/<name>`, because both read the database,
- fetching Discord images missing from the cache, which the Bun server does when `externalRequests.discordClientAssets` is on,
- application activities served by host name.

## CDN

The router serves media from the same origin as the client, under the same R2 keys the Bun server's file and S3 storage use, such as `avatars/<user_id>/<hash>`. A bucket filled by copying the Bun server's `files` directory works as it is. URLs signed by the Bun API are valid on the Worker, and the Worker accepts the same signed uploads and deletes as the Bun CDN. When `externalRequests.discordAssetFallback` is on, or `CDN_UPSTREAM` is `true`, the Worker fetches missing default assets from `cdn.discordapp.com` once and writes them to R2.

Unlike the Bun CDN, the Worker resizes images. `?size=`, `?width=` and `?height=` are clamped to 16 to 4096 pixels and only scale down. The URL's extension or `?format=` picks WebP, PNG, JPEG or AVIF, `?quality=` sets the quality and `?animated=false` takes the first frame. Only PNG, JPEG, WebP, AVIF, GIF and APNG files up to 20 MB are transformed. Results are cached, and Cloudflare bills each unique transformation once per calendar month.

The Worker doesn't do these:

- video preview frames, because workerd can't run ffmpeg. Videos are served as stored.
- standard stickers missing from R2. Provision them into R2, see [setup.md](setup.md).
- cloud attachment uploads with `PUT`, and the old attachment path migration.
- uploads over 100 MB, the request body limit on the Free and Pro plans.

## Background jobs

The API Worker's Cron Trigger fires every minute and runs each job whose interval divides the minute. A job that loops over rows stops at its time slice and leaves the rest for the next run.

| Job                      | Interval   |
| ------------------------ | ---------- |
| `scheduled-messages`     | 1 minute   |
| `scheduled-events`       | 1 minute   |
| `poll-expiry`            | 1 minute   |
| `announcement-delivery`  | 1 minute   |
| `thread-archiver`        | 1 minute   |
| `message-purge`          | 1 minute   |
| `rate-limit-prune`       | 1 minute   |
| `federation-delivery`    | 1 minute   |
| `temporary-sessions`     | 5 minutes  |
| `federation-registry`    | 5 minutes  |
| `discovery-index`        | 10 minutes |
| `federation-presence`    | 10 minutes |
| `federation-inbox-prune` | 1 hour     |
| `insight-rollups`        | 1 hour     |

The federation jobs only run when `federation.enabled` is on and `FEDERATION_KEY` is set. Each job holds a PostgreSQL advisory lock, so two runs never do the same job at once. A Bun server doesn't take these locks, so with a Bun server running its timers on the same database, thread archiving and scheduled event changes can send the same update twice.

The Bun server does this background work, and the Workers don't:

- the federation startup sync, which resumes and announces instance moves,
- federated voice and the AFK mover,
- the collectibles catalog refresh,
- delivering announcements that have attachments,
- shared rate limit counting with `limits.rate.shared`.

## Gateway

All websockets go to one Durable Object, so one gateway handles at most 32,768 sockets on one CPU thread. It speaks json and etf, zlib-stream and zstd-stream, RESUME, lazy member lists and the remote auth handshake. Sessions live in the Durable Object's memory. When it restarts, for example after a deploy, it sends every client op 7 RECONNECT, and the clients identify again. `/_spacebar/gateway/admin/introspect` isn't served.

## Local development

Start each Worker with `bunx wrangler@4.79.0 dev` in its own directory, and the router reaches the others through the local dev registry. Point Hyperdrive at a local database with an environment variable. The URL needs a password even when PostgreSQL trusts local connections.

```sh
bun run build:src
cd workers/gateway
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://user:password@localhost:5432/meowcord bunx wrangler@4.79.0 dev --port 3312 --ip 127.0.0.1
```

```sh
cd workers/api
bun install
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://user:password@localhost:5432/meowcord bunx wrangler@4.79.0 dev --port 3302 --test-scheduled
```

```sh
bun scripts/workers/prepare-assets.mjs
cd workers/router
CHOKIDAR_USEPOLLING=1 CHOKIDAR_INTERVAL=600000 bunx wrangler@4.79.0 dev --port 8815
```

Put each Worker's secrets in a `.dev.vars` file in its directory, which git ignores. Wrap each value in single quotes. A PEM key can span several lines inside the quotes.

The router needs `CHOKIDAR_USEPOLLING`, because watching all 12,551 asset files makes `wrangler dev` fail with `spawn EBADF`. `wrangler dev` simulates R2 and the Images binding and keeps the bucket in `workers/router/.wrangler/state`. The API Worker rebuilds when `dist` changes.

To run every background job once, request `http://localhost:3302/__scheduled?cron=all` from the API Worker started with `--test-scheduled`. The Worker logs one line per run with each job's time.

| Command                                                                     | What it checks                                                          |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `bun run typecheck:workers`                                                 | Generates each Worker's types and typechecks the API, gateway and router. Build first. |
| `bun run test`                                                              | Includes `scripts/tests/workers-edge.test.mjs`, the routing table, upload type sniffing and client page preparation. |
| `PORT=3311 GATEWAY=ws://127.0.0.1:3312 bun scripts/dev/workers-gateway-probe.mjs` | Every encoding and compression pair, RESUME, member lists and remote auth against the gateway Worker. Needs a Bun server on port 3311 with the same database and the seeded accounts. |

## What doesn't work

- Voice. It needs UDP and the SFU.
- Files written by API routes, such as data packages, harvests and `widget.png`, because `/tmp` lasts for one request. Files the Bun server keeps next to `config.json`, such as `.e2ee-recovery.key`, the `.e2ee-system` keys and the `.announcement-spool`, can't be read or written.
- Request validation for the 52 of 643 schemas that don't compile. They fail on the Bun server too.
- GIF providers and embedded activities, which aren't loaded at startup.
- More than 32,768 gateway sockets, and sessions that survive a gateway restart.
