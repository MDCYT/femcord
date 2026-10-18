# External services

The server, database, gateway, voice, captcha, encryption and pride artwork all run on the instance. This page lists everything the instance can contact outside it and the switch for each.

## Switches

The External requests card on the Site settings page of the admin dashboard edits `externalRequests`:

| Key | Default | Allows |
| --- | --- | --- |
| `discordDecorations` | on | Downloading avatar decorations, nameplates and profile effects from Discord's CDN. Shop items stay free. |
| `discordAssetFallback` | on | Downloading other missing Discord CDN assets, such as client images and Krisp noise suppression models. |
| `discordClientAssets` | on | Downloading web client files missing from the cache while people browse. |
| `discordGames` | on | Refreshing the detectable games list from Discord. |
| `discordTemplates` | on | Importing server templates from Discord. |
| `discordStickerPacks` | on | Importing standard sticker packs and fetching their artwork from Discord. |
| `discordBadDomains` | on | Downloading Discord's blocked-domain list. |
| `thirdParty` | off | Every other integration: link previews, embed media, IP reputation, connected accounts and Web Push. Each one also needs its own configuration. |

The server downloads and caches every Discord asset itself, so browsers only contact the instance.

## Services

| Service | Used for | When |
| --- | --- | --- |
| Discord's site and CDN | Downloading the web client during setup and updates, plus the switches above. | Setup, then per switch. |
| Klipy | GIF search, categories and trending GIFs. The default provider. | GIF search on and an operator key entered. |
| Tenor | The other GIF provider, with the public v1 key that Vencord's TenorGifSearch uses. Google retired the Tenor API on June 30, 2026, so it can stop answering. | GIF search on. |
| `cors.estrogen.delivery` | Fetching link preview pages and serving embed and component media to clients. It receives every destination URL, query strings included. | `thirdParty` on. |
| FixTweet, `api.fxtwitter.com` | Text, author and video of X and Twitter post links. | `thirdParty` on and no `external.twitter` token. |
| Linked websites | Link previews, `og:video` players from YouTube, Vimeo and Dailymotion, and domain verification of a user's own domain. | `thirdParty` on. |
| AbuseIPDB, IPData, Stop Forum Spam | IP and signup reputation. | `thirdParty` on and a key configured. |
| OAuth providers | Connected accounts: Twitch, Epic Games, Battle.net, Reddit, Facebook, GitHub, Google, Spotify, Xbox, Discord and X. | `thirdParty` on, the connection configured, and a user links an account. |
| Browser push services | Web Push to Google, Mozilla, Apple or another endpoint the browser picks. | `thirdParty` on and Web Push on, see [notifications.md](../features/notifications.md). |
| SMTP, Mailgun, Mailjet, SendGrid | Email. | An operator configures one. Not affected by `thirdParty`. |
| S3 | Object storage instead of local files. | An operator configures it. |
| A Cap Standalone server | Captcha, instead of the built-in Cap. | Standalone mode with its URL and keys, see [signup.md](../features/signup.md). |
| Hosts chosen by apps and users | OAuth callbacks, interaction endpoints, webhook `avatar_url` images, embedded activities. | Configured by app developers and users. |
| Other instances and the registry | Federation, see [federation.md](../features/federation.md). | Federation on. |
| GitHub and package registries | Dependencies and Equicord source. | Build time only. |
| Equicord plugins and themes | Whatever each optional plugin or remote theme contacts. ReverseImageSearch is on by default and opens a search only when a user asks. | Users turn them on. |

`thirdParty` is not a firewall. Email, storage, app callbacks and client plugins contact their hosts whatever it is set to. Discord's telemetry and Sentry endpoints are turned off in the client.

GIF search is on by default and has its own card on the Site settings page, independent of `thirdParty`. Users pick Klipy or Tenor in the GIF picker. A Klipy key comes from [Klipy's partner panel](https://partner.klipy.com). The server stores keys in the configuration and never returns them from the settings API. Neither provider fills in results from the other.

## Hiding the server's address

The server fetches URLs that users, bots and other instances choose: link previews, the `/external` media proxy, video preview frames, webhook `avatar_url` images, interaction endpoints, Web Push endpoints, domain verification and connections to other instances. All of them go through the SOCKS5 proxy in `PUBLIC_FETCH_PROXY`, so the receiving site sees the proxy's address.

| `PUBLIC_FETCH_PROXY` | Result |
| --- | --- |
| `socks5://host:port` | Requests to public addresses go through the proxy. |
| `direct` | Requests go out from the server's own address. Use it only for development. |
| unset or invalid | Requests to public addresses fail. |

Compose runs Cloudflare WARP from `caomingjun/warp` as the `warp` service and points the server at `socks5://warp:1080`. `WARP_LICENSE_KEY` takes an optional WARP+ key. A native install runs `warp-cli` in proxy mode or the same container, see [native.md](native.md#runtime-configuration).

When the setting is missing, invalid or `direct`, the server logs a `[Network] Warning` line at startup. The Link previews card on the System page of the admin dashboard shows the mode, whether the proxy accepts a connection within 2 seconds and whether `thirdParty` is on. Requests to the instance's own CDN and to private addresses allowed by `security.allowPrivateNetworkRequests` don't use the proxy. [limits.md](../security/limits.md) covers how the server checks fetched addresses and caps response sizes.
