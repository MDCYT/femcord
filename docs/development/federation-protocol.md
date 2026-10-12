# Federation protocol, version 1

This is the contract between Meowcord instances and the registry for phase 1 of [federation.md](federation.md): the instance directory and global discovery. Chat between instances comes in a later version of this document.

All JSON is UTF-8. Binary values are base64url without padding. Times are ISO 8601 in UTC. An instance id is its lowercase host, with the port when it isn't 443, for example `meow.example` or `localhost:3001`. A canonical object id is `@<snowflake>@<instance id>`.

## Keys

- The registry has one Ed25519 key pair. Its public key, `f0jm9Szfa52pkT0nWkeZK4D1wa3NUZ9hceWaFQLZYrk`, is the default `federation.registry.publicKey` in the server config. The private key lives in Proton Pass (`projects/meowcord/registry_signing_key`) and in the registry Worker as the `REGISTRY_SIGNING_KEY` secret.
- Each instance makes its own Ed25519 key pair on first start and stores it in a file next to `jwt.key`, `federation.key`. The public key is the raw 32 bytes, base64url.

## Signed envelope

Everything signed uses one shape:

```json
{ "payload": "<base64url of the JSON bytes>", "signature": "<base64url Ed25519 signature over the payload bytes>", "key_id": "<string>" }
```

The receiver verifies the signature over the exact decoded payload bytes before parsing them. For the registry, `key_id` is `registry-1`. For an instance, it is the instance id.

## Registry document

`GET https://<registry>/v1/registry` returns a signed envelope. Its payload:

```json
{
  "version": 1,
  "sequence": 1792500000000,
  "issued_at": "2026-10-12T20:00:00.000Z",
  "expires_at": "2026-10-19T20:00:00.000Z",
  "min_protocol": 1,
  "instances": [
    {
      "id": "meow.example",
      "name": "Meow",
      "description": "",
      "icon_url": "https://meow.example/...",
      "url": "https://meow.example",
      "source_url": "https://github.com/...",
      "public_key": "<base64url or null>",
      "protocol": 1,
      "registration": "open",
      "state": "active",
      "listed_at": "2026-10-12T20:00:00.000Z"
    }
  ],
  "blocked": {
    "instances": [{ "id": "bad.example", "reason": "", "at": "..." }],
    "guilds": [{ "id": "@123@meow.example", "reason": "", "at": "..." }],
    "users": [{ "id": "@456@meow.example", "reason": "", "at": "..." }]
  },
  "discovery": [
    {
      "id": "@123@meow.example",
      "instance": "meow.example",
      "name": "Cat pictures",
      "description": "",
      "icon_url": "https://meow.example/icons/...",
      "member_count": 120,
      "invite_url": "https://meow.example/invite/abc",
      "verified_at": "..."
    }
  ]
}
```

- `sequence` only grows. The registry uses the publish time in milliseconds.
- `state` is `active` (federates), `listed` (shown in the directory, no key yet or not running a federating version), `suspended` (shown, not federating) or `blocked`.
- `registration` is `open`, `invite`, `approval` or `closed`.
- `public_key` is null until the registry has read it from the instance's well-known document.
- `discovery` only holds servers the registry operators verified.

An instance accepts a document only when the signature verifies against its configured registry key, `version` is 1, `sequence` is higher than or equal to the last one it accepted, and `expires_at` is in the future. It keeps the last accepted document. When that document expires, federation features turn off until a newer one arrives.

## Instance well-known document

`GET https://<instance>/.well-known/meowcord`, unauthenticated, cacheable for 5 minutes:

```json
{
  "protocol": 1,
  "software": "meowcord",
  "version": "<revision>",
  "id": "meow.example",
  "url": "https://meow.example",
  "name": "Meow",
  "description": "",
  "icon_url": "https://meow.example/...",
  "public_key": "<base64url>",
  "registration": "open",
  "federation": { "enabled": true, "accepts_unlisted": false },
  "discovery_url": "https://meow.example/.well-known/meowcord/discovery"
}
```

`GET https://<instance>/.well-known/meowcord/discovery` returns a signed envelope from the instance (`key_id` is the instance id) whose payload is:

```json
{ "instance": "meow.example", "issued_at": "...", "guilds": [{ "id": "@123@meow.example", "name": "", "description": "", "icon_url": "", "member_count": 0, "invite_url": "" }] }
```

It lists only servers whose owner turned on "Show on other instances", which the instance's admins haven't hidden, and which have a permanent invite. A server owner turning the switch on makes the instance create a permanent invite for it if none exists.

## Announcing to the registry

`POST https://<registry>/v1/announce` with a signed envelope from the instance. The payload is:

```json
{ "type": "announce", "id": "meow.example", "sent_at": "...", "nonce": "<16 random bytes, base64url>" }
```

The registry:

1. Refuses a `sent_at` more than 5 minutes off and a nonce it saw in the last 10 minutes.
2. Fetches `https://<id>/.well-known/meowcord` and refuses the announce if its `id` doesn't match or the signature doesn't verify against its `public_key`. This proves the sender controls the domain.
3. Stores or updates the instance as pending review, with the well-known data, then fetches and stores its discovery list as pending.
4. Answers `202` with `{ "status": "pending" | "listed" | "active" | "suspended" | "blocked" }`.

Instances announce on start, once a day and when an admin presses "Send to registry". It is on by default and an admin can turn it off. An instance never announces when its id is `localhost`, an IP address or a private name.

The registry rate limits announces to 10 per instance id and 30 per IP address per hour.

## Instance config

```
federation.enabled                   true
federation.registry.url              https://meowcord-registry.tiag.workers.dev
federation.registry.publicKey        f0jm9Szfa52pkT0nWkeZK4D1wa3NUZ9hceWaFQLZYrk
federation.announce                  true
federation.allowUnlistedPeers        false
federation.peers                     []
federation.discovery.verification    "registry" | "instance"
```

- With `verification` set to `registry`, global discovery shows what the registry document lists. With `instance`, the instance's own admins verify servers for their users, from the discovery lists of approved instances and peers.
- `peers` are extra instance ids the admins chose to federate with. They are used only when `allowUnlistedPeers` is true, and never when the registry blocks them.
- Local admins can add their own blocks on top of the registry's, and can't lift a registry block.
