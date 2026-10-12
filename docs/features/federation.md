# Federation

Approved Meowcord instances list each other's public servers in Discovery. This is phase 1 of the [federation plan](../development/federation.md): people find a server on another instance and its invite opens on that instance in a new tab, where they sign up or sign in. Chatting across instances comes in later phases. The wire format is in [federation-protocol.md](../development/federation-protocol.md).

## For people using the instance

Discover has an Other instances tab next to the Discord categories. It lists two things:

- Servers on other approved instances, with their name, icon, description, member count and the instance they're on. Clicking one opens its invite page on that instance in a new tab.
- The approved instances themselves, with their address and whether signups are open, need an invite, need approval or are closed.

Your own instance answers this list. Your browser never contacts the other instances to draw the page, and their icons come through the instance's media proxy.

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

The instance id is the host of `general.serverName`, or of `api.endpointPublic` when the server name is empty, in lowercase, with the port when it isn't 443.

## Endpoints

| Endpoint                                   | Who                    | What                                                                                     |
| ------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------- |
| `GET /.well-known/meowcord`                | Anyone                 | The instance's id, name, public key, protocol version and signup state.                  |
| `GET /.well-known/meowcord/discovery`      | Anyone                 | The signed list of local servers that turned on Show on other instances.                 |
| `GET /api/v9/federation/discovery`         | Signed-in users        | The Other instances directory, cached for 30 seconds.                                    |
| `GET`, `PATCH /api/v9/guilds/:id/global-discovery` | The server owner | Read or change Show on other instances.                                                |
| `/api/v9/admin/federation/...`             | Operators              | Overview, settings, refresh, announce, registry, guilds, blocks and verified servers.    |
