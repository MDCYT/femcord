# Federation plan

This is a plan, not a feature. Nothing here is built yet. It describes how Meowcord instances could let people discover servers on other instances and chat in them, with DMs, group DMs and friends across instances, without copying the parts of Matrix and ActivityPub that make them slow, leaky and hard to moderate.

## What we want

- People find verified servers on their own instance and on other approved instances, in one Discovery view.
- People join a server on another instance and use it like a local one: read, send, react, get pinged, see members.
- DMs, group DMs and friend requests work between people on different instances.
- No other instance ever learns a user's IP address. That covers messages, media, avatars, emojis, stickers and, later, voice.
- By default an instance only talks to instances on our approved list, and only lists servers that their owner turned on for global discovery and an admin verified. We can block an instance, server or user for every instance within minutes.
- The stock Discord client keeps working, with small Equicord additions for instance badges and global discovery.

## What we accept giving up

- It isn't fully decentralized. We run the registry that says which instances are approved and what is blocked. Instances keep working when the registry is down, but nobody new can join and no new block goes out until it's back.
- A server lives on one instance. If that instance goes down, its servers are down for everyone, the same as when Discord has an outage. There is no replication.
- The admins of the instance that hosts a server can read that server's unencrypted messages, the same as today.

## Why Matrix and ActivityPub hurt, and what we do instead

| Problem there | Cause | What we do |
| --- | --- | --- |
| Matrix room joins take minutes and rooms split | Every server keeps a full copy of the room state and has to merge conflicting histories | One instance owns each server, DM and group DM. Others ask it, they don't copy it. There is nothing to merge |
| ActivityPub delivery storms | A post is pushed to every follower's inbox separately | Instances keep one connection to each other and the host sends each event once per instance, not once per user |
| Spam and harassment from instances nobody vetted | Anyone can stand up a server and start talking to everyone | An allow list we curate, signed blocklists and per-instance rate limits from the first release |
| Moderation is a fight between thousands of admins | No shared authority | We are the shared authority for the list and emergency blocks. Instance admins still moderate their own servers |
| Clients have to understand federation | Identity and addresses leak into every client | The user's own instance relays everything, so the client still thinks it talks to one server |
| Servers learn users' IPs from media | Clients fetch remote media directly | The home instance proxies all remote media |

## Words used here

- **Registry**: the service we run that publishes the signed list of approved instances, blocklists and the global discovery index.
- **Home instance**: where a user's account lives.
- **Host instance**: where a server, DM or group DM lives.
- **Remote user**: a user whose home is another instance, seen from a host.

## Architecture

### Registry

A Cloudflare Worker with D1 in `extra/registry`, publishing one signed JSON document. [registry.md](../self-hosting/registry.md) describes the running service. Its admin pages sit behind hrtID.

- `instances.md` becomes `instances.json`, and the markdown file is generated from it. Approving an instance in the registry and merging the PR are the same act.
- The document lists each approved instance: id, domain, display name, the instance's public signing key, minimum protocol version, and its state (`active`, `suspended` or `blocked`).
- It lists blocked servers and users as `instance:id` pairs, with a reason and a date.
- It lists the global discovery index (see below).
- It carries a sequence number and an expiry. We sign it with an Ed25519 key kept in Proton Pass, and the public key is pinned in the server code. Instances refuse a document with a lower sequence number than the one they have, so nobody can roll a block back by replaying an old file.
- Instances fetch it every 5 minutes through `fetchPublicUrl`, so through WARP. If the registry is unreachable, they keep the last good document until it expires, 7 days after signing, and then stop federating until they get a new one.

Approval needs: a moderation contact, captcha on, a minimum protocol version, and the instance's key published at `/.well-known/meowcord`. We can't check that a fork runs our automod, so approval is a trust decision and suspension is the answer to abuse.

### Instance identity and server-to-server requests

- Each instance makes an Ed25519 key pair on first start, stored outside the database like the E2EE master key, and publishes the public half at `/.well-known/meowcord` with its protocol version and domain.
- Every request between instances is an HTTPS request signed with HTTP Message Signatures (RFC 9421), covering method, path, body digest, a timestamp and a nonce. The receiver checks the signature against the key in the registry, not the one served live, so a hijacked domain can't speak for the instance.
- An instance is trusted to say who its own users are, and nothing else. A request "user 123 of instance A sends this message" is accepted only from instance A. A bad instance can make its own users misbehave, and the fix for that is suspending the instance.
- Instances reach each other through WARP, so a host doesn't learn a home instance's real IP either.

### Home relay

The client only ever talks to its home instance. When a user acts in a remote server, the home instance forwards the call to the host instance, signed, naming the user. The host checks permissions as for a local member and answers. The home instance translates the answer and returns it.

- One login and one gateway connection, as today.
- The host never sees the user's IP, token or client.
- The home instance can apply its own automod and rate limits to what its users send to other instances, which protects the instance's standing on the list.

Gateway events go the other way. Each pair of instances keeps one signed websocket open. A host sends an event once to each home instance that has a user who should see it, with the list of those users, after it has checked channel permissions. The home instance hands it to the matching local sessions.

### Ids

Ids are snowflakes built from a timestamp and a 5-bit worker id and a 5-bit process id (`src/util/util/Snowflake.ts`). Two instances can create the same id, and a malicious instance can do it on purpose to hijack an object on another instance.

Every object has one canonical id, written `@id@instance`, for example `@1559204248149852286@meow.example`. That is the only form used between instances, in the registry, in blocklists, in reports, in E2EE signatures and in anything stored about remote objects. It can't clash, because the instance part is checked against the signature on the request that carried it.

