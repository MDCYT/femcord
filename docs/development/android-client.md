# Discord's Android client

This page covers what Discord's React Native Android app does on the wire that the web client doesn't, what the server answers today, and what still needs a client mod. Nothing here comes from a downloaded APK. The sources are [docs.discord.food](https://docs.discord.food), the [Discord developer docs](https://discord.com/developers/docs), the READMEs of the open source mobile mod loaders and tests run against a local instance with `scripts/dev/android-gateway-probe.mjs`.

## How the app would reach an instance

The app has `discord.com/api`, `gateway.discord.gg`, `cdn.discordapp.com` and `media.discordapp.net` compiled into its JavaScript bundle. There is no server picker. The mobile mod loaders, [Vendetta](https://github.com/vendetta-mod/Vendetta), [Bunny](https://github.com/bunny-mod/Bunny), [Revenge](https://github.com/notmarek/revenge) and [Kettu](https://codeberg.org/cocobo1/Kettu), install through a manager app or Xposed and run a JavaScript bundle before Discord's own code. Their READMEs document a developer setting, "Load from custom URL", that loads the mod bundle from any HTTP server. None of them document an instance switcher, so pointing the app at Meowcord needs a mod plugin or a custom bundle that replaces those four hosts before the app makes its first request. [Aliucord](https://github.com/Aliucord/Aliucord) only supports the legacy Kotlin app at version 126.21 and is out of scope.

The server side is ready for that client. The bundle itself is not written yet.

## What the app sends

| Area | What the Android app does | Source |
| --- | --- | --- |
| Gateway URL | `?encoding=etf&v=9&compress=zstd-stream`, older builds `zlib-stream` | [Gateway](https://docs.discord.food/topics/gateway#encoding-and-compression) |
| ETF | Binary External Term Format. The client sends string map keys and never compresses what it sends. Snowflakes may arrive as 64-bit integers or strings. | [Using ETF encoding](https://docs.discord.food/topics/gateway#using-etf-encoding) |
| zstd-stream | One zstd context for the life of the connection. Each websocket message is one gateway payload and is flushed, but doesn't end the zstd frame. | [Zstd-stream compression](https://docs.discord.food/topics/gateway#zstd-stream-compression) |
| zlib-stream | One shared inflate context, each payload ends with the `00 00 ff ff` sync flush suffix. | same page |
| IDENTIFY | `properties.os` is `Android`, `browser` is `Discord Android`, plus `device`, `os_version` as the SDK level, `client_version` like `280.2 - rn` and `client_build_number`. `capabilities` is a bit field, `client_state` carries cached guild versions. | [Client properties](https://docs.discord.food/reference#client-properties), [capabilities](https://docs.discord.food/topics/gateway#gateway-capabilities) |
| REST headers | `X-Super-Properties` is the same properties object in base64, the user agent is `Discord-Android/<build>;RNA`. | [Client properties](https://docs.discord.food/reference#client-properties) |
| Lazy guilds | OP 14 for one guild and OP 37 for several guilds at once | [Opcodes](https://docs.discord.food/topics/opcodes-and-status-codes) |
| Push | `POST /users/@me/devices` with `provider: "gcm"` and an FCM token, `DELETE` with the same body on logout. `PATCH /users/@me` can carry `push_provider` and `push_token`. | [Push notifications](https://docs.discord.food/topics/push-notifications) |
| Images | Avatars, icons and emojis as `.webp` or `.png` with `?size=` | [Image formatting](https://discord.com/developers/docs/reference#image-formatting) |

## What works today

The probe logs in with Android super properties and user agent, calls the startup endpoints below and then runs the gateway four ways: ETF with zstd-stream, ETF with zlib-stream, plain ETF and JSON with zstd-stream. Every run gets READY with string IDs and real arrays, READY_SUPPLEMENTAL, a heartbeat ACK, a member list for OP 14 and for OP 37, and the MESSAGE_CREATE for a message sent over REST. On the seeded database a full run takes 4,839 bytes on the wire for 20,735 bytes of ETF with zstd-stream, and 4,740 bytes with zlib-stream.

A session that identifies as Android gets the `mobile` platform, so friends see the phone icon in `client_status`.

These startup endpoints answer with 2xx: `/experiments` with a fingerprint, `/auth/location-metadata`, `/users/@me`, `/users/@me/settings-proto/1` and `/2`, `/users/@me/consent`, both affinities lists, connections, billing subscriptions and payment sources, premium subscription slots, gift entitlements, library, mentions, `/users/@me/notification-center/items`, survey, referral eligibility, collectible purchases, email settings, application statistics, `/applications/detectable`, `/sticker-packs`, `/gateway`, `/voice/regions`, promotions, outbound promotions, `POST` and `DELETE /users/@me/devices`, `/science` and `/metrics/v2`.

The CDN serves the stored file whatever extension the URL asks for, so a `.webp` URL for a PNG avatar gets the PNG with `image/png`. Fresco, the image library React Native uses on Android, decodes by content. This hasn't been checked on a phone.

## Bugs fixed for this client

- ETF frames from the client failed to decode. The old `harmony-erlpack` decoder turned `NIL_EXT`, the empty list Discord's erlpack writes for `activities: []`, into `undefined`, rejected every atom except `nil`, `true` and `false`, and had no `ATOM_UTF8`, `STRING_EXT`, `LARGE_BIG` or tuple support. An Android-style IDENTIFY was closed with 4002 every time. `src/gateway/util/Etf.ts` replaces it and checks lengths, nesting depth and trailing bytes.
- ETF output differed from JSON output. The encoder wrote `toJSON` results back into the shared payload and then encoded the original object, wrote `nil` for keys JSON drops, broke a map's arity when it skipped a function, sent integers above 2^32 such as millisecond timestamps as floats and wrote empty lists as a zero-length `LIST_EXT`. `Send` now encodes ETF from the exact JSON the json encoding sends, and empty lists use `NIL_EXT` like Discord's erlpack.
- zstd-stream sent every payload as its own finished frame from a fresh context, so nothing was shared between messages. `src/gateway/util/ZstdStream.ts` keeps one compression context per socket and flushes with `ZSTD_e_flush`. A repeated payload now costs a few bytes, and the JSON run above dropped from 5,963 to 4,301 bytes.
- `DELETE /users/@me/devices` and `GET /users/@me/notification-center/items` returned 404.
- `GET /users/@me/settings-proto/3`, `GET /users/@me/devices/sync-token` and `PUT /users/@me/devices/sync` returned 404. Type 3 is `TEST_SETTINGS`, which the client never decodes, so the server answers with an empty proto and doesn't store updates. A sync token is the user id and the time it was issued, signed with an HMAC key derived from the instance's JWT key. It lasts 30 days and stops working when the account's sessions are revoked, for example by a password change. `PUT /users/@me/devices/sync` registers the device token for every account whose sync token checks out and lists the others in `invalid_push_sync_tokens`. One device token can now belong to several accounts, so the unique index on `push_devices` covers provider, token and user. The content inventory request this page used to list as missing is `GET /content-inventory/users/@me`, which already answered.

`scripts/tests/gateway-etf.test.cjs` covers the encoder and decoder byte by byte, the zstd stream, and `Send` producing the same payload for ETF and JSON.

## What doesn't work yet

- Signing up. Registration asks for a [Cap](../features/captcha.md) proof and the app only knows hCaptcha. Accounts have to be made on the web. Login works as long as `security.captcha.login.requireCaptcha` stays off.
- Voice. Nothing has tested the mobile app against `src/webrtc` and the SFU.
- The probe's capabilities value is 30717. Each bit's effect on the mobile READY shape has not been compared against Discord's.

## What can't work

Android push goes through Firebase Cloud Messaging. Sending to an FCM token needs a service account for the Firebase project the app was built with, and that project belongs to Discord. The server stores `gcm` registrations so the app doesn't retry them, but only `webpush` devices get notifications, see [notifications.md](../features/notifications.md). A mod can register a [UnifiedPush](https://unifiedpush.org) endpoint instead. UnifiedPush delivers through a distributor app the user picks, such as ntfy, and accepts the same `aes128gcm` and VAPID requests as Web Push, so the mod sends `{ "provider": "webpush", "token": "{\"endpoint\":...,\"keys\":{\"p256dh\":...,\"auth\":...}}" }` and the server needs nothing new. Each payload carries the `user_id` it's for, so a device synced to several accounts can route it. The mod side is not written.

## Running the probe

```sh
scripts/dev/worktree-setup.sh 3203 mc_android_gw
PORT=3203 bun scripts/dev/android-gateway-probe.mjs
```

It reads the seeded accounts from `scripts/dev/.test-account`, refuses any host other than localhost and exits with code 1 when a check fails.
