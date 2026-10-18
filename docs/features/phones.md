# Phones and tablets

People use an instance on a phone through the browser. The web client switches to its phone layout when the user agent belongs to a phone or tablet, with the server and channel lists in a drawer, full screen settings and a send button.

## Fixes for the phone layout

The `FosscordMobileWeb` plugin changes what the stock client got wrong in a mobile browser:

- Invite and template links accept the invite or create the server in the browser instead of sending people to the Discord app.
- Voice works in Chrome, Firefox, Opera and Samsung Internet on Android. Discord's browser check refused their mobile names. iOS Safari already worked.
- The Android back button closes the top menu or dialog, then a settings page, then the drawer, and leaves the page only when nothing is open.
- Server and channel settings fit a 412 pixel screen. The member table is wider and scrolls sideways.

`FosscordNotifications` shows desktop notifications on Android through the notifications service worker, because Chrome on Android refuses `new Notification()`. Web Push works on Android as well, see [notifications.md](notifications.md). `FosscordNoAppUpsells` removes every download-the-app prompt.

The server adds `interactive-widget=resizes-content` to the viewport tag, so Chrome and Firefox on Android shrink the page when the keyboard opens and the channel header stays visible.

Encrypted DMs need X25519 and Ed25519 in WebCrypto, which Chrome has had since version 137. On older browsers the encryption self-test fails and the DM message box sends nothing. Server channels still work.

## Installing to the home screen

Browsers offer to install a site only over HTTPS or from localhost. In Chrome or Samsung Internet on Android, choose "Add to Home screen" or "Install app" from the browser menu. On iOS, tap Share in Safari and choose "Add to Home Screen". The installed app opens without browser controls and needs a connection, since nothing is cached for offline use.

The server serves `/manifest.webmanifest` with the name from `client.instanceName` and `/app` as the start page. The icons at `/assets/pwa/icon-180.png`, `icon-192.png` and `icon-512.png` draw the instance icon from `client.icon`, then `general.image`, then `assets/icon.png`, on a `#121214` background. An SVG or WebP icon falls back to `assets/icon.png`.

## Discord's Android app

Discord's apps have Discord's hosts built in and no server picker. On Android, the Kettu mod loader can load the instance's bundle from `/mobile/meowcord.js`, which redirects the app to the instance. This is experimental and has no push notifications. [android-client.md](../development/android-client.md) has the setup steps and the current gaps.
