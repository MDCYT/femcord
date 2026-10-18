# Federation registry

The registry tells Meowcord instances which other instances are approved, what is blocked everywhere and which servers are listed in global discovery. It publishes one JSON document signed with an Ed25519 key, and instances refuse any document that doesn't verify against `federation.registry.publicKey` in their config. This page is for whoever runs the registry. Instance admins who want to be listed should read [verification.md](verification.md). The document format, the announce request and its errors and rate limits are specified in [federation-protocol.md](../development/federation-protocol.md).

The registry runs at `https://meowcord-registry.tiag.workers.dev`, the default `federation.registry.url`. Its source is in `extra/registry`, a Cloudflare Worker in JavaScript with a D1 database. The public key is `f0jm9Szfa52pkT0nWkeZK4D1wa3NUZ9hceWaFQLZYrk` with key id `registry-1`, the default `federation.registry.publicKey`.

| Endpoint            | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `GET /`             | The key id, the public key and the endpoint URLs.               |
| `GET /v1/registry`  | The signed registry document, cached for 60 seconds.            |
| `POST /v1/announce` | An instance asks to be reviewed or refreshes its data.          |
| `/admin`            | The review pages, behind hrtID.                                 |

## What the Worker does on its own

The Worker builds the document from D1 and signs a new copy when something in it changes, and at least once a day. Each copy expires 7 days after it is signed, and its `sequence` is the publish time in milliseconds.

An announce stores the instance as pending, or updates it, with its admin contacts, its counts and its discovery list. The contacts and counts are never published. The registry only fetches public HTTPS hosts, without redirects, for at most 8 seconds, 64 KiB of a well-known document and 1 MiB of a discovery list.

Every hour at minute 17 the Worker:

