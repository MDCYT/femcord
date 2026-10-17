import { AsyncLocalStorage } from "node:async_hooks";
import { httpServerHandler } from "cloudflare:node";

interface Hyperdrive {
    connectionString: string;
}

interface Fetcher {
    fetch(input: string, init?: RequestInit): Promise<Response>;
}

interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
}

export interface Env {
    HYPERDRIVE: Hyperdrive;
    GATEWAY?: Fetcher;
    EVENT_SECRET?: string;
    DB_POOL_SIZE?: string;
}

interface Pool {
    end(): Promise<void>;
    on(event: "error", listener: (error: Error) => void): unknown;
}

interface RequestDatabase {
    pool?: Pool;
}

const routingPort = 3001;
const requestDatabase = new AsyncLocalStorage<RequestDatabase>();
const handler = httpServerHandler({ port: routingPort });
let started: Promise<void> | undefined;

const start = async (env: Env) => {
    process.env.DATABASE = env.HYPERDRIVE.connectionString;
    process.env.APPLY_DB_MIGRATIONS = "false";
    process.env.DATABASE_ENTITIES = "bundled";
    process.env.CONFIG_JSON ??= "{}";
    process.env.STORAGE_LOCATION ??= "/tmp/files";

    const { SpacebarServer } = await import("@spacebar/api/Server");
    const [database, util, schemas, validators] = await Promise.all([
        import("@spacebar/database"),
        import("@spacebar/util"),
        import("@spacebar/schemas"),
        import("../build/validators.js"),
    ]);
    schemas.usePrecompiledSchemas(validators.default ?? validators);
    const routes = await import("../build/routes.js");

    const driver = database.DataSourceOptions.driver as unknown as { postgres: { Pool: new (options: object) => Pool } };
    let bootstrapPool: Pool | undefined;
    Object.defineProperty(driver, "master", {
        configurable: true,
        get() {
            const scope = requestDatabase.getStore();
            if (!scope) return bootstrapPool;
            if (!scope.pool) {
                scope.pool = new driver.postgres.Pool({
                    connectionString: env.HYPERDRIVE.connectionString,
                    max: Number(env.DB_POOL_SIZE) || 5,
                    connectionTimeoutMillis: 30000,
                });
                scope.pool.on("error", (error) => console.warn("[Database] pool error", error.message));
            }
            return scope.pool;
        },
        set(pool: Pool | undefined) {
            bootstrapPool = pool;
        },
    });

    await database.initDatabase();
    await bootstrapPool?.end();
    await util.Config.init();
    util.useEventWriter({
        init: async () => {},
        close: async () => {},
        emit: async (event) => {
            if (!env.GATEWAY) return;
            const response = await env.GATEWAY.fetch("https://gateway.internal/events", {
                method: "POST",
                headers: { "content-type": "application/json", ...(env.EVENT_SECRET ? { "x-event-secret": env.EVENT_SECRET } : {}) },
                body: JSON.stringify(event, util.JSONReplacer),
            }).catch((error: Error) => error);
            if (response instanceof Error) return console.warn(`[Events] could not reach the gateway for ${event.event}: ${response.message}`);
            if (!response.ok) console.warn(`[Events] the gateway answered ${response.status} to ${event.event}`);
        },
    });
    await util.Email.init().catch((error: Error) => console.warn("[Email] not available:", error.message));
    await util.ConnectionConfig.init();
    await util.JwtKeypairManager.init();
    util.WebAuthn.init();
    util.useBundledRoutes(routes.default ?? routes);

    const server = new SpacebarServer({ port: routingPort, serverInitLogging: false });
    await server.mount();
    server.app.listen(routingPort);
};

const releaseDatabase = (scope: RequestDatabase, response: Response, ctx: ExecutionContext) => {
    const end = () => scope.pool?.end().catch((error: Error) => console.warn("[Database] could not close the request pool", error.message));
    if (!response.body) {
        ctx.waitUntil(Promise.resolve().then(end));
        return response;
    }
    const { readable, writable } = new TransformStream();
    ctx.waitUntil(response.body.pipeTo(writable).finally(end));
    return new Response(readable, response);
};

export default {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const scope: RequestDatabase = {};
        return requestDatabase.run(scope, async () => {
            try {
                started ??= start(env).catch((error) => {
                    started = undefined;
                    throw error;
                });
                await started;
                return releaseDatabase(scope, await handler.fetch(request, env, ctx), ctx);
            } catch (error) {
                await scope.pool?.end().catch(() => {});
                console.error("[API]", error);
                return Response.json({ message: "Internal Server Error", code: 0 }, { status: 500 });
            }
        });
    },
};
