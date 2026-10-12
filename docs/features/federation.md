# Federation

Approved Meowcord instances list each other's public servers in Discovery. This is phase 1 of the [federation plan](../development/federation.md): people find a server on another instance and its invite opens on that instance in a new tab, where they sign up or sign in. Chatting across instances comes in later phases. The wire format is in [federation-protocol.md](../development/federation-protocol.md).

## For people using the instance

Discover has an Other instances tab next to the Discord categories. It lists two things:

- Servers on other approved instances, with their name, icon, description, member count and the instance they're on. Join adds the server to your server list with your account on this instance and opens it. Open on its instance opens its invite page on that instance in a new tab instead. When a join fails, the card shows the error text the server answered with.
- The approved instances themselves, with their address and whether signups are open, need an invite, need approval or are closed.

Your own instance answers this list. Your browser never contacts the other instances to draw the page, and their icons come through the instance's media proxy.

The rest of the client handles other instances like this:

- Join a Server takes `https://<instance>/invite/<code>` or `<instance>/invite/<code>`. When the host isn't this instance, the invite preview and the join go through `/api/v9/federation/invites/<instance>/<code>`, and the dialog shows the server's error text when either fails.
- A link to `/invite/<code>` on an instance from the Other instances list shows an invite card in chat, and clicking the link opens the usual invite flow, both through the same federation route. Links to hosts that aren't on the list stay ordinary links.
- Add Friend takes `name@instance`. The client looks the user up with `/api/v9/federation/users/lookup?handle=name@instance` and sends the request to `PUT /api/v9/users/@me/relationships/<id>` with the local id it gets back.
- Users from other instances have usernames like `name@instance`. Where a message or the member list shows their display name instead, a small tag with the instance follows it, and their profile has a globe badge naming the instance.
- Servers that live on another instance show "Hosted on <instance>" at the top of the server menu and the server icon's right-click menu. The client takes the instance from the guild's `federated_instance` field, and asks `/api/v9/federation/objects?ids=...` for guilds that arrive without it.

## For server owners

Server Settings has an Other instances section, visible only to the owner. Turning on Show on other instances does this:

1. The server gets a permanent invite if it has none. The invite points at the system channel, or the first text channel.
2. The server's name, icon, description, member count and invite link go into this instance's signed discovery list at `/.well-known/meowcord/discovery`.
3. Other instances show it after it's verified. By default the registry's operators verify servers. An instance can choose to verify servers itself instead.

The section shows the invite link people from other instances use and one of these states: waiting for verification, verified, hidden by an admin of this instance, or blocked. Turning the switch off takes the server out of this instance's discovery list right away. Other instances fetch the list every 5 minutes, so they drop it by then.

## For instance admins

Federation is on by default. Each instance keeps an Ed25519 key in `federation.key`, next to `jwt.key` in the working directory. The server creates it on first start with mode 600. Back it up with `jwt.key`, because a new key means the registry has to read the instance's key again. Docker keeps it in the `state` volume, and the native systemd unit keeps it in the working directory.

The admin dashboard has a Federation page under Instance, for operators. It has:

- The registry address, the sequence and expiry of the last accepted registry list, the last check and its error, and a Check the registry now button.
- Settings for taking part, announcing, showing unlisted peers, the registry address and key, who verifies servers, and the peer list with each peer's last fetch.
- The announce state with a Send to registry button. Instances on localhost, an IP address or a private name never announce.
- The instance's entry for `instances.json`, a Copy entry button and a link to edit the file on GitHub. The registry lists an instance after a maintainer merges that pull request.
- Every local server that turned on Show on other instances, its registry status, and a button to hide or show it.
- When admins verify servers themselves, the servers other instances list, each with a button to verify it or take the verification back.
- Local blocks of instances, servers and users. Servers and users use canonical ids such as `@123@meow.example`. A block of an instance also hides its servers and users.
- The registry's approved instances and blocks, read only.

The registry list is signed. The instance refuses a list with a bad signature, an unknown version, a lower sequence than the last one it accepted, or a past expiry, and keeps the last good one. When that one expires, Other instances shows nothing until a newer list arrives.

### Config keys

