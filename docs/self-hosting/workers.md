# Cloudflare Workers

This page covers running Meowcord on Cloudflare Workers instead of the Bun server. The Bun server is still the supported way to host an instance, and nothing here changes how it runs.

## API

The API Worker is in `workers/api`. It runs the same Express app as `src/api`, compiled into `dist`, behind `httpServerHandler` from `cloudflare:node`. Every route under `/api`, `/api/v6` through `/api/v10` and the top level pages in `src/api/routes_toplevel` are registered, 542 route files in total. Logins, `GET /api/v9/users/@me`, guild lists and sending and listing messages were tested against a local database.

### Build

`bun build.ts`, which `wrangler dev` runs by itself through `build.command`, reads the compiled `dist` and writes `workers/api/build`:

| Output                    | What it is                                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build/dist`              | Every `.js` file of `dist` except `gateway` and `webrtc`, plus `dist/tsconfig.json`. Files that use `__dirname` or `__filename` get both defined as their own path under `/bundle/dist`.                    |
| `build/routes.js`         | A static list of the route modules in the order `traverseDirectory` registers them on the Bun server, because workerd can't list or `require` files at runtime.                                            |
| `build/validators.js`     | Request validators compiled ahead of time with Ajv's standalone code generation. workerd forbids `new Function`, which Ajv uses to compile schemas. It is rebuilt only when `assets/schemas.json` changes. |
| `build/bundle`            | Data files the code reads with `node:fs`: `assets/locales`, `icon.png`, `icon_white.png`, `logo.png`, `public/index.html`, `package.json` and a `.rev` file with the git commit.                            |

Wrangler then bundles `src/index.ts` with esbuild. TypeORM needs the decorator metadata that `tsc` emits and esbuild doesn't, so the bundle starts from `dist` and not from the TypeScript sources. `workers/api/tsconfig.json` maps `@spacebar/*` and `lambert-server` to `build/dist`, so esbuild doesn't follow the root `tsconfig.json` into `src`. `base_dir` is `build/bundle` and its files are attached as data modules, so workerd serves them read only under `/bundle`, and a staged file in `build/dist/schemas` resolves `../../assets` to `/bundle/assets`.

Of the 643 schemas in `assets/schemas.json`, 591 compile. The other 52, among them `User`, `Message` and `ApplicationCommandSchema`, reference types the schema generator didn't emit, such as `Record<string,boolean>`, and fail the same way when the Bun server compiles them. Compiling takes about 70 seconds on a loaded laptop and writes 5.1 MB of code.

`wrangler.jsonc` points these packages elsewhere:

| Package                                         | Replacement                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `bcrypt`                                        | `bcryptjs`, installed in `workers/api`, because the native addon can't load.        |
| `ws`, `@hpke/core`, `i18next-fs-backend`        | Their Node or CommonJS builds. The browser build of `ws` throws, and the ESM build of `i18next-fs-backend` has a top level `await` that a `require` can't load. |
| `bun:sqlite`, `node-unix-socket`, `@aws-sdk/client-s3` | `src/unavailable.ts`, an empty module. SQLite, unix socket events and S3 don't run here. |

### Database

`DATABASE` is set to the Hyperdrive connection string before `@spacebar/database` is imported, `DATABASE_ENTITIES` is `bundled` so TypeORM gets the entity classes instead of a file glob, and `APPLY_DB_MIGRATIONS` is `false`. Migrate the database with the Bun server or `bun run apply:migrations` before pointing the Worker at it.

A database connection opened while handling one request can't be used by another. A `pg` client reused on the next request hung until workerd cancelled it. TypeORM keeps one pool for the life of the process, so the Worker replaces the driver's pool with an accessor that returns a pool for the current request, kept in an `AsyncLocalStorage`. The pool is created on the first query, holds at most `DB_POOL_SIZE` connections, 5 by default, and is closed with `ctx.waitUntil` once the response body has been sent. Hyperdrive does the real pooling. The pool TypeORM opens during startup is closed right after startup.

### Startup

The first request in an isolate imports the app, connects, loads the configuration, the email and connection settings, the JWT keys and WebAuthn, mounts the routes and calls `listen` on routing port 3001. The other requests wait for that and reuse it. `SpacebarServer.mount()` is the part of `start()` that adds middleware and routes, and the Worker calls only that, so none of the Bun server's timers run: thread archiving, scheduled messages, the message purger, announcement delivery, federation, discovery indexing, the scam list refresh, poll recovery and guild insight rollups. Those need a Cron Trigger or the Bun server running next to the Worker.

On a loaded laptop the first `GET /api/v9/ping` took 3.6 seconds, a login 2.1 seconds, mostly bcryptjs, and a later `GET /api/v9/users/@me` 90 to 470 ms. Eight parallel `GET /api/v9/users/@me` requests all answered 200, in 0.6 to 3.3 seconds, because each opens its own connection through the local Hyperdrive proxy.

### Events

`emitEvent` sends events through `useEventWriter`, which the Worker sets to a writer that posts each event as JSON to the `GATEWAY` service binding:

```ts
await env.GATEWAY.fetch("https://gateway.internal/events", {
    method: "POST",
    headers: { "content-type": "application/json", "x-event-secret": env.EVENT_SECRET },
    body: JSON.stringify(event, JSONReplacer),
});
```

The body is the object `emitEvent` passes to `transmit`: `event`, `data`, and one of `guild_id`, `channel_id`, `user_id` or `session_id`. `SB_GUILD_CACHE_INVALIDATE` events are sent the same way. `x-event-secret` is only sent when `EVENT_SECRET` is set. A failed POST is logged and the request that caused the event still succeeds. With the gateway not running under `wrangler dev`, the binding answers 503 and the message was still saved and returned with 200. Without the binding, events are dropped. Push notifications and federation forwarding, which the Bun server hooks onto `emitEvent`, are not hooked up.

### Configuration

| Name                  | Kind               | Use                                                                                                                         |
| --------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `HYPERDRIVE`          | Hyperdrive binding | The PostgreSQL database. Replace the placeholder id in `wrangler.jsonc` with the id from `wrangler hyperdrive create`.       |
| `GATEWAY`             | Service binding    | The gateway Worker, `meowcord-gateway`.                                                                                      |
| `CONFIG_JSON`         | Secret             | The instance configuration as one JSON object, the same shape as `config.json`. It is read only, so the admin dashboard can't change it. |
| `JWT_PRIVATE_KEY`     | Secret             | The PEM private key from `jwt.key`. The API, the gateway and any Bun server on the same database need the same pair.        |
| `JWT_PUBLIC_KEY`      | Secret             | The PEM public key from `jwt.key.pub`.                                                                                       |
| `EVENT_SECRET`        | Secret, optional   | Sent as `x-event-secret` with every event.                                                                                   |
| `DB_POOL_SIZE`        | Variable, optional | Connections per request, 5 by default.                                                                                       |
| `STORAGE_LOCATION`    | Variable, optional | Where `src/cdn/util/Storage.ts` writes, `/tmp/files` by default. `/tmp` lasts for one request, see below.                   |

### Local development

```sh
bun run build:src
cd workers/api
bun install
```

Put the secrets in `workers/api/.dev.vars`, which git ignores. Wrap each value in single quotes. The PEM keys can span several lines inside the quotes:

```
JWT_PRIVATE_KEY='-----BEGIN EC PRIVATE KEY-----
...
-----END EC PRIVATE KEY-----'
JWT_PUBLIC_KEY='-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----'
CONFIG_JSON='{"general":{"serverName":"http://localhost:3302"},...}'
```

Point Hyperdrive at a local database with an environment variable. The URL needs a password even when PostgreSQL trusts local connections:

```sh
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://user:password@localhost:5432/meowcord wrangler dev --port 3302
```

`wrangler dev` rebuilds when `dist` changes. Wrangler 4.79.0 runs workerd 1.20260329.1, so `compatibility_date` is `2026-03-29`.

### What doesn't work

- Files. `/tmp` lasts for one request and `/bundle` is read only, so API routes that write through `src/cdn/util/Storage.ts`, such as data packages, harvests and `widget.png`, lose what they write. Uploads belong to the CDN Worker.
- `res.sendFile`. Routes that send files from disk, such as `/api/v9/auth/cap/widget.js`, answer 500 because the files aren't in the bundle. The captcha widget needs to come from the static assets Worker.
- Request validation for the 52 schemas that don't compile.
- Background work, see Startup.
- `src/integrations/gifs` providers, embedded activities and `FederationKey` aren't loaded at startup, because they list or read files.
- The bundle size wasn't measured, because `wrangler deploy --dry-run` is the only command that prints it.
