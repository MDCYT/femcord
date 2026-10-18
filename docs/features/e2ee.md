# End-to-end encrypted messages

Every DM and group DM encrypts new messages and attachments, and nobody can turn it off. That covers messages sent by bots, applications and webhooks into private channels, and DMs with people on other instances. Guild channels are not encrypted. Messages sent before a conversation was encrypted stay in plaintext.

Users don't set anything up. Signing up or logging in with a password creates or unlocks the key backup in the background.

## Security model

By default the server is trusted, and `limits.e2ee.trustServerByDefault` is `true`. In this mode the operator can recover message keys, so it protects messages from a stolen database or a passive observer but not from the operator. The operator can read message content in these cases:

- The server keeps a recovery copy of every user's backup secret, encrypted under a recovery master key that lives outside the database. Whoever holds both the database and that key can open every backup, and with it every message key.
- The server serves the client JavaScript, so a malicious operator can ship a client that leaks keys. Every web E2EE design has this limit.
- In default mode the client trusts the server's key directory, so a compromised server could swap a contact's identity key or approve a device link to the same account without the user seeing it.

Without the recovery master key and without changing the client, the operator can read none of the content. It still sees the metadata: who talks to whom and when, message and file sizes, the number of attachments, voice message flags, reactions, pins, typing, read state, reply structure, which members a message mentions, which stickers a client loads from the CDN, and the links whose previews a reader's browser asks for.

The advanced option in User Settings > Encryption, "Review safety number changes and new browser approvals", turns on strict safety checks for that browser. Strict mode pins each contact's identity key, blocks sending when it changes until the user reviews the safety number, asks the user to approve new browsers with a six-digit code, and never uploads or fetches a recovery copy. It does not delete a recovery copy that another browser of the user already published. Setting `limits.e2ee.trustServerByDefault` to `false` makes strict mode the default for every browser and makes the recovery endpoints refuse to store or return secrets.

Discord's own analytics and Sentry code runs in the same page, so its payloads need checking to keep plaintext out.

## Cryptography

For each message the sending browser generates a random 256-bit content key, encrypts the payload once with AES-256-GCM, wraps the content key to each recipient device's signed X25519 prekey with HPKE base mode, and signs the envelope with its Ed25519 device key. Keys are non-extractable WebCrypto keys in IndexedDB.

| Key | Type | Scope |
| --- | --- | --- |
| Identity key | Ed25519 | One per user. Signs the user's devices. Safety numbers are computed over it. |
| Device key | Ed25519 | One per browser profile and origin. |
| Signed prekey | X25519 | Rotated every 7 days. Old private prekeys are deleted after 30 days. |

There is no per-message forward secrecy. Prekey rotation gives a coarse version of it. The planned upgrade is MLS behind a new envelope version, first for group DMs and then for guild channels.

The additional authenticated data binds the channel, the sender, the sender device and the nonce, so a ciphertext can't be moved to another channel or replayed. The server writes `🔒 Encrypted message` into `content` itself, so mentions, search and push notifications never see plaintext. The encrypted payload holds the text, the attachment metadata and the stickers.

Safety numbers are 60 digits in Signal's numeric fingerprint format, compared by voice or in person. There is no QR code. When a user marks a contact as verified, the mark follows them to their other browsers through a list sealed in the key backup.

## Devices

Each browser profile is a device. A new device registers as pending, and other browsers only encrypt to it once the user's identity key signs it. The device gets the identity key from the key backup, from a recovery copy, or from another of the user's browsers.

The server ties each device to the session that registered it. Logging that session out, from the browser, from Logged-in Devices or through a password change, revokes the device. A browser that finds its own device revoked deletes its keys. User Settings > Log Out deletes them right away, so a shared computer doesn't keep the secret that opens the backup. Pending devices are revoked when their session ends or after `limits.e2ee.pendingDeviceTtlHours`, 168 hours by default.

