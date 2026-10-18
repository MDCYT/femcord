# Native Linux hosting

This guide runs the server and the voice SFU under systemd as a non-login `meowcord` user on a fresh Debian or Ubuntu host, without Docker. Root owns the application files, so the `meowcord` user can write state and caches but can't replace the server, its dependencies or Bun. Don't give that user sudo or the `docker` group. The Docker install is in [setup.md](setup.md), and its notes on configuration, voice and optional content apply here too.

## Prerequisites

```sh
sudo apt update
sudo apt install ca-certificates curl unzip git rsync openssl build-essential python3 pkg-config libssl-dev ffmpeg postgresql postgresql-client
sudo systemctl enable --now postgresql
```

As your normal build user, install [Bun 1.4](https://bun.sh/docs/installation), Go at the version in `extra/pion-sfu/go.mod` for the SFU, and Node.js, which only Equicord's own build uses. Then copy Bun to the path the service uses:

```sh
sudo install -o root -g root -m 0755 "$(command -v bun)" /usr/local/bin/bun
/usr/local/bin/bun --version
go version
```

Point a DNS name such as `chat.example.com` at the host. In the firewall, allow SSH, 80/tcp, 443/tcp, 443/udp for HTTP/3, 50000/udp for voice, and 3478/udp, 3478/tcp and 49160 to 49200/udp for the TURN relay.

**The server listens on all interfaces on `PORT` and has no setting to bind to loopback, so block 3001/tcp and 5432/tcp from outside on IPv4 and IPv6, and check from another machine before you open registration.** Keep PostgreSQL's `listen_addresses` on localhost.

## Service account and directories

```sh
sudo useradd --system --user-group --home-dir /var/lib/meowcord --no-create-home --shell /usr/sbin/nologin meowcord
sudo install -d -o root -g meowcord -m 0750 /opt/meowcord /opt/meowcord/assets /etc/meowcord
sudo install -d -o meowcord -g meowcord -m 0700 /var/lib/meowcord /var/lib/meowcord/storage /var/cache/meowcord
```

| Path | Owner | Contents |
| --- | --- | --- |
| `/opt/meowcord` | `root:meowcord` | The compiled server, dependencies, scripts and static assets. The service can read but not write them. |
| `/etc/meowcord/meowcord.env` | `root:meowcord`, mode `0640` | Database credentials and the runtime environment. |
| `/var/lib/meowcord` | `meowcord:meowcord`, mode `0700` | Configuration, signing keys, the encryption recovery key and uploads. |
| `/var/cache/meowcord` | `meowcord:meowcord`, mode `0700` | The cached client, its compressed copies, the cache miss log and the detectable games list. |
| `/run/meowcord` | systemd | The SFU socket. systemd removes it when the service stops. |

## PostgreSQL

Create a role without administration rights and a database it owns:

```sh
sudo -u postgres createuser --no-superuser --no-createdb --no-createrole --pwprompt meowcord
sudo -u postgres createdb --owner=meowcord meowcord
psql -h 127.0.0.1 -U meowcord -d meowcord -W -c 'SELECT 1'
```

Use a password from `openssl rand -hex 24`, which needs no escaping in the connection URL. If the last command fails, add `host meowcord meowcord 127.0.0.1/32 scram-sha-256` to `pg_hba.conf` above any rule that matches first, never `trust`, and reload PostgreSQL. The server runs its migrations on startup and needs no superuser rights.

## Build and install

Build as your normal user, in a checkout separate from the installed files:

```sh
git clone https://github.com/meowcorded/meowcord.git meowcord-build
cd meowcord-build
bun install --frozen-lockfile
bun run build
bun run build:e2ee
bun run generate:client
bun run check:client
(cd extra/pion-sfu && go build -trimpath -o pion-sfu .)
```

`generate:client` downloads the pinned Discord client, about 300 MB, builds Equicord and compresses the assets. Never commit or redistribute those files. Then install the runtime files:

```sh
for directory in dist node_modules scripts client; do
    sudo rsync -a --delete "$directory/" "/opt/meowcord/$directory/"
done
sudo install -o root -g meowcord -m 0640 package.json /opt/meowcord/package.json
sudo rsync -a --delete --exclude=/cache --exclude=/cache_compressed --exclude=/cacheMisses --exclude=/detectable.json assets/ /opt/meowcord/assets/
sudo install -o root -g meowcord -m 0750 extra/pion-sfu/pion-sfu /opt/meowcord/pion-sfu
sudo chown -hR root:meowcord /opt/meowcord
sudo chmod -R u=rwX,g=rX,o= /opt/meowcord
sudo rsync -a --delete assets/cache/ /var/cache/meowcord/cache/
sudo rsync -a --delete assets/cache_compressed/ /var/cache/meowcord/cache_compressed/
sudo touch /var/cache/meowcord/cacheMisses
sudo sh -c 'test -f /var/cache/meowcord/detectable.json || printf "[]\n" > /var/cache/meowcord/detectable.json'
sudo chown -R meowcord:meowcord /var/cache/meowcord
sudo chmod -R u=rwX,go= /var/cache/meowcord
sudo ln -s /var/cache/meowcord/cache /opt/meowcord/assets/cache
sudo ln -s /var/cache/meowcord/cache_compressed /opt/meowcord/assets/cache_compressed
sudo ln -s /var/cache/meowcord/cacheMisses /opt/meowcord/assets/cacheMisses
sudo ln -s /var/cache/meowcord/detectable.json /opt/meowcord/assets/detectable.json
```

The four symlinks are only needed on the first install. They give the server writable caches under `/opt/meowcord/assets` without write access to the application files.

## Runtime configuration

```sh
sudo install -o root -g meowcord -m 0640 /dev/null /etc/meowcord/meowcord.env
sudoedit /etc/meowcord/meowcord.env
```

Replace the password, domain and public IPv4 address in these values:

```ini
NODE_ENV=production
PORT=3001
DATABASE=postgres://meowcord:REPLACE_WITH_HEX_PASSWORD@127.0.0.1:5432/meowcord
CONFIG_PATH=/var/lib/meowcord/config.json
STORAGE_LOCATION=/var/lib/meowcord/storage
E2EE_RECOVERY_KEY_FILE=/var/lib/meowcord/.e2ee-recovery.key
BUN_RUNTIME_TRANSPILER_CACHE_PATH=/var/cache/meowcord/bun
DOMAIN=chat.example.com
TRUSTED_PROXIES=loopback
WRTC_LIBRARY=pion
PION_SFU_BIN=/opt/meowcord/pion-sfu
PION_SFU_IPC=/run/meowcord/sfu.sock
WRTC_PUBLIC_IP=203.0.113.10
WRTC_PORT_MIN=50000
WRTC_PORT_MAX=50000
TURN_SECRET=<openssl rand -hex 32>
LOG_REQUESTS=500,501
PUBLIC_FETCH_PROXY=socks5://127.0.0.1:1080
```

systemd doesn't expand `$VARIABLE` references, so write literal values. Unlike Compose, a native install sets `DATABASE`, `PORT`, `WRTC_PORT_MIN`, `WRTC_PORT_MAX` and `PION_SFU_BIN` directly. The service runs `scripts/docker-configure.js` before each start. It writes the public URLs and trusted proxies into `config.json` and reads the optional `INSTANCE_NAME`, `CAP_*` and `SMTP_*` variables listed in [setup.md](setup.md#environment).

`PUBLIC_FETCH_PROXY` must point at a SOCKS5 proxy, or link previews and other fetches of user-chosen URLs fail. Run Cloudflare WARP with `warp-cli mode proxy` and `warp-cli proxy port 1080`, or run the `caomingjun/warp` container from `docker-compose.yml` with port 1080 published on `127.0.0.1`. See [external-services.md](external-services.md#hiding-the-servers-address).

Leave `THREADS` and `WRTC_WS_PORT` unset. The server then runs one process, serves the voice websocket at `/voice` on port 3001 and starts the SFU as the same user. Without `TURN_SECRET`, the server generates a new relay secret on every start, which works because it starts the SFU itself.

## systemd service

Save this as `/etc/systemd/system/meowcord.service`, owned by root with mode `0644`:

```ini
[Unit]
Description=Meowcord server
Wants=network-online.target
After=network-online.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=meowcord
Group=meowcord
WorkingDirectory=/var/lib/meowcord
EnvironmentFile=/etc/meowcord/meowcord.env
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStartPre=/usr/local/bin/bun /opt/meowcord/scripts/client-release.js --check
ExecStartPre=/usr/local/bin/bun /opt/meowcord/scripts/e2ee-anchors.js
ExecStartPre=/usr/local/bin/bun /opt/meowcord/scripts/docker-configure.js
ExecStart=/usr/local/bin/bun /opt/meowcord/dist/bundle/start.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=35
KillSignal=SIGTERM
KillMode=mixed
UMask=0077
RuntimeDirectory=meowcord
RuntimeDirectoryMode=0700
NoNewPrivileges=true
CapabilityBoundingSet=
AmbientCapabilities=
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/meowcord /var/cache/meowcord /run/meowcord
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK

[Install]
WantedBy=multi-user.target
```

The server writes `jwt.key`, `jwt.key.pub` and `federation.key` to its working directory. The 35 second stop timeout is longer than the server's own 30 second shutdown deadline. Don't add `MemoryDenyWriteExecute=true`, because Bun's JavaScript engine needs executable memory. `AF_NETLINK` lets the SFU list network interfaces.

```sh
sudo systemd-analyze verify /etc/systemd/system/meowcord.service
sudo systemctl daemon-reload
sudo systemctl enable --now meowcord
sudo journalctl -u meowcord -n 100 --no-pager
curl --fail http://127.0.0.1:3001/readyz
curl --fail http://127.0.0.1:3001/api/ping
curl --fail --output /dev/null http://127.0.0.1:3001/login
```

`/readyz` answers only when PostgreSQL does. Restart the service after changing the environment file, and run `systemctl daemon-reload` after changing the unit.

## HTTPS and the operator account

[Install Caddy](https://caddyserver.com/docs/install) and put this in `/etc/caddy/Caddyfile`:

```caddyfile
chat.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3001
}
```

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl --fail https://chat.example.com/readyz
```

`TRUSTED_PROXIES=loopback` matches a proxy on the same host. A proxy on another host needs its address there, and a firewall rule that lets only that host reach port 3001.

Register your account at `https://chat.example.com/register`, copy its numeric ID with Developer Mode on, and grant it the operator right as [setup.md](setup.md#operator-account) describes, with the environment file loaded:

```sh
sudo -u meowcord /usr/local/bin/bun --env-file=/etc/meowcord/meowcord.env /opt/meowcord/scripts/ops/operator.mjs grant ACCOUNT_ID
```

## Backups and restore

Run these in Bash. The service stops so the database and files match:

```sh
set -o pipefail
sudo systemctl stop meowcord
backup_dir="/var/backups/meowcord/$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -o root -g root -m 0700 "$backup_dir"
sudo -u postgres pg_dump -Fc meowcord | sudo tee "$backup_dir/database.dump" > /dev/null
sudo tar -czf "$backup_dir/state.tar.gz" -C / etc/meowcord var/lib/meowcord
sudo tar -czf "$backup_dir/client.tar.gz" -C / var/cache/meowcord
sudo chmod 0600 "$backup_dir/database.dump" "$backup_dir/state.tar.gz" "$backup_dir/client.tar.gz"
sudo systemctl start meowcord
```

Keep the installed release and its commit with each backup, encrypt the backup and copy it off the host. The state archive holds the database password, the signing keys and `.e2ee-recovery.key`. Without that key, existing encrypted backups can't be recovered.

To restore, use a fresh database. Restore `/etc/meowcord`, `/var/lib/meowcord` and `/var/cache/meowcord`, install the matching release, recreate the symlinks, ownership and modes above, and restore the dump with `pg_restore --no-owner --role=meowcord`. Never restore over a live database or generate a new recovery key for an existing instance.

## Updates

In the build checkout, check out the new revision and run `bun install --frozen-lockfile`, `bun run build`, `bun run build:e2ee`, `bun run build:equicord` and the SFU build. The install commands copy the checkout's `assets/cache` over the installed one with `--delete`, so a fresh checkout needs a copy of `/var/cache/meowcord/cache` first. When `client/release.json` changed, run `bun run generate:client` and `bun run check:client` in the checkout, never against the installed cache. `scripts/auto-update.sh` only works with Compose.

Stop the service, back it up and keep a copy of `/opt/meowcord`. Run the install commands again without the symlinks, start the service and repeat the health checks. Then check sign-in, an encrypted DM and a voice call. Migrations have run by then, so a rollback restores the database, state, release and client from the backup together.