| Key                                      | Default                                       | Meaning                                                                                                                                         |
| ---------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `federation.enabled`                     | `true`                                        | Fetch the registry, publish the discovery list and show Other instances.                                                                        |
| `federation.registry.url`                | `https://meowcord-registry.tiag.workers.dev`   | Registry address. Fetched every 5 minutes through `fetchPublicUrl`.                                                                             |
| `federation.registry.publicKey`          | The registry's key                            | Ed25519 public key, raw 32 bytes in base64url. Changing it or the address forgets the stored list and its sequence.                              |
| `federation.announce`                    | `true`                                        | Send a signed announce on start and every 24 hours. `scripts/dev/worktree-setup.sh` turns it off for development instances.                     |
| `federation.allowUnlistedPeers`          | `false`                                       | Show the instances in `federation.peers` even when the registry doesn't list them. The first key a peer serves is kept, and a changed key fails. |
| `federation.peers`                       | `[]`                                          | Instance ids such as `meow.example`.                                                                                                            |
| `federation.discovery.verification`      | `registry`                                    | `registry` shows servers the registry verified. `instance` shows servers this instance's admins verified on the Federation page.                |
| `federation.media.cacheSize`             | `67108864` (64 MiB)                           | Bytes of remote media kept in memory. A file larger than a quarter of it isn't cached. Capped at 4 GiB.                                           |
| `federation.media.maxFileSize`           | `52428800` (50 MiB)                           | Largest remote file the media proxy fetches. Larger files get `413`. Capped at 64 MiB.                                                          |
| `federation.media.cacheSeconds`          | `3600`                                        | How long a fetched file stays in the cache, and the `max-age` sent to clients.                                                                 |
| `federation.media.requestsPerMinute`     | `600`                                         | Fetches to one instance per minute when the file isn't cached, and separately uploads to one instance per minute. More get `429` with `Retry-After`. |

The instance id is the host of `general.serverName`, or of `api.endpointPublic` when the server name is empty, in lowercase, with the port when it isn't 443.

## Media from other instances

People never load anything from another instance. The home instance fetches it and serves it from its own CDN:

- `GET /federation-media/<instance id>/<path>` fetches `<path>` from that instance's address and returns it. It only works for instances that may federate: `active` in the registry list with a current protocol, or a peer in `federation.peers` with `federation.allowUnlistedPeers` on and a fetched well-known document, and not blocked by the registry or locally. Any other instance gets `403` without a request.
- Only these CDN paths are fetched: attachments, avatars, banners, guild icons, splashes, discovery splashes, emojis, stickers, guild member avatars and banners, role icons, avatar decorations and the `/external/...` embed proxy. Any other path, a `..` segment, an encoded slash or backslash, or a NUL byte gets `404`. Only the query keys `size`, `format`, `quality`, `passthrough`, `animated`, `keep_aspect_ratio`, `width`, `height`, `ex`, `is` and `hm` are passed on.
- The fetch goes through `fetchPublicUrl` with no redirects, a 20 second timeout and `federation.media.maxFileSize`. A redirect answers `502`. The type comes from the file's bytes, then the remote header. Images, video and audio pass for every path, Lottie JSON for stickers, and attachments of any other type are sent as `text/plain` or `application/octet-stream`. Avatars and other images that aren't images get `415`. Every answer has `X-Content-Type-Options: nosniff` and a sandboxing `Content-Security-Policy`, and byte ranges work.
- Fetched files stay in a memory cache for `federation.media.cacheSeconds`, up to `federation.media.cacheSize` bytes, least recently used first out. A `404` from the remote is remembered for a minute.
- The avatar, banner, guild icon, emoji, sticker and member avatar routes fall back to the remote file when the file isn't stored locally and the id belongs to an object from another instance. Member avatars only fall back when the user and the server come from the same instance.
- Message, user, guild and sticker payloads from another instance get every absolute URL on a federating instance's address that matches one of the paths above rewritten to `/federation-media/...` on this instance. Message `content` is left alone, and so are links that aren't media, such as invite links.
- An upload into a channel on another instance gets an `upload_url` on this instance, `/federation-upload/<instance id>/<expiry>.<signature>/attachments/...`, signed with `security.requestSignature` and valid for 24 hours. This instance reads the file, up to `cdn.maxAttachmentSize` and at most 64 MiB, and sends it to the host with one `PUT`.

## Endpoints

| Endpoint                                   | Who                    | What                                                                                     |
| ------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------- |
| `GET /.well-known/meowcord`                | Anyone                 | The instance's id, name, public key, protocol version and signup state.                  |
| `GET /.well-known/meowcord/discovery`      | Anyone                 | The signed list of local servers that turned on Show on other instances.                 |
| `GET /api/v9/federation/discovery`         | Signed-in users        | The Other instances directory, cached for 30 seconds.                                    |
| `GET`, `PATCH /api/v9/guilds/:id/global-discovery` | The server owner | Read or change Show on other instances.                                                |
| `/api/v9/admin/federation/...`             | Operators              | Overview, settings, refresh, announce, registry, guilds, blocks and verified servers.    |
| `GET /federation-media/<instance id>/<path>` | Anyone                | Media from another instance, fetched and cached by this instance.                        |
| `PUT /federation-upload/<instance id>/...` | Holders of a signed URL | An upload into a channel on another instance, forwarded to it.                          |