User Settings > Encryption lists the user's devices with their session's last activity and location. Removing a device revokes it and logs its session out.

## Key backup and recovery

Without a backup a new browser couldn't sign itself or read older messages. The backup is on by default. The browser that holds the identity key creates a random 32-byte backup secret and an X25519 backup keypair. The server stores one backup row per user with the identity private key and the backup private key sealed under the backup secret, and the backup secret sealed under the user's password or recovery code. Every envelope also seals its content key to each member's backup public key, so a new browser can read the whole history once it opens the backup.

### Password

By default the browser seals the backup secret under a key derived from the account password with Argon2id, 64 MiB, 3 iterations and parallelism 1. The browser sees the password when the user logs in, registers or changes it, and uses it only after the server accepts it. A new browser unlocks the backup at login without any prompt. A password change reseals the secret under the new password.

Anyone with a copy of the database can guess passwords offline at the cost of one 64 MiB Argon2id run per guess, so a weak password makes the backup about as weak as that password.

### Recovery code

User Settings > Encryption can switch the backup to a recovery code of 32 Crockford base32 characters, about 160 bits, shown once. After the user confirms with "I saved it", the password no longer opens the backup. If the user loses the code and every signed-in browser, and no server recovery copy exists, the history is gone.

### Server recovery copy

In default mode an unlocked browser publishes its backup secret to the server, signed by the identity key. The server checks the signature and the backup before storing it, and encrypts it under the recovery master key. A new browser can then get the secret back with the current account password, even when the backup itself uses a recovery code. `GET /users/@me/e2ee/backup/escrow` reports whether a recovery copy is ready without returning it. Resetting encryption or deleting the account removes the copy.

The recovery master key is 32 bytes. The server reads it from these places, in this order:

| Source | Notes |
| --- | --- |
| `E2EE_RECOVERY_MASTER_KEY` | 64 hex characters or 32 bytes in base64url. |
| `E2EE_RECOVERY_KEY_FILE` | Path to a file holding the key in either format. |
| `.e2ee-recovery.key` next to `CONFIG_PATH` | The default. Docker keeps it in the `state` volume. |

The server creates the default file with mode 600 the first time it needs the key, but only while no recovery copies exist. The file must be a regular file with no group or other permissions and at most 128 bytes, and it can't be a symlink. When the key is missing or invalid, the recovery endpoints answer `503` and store nothing. When recovery copies already exist, the server refuses to make a new key, because a new one couldn't open them. Back the key up separately from the database, keep it out of version control and never serve it from a public directory. The repository's `.gitignore` already excludes `.e2ee-recovery.key*`.

A recovery copy only exists after a browser published it, so it can't bring back secrets that were lost before that.

### Approval from another browser

A locked browser can ask the user's other signed-in browsers for the backup secret over the gateway. The two browsers run an X25519 key exchange in which the new browser commits to its key first, so the server can't pick keys that make the codes match. In default mode an unlocked browser approves automatically when the server says the requesting device belongs to a live session of the same account. In strict mode every unlocked browser shows the new login with its location and a six-digit code, and the user picks Approve or Deny. Deny revokes the device and signs its session out. Pending devices in User Settings > Encryption also have an Approve button.

### Resetting encryption

When nothing can unlock the backup, "Reset encryption" in the unlock dialog and in User Settings > Encryption asks for the account password and starts over. The server revokes every device, deletes the backup, the stored message keys and the recovery copy, and stores a new identity. The user's own browsers then show old messages as "Sent before encryption was reset". Contacts keep reading what they already received, because their browsers still accept a revoked device's signature on messages sent before it was revoked. Contacts in strict mode see a safety number change.

## What users see

Private chats show a quiet encryption status in the header and no lock on each message. While keys load, messages show "Decrypting…" and fill in. When a send can't be encrypted, the draft stays in the composer with a short error, and nothing is sent in plaintext. When the browser needs the account password to unlock, it asks for it in a prompt that can't be skipped.

