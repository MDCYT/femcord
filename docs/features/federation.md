# Federation

Approved Meowcord instances list each other's public servers in Discovery. People on one instance can join servers on another, add friends there, send them DMs and talk in their voice channels. Each person's account stays on their own instance, their home, and their client only ever talks to it. The [federation plan](../development/federation.md) describes the phases, and [federation-protocol.md](../development/federation-protocol.md) has the wire format.

## Turning it on

Federation is on by default. On first start the server creates an Ed25519 key in `federation.key` in its working directory with mode 600. Back it up together with `jwt.key`, because with a new key the registry has to learn the instance's key again. Docker keeps both in the `state` volume.

The instance id is the host of `general.serverName`, or of `api.endpointPublic` when the server name is empty, in lowercase, with the port when it isn't 443. To change it, follow [change-url.md](../self-hosting/change-url.md).

For other instances to list this one, the registry has to approve it. [verification.md](../self-hosting/verification.md) explains how. Instances on localhost, an IP address or a private host name never announce themselves.

Calls in servers on other instances also need the [TURN relay](#turn-relay).

## Config keys

| Key | Default | Meaning |
| --- | --- | --- |
| `federation.enabled` | `true` | Fetch the registry, publish the discovery list and show Other instances. |
| `federation.registry.url` | `https://meowcord-registry.tiag.workers.dev` | Registry address, fetched every 5 minutes. |
| `federation.registry.publicKey` | The registry's key | Ed25519 public key, 32 bytes in base64url. Changing it or the address forgets the stored registry list. |
| `federation.announce` | `true` | Announce to the registry on start and every 24 hours. `scripts/dev/worktree-setup.sh` turns it off for development instances. |
| `federation.announceStats` | `true` | Include the local user, server and 24-hour message counts in the announce. |
| `federation.contacts` | `[]` | Local usernames listed as the instance's contacts in the announce, at most 10. Empty means the operators. |
| `federation.allowUnlistedPeers` | `false` | Federate with the instances in `federation.peers` even when the registry doesn't list them. The first key a peer serves is kept, and a changed key fails. |
| `federation.peers` | `[]` | Instance ids such as `meow.example`. |
| `federation.previousIds` | `[]` | Ids this instance had before its address changed, at most 10. See [change-url.md](../self-hosting/change-url.md). |
| `federation.discovery.verification` | `registry` | `registry` shows every server the registry lists. `instance` also requires this instance's admins to pick servers from other instances on the Federation page. |
| `federation.media.cacheSize` | `67108864` | Bytes of remote media kept in memory, at most 4 GiB. A file larger than a quarter of it isn't cached. |
| `federation.media.maxFileSize` | `52428800` | Largest remote file the media proxy fetches, at most 64 MiB. Larger files get `413`. |
| `federation.media.cacheSeconds` | `3600` | How long a fetched file stays cached, and the `max-age` sent to clients. |
| `federation.media.requestsPerMinute` | `600` | Uncached fetches from one instance per minute, and separately uploads to one instance per minute. More get `429`. |
| `federation.limits.objectsPerInstance` | `200000` | Id mappings one other instance may have here. Past it, requests that add ids get `507`. |
| `federation.limits.shadowsPerInstance` | `50000` | Users from one other instance stored here. |
| `federation.limits.guildsPerInstance` | `500` | Mirror servers from one other instance. |
| `federation.limits.inboxEventsPerInstance` | `200000` | Event ids remembered per sender to skip retried batches. At the limit the oldest tenth is deleted. |
| `federation.limits.newObjectsPerRequest` | `10000` | New ids one request may introduce. A larger request is refused whole. |

The admin Federation page edits every key above except `federation.media.*` and `federation.limits.*`.

## Listing a server on other instances

Server Settings has an Other instances section that only the owner sees. Turning on Show on other instances does this:

1. The server gets a permanent invite to its system channel, or its first text channel, if it has none.
2. This instance's admins verify the server on the admin Federation page.
3. The instance adds the verified server to its signed discovery list at `/.well-known/meowcord/discovery`. The registry picks it up within an hour, and other instances show it from then on.

People from other instances can join through an invite as soon as the switch is on, verified or not. The section shows the invite link and whether the server is waiting for this instance's admins, waiting for the registry, listed, hidden by an admin, or blocked. Turning the switch off removes the server from this instance's list right away, and from other instances within about 5 and a half minutes. The registry can remove or block a server, and any instance can block it locally.

## Discover on other instances

Discover has an Other instances tab next to Discord's categories in Servers, and an Other instances entry in the sidebar. It lists servers from approved instances, 24 at a time, with their icon, splash, description, member and online counts and instance. Servers listed in the registry document have a verified mark. The tab also lists the approved instances with their address, server count and whether signups are open, need an invite or approval, or are closed.

The tab has a search box, a Sort by menu with Recommended, Most active, Most members and Newest, and a row of buttons to pick one instance. Search works like [local search](discovery.md#search). A search in Discover also shows up to 12 matching servers from other instances above the local results.

Clicking a server opens a preview with its full description, welcome screen and rules, a Join server button, and a link that opens the invite on its own instance. A server the user already joined shows Open server instead.

This instance answers the tab from lists it fetches from other instances every 5 minutes, so the user's browser never contacts another instance and typing a search sends no requests to them. The tab and the preview share a rate limit of 60 requests per 30 seconds per account.

## Chat across instances

When a user does something in a server or conversation hosted on another instance, their home relays the request to the host. The host runs it as a copy of the user's account, a shadow user, with the same permission checks, automod and rate limits as for its own users. Events come back the same way.

- Joining a server on another instance copies its channels the user can see, roles, emojis, stickers and members to the home as a mirror server. Reading history, sending, editing, deleting, reactions, mentions, typing, the member list and leaving work as in a local server. The home's automod checks what the user sends before it leaves.
- Join a Server takes `https://<instance>/invite/<code>` or `<instance>/invite/<code>`. Invite links to listed instances in chat show an invite card.
- People from other instances appear as `name@instance`, with a small instance tag next to their display name and a globe badge on their profile. Their profile comes from their home and refreshes at most once a minute.
- Add Friend takes `name@instance` or a friend link, `https://<instance>/add/<name>`. The user menu has Copy global username and Copy friend link.
- A DM or group DM lives on the instance of the person who started it. Any member can add a friend from their own instance to it. DMs and group DMs across instances are always end-to-end encrypted, see [e2ee.md](e2ee.md#conversations-with-users-of-other-instances).
- Avatar decorations, status, activities and mentions work across instances. Mentions count in unread badges and send push notifications under the user's own notification settings. A status from another instance expires after 30 minutes without an update.
- Badges from a person's home, including their pride flags, show in a separate "On <instance>" box under this instance's badges, at most 12. A staff, admin or moderator badge from another instance shows only as a "Staff on <instance>" label and never with its own art. Remote badges never grant rights.
- Servers hosted elsewhere show "Hosted on <instance>" at the top of the server menu.
- Reporting a message or server from another instance sends the report to that instance's staff.

When the host is down, loading or sending there fails with `502` and a message that names the host. Events the host couldn't deliver wait in its outbox and go out within seconds once the home is reachable again.

## Voice across instances

A voice channel in a server on another instance works like a local one, with voice, camera and Go Live in both directions. DM and group DM calls with people on other instances work the same way and run on the voice server of the instance that hosts the conversation. DAVE end-to-end encryption stays on, and every participant joins the same MLS group.

The host never learns a user's IP address:

- The client connects to its home at `/federated-voice`, and the home forwards the connection to the host's voice gateway.
- The client sends media only through the TURN relay in the home's SFU, with `iceTransportPolicy: "relay"`, so the browser never offers its own addresses. The host's SFU sees the home's address.
- When the home has no relay, it refuses the call instead of falling back to a direct connection.

Calls between people on the same instance don't use the relay. The host's moderators can server mute, deafen, move and disconnect people from other instances. When the home restarts during a call, the client reconnects to the same call.

### TURN relay

The relay runs inside `pion-sfu` and starts when the SFU has `TURN_SECRET`. The server signs relay credentials with the same secret. When the server starts the SFU itself through `PION_SFU_BIN` and `TURN_SECRET` is empty, it generates a random secret on every start. Docker runs the SFU as its own service, so set `TURN_SECRET` in `.env` there, or calls in servers on other instances are refused.

| Variable | Read by | Default | Meaning |
| --- | --- | --- | --- |
| `TURN_SECRET` | SFU and server | Random per start, native only | Shared secret for credentials. Generate it with `openssl rand -hex 32`. Empty in Docker turns the relay off. |
| `TURN_PORT` | SFU and server | `3478` | Port the relay listens on, UDP and TCP. `0` turns the relay off. |
| `TURN_PUBLIC_IP` | SFU and server | `WRTC_PUBLIC_IP` | Address clients reach the relay on, IPv4 or a host name. |
| `TURN_LISTEN_IP` | SFU | `0.0.0.0` | IPv4 address the relay binds to. |
| `TURN_RELAY_PORT_MIN` | SFU | `49160` | First UDP port of the relayed range. Each call uses one port. |
| `TURN_RELAY_PORT_MAX` | SFU | `49200` | Last UDP port of the relayed range. |
| `TURN_REALM` | SFU | `meowcord` | TURN realm. |
| `TURN_CREDENTIAL_TTL` | server | `43200` | Seconds a credential stays valid, at least 60. |
| `TURN_ALLOW_PRIVATE_PEERS` | SFU and server | off | `1` lets the relay reach private and reserved IPv4 addresses. Only for testing on one machine. |

Open `TURN_PORT` over UDP and TCP and the relayed range over UDP in the firewall, next to the voice port. Behind NAT, forward the same ports and set `TURN_PUBLIC_IP` to the outside address. Each credential only reaches the host SFU's IPv4 address named in it, and neither the server nor the relay accepts loopback, private, link-local, carrier-grade NAT or multicast addresses, so the relay can't be used as an open relay or to reach the home's own network.

The SFU logs `TURN allocation for <client> over <protocol> relays from <address>` for every relayed call. The host logs `[WebRTC] media of <user> from <instance> in <room> comes from <address>` for every call from another instance.

## Admin Federation page

The admin dashboard has a Federation page under Instance, for operators. It shows and controls:

- The registry address, the last accepted registry list, the last check and its error, and a Check the registry now button.
- The federation settings, and the peer list with each peer's last fetch.
- The announce state with a Send to registry button, and this instance's entry for the registry's `instances.json` with a Copy entry button. The registry lists an instance after a maintainer merges that entry.
- Local servers that turned on Show on other instances, with a button to verify each one or take it back. When `federation.discovery.verification` is `instance`, the servers other instances list, with the same buttons.
- Local blocks of instances, servers and users. Servers and users use canonical ids such as `@123@meow.example`. Blocking an instance also hides its servers and users, stops event delivery to it and refuses its requests right away. The registry's own blocks are listed read only.
- Event delivery to each instance. Undelivered events wait in the `federation_outbox` table, at most 10,000 per instance, and survive restarts. An instance that answered nothing for 24 hours is marked unreachable, and events still waiting after 24 hours are dropped and logged.
- The users and servers from other instances stored here, and storage per instance against `federation.limits`.
- Instance moves, with an Apply button for moves this instance couldn't confirm. See [change-url.md](../self-hosting/change-url.md).

The Users and Servers pages list people and servers from other instances in their own Other instances tabs, read only. [admin.md](admin.md#users-and-servers-from-other-instances) lists what an admin can still do to them.

Shadow users and mirror servers don't count as this instance's own. The admin overview, `GET /api/v9/policies/stats`, experiment rollouts, announcements, the Official inbox, the automod name scan and the registration limit in `limits.absoluteRate.register` all leave them out.

Accounts from other instances go through this instance's automod, and a rule they trip sends a signed report to their home's Reports. [automod.md](automod.md#federation) has the settings.

The registry list is signed. The instance refuses a list with a bad signature, an unknown version, a lower sequence or a past expiry, and keeps the last good one. When that one expires, Other instances shows nothing until a newer list arrives.

## Media from other instances

Browsers never load anything from another instance. The home fetches remote files and serves them at `GET /federation-media/<instance id>/<path>`, and rewrites media URLs in messages, profiles and servers from other instances to that route.

- It only fetches from instances that may federate, meaning active in the registry or an allowed peer, and not blocked. Others get `403`.
- It only fetches known CDN paths: attachments, avatars, banners, icons, splashes, emojis, stickers, role icons, avatar decoration art, badge icons and the embed proxy. Other paths get `404`.
- It follows no redirects, waits at most 20 seconds and fetches at most `federation.media.maxFileSize`. Files that aren't images, video or audio are served as `text/plain` or `application/octet-stream`, and every answer has `nosniff` and a sandboxing CSP.
- Uploads into a channel on another instance go to `/federation-upload/<instance id>/...` on the home, a signed URL valid for 24 hours, which forwards the file to the host. The limit is `cdn.maxAttachmentSize`, and at most 64 MiB.

## Avatar decorations from other instances

Decorations of people from other instances show in messages, the member list, DMs, profiles and voice. When a decoration's shop item exists on this instance with the same art, which is the case for Discord's shop items, this instance uses its own copy. A decoration that another instance made in its own shop gets a local id and its art is fetched from that instance through the media proxy, at most 10 MiB. A server decoration set in a server on another instance shows in that server's mirror.

Profile effects and nameplates from other instances don't show yet. Equipping a server decoration in a server on another instance doesn't work, because this instance's shop items mean nothing to the host.

## Threat model

Two attackers are in scope. One is an approved instance that turns malicious or whose domain someone takes over, so it holds a valid key. The other has no key and sends crafted requests to `/federation/v2`, the media proxy or the upload forward. `scripts/dev/federation-attack-probe.mjs` runs a rogue instance against a real one and prints `pass` for each attack the real instance blocks.

| Attack | Defense |
| --- | --- |
| Replay or forge a signed request | Signatures cover method, path, timestamp, nonce and a body hash. Nonces are remembered for 10 minutes and timestamps more than 5 minutes off are refused. |
| Exhaust memory, disk or rows | Unverified bodies share a 128 MiB budget. Per-instance quotas in `federation.limits` cap stored ids, users, servers and events. |
| Reach local-only or admin routes through the relay | The host allows only server and channel routes, invites, leaving, profiles and reports, and refuses any path a URL parser would change. |
| Act as a local user or a third instance's user | Relays, joins, profile updates, presence and voice states only apply to users of the sending instance. |
| Join local users to a server or DM | A home adds a local user to a remote server only after that user asked to join. A DM from another instance only takes local users with a friendship, pending request or shared server with the sender, and never someone who blocked them. |
| Look like this instance's staff | Remote users keep only the HypeSquad and AI account flags. Remote staff badges show only as "Staff on <instance>", and remote badges never grant rights. |
| Make this instance fetch arbitrary URLs or track viewers | Decorations and badge icons must be specific paths on the sender's own address, and browsers load them through this instance's media proxy. |
| Make the TURN relay reach private networks | Credentials are only issued for public IPv4 addresses, and the relay checks again. |
| Turn encryption off in a DM | A home never clears encryption on a mirrored DM and refuses to relay a plaintext message into it. |
| Forge a message by another instance's user | The author's home signs every message and edit with its federation key, and receivers drop new messages that fail and show stored ones as "Unverified author". See [message authorship](../development/federation-protocol.md#message-authorship). |

The host still decides what happens in the servers and conversations it hosts, including deleting messages and removing members. Message authorship has known gaps. A host can serve an earlier signed version of an edited message and choose link previews and attachment bytes, since receivers check attachment names and sizes but not bytes. System, automod, bot, webhook and interaction messages are the host's own and aren't signed by anyone else. A malicious instance can fill its own quota on every instance it federates with, which is why the quotas are per instance and shown on the admin page.

## Endpoints

| Endpoint | Who | What |
| --- | --- | --- |
| `GET /.well-known/meowcord` | Anyone | The instance's id, name, public key, protocol version and signup state. |
| `GET /.well-known/meowcord/discovery` | Anyone | The signed list of local servers shown on other instances. |
| `GET /api/v9/federation/discovery` | Signed-in users | The Other instances directory. Takes `query`, `category_id`, `instance`, `sort`, `offset` and `limit`, at most 48. |
| `GET /api/v9/federation/discovery/guilds/:id` | Signed-in users | One listed server by its canonical id. |
| `GET`, `PATCH /api/v9/guilds/:id/global-discovery` | The server owner | Read or change Show on other instances. |
| `GET`, `POST /api/v9/federation/invites/<instance id>/<code>` | Signed-in users | Preview or join a server on another instance. |
| `GET /api/v9/federation/users/lookup?handle=name@instance` | Signed-in users | Resolve a user on another instance to a local id. |
| `GET /api/v9/federation/objects` | Signed-in users | Map local ids to canonical ids and back, at most 100 of each. |
| `GET /api/v9/federation/moves` | Signed-in users | Previous ids of this and other instances. |
| `/api/v9/admin/federation/...` | Operators | Everything on the admin Federation page. |
| `GET /federation-media/<instance id>/<path>` | Anyone | Media from another instance, fetched and cached here. |
| `PUT /federation-upload/<instance id>/...` | Holders of a signed URL | An upload forwarded to another instance. |
| `/federation/v2/...` | Other instances, signed | The instance-to-instance protocol, see [federation-protocol.md](../development/federation-protocol.md). |
