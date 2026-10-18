# Instance automod

Automod is a set of instance-wide rules that the server applies to messages, names, signups and sign-ins before it saves anything. Every action goes to the `automod_actions` table and shows on the Automod page of the admin dashboard at `/admin/#/automod`. Reading the page needs `VIEW_MODERATION`, acting on accounts needs `MODERATE_USERS` and changing settings needs `MANAGE_USERS`. Every setting on this page is under `automod` in the configuration unless the table says otherwise, and the Automod page has a form for most of them.

## Actions

Most rules take one of these actions:

- `log` writes the automod log and lets the message through.
- `delete` refuses the message with error code 200000 and, for spam rules, deletes the earlier messages that counted toward the rule.
- `timeout` also times the member out in that server for `spam.timeoutMinutes`. Server owners are never timed out in their own server. Spam in DMs mutes the account on the whole instance instead, and the mute survives a restart.
- `hold` also puts a local account back to waiting for approval and signs it out, so it shows in Join requests like a held signup.
- `suspend` also suspends the account. Login and the token check refuse it until the suspension ends, and then it can sign in again without anyone lifting anything.
- `disable` also disables the account.

## Slur auto-ban

When someone posts the hard-R n-word, the server refuses the message with error code 200000, or the name with a `NAME_NOT_ALLOWED` field error. With the default action `suspend` it also:

1. suspends the account for `slurs.suspendDays` and signs it out everywhere,
2. records a Hateful Conduct violation with the Temporary Ban and Message Removal actions, which the user sees on their Account Standing page for `slurs.violationDays`,
3. deletes every message the user ever sent when `slurs.deleteAllMessages` is on, and writes the count to the log entry,
4. writes a log entry with an excerpt where the word is masked.

The rule checks messages and edits in servers, DMs and group DMs, poll questions and answers, and thread, channel and server names. It skips webhook messages, interaction responses and system accounts. The matcher undoes look-alike letters from other scripts, leetspeak, repeated letters, invisible characters and up to four separators between letters, and it doesn't match Niger, Nigeria, snigger, niggard or similar words. Any other action refuses the message and takes that action instead, and only `suspend` records a violation and deletes old messages.