Before each send the browser checks which members have keys. A member who never signed in since encryption existed has neither a device nor a backup and can never read the message. When every other member is in that state, the browser refuses the send and names them. When only some are, the message goes to the rest and a warning names the members who can't read it.

These work in encrypted conversations too:

- Attachments, stickers and voice messages. Files are encrypted in 64 KiB chunks before upload, and the server only sees an opaque `.bin` file of the same size plus 16 bytes per chunk. A service worker at `/e2ee-sw.js` decrypts them for display and serves only images, video, audio and PDF with their own type.
- Mentions. The sending browser lists the mentioned members in the envelope in plaintext, at most 100, so mentions, badges and push notifications work. A sender can list someone the text doesn't name, which triggers that person's push notification but not the highlight.
- Search. The browser answers it from the decrypted copies of the last 1000 messages, and the query never reaches the server.
- Link previews. After decrypting, the reader's browser sends up to 5 links to `POST /e2ee/embeds` and the server returns their previews. The server stores no embed on the message.

Polls, clips, forwards, components and text-to-speech are not available. The server rejects them in encrypted channels and the client disables them.

The browser keeps the decrypted text and content keys of the 5,000 messages it used most recently, and the decrypted copies used for search for the 50 most recent channels at 2,000 messages each. Older entries are decrypted again when they come back into view. Key lookups that start together go out as one `POST /e2ee/keys/query` of at most 100 users, the limit the server accepts.

## Members who left a group

The content key of every message is wrapped to every member at send time, so remaining members can still read messages from someone who left. To check the signatures on those messages, the server keeps answering key requests about a former member to anyone who is a member of that channel now. Strangers, and people who only share a different conversation with them, get nothing.

Across instances the former member's home instance answers when the asking instance hosts the group or still has a user in it. When the home refuses, an instance keeps its cached copy of the keys. One gap remains, tracked as ENC-022 in the [work backlog](../development/work-backlog.md): a third instance that never cached the keys gets nothing once the home's last local member has left the group.

## Conversations with users of other instances

A DM or group DM with someone on another [federated](federation.md) instance is encrypted from its first message. The instance where the conversation started hosts it and stores the ciphertext. Each other member's home instance keeps a mirror and relays their requests. A home never turns encryption off on a mirror and refuses to relay a message or edit without an envelope, so a malicious host can't downgrade the conversation.

These conversations use version 2 envelopes, which sign canonical `@snowflake@instance` ids instead of local ids, because local ids differ on each instance. Mentions, custom emojis and stickers inside the payload use canonical ids too, and each reader's browser maps them back to its own instance. Conversations with only local members keep version 1. The wire format is in [federation-protocol.md](../development/federation-protocol.md).

Each instance fetches a remote user's keys from that user's home and caches them for 10 minutes. The home only answers instances that share a DM, a group DM or a friendship with the user, or the host of a conversation the user is in. Adding someone from another instance to an encrypted group DM fails with `E2EE_RECIPIENT_NO_DEVICES` when their instance returns no active device. In default mode a browser trusts both its own instance and the contact's home for key changes. Strict mode pins the key, so neither instance can swap it unnoticed.

The host stores the ciphertext and attachments and sees the conversation's metadata. Each home sees the same metadata for its own members and caches attachment ciphertext in its media proxy. No instance gets a content key, except through a report.

## Reporting encrypted messages

When a user reports a message in an encrypted conversation, their browser adds the 32-byte content key of that message and the keys of up to 50 surrounding messages it can read. No other key leaves the browser. The server checks that the sender's device belonged to the author and was active when the message was sent, verifies the signature, decrypts the stored ciphertext and saves up to 4000 characters of text and up to 10 file names in the report. It never stores the keys. Because the text comes from ciphertext the sender signed, a reporter can't change what the message says.

