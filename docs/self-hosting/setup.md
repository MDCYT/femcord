# Setup

This page runs a public instance with Docker Compose on one Linux host. To run without Docker, follow [native.md](native.md) instead. A development instance is set up as described in [CONTRIBUTING.MD](../../CONTRIBUTING.MD#development).

## What Compose runs

| Service    | What it does                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| `postgres` | PostgreSQL 18, reachable only inside the Compose network.                                                    |
| `client`   | Downloads the Discord web client into the `client` volume on the first start, then exits with code 0.        |
| `sfu`      | The Go media server from `extra/pion-sfu`. It carries voice, video and Go Live on one UDP port and runs the TURN relay. |
| `warp`     | Cloudflare WARP as a SOCKS5 proxy, so fetches of user-chosen URLs don't reveal the server's address.         |
| `server`   | API, CDN, gateway, voice gateway and web client on port 3001, published on `127.0.0.1:3001` for a host proxy. |
| `caddy`    | Optional. TLS with automatic certificates, HTTP/1.1, HTTP/2 and HTTP/3, and the websocket proxy.            |

Compose builds `meowcord-server` and `meowcord-sfu` from the `Dockerfile` in this checkout. They are not published on Docker Hub.

## Requirements

- A Linux host with Docker Engine and the Compose plugin.
- A DNS record for the instance's domain that points at the host. Caddy keeps retrying the certificate request until the record resolves.
- Open ports: 80/tcp, 443/tcp, 443/udp for HTTP/3, and 50000/udp for voice unless you change `WRTC_PORT`. With `TURN_SECRET` set, also 3478/udp, 3478/tcp and 49160 to 49200/udp.

## Install

```sh
git clone https://github.com/meowcorded/meowcord.git meowcord && cd meowcord
cp .env.example .env
$EDITOR .env
docker compose up -d --build
docker compose logs -f client
```

The client service downloads about 300 MB in 12,000 files and compresses them, which takes several minutes. Equicord is built into the image from the commit pinned in `client/vencord.json`. Nothing from Discord goes into the image or into git. The server starts when the client service exits, and Caddy starts when the server answers `/readyz`, `/api/ping` and `/login`. `docker compose ps --all` then shows the client as exited with code 0 and every other service as healthy. Open `https://<DOMAIN>/register` to create the first account.

Compose reads `.env` from the project directory. To use another file, pass it on every command, such as `docker compose --env-file prod.env up -d`.

## Environment

`.env.example` lists every variable. Only the first three are required.

| Variable | Meaning |
| --- | --- |
| `DOMAIN` | Host name of the instance, such as `chat.example.com`. Caddy requests its certificate and the server builds every public URL from it. `http://localhost:3001` works for a local trial. |
| `POSTGRES_PASSWORD` | Database password. Use letters and digits only, for example from `openssl rand -hex 24`, because it goes into a connection URL. Postgres reads it only when its volume is empty, so changing it later also needs `ALTER USER`. |
| `WRTC_PUBLIC_IP` | Public IPv4 address or host name that clients send media to. Behind NAT, use the outside address and forward the voice port. The SFU and server resolve a host name once at startup, so restart both after its address changes. |
| `WRTC_PORT` | UDP port for all media, 50000 by default. |
| `TURN_SECRET` | Secret for the TURN relay that carries your users' calls in servers on other instances, from `openssl rand -hex 32`. Empty turns the relay off and refuses those calls. See [federation.md](../features/federation.md). |
| `TURN_PUBLIC_IP`, `TURN_PORT`, `TURN_RELAY_PORT_MIN`, `TURN_RELAY_PORT_MAX` | Relay address, `WRTC_PUBLIC_IP` by default, and its ports, 3478 and 49160 to 49200 by default. |
| `INSTANCE_NAME` | Name shown in the client, emails, developer portal and status page. It is applied on the first start and whenever you change it here. A name set in the admin dashboard stays until then. |
| `POSTGRES_USER`, `POSTGRES_DB`, `MEOWCORD_VOLUME_PREFIX` | `meowcord` in `.env.example`. When they are absent, Compose falls back to `fosscord`, the names older installations use. |
| `COMPOSE_PROFILES` | `caddy` starts the bundled Caddy. Leave it empty to use your own proxy. |
| `SERVER_PORT` | Port on `127.0.0.1` for your own proxy, 3001 by default. |
| `CADDY_GLOBAL_OPTIONS` | One line for Caddy's global options, such as `email you@example.com`, or `local_certs` to sign with Caddy's own CA. |
| `TRUSTED_PROXIES` | Express `trust proxy` value, `uniquelocal` by default, which trusts the private ranges Docker uses. |
| `CAP_INSTANCE_URL`, `CAP_SITE_KEY`, `CAP_SECRET_KEY` | A [Cap Standalone](https://capjs.js.org/guide/standalone/) server. Without them the built-in Cap runs. See [signup.md](../features/signup.md). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_STARTTLS`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `EMAIL_FROM` | Email over SMTP. Without `SMTP_HOST` the instance sends no email. The port defaults to 465 with `SMTP_SECURE=true` and 587 otherwise, STARTTLS is required unless `SMTP_STARTTLS=false`, and the sender defaults to `noreply@<DOMAIN>`. |
| `PUBLIC_FETCH_PROXY`, `WARP_LICENSE_KEY` | Proxy for fetches of user-chosen URLs, `socks5://warp:1080` by default, and an optional WARP+ key. See [external-services.md](external-services.md#hiding-the-servers-address). |
| `E2EE_RECOVERY_KEY_FILE`, `E2EE_RECOVERY_MASTER_KEY` | Where the encryption recovery key lives, `/data/state/.e2ee-recovery.key` by default, or the key itself. Never change the key once recovery records exist. A file path must be inside the container, under `/data/state`. |
| `CLIENT_CONCURRENCY` | Parallel downloads for the client service, 8 by default. |
| `LOG_REQUESTS` | Status codes whose requests the server logs, `500,501` by default. |
| `REVISION`, `REVISION_TIME` | Commit hash and commit time in Unix seconds, so the server reports what it runs. See [Updates](#updates). |

## Operator account

The first account gets no special rights. Register an account, turn on Developer Mode in the client, copy your numeric account ID and run:

```sh
docker compose exec server bun scripts/ops/operator.mjs grant <account-id>
```

Sign in again and open `/admin`. The command only sets the operator right and keeps the account's other rights. `revoke` instead of `grant` removes it. Only someone with shell access to the host can grant it, and an operator controls the whole instance, so grant it only to accounts you control. Outside Docker, run `bun scripts/ops/operator.mjs grant <account-id>` from the checkout so Bun loads its `.env`.

## Configuration file

The server keeps its settings in `/data/state/config.json` in the `state` volume, and the admin dashboard edits the same file. Before every start, `scripts/docker-configure.js` writes the values that come from the environment: the public API, CDN and gateway URLs, the voice endpoint `<DOMAIN>/voice`, the trusted proxies and, when their variables are set, the instance name, Cap and SMTP. It leaves everything else alone. Unsetting `CAP_*` or `SMTP_*` later leaves the old values in the file, so change those in the dashboard. To edit the file by hand:

```sh
state_volume=$(bun scripts/ops/compose-resource.mjs state)
docker run --rm -it -v "$state_volume:/state" alpine vi /state/config.json
docker compose restart server
```

[CONTRIBUTING.MD](../../CONTRIBUTING.MD#configuration) lists the keys specific to Meowcord.

## Your own reverse proxy

Leave `COMPOSE_PROFILES` empty, then point your proxy at `127.0.0.1:3001` or `SERVER_PORT`. The proxy has to pass websocket upgrades. For a system Caddy, `docker/Caddyfile` works with `server:3001` replaced by `localhost:3001`, and Caddy older than 2.7 needs the `stream_close_delay` line removed. That line keeps websockets on `/`, `/voice` and `/remote-auth` open for five minutes across Caddy reloads. The proxy reaches the container through Docker's bridge network, which the default `TRUSTED_PROXIES` already trusts. The voice and TURN ports still go straight to the SFU.

A stack that ran with Caddy keeps its container after you turn the profile off. Remove it with `docker compose --profile caddy rm -sf caddy`.

The bundle can also serve HTTPS and HTTP/2 itself. Set `TLS_CERT` and `TLS_KEY` to PEM files and `HTTPS_PORT` to a port other than `PORT`, because TLS on the shared port fails under Bun:

```sh
TLS_CERT=/etc/ssl/meowcord.pem TLS_KEY=/etc/ssl/meowcord.key HTTPS_PORT=443 bun run start
```

## Voice

Clients send media straight to `WRTC_PUBLIC_IP:WRTC_PORT` over UDP, so that address must be reachable from the internet. Calls on your own instance don't use TURN, and a client whose network blocks outgoing UDP can't join them. The TURN relay only carries calls in servers on other instances. The SFU accepts one server connection, so leave `THREADS` unset. When the SFU restarts, the server closes running calls with code 4015 and the clients reconnect.

## Local trial

Set `DOMAIN=http://localhost:3001`, `WRTC_PUBLIC_IP=127.0.0.1`, a free `WRTC_PORT` and an empty `COMPOSE_PROFILES`, then open `http://localhost:3001`.

To test the full stack with TLS, use a made-up domain and Caddy's own CA:

```sh
cat > local.env <<EOF
DOMAIN=meowcord.test
POSTGRES_PASSWORD=local
WRTC_PUBLIC_IP=127.0.0.1
COMPOSE_PROFILES=caddy
CADDY_GLOBAL_OPTIONS=local_certs
EOF
docker compose --env-file local.env up -d --build --wait
docker compose --env-file local.env cp caddy:/data/caddy/pki/authorities/local/root.crt caddy-root.crt
curl --cacert caddy-root.crt --resolve meowcord.test:443:127.0.0.1 https://meowcord.test/api/ping
```

In a browser, add `127.0.0.1 meowcord.test` to `/etc/hosts` and trust `caddy-root.crt`.

## Data and backups

| Volume | Holds |
| --- | --- |
| `postgres` | The database. |
| `state` | `config.json`, the signing keys `jwt.key` and `jwt.key.pub`, `federation.key`, `.e2ee-recovery.key`, managed sender keys in `.e2ee-system` and queued announcements in `.announcement-spool`. |
| `storage` | Attachments, avatars, icons, emojis, stickers and the cache of Discord assets. |
| `client` | The downloaded web client. It can be downloaded again. |
| `sfu` | The socket between the server and the SFU. |
| `caddy_data`, `caddy_config` | Certificates and Caddy's CA. |

Volume names start with `MEOWCORD_VOLUME_PREFIX`. **Losing `state` signs everyone out and loses the keys for encrypted account recovery, managed Official conversations and queued announcements.** Never run `docker compose down -v` on data you want to keep, and never generate a new recovery key for an existing instance.

Back up `postgres`, `state` and `storage` together:

```sh
mkdir -p dump
scripts/ops/backup.sh "dump/backup-$(date +%Y%m%d-%H%M%S)"
```

The script stops the server, writes a PostgreSQL dump and an archive of `state` and `storage` with SHA256 checksums, then starts the server again. It refuses a directory that exists, and a failed backup leaves the server stopped. Protect the backup like a password, because it holds every key.

To restore, set up a separate deployment with an empty database and empty `state` and `storage` volumes, start its `postgres` service, and run from its checkout:

```sh
scripts/ops/restore.sh /absolute/path/to/backup-directory
docker compose start server
```

The restore script checks the checksums, refuses a database or volume that already has data and restores the dump in one transaction. A failed restore leaves the server stopped.

## Storage limits

`cdn.storageQuota` caps what the CDN stores, on local disk or S3. The defaults are 100 GiB and 100,000 files for the instance, 10 GiB and 10,000 files per account, and 1 GiB and 10,000 files for the cache of Discord assets, mostly Shop art. When the cache is full, the CDN deletes the least recently served cached assets. It never deletes uploads. The System page of the admin dashboard shows cache use. Plaintext attachment URLs work for anyone who has the URL.

## Updates

```sh
git pull
REVISION=$(git rev-parse HEAD) REVISION_TIME=$(git log -1 --format=%ct) docker compose build
docker compose up -d
```

Migrations run when the server starts. The web client stays as it is, because the client service only downloads into an empty volume. `client/release.json` pins the Discord build that the Equicord plugins and the encryption hooks were checked against. When an update changes that pin, the client and server containers refuse the old build until you refresh the client:

```sh
(
    set -e
    client_volume=$(bun scripts/ops/compose-resource.mjs client)
    client_backup="client-$(date +%Y%m%d-%H%M%S).tar.gz"
    docker compose stop server
    docker run --rm -v "$client_volume:/data/client:ro" -v "$PWD":/backup alpine \
        tar czf "/backup/$client_backup" -C /data/client cache cache_compressed
    docker compose run --rm client client --force
    docker compose start server
)
```

This downloads the pinned build's `index.html` from the matching GitHub release and its assets from discord.com, then checks the pin and the encryption hooks. A failed download or check leaves the server stopped. To go back, extract the archive into the volume and start the client service without `--force`:

```sh
(
    set -e
    client_volume=$(bun scripts/ops/compose-resource.mjs client)
    docker compose stop server
    docker run --rm -v "$client_volume:/data/client" -v "$PWD":/backup:ro alpine \
        tar xzf /backup/client-TIMESTAMP.tar.gz -C /data/client
    docker compose run --rm client
    docker compose start server
)
```

### Automatic updates

`scripts/auto-update.sh` fast-forwards the checked out branch, rebuilds the images, runs `docker compose up -d` and waits up to 5 minutes for `/api/ping`. A failed build moves the checkout back to the running commit, and a checkout with local commits is left alone. It exits with code 1 when something failed. Turn off its client step with `UPDATE_CLIENT=0`, because that step downloads whenever discord.com serves a build other than the cached one, without the backup and stopped server of the manual refresh.

```cron
17 */6 * * * UPDATE_CLIENT=0 /srv/meowcord/scripts/auto-update.sh >> /var/log/meowcord-update.log 2>&1
```

| Variable | Use |
| --- | --- |
| `ENV_FILE` | The Compose env file when it isn't `.env`. |
| `UPDATE_CODE` | `0` skips the code update. |
| `UPDATE_CLIENT` | `0` skips the client update. |
| `SERVER_PORT` | The server's loopback port, if not 3001. |
| `NOTIFY_WEBHOOK` | A Discord-compatible webhook URL that gets a message after each update or failure. |

## Optional content

### Shop catalogue

The Shop is free and lists the items in `assets/collectibles.json` and `assets/profile-effects.json`. Neither file is in the repository or the image, so a new instance has an empty Shop. Both hold the JSON arrays that Discord's `collectibles-categories` and profile effects endpoints return. Mount them into the server service and restart it:

```yaml
    volumes:
      - ./assets/collectibles.json:/app/assets/collectibles.json:ro
      - ./assets/profile-effects.json:/app/assets/profile-effects.json:ro
```

To download them instead, set `COLLECTIBLES_EXTERNAL_REFRESH=true`, `COLLECTIBLES_CATALOG_URL` and `PROFILE_EFFECTS_CATALOG_URL`, and don't mount the files read-only. The server downloads both every 12 hours, or every `COLLECTIBLES_REFRESH_HOURS`, and keeps the last good copy when a download fails. The Shop catalogue card in the admin dashboard shows the source and the last error.

### Standard stickers

Discord's standard sticker packs don't include their artwork. Without local artwork, the sticker picker shows failed tiles. Download the catalog and artwork once:

```sh
DOTENV_CONFIG_PATH=/path/to/instance/.env bun scripts/provision-stickers.mjs --import-catalog
```

Leave out `--import-catalog` when the packs already exist. The script reads `DATABASE` and `STORAGE_LOCATION` from that file, needs PostgreSQL and file storage, and isn't in the Docker image. It contacts only Discord's catalog API and CDN, keeps existing packs and artwork, and downloads only what is missing on a rerun. A partial run exits with an error and lists the failed sticker IDs. Rerunning with `--import-catalog` adds back deleted official packs but doesn't change existing ones. Edit packs on the Sticker packs page of the [admin dashboard](../features/admin.md). The CDN asks Discord for missing sticker artwork only when `externalRequests.discordStickerPacks` is on, which it isn't by default.

## SQLite

PostgreSQL is the default, and Compose and the development setup use it. A single-process instance can use SQLite instead, through Bun's built-in driver:

```dotenv
DATABASE=sqlite:db/meowcord.sqlite
CONFIG_PATH=config.json
PORT=3001
```

Relative paths resolve from the working directory, and `sqlite:/var/lib/meowcord/meowcord.sqlite` works too. Leave `THREADS` and `DB_SYNC` unset. Migrations create the schema on the first start. Changing `DATABASE` doesn't copy data between backends. To back up, stop the server and copy the database with its `-wal` and `-shm` files, the configuration, the storage directory and the recovery key.

## Renamed Compose project

The Compose project used to be called `fosscord`. On an installation from before the rename, stop the old project without deleting volumes, then start the new one with your existing `.env`:

```sh
docker compose -p fosscord down
docker compose up -d --build
```

Don't add the `meowcord` values from `.env.example` to an existing `.env`, because they select new, empty volumes and credentials. If the old project had a custom name, set `MEOWCORD_VOLUME_PREFIX` to it first.

## Troubleshooting

- The client container exited with code 0. That is expected.
- The server is unhealthy. Read `docker compose logs --tail=100 server`. The healthcheck needs `/readyz`, which runs `SELECT 1` against the database, plus `/api/ping` and `/login`, each within 3 seconds.
- Link previews fail. Check the Link previews card on the System page of the admin dashboard, see [external-services.md](external-services.md#hiding-the-servers-address).
