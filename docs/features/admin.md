# Admin dashboard

The dashboard is at `/admin`. Operators see every page, and [setup.md](../self-hosting/setup.md) explains how to grant the operator right with `scripts/ops/operator.mjs`. Other staff see only the pages, fields and buttons their rights allow. [admin-api-coverage.md](../development/admin-api-coverage.md) maps which API operations the dashboard covers.

## Pages

| Group             | Page                   | Needs             | What it controls                                                                                         |
| ----------------- | ---------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| Instance          | Overview               | any staff right   | Counts and activity charts.                                                                              |
| Instance          | Site settings          | `OPERATOR`        | Instance configuration, see [Site settings](#site-settings).                                              |
| Instance          | Official inbox         | `OPERATOR`        | Direct messages to and from the official account.                                                        |
| Instance          | Announcements          | `OPERATOR`        | Encrypted announcements from the official account, see [announcements.md](announcements.md).             |
| Instance          | Federation             | `OPERATOR`        | Peers, blocks and federated servers, see [federation.md](federation.md).                                 |
| People & servers  | Users & profiles       | `VIEW_USERS`      | Accounts, addresses and IP bans.                                                                         |
| People & servers  | Instance invites       | `VIEW_USERS`      | Signup invites and invite trees, see [invites.md](invites.md).                                           |
| People & servers  | Servers                | `MANAGE_GUILDS`   | Servers, their channels and roles.                                                                       |
| People & servers  | Reports                | `VIEW_MODERATION` | Reports people sent from the client.                                                                     |
| People & servers  | Automod                | `VIEW_MODERATION` | Instance automod, see [automod.md](automod.md).                                                          |
| Staff             | Staff roles            | `MANAGE_STAFF`    | Staff roles and who holds them.                                                                          |
| Staff             | Audit log              | `VIEW_AUDIT_LOG`  | Every staff action.                                                                                      |
| Customization     | Shop & collectibles    | `OPERATOR`        | Shop packs and items. Every price is 0.                                                                  |
| Customization     | Sticker packs          | `OPERATOR`        | The sticker packs every account gets.                                                                    |
| Customization     | Profile badges         | `OPERATOR`        | Custom badges, which staff then give out from the user drawer.                                           |
| Customization     | Experiments            | `OPERATOR`        | Discord client experiments for some or all users, which take effect after a reload.                      |
| Customization     | Games                  | `OPERATOR`        | Games added to the built-in list people pick from.                                                       |
| Operations        | Performance            | `OPERATOR`        | This process's uptime, memory, event loop delay, database state, latency, errors and rate limiting.      |
| Operations        | Status page            | `OPERATOR`        | Components, incidents and maintenance on the public `/status` page.                                      |
| Operations        | System & compatibility | `OPERATOR`        | The bundled client and its patch check, link previews, voice and the Shop catalog.                       |

Command+K or Ctrl+K focuses the sidebar search, which filters the pages and finds people by username, display name, email, id, `@handle` or `name#1234`, servers by name or id, and IP addresses. Actions that delete, disable, ban, lift a ban, sign out or send to everyone ask first in a dialog that names the target and the count. Lifting a suspension and lifting address bans offer Undo for 10 seconds.

## Staff roles

A staff role is a named set of instance rights with a position, a color and a badge switch. An account's rights are its own `rights` plus the rights of every role it holds. A role can never carry `OPERATOR`. The first start seeds these roles, which operators can rename, edit, reorder or delete:

| Role            | Position | Rights                                                                                                    | Badge |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------- | ----- |
| Admin           | 4        | `MANAGE_USERS`, `MANAGE_GUILDS`, `MANAGE_MESSAGES`, `MANAGE_STAFF`, `VIEW_AUDIT_LOG` and everything below | yes   |
| Moderator       | 3        | `MODERATE_USERS`, `VIEW_MODERATION`, `VIEW_USERS`, `MANAGE_MESSAGES`                                      | yes   |
| Support         | 2        | `SUPPORT_USERS`, `VIEW_USERS`, `VIEW_MODERATION`, `RESEND_VERIFICATION_EMAIL`                             | yes   |
| Read-only audit | 1        | `VIEW_AUDIT_LOG`, `VIEW_MODERATION`                                                                       | no    |

| Right             | Allows                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `VIEW_USERS`      | Search and open accounts, and list addresses, badges, the shop catalog and instance invites.          |
| `MODERATE_USERS`  | Violations, suspensions, disabling, IP bans, report decisions, automod actions, join requests, raids. |
| `VIEW_MODERATION` | Read reports, violations, IP bans and the Automod page.                                                |
| `SUPPORT_USERS`   | Password reset links, turning off two-factor authentication, signing out sessions, marking an email verified. |
| `MANAGE_STAFF`    | Create, edit, reorder, delete and assign staff roles.                                                  |
| `VIEW_AUDIT_LOG`  | Read the audit log.                                                                                    |

`MANAGE_USERS` includes `VIEW_USERS`, `MODERATE_USERS`, `VIEW_MODERATION` and `SUPPORT_USERS`, and it alone covers profile edits, account deletion, automod settings and instance invites. `MODERATE_USERS` includes `VIEW_MODERATION`.

Staff can't act on an account at or above their own level, assign a role at or above it, move a role to it or above, or give a role a right they don't have. An account's level is its highest role position, and operators are above every role. An account with staff rights in its own `rights` and no role ranks above every role, so only operators can act on it. Reading an account is never limited by level.

The Staff roles page edits roles and their members, and the user drawer has a checkbox per role the viewer can assign. A role with the badge switch on shows a staff badge named after the instance and the role on its members' profiles, the highest such role only.

## Audit log

The server writes every successful staff action to the audit log: every write under `/api/v9/admin`, every request elsewhere that needed a staff right, staff role changes, and actions where a staff right got someone past missing server permissions. Each entry has the actor, the target, the action, the area and the request body with secrets removed. Refused requests aren't logged.

The Audit log page filters by staff member, target, area, action and time. Clicking a user or server opens its drawer, and the user drawer has Staff actions on this account for staff with `VIEW_AUDIT_LOG`.

## Overview

The Overview page shows accounts, servers, messages in 24 hours, people online and open reports, each with its change against the previous period, plus memberships, disabled accounts, open incidents and, when there are any, users and servers from other instances. Open reports need `VIEW_MODERATION`.

Activity charts cover new accounts, messages, active people, new servers, reports opened and closed, automod actions, federation and attachment uploads, over 24 hours, 7 days, 30 days or 90 days. Reports and automod charts need `VIEW_MODERATION`, and the federation and upload charts need `OPERATOR`. The federation chart counts the new users, servers and messages each instance introduced, because the server doesn't count requests per peer. Results are cached for 60 seconds.

## Users

The Users page has tabs for local accounts, accounts from other instances, IP addresses and IP bans. The list sorts by newest, oldest or username, filters to suspended accounts, accounts waiting for approval and accounts with a join reason, and pages 50 at a time. Typing an address lists the accounts that registered on it or have a session from it.

The user drawer edits the profile, cosmetics, badges, pride badges, profile widgets, client preferences, rights, standing, violations, suspension, sessions, two-factor authentication, staff roles and invites, and sends password reset links. Each field needs its own right: `disabled`, `suspended_until`, `account_standing` and `join_status` need `MODERATE_USERS`, `verified` needs `SUPPORT_USERS`, `rights` needs `OPERATOR` and the rest need `MANAGE_USERS`. The dashboard never shows password hashes, tokens, two-factor secrets, encryption keys or recovery codes.

### Removing spam accounts

Every row has a checkbox. Once the whole page is selected, a button selects every account that matches the search, up to the newest 5,000. The bar above the list then disables or deletes them, 100 per request with a progress bar. Disabling signs the accounts out and can also delete their messages, which needs `MANAGE_MESSAGES`. Deleting needs `MANAGE_USERS` and always removes their messages, DMs and memberships, and hands each owned server to the member with the highest role or deletes it when nobody is left. Your own account, accounts at or above your level and, unless you are an operator, operators are skipped. The bulk route takes up to 500 ids.

### Users and servers from other instances

When someone here joins a server on another instance or talks to someone there, this instance stores the people they meet as shadow users named `name@instance` and the servers they join as mirror servers. The Users and Servers pages list them in Other instances tabs, and the overview counts them apart from local ones. Their drawers are read-only. A shadow user can only be disabled here, suspended, signed out, have violations resolved or be deleted, and a mirror server can only be deleted. The API refuses other edits with HTTP 400 and the name of the home instance. Deleting a copy doesn't block anyone, because a shadow user comes back the next time they talk to someone here, so block them on the Federation page instead.

## IP addresses and bans

Accounts keep the address they registered from and the last address of each session. The user drawer lists them with how many accounts share each address and whether it is banned. The IP addresses tab lists addresses with the most accounts first, and opening one can remove all its accounts and ban the address.

The IP bans tab lists bans 50 per page, filtered by bans staff set and bans that spread from another ban. Checkboxes select bans across pages, and Lift bans lifts up to 100 with the bans they spread.

- Registration from a banned address gets 403 before the captcha. Sign-in checks the address after the password, so staff can still sign in from it.
- A token used from a banned address stops working, and its account gets a ban of its own. A banned account that signs in from a new address or browser bans that address or browser. Bans spread one step only, from bans that staff or automod made, and spread browser bans expire after 7 days. Lifting a ban lifts the bans it spread.
- A banned account never bans the addresses it uses. Address bans only come from staff or a raid action.
- Staff are never caught by address or browser bans, though a ban on a staff account itself applies.
- Private, loopback, shared and Cloudflare addresses, such as `127.0.0.1`, `10.0.0.0/8` and `100.64.0.0/10`, never match a ban and can't be banned, and neither can your own address. Users from other instances arrive through the federation relay on loopback, so address bans never catch them.

## Reports

The Reports page lists reports newest first, filtered by status or reported user. The server works out what a report points at from its own data, so a reporter can't attach a server, channel or message they made up, and a second report about the same thing updates the open one. Message reports save the 15 messages before and the 10 after the reported one as they were then, and in encrypted channels the reporter's client shares the keys of the ones it can read. Reports from other instances' automod show as "Automod on another instance", see [automod.md](automod.md#federation).

The report drawer shows how many open reports point at the same message or user and can close them all, the reported user's violations and report history, and how many of the reporter's past reports were upheld or dismissed.

## Servers

The server drawer edits artwork, description, locale, verification and content filter levels, notifications, premium tier, NSFW and AFK settings and feature flags. Manage channels and roles edits and creates categories, channels and roles within the instance limits.

## Shop and sticker packs

The Shop page manages custom packs and items and local names, summaries, order and artwork for mirrored packs, with Reset to restore the originals. Hiding a built-in category keeps equipped decorations working, and deleting a custom item removes it from every profile.

The Sticker packs page holds both packs imported from Discord, as described in [setup.md](../self-hosting/setup.md), and packs made on the instance:

- Packs sort by order number, lowest first. A new pack gets 0, so it comes after the imported packs until it gets a lower number.
- Add stickers takes PNG, APNG, GIF, WebP or Lottie JSON files of up to 4 MiB each. A sticker name is 2 to 30 characters.
- A pack holds up to 200 stickers and an instance up to 500 packs.
- Hiding a pack takes it out of the picker and keeps it on old messages. Deleting a pack also removes its stickers from the messages that used them, so hide a pack to retire it.
- Open clients pick up new and edited packs within an hour.
- While `externalRequests.discordStickerPacks` is on, an instance with no packs imports Discord's catalog again, so hide imported packs instead of deleting all of them.

## System

The Link previews card on the System page says whether `PUBLIC_FETCH_PROXY` names a SOCKS5 proxy that accepts a connection within 2 seconds, and whether `externalRequests.thirdParty` is on. Without a working proxy setting, link previews and component media fail, see [external-services.md](../self-hosting/external-services.md).

## Site settings

Site settings holds the instance configuration: registration, captcha, user, server, message and channel limits, default server features, client addresses and the external request policy. Feature pages describe their own settings:

- [signup.md](signup.md) for the captcha, email and registration switches,
- [invites.md](invites.md) for invite-only signup and member invites,
- [automod.md](automod.md) for blocked name words,
- [homepage.md](homepage.md) for the homepage, loading tips and the loading image,
- [external-services.md](../self-hosting/external-services.md) for GIF search and other outside requests.

The Client addresses card picks how the server finds a visitor's address, which rate limits, bans and the accounts per address caps use. Address header sets `security.forwardedFor`. Automatic, the default, reads `X-Forwarded-For` from trusted proxies and `CF-Connecting-IP` from Cloudflare's ranges, and the other choices are `X-Forwarded-For`, `CF-Connecting-IP`, `True-Client-IP`, `X-Real-IP` and `Fly-Client-IP`. The server only reads the header from a trusted proxy or Cloudflare. Trusted proxies sets `security.trustedProxies`, a comma separated list of addresses, CIDR ranges or `loopback`, `linklocal` and `uniquelocal`, which are what a blank field means. It takes effect after a restart.

Slowmode applies to everyone, server owners and moderators included, unless `limits.channel.allowSlowmodeBypass` is on.

Outside requests need `externalRequests.thirdParty`, and a provider key alone doesn't turn them on. Everything Site settings doesn't show is in the configuration file described in [setup.md](../self-hosting/setup.md).