The admin dashboard shows a report that passes as "Verified encrypted text". A report with a missing or wrong key, or a bad signature, shows as "Encrypted, not verified" with the reason. A report about a conversation hosted on another instance is sent to the host, which verifies it the same way.

Instance automod skips encrypted messages and only acts on a verified report, as [automod.md](automod.md#encrypted-messages) describes.

## Limits

Operators change these in the admin dashboard under Site settings > Encrypted DMs, and the new values apply without a restart. They live under `limits.e2ee` in the config. `trustServerByDefault` is only in the config.

| Key | Default | Meaning |
| --- | --- | --- |
| `trustServerByDefault` | `true` | Default mode with server recovery. `false` makes strict mode the default and turns off recovery copies. |
| `maxEnvelopeBytes` | `65536` | Largest encrypted envelope in bytes. |
| `maxEnvelopeDevices` | `256` | Recipient devices one message can be encrypted for. |
| `pendingDeviceTtlHours` | `168` | Hours before an unapproved device is revoked. |
| `deviceRegistrationsPerHour` | `30` | New devices per account per hour. Re-signing a known device doesn't count. |
| `deviceUpdatesPerHour` | `60` | Device re-signs per account per hour. |
| `keyQueriesPerMinute` | `60` | Key directory lookups per account per minute. |

The password check and reset endpoints have fixed limits of 10 per 10 minutes and 5 per hour.

## Error codes

| Code | Name | Meaning |
| --- | --- | --- |
| 90001 | `E2EE_DEVICE_MISMATCH` | The envelope skipped an active device of a member. The client refetches keys and retries. |
| 90002 | `E2EE_REQUIRED` | A plaintext message was sent into an encrypted conversation. |
| 90003 | `E2EE_INVALID_ENVELOPE` | The envelope is malformed or has the wrong version for the conversation. |
| 90004 | `E2EE_UNSUPPORTED` | Polls, forwards, components, text-to-speech or plaintext stickers in an encrypted conversation. The recovery endpoints also answer it when `trustServerByDefault` is `false`. |
| 90007 | `E2EE_RECIPIENT_NO_DEVICES` | A member has no active device. The response lists their `user_ids`. |
| 90016 | `E2EE_PLAINTEXT_ATTACHMENT` | An attachment wasn't an opaque `.bin` file. |

## Discord's Android app

The mobile bundle in `client/mobile` encrypts and decrypts text in DMs and group DMs and unlocks with the login password. It has no UI for approvals, safety numbers or settings, and it refuses attachments. [android-client.md](../development/android-client.md#encrypted-dms) has the details.

## For contributors

The engine is in `client/e2ee`, bundled into `assets/public/e2ee` by `bun run build:e2ee` and loaded by `assets/client_patches/10-e2ee-loader.js`. The `fosscordE2ee` plugin adds the UI. The loader finds Discord's modules by shape, never by numeric id. When it can't find a hook, the client shows "E2EE unavailable in this client build" and refuses to send in encrypted channels instead of falling back to plaintext. `scripts/e2ee-anchors.js` checks the hook anchors after every `bun run generate:client`. Read [client-patches.md](../development/client-patches.md) before changing any of this.

The browser tests take several minutes, so run them from a terminal or through `scripts/dev/outside-app.sh`:

```sh
PORT=<port> E2EE_TEST_DATABASE_NAME=<db> bun scripts/dev/e2ee-test.mjs
bun scripts/dev/federation-e2ee-test.mjs
```

`e2ee-test.mjs` refuses a database it wasn't given by name. `federation-e2ee-test.mjs` starts two instances on new databases, `meowcord_fed_e2ee_a` and `meowcord_fed_e2ee_b` by default, runs DMs, files, mentions, safety numbers, a group DM, history on a new browser and a verified report across them, and drops the databases at the end. The unit tests in `scripts/tests/e2ee-*.test.cjs` and `encrypted-report.test.cjs` run with `bun run test`.