- imports `instances.json` from the `main` branch on GitHub. Every instance in it counts as approved unless an admin blocked or suspended it.
- checks up to 5 moves from `previous_ids`, see [Moves](#moves).
- fetches the well-known document and discovery list of the `REFRESH_BATCH` instances checked longest ago, 8 by default.
- deletes nonces, rate limit counters and sign-in state that expired, activity older than 30 days, and snapshots and counts older than 120 days. It also deletes pending instances that aren't in `instances.json` and haven't announced for 30 days.
- writes the hour's row to `registry_snapshots` for the charts. Network totals add up the approved, unblocked instances that reported counts in the last 72 hours.
- signs a new document if anything changed or the current one is a day old.

## Admin pages

The admin pages at `/admin` need an hrtID account in the `admins` group. The sign-in page allows 20 attempts per client every 10 minutes.

| Page      | What it has                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview  | Stat cards and charts, announce health, what waits for review, errors in the last day, the published document, a button that signs and publishes a new one, the admin group chat. |
| Instances | Approve, suspend or block an instance with a reason, move it back to pending, check it now, accept a new key. Each entry shows its admin contacts and latest counts.            |
| Discovery | Remove a server from discovery, list it again or block it.                                                                                                                     |
| Blocks    | Block or unblock an instance id, or a server or user by canonical id such as `@123@meow.example.com`.                                                                           |
| Moves     | Every move from `previous_ids` with its state, proof and keys, and Approve for moves that wait for an admin.                                                                   |
| Activity  | Announces, checks, imports, errors and admin actions.                                                                                                                          |

Announce health calls an instance on time when it announced within 26 hours, late within 72 hours and silent after that.

To look at the pages without hrtID, run `bun scripts/preview-admin.mjs` in `extra/registry`. It serves them on `http://127.0.0.1:8790/admin` with 90 days of sample data in an in-memory SQLite database and can't reach the production database.

## How to review

Approve an instance when it meets the checklist in [verification.md](verification.md). Servers aren't reviewed one by one. A server an approved instance lists goes into the next document and stays there through renames. Removing a server keeps it out until you list it again, and blocking it also stops joins and federation for it.

When an approved instance starts serving a different key, the registry keeps publishing the old key, marks the instance "new key waiting" and ignores its discovery list. Confirm with the instance's admins that they changed the key, then press Accept the new key. This stops someone who takes over a domain from speaking for the instance.

## Admin group chat

The Admin group chat card on the Overview opens a group DM named "Meowcord Admins" between a Meowcord Admins account and the announced contacts of every approved instance that isn't blocked. The Worker acts as that account through its instance's API.

To connect the account, pick its instance on the card and sign in with its username or email, its password and a TOTP or backup code if it has two-factor authentication. Security keys and captchas can't finish this sign-in, so leave `login.requireCaptcha` off on that instance. The Worker stores only the token, encrypted with a key derived from `REGISTRY_SIGNING_KEY`. Each admin gets 10 sign-in attempts per 15 minutes. Without a connected account the Worker uses the `ADMIN_CHAT_ORIGIN` and `ADMIN_CHAT_TOKEN` secrets, and without those the buttons are disabled.

Open admin group chat creates the group or adds the contacts who aren't members yet. Handles that don't resolve show under Not added with the reason. Close admin group chat removes everyone and deletes the group.

With 10 contacts per instance the group outgrows the default limit of 25 people at three instances. Give the Meowcord Admins account the BYPASS_RATE_LIMITS right in its instance's admin dashboard, under Users. That raises its limit to `limits.channel.maxStaffGroupDmRecipients`, 100 by default, and skips the contact spam checks. Don't give it OPERATOR, because the Worker holds its token.

An admin with no active encryption device can't join the encrypted group and shows under Not added until they set up encryption and someone opens the chat again.

## Moves

An instance that changes its address keeps its key and lists its old id in `previous_ids` of its `instances.json` entry. [change-url.md](change-url.md) is the guide for instance admins. On each hourly import the registry takes up to 5 moves that aren't applied yet and:

1. refuses a move while the old id still has its own entry in `instances.json`, when it has no record of the old id, when the old id already moved elsewhere and when the new id itself moved,
2. looks for a move statement in the new id's `moved_from` that verifies against the key it has for the old id. An announce from the new id signed with the old key also counts when the key didn't change,
3. applies the move when it found proof and the key is the same. A move without proof, or with a new key, waits on the Moves page. Approve it only after the instance's admins confirmed they run both addresses.

Applying a move gives the new id the more restrictive status of the two, copies every block of the old id to it, and moves the discovery servers with their removals, the admin contacts and the counts. The old id is marked `moved` and the move is published. A move never clears a block or a suspension. Moves that drop out of `instances.json` before they are applied are forgotten.

## Running it

```sh
cd extra/registry
bun install
bun run test
bunx wrangler d1 migrations apply DB --remote
bunx wrangler deploy
```

`bun run test` runs `wrangler dev` with a throwaway key and database and announces a fake local instance, so it needs no Cloudflare account. `bun scripts/verify-registry.mjs` fetches the deployed document and checks its signature.

| Setting                                        | Kind   | What it is                                                                                                       |
| ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `REGISTRY_SIGNING_KEY`                         | secret | The Ed25519 private key as a 32 byte base64url seed. It is in Proton Pass at `projects/meowcord/registry_signing_key`. |
| `OIDC_CLIENT_SECRET`                           | secret | The hrtID client secret. Rotate it in hrtID to get a new one.                                                    |
| `ADMIN_CHAT_ORIGIN`                            | secret | Optional. The https address of the instance that holds the Meowcord Admins account.                              |
| `ADMIN_CHAT_TOKEN`                             | secret | Optional. The user token of that account.                                                                        |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `ADMIN_GROUP` | var    | hrtID sign-in. Only `ADMIN_GROUP`, `admins`, can use the pages.                                                  |
| `INSTANCES_JSON_URL`                           | var    | Where the hourly job reads `instances.json`.                                                                     |
| `REFRESH_BATCH`                                | var    | How many instances the hourly job checks, 8 by default.                                                          |
| `ALLOW_PRIVATE_HOSTS`                          | var    | `1` lets the registry fetch `localhost` and private addresses over HTTP. Only for tests and local development.   |

Set secrets with `bunx wrangler secret put <name>`. To rotate the signing key, ship a server release with the new public key first and give the Worker the new secret after, because instances only trust the key in their config.