| Key                          | Default   | Meaning                                                                                                          |
| ---------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| `slurs.enabled`              | true      | The rule for messages and names. Names on the blocked name words list are refused even when it is off.           |
| `slurs.action`               | `suspend` | What a match does.                                                                                               |
| `slurs.includeSoftA`         | false     | Also act on the soft-A spelling, with the same action.                                                           |
| `slurs.suspendDays`          | 7         | Suspension length.                                                                                               |
| `slurs.deleteAllMessages`    | true      | Delete every message the user sent.                                                                              |
| `slurs.violationDays`        | 90        | How long the violation shows on Account Standing.                                                                |
| `slurs.actOnVerifiedReports` | true      | Act on reported encrypted messages whose signature verifies, see [Encrypted messages](#encrypted-messages). |

## Word lists and the allow list

`wordLists` holds extra lists, empty by default. Each list has a `name`, up to 500 `terms`, an `action` from the table above or `name`, and `suspendDays` for `suspend`. A list with `suspend` keeps the user's other messages. A list with `name` only refuses names, and every other list applies to names as well as messages.

A term matches as a whole word with the same folding and leetspeak as the slur rule, so `ass` matches "@$$" and "a s s" but not "class". A `*` at the start or end of a term allows longer words on that side, so `scam*` matches "scammer".

`allowList` holds up to 500 words automod never acts on, empty by default. Not a match in the log adds the matched text to it.

## Names

Usernames, display names, nicknames and server, channel and thread names go through the slur rule and the word lists, and the first three also through the blocked name words in `user.identityBlockedTerms`. This covers signups, renames, bots and admin edits. A refused name gets a `NAME_NOT_ALLOWED` field error and a log entry with action `block`, and never suspends anyone. Existing names aren't renamed.

The blocked name words default to a list of 9 slurs and hold up to 256 words of up to 64 letters or numbers. The default list doesn't block queer, trans, lesbian, gay or pride labels. Matching ignores case, invisible characters, common number substitutions and punctuation or spaces between letters, and leaves words like Scunthorpe, Pakistan and spice alone. Other spellings, look-alike letters and other languages need their own entries. Site settings and the Automod page both edit the list.

The Automod page can scan existing accounts for usernames and display names the rules would refuse, 10,000 accounts per click, and disable the ones you select, which also signs them out. Only operators can disable an operator there, and nobody can disable themselves.

## Join reasons and approval

| Key                             | Default | Meaning                                    |
| ------------------------------- | ------- | ------------------------------------------ |
| `register.joinReason.required`  | false   | Ask "Why do you want to join?" at signup.  |
| `register.joinReason.minLength` | 20      | Shortest answer.                           |
| `register.joinReason.maxLength` | 1000    | Longest answer.                            |
| `register.requireApproval`      | false   | Hold every new account for a moderator.    |

The FosscordJoinReason plugin adds the question to the signup form when a reason is required or approval is on. Automod checks the answer, and moderators see it in Join requests and the user drawer.

With approval on, registration creates the account as pending and answers with an `ACCOUNT_PENDING_APPROVAL` field error instead of a token, so the form tells the person a moderator has to approve the account first. Sign-in refuses pending and rejected accounts with a field error.

Join requests flag an answer as low effort when it has fewer than 4 words or 20 characters, repeats characters, looks like keyboard mashing, or matches the answers of 2 or more other signups from the last 7 days. Moderators approve or reject in bulk, and rejecting signs the accounts out.

## Sign-in and signup limits

These add to the route rate limits, which allow 2 successful registrations per IP every 12 hours and 5 login attempts per IP per minute by default. Registration tokens skip the signup limits. Every address cap counts an IPv6 address together with its whole /64 and a `::ffff:` address as its IPv4 address.

| Key                                         | Default | Meaning                                                                                                    |
| ------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `registration.maxAccountsPerIpPerDay`       | 0       | Accounts created from one IP in 24 hours, pending ones included. Refused with `TOO_MANY_REGISTRATIONS`. 0 is off. |
| `registration.maxAccountsPerIp`             | 0       | Accounts registered from one address that aren't deleted or disabled. 0 is off.                            |
| `login.maxFailedAttemptsPerAccount`         | 10      | Wrong passwords from one address before the account locks for that address. 0 is off.                      |
| `login.lockoutMinutes`                      | 15      | Lock length.                                                                                               |
| `login.maxAccountsPerIp`                    | 0       | Other accounts with a recently used session on one address. 0 is off.                                      |
| `login.sessionActiveDays`                   | 30      | How recently a session must have been used to count.                                                       |
| `ipAllowList`                               | `[]`    | Up to 500 addresses and CIDR ranges, such as `192.0.2.0/24`, that the address caps skip.                   |

The sign-in lock only locks the address that guessed. After 10 times the limit in wrong passwords from all addresses together, the account also locks for every address it has never signed in from or registered on. A locked sign-in gets `ACCOUNT_LOGIN_LOCKED`, and a successful one clears the count for that address.

The two address caps answer with a `TOO_MANY_ACCOUNTS_ON_IP` field error. The sign-in cap doesn't count the account's own sessions, and schools, offices and mobile carriers put many people behind one address. Staff never count toward the caps. The caps and the daily limit skip Cloudflare, private and allow-listed addresses. Refusals are logged with rule `ip_account_limit` or `ip_limit`, at most once every 10 minutes per address and account. The Automod page has a lookup that lists who counts toward both caps for one address.

## Spam rules

The spam rules check every message, content edit and new thread, and skip system accounts and accounts with `BYPASS_RATE_LIMITS`. Each rule is under `spam.<key>` with `enabled`, on by default, `action`, the thresholds below and `exemptAccountAgeDays`, shown as Age. Accounts older than that age skip the rule, and 0 checks everyone. For `burst` only accounts younger than it count.

| Rule logged as         | Key           | Trips when, with default thresholds                                                                                                                                         | Age | Action  |
| ---------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------- |
| `everyone_spam`        | `everyone`    | An account tries @everyone or @here `unpermittedLimit` 2 times without permission, or pings it `permittedLimit` 4 times with permission, within `windowSeconds` 600.         | 0   | timeout |
| `mention_spam`         | `mentions`    | One message mentions `messageLimit` 10 users or roles, or an account mentions `windowLimit` 20 within `windowSeconds` 60.                                                    | 0   | timeout |
| `flood`                | `flood`       | An account sends `messageLimit` 15 messages within `windowSeconds` 10, or posts in `channelLimit` 5 channels of one server within `channelWindowSeconds` 30.                 | 0   | timeout |
| `duplicate`            | `duplicates`  | The same text of `minLength` 30 or more characters from one account in `channelLimit` 3 channels, or from `accountLimit` 5 accounts, within `windowSeconds` 120.           | 0   | delete  |
| `link_spam`            | `links`       | An account posts `inviteLimit` 2 invites or `linkLimit` 4 other links within `windowSeconds` 300.                                                                           | 7   | delete  |
| `new_account_burst`    | `burst`       | `accountLimit` 4 new accounts post the same text of `minLength` 10 or more characters within `windowSeconds` 300.                                                          | 1   | suspend |
| `duplicate_attachment` | `attachments` | The same file from `accountLimit` 3 accounts, or from one account in `channelLimit` 3 channels, within `windowSeconds` 600. Files under `minBytes` 256 are skipped.        | 7   | delete  |
| `dm_spam`              | `dms`         | An account opens DMs with `openLimit` 10 non-friends, sends `friendRequestLimit` 10 friend requests, or sends the same DM text of `minLength` 8 or more characters into `sameContentLimit` 4 DM channels within `windowSeconds` 600. | 0 | timeout |

Shared spam settings:

| Key                         | Default                         | Meaning                                                                     |
| --------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `spam.ignoreLinkDomains`    | tenor.com, giphy.com, klipy.com | Link domains that don't count toward link spam or repeated content.         |
| `spam.timeoutMinutes`       | 60                              | Timeout and instance mute length.                                           |
| `spam.suspendHours`         | 24                              | Suspension length.                                                          |
| `spam.escalateAfterStrikes` | 3                               | Hits before each further hit steps the action up one level. 0 is off.       |
| `spam.strikeWindowHours`    | 24                              | How long a hit counts as a strike.                                          |
| `spam.dms.newAccountHours`  | 72                              | Accounts younger than this can only open `spam.dms.newAccountDmsPerHour` new DMs an hour. |
| `spam.dms.newAccountDmsPerHour` | 5                           | The next DM gets error 40003, "Opening direct messages too fast", with HTTP 429. |

Escalation stops at `suspend`, and both `timeout` and `hold` step up to `suspend`. When the account is from another instance, `suspend` and `disable` also block it on the Federation page, so its instance can't relay it here. Undo in the log lifts timeouts, mutes, suspensions, disables and these blocks.

The rules leave these cases alone:

- Members who can manage the server don't count toward permitted @everyone pings, mention spam or the flood rule's channel limit, and can post one announcement in several channels.
- @everyone in a DM or an email address and mentions inside code don't count. Links to this instance don't count, and invites always do.
- Plain text with no link or mention only counts as repeated content or a burst when it shows up in 2 or more channels, or when the accounts posted it more times than there are accounts, so new members each typing a verification phrase once pass.
- The same DM text rule skips DMs to friends and encrypted DMs. An encrypted message only counts toward the flood rule and the file rules.
- Accounts from other instances are aged by their creation on their home instance.

"The same text" ignores case, mentions, numbers, punctuation and spacing, and reduces links to their host, except in a message that is only links. Files are compared by SHA-256.

## Scam and phishing links

The scam check reads every link in a message, including bare ones like `discord-gift.ru/x`, on message create, edit and new threads. A hit refuses the message with error 200000, is logged with rule `scam_link` and gets `scam.action`. Bots are skipped.

It catches, by kind:

- `lookalike`: a domain that uses a brand such as Discord, Steam, Epic Games, Roblox or a crypto wallet without being the real one, like `discrod.com`, `discord-gift.ru` or `discord.com.login-verify.ru`.
- `homoglyph`: a brand spelled with look-alike letters, in Unicode or punycode.
- `gift_bait`: text offering free Nitro, skins or gifts next to a link to another site.
- `qr_login`: a link to the QR code login page at `/ra/` with text asking people to scan a code.
- `ip_logger`: Grabify, iplogger.org and similar sites.
- `shortener`: bit.ly, tinyurl.com and other shorteners from young accounts.
- `listed`: a domain in `scam.extraDomains` or in the remote list.

Links to the real sites, to this instance and to fan sites like discord.js.org and steamdb.info pass.

| Key                             | Default  | Meaning                                                                    |
| ------------------------------- | -------- | -------------------------------------------------------------------------- |
| `scam.enabled`                  | true     | The scam check.                                                            |
| `scam.action`                   | `delete` | What a hit does.                                                           |
| `scam.lookalikes`, `giftBait`, `qrLogin`, `ipLoggers` | true | Each kind of check. `lookalikes` covers homoglyphs too.          |
| `scam.shortenerAccountAgeDays`  | 7        | Refuse shorteners from accounts younger than this. 0 is off.               |
| `scam.extraDomains`             | `[]`     | Domains to always refuse.                                                  |
| `scam.allowDomains`             | `[]`     | Domains to always let through.                                             |
| `scam.remoteListUrl`            | `""`     | A domain list to fetch. Empty is off.                                      |
| `scam.remoteListRefreshMinutes` | 360      | How often to fetch it, at least 15.                                        |

The remote list is fetched on that schedule, never per message, up to 8 MB. It can be one domain per line, a hosts file, a JSON array or a JSON object with a `domains` array. The Automod page shows its status and can fetch it right away.

A separate older check refuses a built-in list of Discord and Steam typo domains plus `guild.safety.harmfulLinkDomains`, empty by default, with error 200000 and no log entry.

## Signup scoring

Every signup gets a score before the captcha is used up. Registration tokens skip it.

| Signal             | Weight key              | Points | When                                                                                                         |
| ------------------ | ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| `disposable_email` | `disposableEmailWeight` | 40     | The email domain is on the bundled list of about 150 disposable mail services and not on `allowedEmailDomains`. |
| `similar_names`    | `similarNameWeight`     | 30     | `similarNameLimit` 3 or more signups in the window share a username stem or its first 6 letters.             |
| `same_password`    | `samePasswordWeight`    | 30     | `samePasswordLimit` 2 or more signups in the window used the same password.                                   |
| `fast_captcha`     | `fastCaptchaWeight`     | 25     | The captcha was solved in under `fastCaptchaMs` 1500 ms.                                                      |

| Key                          | Default | Meaning                                                                                  |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `signup.enabled`             | true    | Signup scoring.                                                                          |
| `signup.windowMinutes`       | 30      | How far back similar names and passwords count.                                          |
| `signup.logScore`            | 20      | Log the signup with rule `signup_bot`. 0 is off.                                         |
| `signup.holdScore`           | 60      | Create the account as pending, the same as manual approval. 0 is off.                    |
| `signup.refuseScore`         | 0       | Refuse with a `SIGNUP_REFUSED` field error. 0 is off.                                    |
| `signup.deniedEmailDomains`  | `[]`    | Domains always refused with `EMAIL_DOMAIN_NOT_ALLOWED`.                                  |
| `signup.allowedEmailDomains` | `[]`    | Domains that never count as disposable.                                                  |

The server compares passwords as a short keyed hash that lives only in memory with the last 5,000 signups, so it stores nothing about passwords and a restart clears it.

## New account quarantine

While the quarantine is on, accounts younger than `quarantine.hours` can't post links other than to this instance, upload files, send embeds or use @everyone or @here, can mention at most `maxMentions` people in one message and can start at most `maxDms` new DMs. The check runs on messages, edits, new threads, new DMs and messages relayed to other instances.

| Key                           | Default | Meaning                              |
| ----------------------------- | ------- | ------------------------------------ |
| `quarantine.enabled`          | false   | The quarantine.                      |
| `quarantine.hours`            | 24      | How long it lasts.                   |
| `quarantine.allowLinks`, `allowAttachments`, `allowEmbeds` | false | Let quarantined accounts post links, upload files or send embeds. |
| `quarantine.maxMentions`      | 2       | Mentions per message.                |
| `quarantine.maxDms`           | 3       | New DMs during the quarantine.       |

A refused message gets HTTP 400 with code 200000, `restriction: "NEW_ACCOUNT_RESTRICTED"`, a `reason` and `ends_at`. The DM limit answers with HTTP 429 and code 40003. Refusals are logged with rule `quarantine` once every 10 minutes per account and reason. Bots, system accounts, accounts from other instances and accounts with `BYPASS_RATE_LIMITS` are never quarantined. The Automod page lists the accounts in quarantine and clears them early, and Undo on a quarantine log entry clears the account too.

## Server verification levels and the explicit media filter

The server applies each server's own verification level to messages, threads and reactions:

| Level | Needs                                                                       |
| ----- | --------------------------------------------------------------------------- |
| 1     | A verified email.                                                           |
| 2     | Level 1 and an account older than 5 minutes.                                |
| 3     | Level 2 and membership longer than 10 minutes.                              |
| 4     | Level 3 and a phone number, when `verification.requirePhoneForHighest` is on. |

The owner, bots, members with any role and members with the bypass verification flag skip it. A refusal gets HTTP 403 with code 50009, a message that says what is missing, `restriction: "GUILD_VERIFICATION_LEVEL"` and `reason`, and is logged with rule `verification_level` once an hour per server, account and reason.

The explicit media filter applies each server's explicit content filter, to members without roles at 1 and to everyone at 2, outside NSFW channels. There is no image classifier. The filter marks a file when its name, title or description has a word from `explicitContent.terms`, when its SHA-256 is in `explicitContent.blockedHashes`, or for every image and video when `flagAllMedia` is on. A marked file gets the `CONTAINS_EXPLICIT_MEDIA` flag and the client blurs it, and the message is still delivered. Name and hash matches are logged with rule `explicit_content` and action `flag`.

| Key                                   | Default | Meaning                                                                 |
| ------------------------------------- | ------- | ----------------------------------------------------------------------- |
| `verification.enforce`                | true    | Apply server verification levels.                                       |
| `verification.requirePhoneForHighest` | false   | Ask for a phone number at level 4. The instance has no SMS provider, so level 4 works like level 3 while this is off. |
| `explicitContent.enabled`             | true    | The explicit media filter.                                              |
| `explicitContent.flagAllMedia`        | false   | Mark every image and video where the filter applies.                    |
| `explicitContent.terms`               | 11 words | Up to 500 file name words that mark a file.                            |
| `explicitContent.blockedHashes`       | `[]`    | Up to 5,000 SHA-256 hashes that mark a file.                            |

## Federation

Every message rule covers accounts from other instances, and the action applies to their copy here. When one of them trips a rule that refuses or acts, this server sends a signed report to their home instance with the rule, the action, the masked excerpt and the server name, at most once an hour per account and rule. The home instance files it in Reports as "Automod on another instance", and a repeat about the same account and rule within 24 hours returns the open report.

| Key                                    | Default | Meaning                                               |
| -------------------------------------- | ------- | ----------------------------------------------------- |
| `federation.reportToHome`              | true    | Report hits on remote accounts to their home instance. |
| `federation.acceptReports`             | true    | Accept those reports about local accounts.            |
| `federation.reportsPerHourPerInstance` | 120     | Reports accepted from one instance per hour.          |

## Raid detection

The server watches each server for 3 kinds of raid. Every raid posts Discord's raid alert to the server's safety alerts channel, at most once an hour per kind, and writes the automod log.

- A join raid is `raidJoinThreshold` joins within `raidJoinWindowSeconds`, `raidNewAccountJoinThreshold` joins from accounts younger than `raidNewAccountHours`, or `raidInviteJoinThreshold` joins through one invite. The thresholds grow with the server: the server multiplies them by the largest of 1, 0.5% of its members divided by `raidJoinThreshold`, and 3 times its usual joins per window divided by `raidJoinThreshold`. A server of 20,000 members needs about 100 joins in 120 seconds. A join raid pauses invites for `raidPauseInvitesMinutes`, and while invites are paused, joins through invites and signups with them are refused.
- A DM raid is `dmRaidThreshold` members starting DMs with other members within `dmRaidWindowSeconds`. Moderators don't count. It pauses new DMs between members for `dmRaidPauseDmsMinutes`.
- A mention raid is `mentionRaidThreshold` accounts tripping mention or @everyone spam in one server within `mentionRaidWindowSeconds`.

| Raid    | Keys under `guild.safety` and defaults                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Join    | `raidJoinThreshold` 15, 0 is off. `raidJoinWindowSeconds` 120, `raidNewAccountJoinThreshold` 8, `raidNewAccountHours` 24, `raidInviteJoinThreshold` 10, `raidPauseInvitesMinutes` 60, 0 only alerts. |
| DM      | `dmRaidThreshold` 10, `dmRaidWindowSeconds` 300, `dmRaidPauseDmsMinutes` 60, 0 only alerts.                                                           |
| Mention | `mentionRaidThreshold` 3, `mentionRaidWindowSeconds` 300.                                                                                              |

Discord's Pause invites, Disable DMs, clear and Report false alarm buttons work. Spam hits and raids are grouped into incidents, one per server and kind, that stay live until 10 minutes pass without a new event or someone ends them. Raids in progress survive a restart.

## Rule switches, dry runs and exemptions

`policies` holds one entry for each of 20 rules: `everyoneSpam`, `mentionSpam`, `flood`, `duplicate`, `linkSpam`, `newAccountBurst`, `duplicateAttachment`, `dmSpam`, `scamLink`, `slurs`, `wordLists`, `quarantine`, `verificationLevel`, `ipAccountLimit`, `ipLimit`, `signupBot`, `explicitContent`, `joinRaid`, `mentionRaid` and `dmRaid`.

| Field                  | Default                                                       | Meaning                                                                                              |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `enabled`              | true                                                          | The switch for word lists, the address caps, the daily signup limit and the 3 raid rules. The other rules use their own `enabled`. |
| `dryRun`               | false                                                         | Log what the rule would do and act on nobody.                                                        |
| `exemptStaff`          | true for the spam rules, quarantine, `ipAccountLimit` and the raid rules | Skip operators and accounts with a staff role.                                            |
| `exemptBots`           | true for the spam rules, `scamLink`, quarantine and `verificationLevel` | Skip bots.                                                                                 |
| `exemptVerifiedEmail`  | false                                                         | Skip accounts with a verified email. Remote accounts never count as verified.                        |
| `exemptAccountAgeDays` | 0                                                             | Skip accounts older than this. The spam rules use their own age setting instead.                     |
| `exemptUserIds`        | `[]`                                                          | Up to 500 user IDs to skip.                                                                          |
| `exemptGuildIds`       | `[]`                                                          | Up to 500 server IDs to skip.                                                                        |

In a dry run the message goes through and nothing is deleted or counted as a strike. Raid rules log one `raid_alert` an hour per server instead of pausing anything, and signup scoring logs the hold or refusal it would have made and lets the account in.

## Appeals

An account that can't sign in because it is suspended, held or disabled gets a sign-in error that points to `<instance>/appeal`. That page asks for the email or username and password, with the second factor when the account has one, and shows the restriction, the reason and when it ends. The person can then send one appeal of up to 1,000 characters per restriction. A later restriction can be appealed again, and a retry with the same message returns the first appeal. Wrong passwords there count toward the sign-in lock. Accounts from other instances can't use it, because their password lives on their home instance.

Appeals show in the Appeals section of the Automod page. Accepting one lifts the restriction, approves a held account or re-enables a disabled one, marks the automod action as a false positive and overturns its violation. Denying keeps the restriction. The person sees the decision the next time they open the page.

## Server AutoMod rules

The server enforces Discord's AutoMod rules on message create and edit: keyword, keyword preset, spam, mention spam and member profile rules. A match blocks the message with the rule's custom message, posts the alert to the rule's alert channel and times the member out when the rule says so.

## Encrypted messages

Automod only sees plaintext, so the message rules skip encrypted DMs. When someone reports an encrypted message with its key, the server decrypts it and checks the sender's signature as [e2ee.md](e2ee.md) describes. When the signature verifies, `slurs.actOnVerifiedReports` is on and the text has the slur, the server deletes the message and applies the slur action. Word lists don't act on reports, and an unverified copy never triggers anything.

## Automod page

Besides the settings forms, the page has counts by rule, the log, a review queue of the last 24 hours, appeals, join requests, the quarantine list, rule stats with false positive rates, raid incidents, the address lookup, the name scan and a test box that runs text, an email, a username and an address through every rule without acting on anyone.

- Confirm keeps an action, and confirming a held signup rejects the account. Undo reverses it, lifts the suspension the entry set and invalidates the violation, and undoing a held signup approves it. False positive does the same as Undo and counts it as a false positive. Not a match also adds the text to the allow list. Deleted messages stay deleted.
- A raid incident can delete its accounts' messages, which also needs `MANAGE_MESSAGES`, suspend or disable them, or ban their IP addresses. These skip your own account and, unless you are an operator, operators.

The routes behind the page are under `/api/v9/admin/automod`, and saving a list setting replaces the whole list. The user drawer shows the join reason with approve and reject buttons and a Lift suspension button.

## Testing

`scripts/tests/instance-automod.test.cjs`, `identity-moderation.test.cjs`, `spam-detection.test.cjs`, `automod-rules.test.cjs`, `automod-policies.test.cjs` and `automod-appeals.test.cjs` cover the rules. Two probes run against a server on a database you created for them, refuse any other database and restore the settings they change:

```sh
PORT=3800 AUTOMOD_PROBE_DATABASE=<db> bun scripts/dev/automod-probe.mjs
PORT=3300 RAID_PROBE_DATABASE=<db> bun scripts/dev/raid-probe.mjs
```