The Discord client can't take it directly. It reads the creation time out of the id, sorts messages and channels by comparing ids as numbers, and puts ids in URLs like `/channels/<server>/<channel>`. So the home instance never hands a canonical id to the client. It gives every remote object (user, server, channel, role, message, emoji, sticker, attachment) a local id, and a `federated_objects` table maps the canonical id and the kind of object to it. Local objects keep their plain snowflakes, and their canonical id is the snowflake plus the instance's own domain. Every payload crossing the boundary is rewritten in both directions:

- Id fields, found from the request and response schemas in `src/schemas`, which we already generate `assets/schemas.json` from.
- Mentions and custom emoji in message text: `<@id>`, `<@&id>`, `<#id>`, `<:name:id>`.
- Media URLs, rewritten to the home instance's media proxy.

We looked at giving each instance its own range of worker ids instead, so ids would never clash. It doesn't work for every object that already exists, it leaves 1024 values to split between instances and processes, and it still needs a check on every id. One rewrite path is simpler to get right and to fuzz.

The client sees remote users as normal users with a badge and a `name@instance` handle, through an Equicord plugin. Adding a friend accepts `name@instance`.

### Where conversations live

- **Servers** live on the instance that created them.
- **DMs** live on the instance of the person who opened them. If the other person's instance gets blocked, the DM becomes read-only for both.
- **Group DMs** live on the creator's instance, with the 25 member limit applied by the host.
- **Friends** are stored on both home instances. A request is one signed call, and either side can remove it.
- **Presence and typing** go through the same event connection, limited to people who share a server, DM or friendship.

### Media and IP privacy

- All remote media (attachments, avatars, banners, emojis, stickers, embeds) is fetched by the home instance through a signed `/federation/media/<instance>/...` proxy with size limits and caching, reusing what `ExternalProxy` and `fetchPublicUrl` already do.
- Link previews are made by the host, as today, and their media goes through the home proxy like any other remote media.
- Voice and video in remote servers come last. Connecting a client straight to the host's SFU would leak the user's IP, so the plan is for the home SFU to forward media to the host SFU. Until then, voice channels in remote servers are shown but can't be joined.

### Moderation

This ships with the first chat release, not after.

- **Registry blocks** apply within 5 minutes everywhere. A blocked instance's websocket is closed and its media proxy stops. Its users disappear from remote member lists and their messages show as hidden.
- **Instance admins** can block any instance, server or user on top of the registry, and can't unblock what the registry blocks.
- **Host automod** runs on everything posted in its servers, remote users included, the same as for local users.
- **Home automod** also checks what its users send out, so a user who says the slur on another instance gets the same suspension at home.
- **Rate limits** at the host apply per remote instance and per remote user, and there's an admin setting for the minimum account age before a remote user can post.
- **Reports** on remote content go to the host's admins with the usual verified snapshot. The host can forward one to the reported user's home admins, and a home can forward to us for a registry block.
- **Bans**: a host can ban a remote user from a server or from the whole instance. Server bans work as today.
- **Global discovery** lists a server only when its owner turned it on, the host instance's admin verified it, and we haven't blocked it. The host instance publishes its list, the registry gathers the lists into the index, and we can remove a server from the index at any time.

### E2EE

E2EE between instances comes later and needs a version 2 envelope. Today's signatures cover local user and channel ids, and those differ on each instance. Version 2 signs canonical `@id@instance` ids, and the Equicord plugin maps between those and local ids. Key directory lookups for remote users go through the home relay. Default mode then trusts both home instances' key directories, and strict mode with safety numbers works as it does now. Encrypted message text can't be rewritten by the server, so mentions inside encrypted messages also use canonical ids.

### Versioning

The protocol has a version number in `/.well-known/meowcord` and in the registry. The registry states the minimum version. An instance below it is suspended for federation automatically until it updates, and its local features keep working.

## Phases

Each phase ends with something people can use, and each has its own probe that runs two or three local instances against a local registry.

1. **Registry and directory**, specified in [federation-protocol.md](federation-protocol.md).
   - `instances.json`, the registry Worker, instance keys and `/.well-known/meowcord`.
   - The "show in global discovery" switch for server owners and the admin verify step.
   - An "Other instances" section in Discovery that links out to their invite pages. No chat yet.
2. **Remote servers, text only.**
   - Signed requests, the instance websocket and the id rewrite.
   - Joining a remote server from global discovery or an invite, then reading, sending, editing, deleting, reacting, mentions and member lists.
   - The media proxy, plus every moderation item above.
3. **People across instances.** Friends, DMs, group DMs, presence, typing and profiles.
4. **E2EE across instances.** Version 2 envelopes and key directory relay.
5. **Voice and video.** Forwarding between SFUs.

Phase 1 takes about a week. Phase 2 is the big one, a few weeks, and most of it is the id rewrite and its tests.

## Decisions

- We verify servers for global discovery by default. An instance's admins can switch to verifying them themselves, or turn federation off.
- Admins can federate with instances that aren't on our list. It is off by default.
- The registry runs on a workers.dev address for now. Every instance announces itself to it by default so we can review instances that never opened a pull request.

## Open questions

- Do we want account moves between instances? Canonical `@id@instance` ids keep that possible, because a move only has to update the mapping.
- Should a host be able to see which home instance a remote user's request came through when that user is on a blocked instance's list? This matters for appeals.
