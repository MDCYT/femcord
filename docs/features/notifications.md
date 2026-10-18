# Notifications

The Discord client decides on its own whether a message shows a desktop notification, plays a sound or adds a badge. The server sends the data that decision reads, keeps notification settings and read states in sync between sessions, and reaches users with no tab open through Web Push, which Discord's web client doesn't have.

## Desktop notifications

On the web the client starts with desktop notifications set to "never". When a user turns on Settings, Notifications, Enable Desktop Notifications, the `FosscordNotifications` plugin asks the browser for permission in the same click, which the client doesn't do by itself.

## Settings and badges

Notification settings for servers, DMs and group DMs sync between sessions. A server left at its default follows the server's default notification level.

The server counts mentions for the red badges the client shows at startup. A message counts as a mention for a user when it is a DM or group DM they're in, mentions them, mentions a role they have, or is `@everyone` or `@here`, unless they suppressed role or everyone mentions. `@here` only counts while they have a connected session. The author never counts, and neither do users who blocked or ignored the author or can't view the channel. In threads, `@everyone` and `@here` only reach thread members.

Reading a channel in one session clears its unread marker and badge in the others, and "Mark as unread" carries over too.

## Inbox

The Mentions tab lists mentions the user can still see, and dismissing one removes it in every session. The Unreads tab works from read states. The For You tab isn't in this client build, so the server doesn't implement it.

## Threads and message requests

A joined thread follows its own notification level, or its parent channel when it has none. Threads the user hasn't joined never notify. A DM from someone who isn't a friend goes to Message Requests and never notifies, by desktop notification or by Web Push.

## Web Push

A client script registers a service worker at `/notifications-sw.js` once the user is logged in and has granted notification permission, subscribes with the instance's VAPID key and sends the subscription to the server. Logging out, or removing the session from Devices, deletes the subscription. On Chrome for Android, which has no `new Notification()`, the client's own notifications go through the same worker.

Web Push needs `externalRequests.thirdParty` on and `PUBLIC_FETCH_PROXY` set, because the server sends each push to the browser vendor's push service, see [external-services.md](../self-hosting/external-services.md).

For each new message the server skips users who:

- have a connected gateway session, since their open tab already notifies,
- are set to Do Not Disturb,
- would see a message request, a message from a blocked or ignored author, or a channel they can't view,
- turned off Mobile Push Notifications for that server, which here controls Web Push.

The server also skips `@silent` and ephemeral messages. For everyone else it follows the client's rules: a DM notifies unless it is muted, and a muted DM still notifies on a direct mention. In servers, a channel or category override wins over the server level, which wins over the server default. Threads use the thread level first.

A push carries the sender's name and avatar, the channel and server name, and the message text with mentions and custom emoji turned into text. Clicking it focuses an open tab on the message or opens a new one. A browser with several accounts logged in gets pushes for all of them. A [UnifiedPush](https://unifiedpush.org) distributor such as ntfy works too.

| Key                                | Default   | Meaning                                                                                                                    |
| ---------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `security.webPush.enabled`         | `true`    | Turns Web Push off without deleting stored subscriptions.                                                                  |
| `security.webPush.vapidPublicKey`  | generated | P-256 public key, base64url, generated on first start. Changing it makes every browser subscribe again.                    |
| `security.webPush.vapidPrivateKey` | generated | The matching private key.                                                                                                  |
| `security.webPush.subject`         | `null`    | VAPID contact, a `mailto:` or `https:` URL. When empty the server uses `mailto:push@<api host>`. Set a real address on a public instance. |

Push endpoints must be public `https` URLs unless `security.allowPrivateNetworkRequests` is on.

Browsers only allow push on `https` origins and on `localhost`. Chrome, Edge and Firefox work out of the box. Brave needs "Use Google services for push messaging" turned on in its privacy settings, or subscribing fails with "push service error". Safari works on macOS from version 16, and on iOS only after the site is added to the home screen.

`PORT=<port> bun scripts/dev/notifications-test.mjs` checks mention counts, DM settings, mention dismissal and Web Push against a running dev server. The push part runs only with `security.allowPrivateNetworkRequests: true`, because it starts a fake push service on `127.0.0.1`.
