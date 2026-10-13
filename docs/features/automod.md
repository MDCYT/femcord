# Instance automod

Automod is a set of instance-wide rules that the server applies to messages, names and signups. It runs before anything is saved, logs every action to the `automod_actions` table and shows that log on the Automod page of the admin dashboard at `/admin/#/automod`. The page needs the `MANAGE_USERS` right, the same as Reports.

## Slur auto-ban

When a user posts the hard-R n-word, the server does the following:

1. It refuses the message or name with error code `200000` for messages and a `NAME_NOT_ALLOWED` field error for names.
2. It sets `users.suspended_until` to now plus `automod.slurs.suspendDays` (7 by default), deletes the user's sessions and emits `SB_SESSION_REMOVE`, so open clients sign out. Login and the token check refuse the account until that time passes, then it can sign in again without anyone lifting anything.
3. It records a Hateful Conduct violation issued by the official account, with the Temporary Ban and Message Removal actions. The user sees it on their Account Standing page, and it stays there for `automod.slurs.violationDays` (90 by default).
4. When `automod.slurs.deleteAllMessages` is on, which is the default, it deletes every message the user ever sent, in batches of 500, and emits `MESSAGE_DELETE_BULK` for each channel. The count is written to the log entry when it finishes.
5. It writes a log entry with the rule, where it happened and an excerpt with the matched word masked.

The rule checks new messages and edits in servers, DMs and group DMs, poll questions and answers, and thread, channel and server names on create and rename. Webhook messages, interaction responses and system accounts are skipped.

The matcher is in `src/util/util/SlurMatcher.ts`. It builds the term from a pattern of letter classes, not a stored string. Before matching it applies NFKC, lowercases, strips combining marks, zero-width and other format characters and Hangul fillers, maps Cyrillic, Greek and other look-alike letters and regional indicator emoji to Latin letters, and shortens runs of three or more of the same character to two. The pattern then accepts leetspeak (`1`, `!`, `|`, `3`, `@`, `6`, `9`, `q`), repeated letters and up to four separators between letters. It does not match Niger, Nigeria, Nigerian, Nigerien, snigger, niggard or niggardly. The soft-A spelling only counts when `automod.slurs.includeSoftA` is on, and it then gets the same action. A 20,000 character adversarial input takes under 500 ms in the tests.

Turning `automod.slurs.enabled` off disables the rule for messages and names. Usernames that match the blocked name words are still refused.

## Word lists

`automod.wordLists` holds extra lists. Each list has a `name`, `terms` (up to 500), an `action` and `suspendDays`:

| Action    | What happens                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `delete`  | The message is refused and logged. The account is untouched.                                                                          |
| `suspend` | The message is refused, the account is suspended for `suspendDays` and a violation is recorded. The user's other messages are kept. |
| `name`    | Only usernames, display names, nicknames and server, channel and thread names are refused. Messages pass.                           |

Every list also applies to names. A term matches as a whole word with the same folding and leetspeak as the slur rule, so `ass` matches "@$$" and "a s s" but not "class". A `*` at the start or end of a term allows longer words on that side, so `scam*` matches "scammer".

`automod.allowList` holds words automod never acts on. The matcher removes them from the folded text before it looks for anything else. "Not a match" in the log adds the matched text to this list.

## Names

Registration, username, display name and server nickname changes check the slur rule and the word lists first, then the blocked name words in `user.identityBlockedTerms` that [identity-moderation.md](identity-moderation.md) describes. A refused name returns a `NAME_NOT_ALLOWED` field error on the field that was edited, and the attempt is logged with action `block`. Names never suspend anyone, because a person who types a name gets the error before anything is saved.

The Automod page can scan existing accounts for usernames and display names the rules would refuse, 10,000 accounts per click, and disable the ones you select. Disabling also signs them out everywhere. Operators can't be disabled by someone without the operator right, and nobody can disable themselves there.

## Join reasons and approval

`register.joinReason.required` adds a required "Why do you want to join?" answer to signup. `register.joinReason.minLength` (20 by default) and `register.joinReason.maxLength` (1000) bound it. The FosscordJoinReason plugin adds the textarea to the stock signup form when the server sends `GLOBAL_ENV.REGISTER_JOIN_REASON`, which it does when the reason is required or approval is on. The answer is stored in `users.join_reason`, checked against automod, and shown in Join requests on the Automod page and in the admin user drawer.

`register.requireApproval` holds every new account for a moderator. Registration creates the account with `join_status = "pending"` and answers with an `ACCOUNT_PENDING_APPROVAL` field error instead of a token, so the stock client stays on the form and the plugin shows "Your account was created. A moderator needs to approve it before you can log in, so try logging in later." Login and the token check refuse pending and rejected accounts with a field error under the email and password inputs. This approach was picked over a limited session because the stock client already shows login field errors, while a limited session would need every route and the gateway to be restricted.

Join requests flag answers that look low effort:

- **Too short**: fewer than 4 words or 20 characters.
- **Repeated characters**: a run of four of the same character, a short chunk repeated, one character over 40% of the text, or fewer than half the words being unique.
- **Keyboard mash**: a run of five keys along a keyboard row, a word over 24 characters, or mostly Latin letters with under 20% vowels.
- **Same as other signups**: the same normalized answer from two or more other accounts in the last 7 days.

Moderators can approve or reject in bulk. Rejecting signs the accounts out. The admin users list has filters for suspended accounts, accounts waiting for approval and accounts that gave a reason.

## Sign-in and signup limits

These sit on top of the route rate limits, which allow 2 successful registrations per IP every 12 hours and 5 login attempts per IP per minute by default.

- `automod.registration.maxAccountsPerIpPerDay` counts every account created from one IP over 24 hours, including pending ones, which the route limiter misses because they answer with an error. It is off at 0. A blocked signup returns `TOO_MANY_REGISTRATIONS` and is logged with rule `ip_limit`. Signups with a registration token skip it.
- `automod.login.maxFailedAttemptsPerAccount` (10) and `automod.login.lockoutMinutes` (15) lock one account after that many wrong passwords from any IP. The lock returns `ACCOUNT_LOGIN_LOCKED` before the password is compared, and a successful sign-in clears the count. Set the attempts to 0 to turn it off.

## Spam rules

`src/util/util/SpamDetector.ts` checks every message create, every content edit and every new thread across the instance, before the server's own AutoMod rules run. It counts in memory with sliding windows, so a message costs no database query. `src/api/util/utility/spamGuard.ts` enforces what it finds. Accounts from other instances post through the same routes, so the rules cover them too. System accounts and accounts with the `BYPASS_RATE_LIMITS` right are skipped.

| Rule                                 | Trips when                                                                                                                                  | Default action |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `everyone_spam`                      | An account tries @everyone or @here twice without the permission, or pings it 4 times with the permission, within 10 minutes.              | timeout        |
| `mention_spam`                       | One message mentions 10 users or roles, or an account mentions 20 within 60 seconds.                                                        | timeout        |
| `flood`                              | An account sends 15 messages within 10 seconds, or posts in 5 channels within 30 seconds.                                                   | timeout        |
| `duplicate`                          | One account posts the same text of 30 or more characters in 3 channels, or 5 accounts post it, within 2 minutes.                           | delete         |
| `link_spam`                          | An account younger than 7 days posts 2 invites or 4 other links within 5 minutes.                                                          | delete         |
| `new_account_burst`                  | 4 accounts younger than 1 day post the same text of 10 or more characters within 5 minutes.                                                | suspend        |

Members who can manage the server never count toward permitted @everyone pings or mention spam, and @everyone in a DM is ignored. Edits count only toward the @everyone and mention rules. "The same text" is compared after NFKC folding, lowercasing, removing invisible characters, mentions, numbers and punctuation, reducing links to their host, joining spaced out letters and collapsing repeated letters. Two texts with the same set of 3 or more words of 3 or more letters also match.

Each rule has `enabled`, `action`, its thresholds, its windows and `exemptAccountAgeDays`. Accounts older than that age skip the rule, and 0 checks everyone. For `new_account_burst` the age works the other way: only accounts younger than it count.

The actions, from weakest to strongest:

- `log` writes the automod log and lets the message through.
- `delete` refuses the message with error 200000 and deletes the earlier messages that counted toward the rule with one `MESSAGE_DELETE_BULK` per channel.
- `timeout` also sets the member's `communication_disabled_until` in that server for `automod.spam.timeoutMinutes` (60). Server owners are skipped. Spam in DMs mutes the account on the whole instance instead, stored in `rate_limits` as `spam-mute:<id>` so a restart keeps it.
- `suspend` also sets `suspended_until` for `automod.spam.suspendHours` (24).
- `disable` also disables the account.

Every hit records a strike in `rate_limits` as `spam-strikes:<id>`. After `escalateAfterStrikes` (3) strikes within `strikeWindowHours` (24), each further hit moves the action one step up, stopping at suspend. When the account is from another instance, suspend and disable also add a user `FederationBlock`, the same block as the Federation admin page, so that instance can no longer relay it here. Undo in the log lifts timeouts, instance mutes, suspensions, disables and these federation blocks.

## Raid detection

`src/api/util/utility/safety.ts` watches each server.

- A join raid is 15 joins within 120 seconds, 8 joins from accounts younger than 24 hours, or 10 joins through one invite. It sets `raid_detected_at`, pauses invites for 60 minutes through `invites_disabled_until` unless invites are already paused for longer, and adds later joiners to the same incident.
- A DM raid is 10 members starting DMs with other members within 300 seconds. It sets `dm_spam_detected_at` and `dms_disabled_until` for 60 minutes.
- A mention raid is 3 accounts tripping `mention_spam` or `everyone_spam` in one server within 300 seconds. It sends `AUTO_MODERATION_MENTION_RAID_DETECTION`, and Discord's "clear" button ends it.

Every raid posts Discord's raid alert to the safety alerts channel when the server has one, at most once an hour per kind, and writes the automod log. Discord's "Pause invites" and "Disable DMs" buttons call `PUT /guilds/:id/incident-actions`, which sets or clears the same fields. Joins through an invite and through registration with an invite are refused while invites are paused, and new DMs between members are refused while DMs are paused. "Report false alarm" clears the alert and ends the incident.

Spam hits and raids are grouped into incidents in the `raid_incidents` table, one per server and kind. An incident is live until 10 minutes pass without a new event, or until someone ends it. Raids in progress and mention raids are reloaded from that table after a restart.

## Server AutoMod rules

`src/api/util/utility/automod.ts` enforces Discord's AutoMod rules on message create and edit: keyword, keyword preset, spam, mention spam and member profile rules. A match blocks the message with the rule's custom message, posts the `auto_moderation_message` alert to the alert channel and times the member out when the rule says so. The spam rule reads the same in-memory counters as the instance spam rules.

## Encrypted messages

Automod only sees plaintext. Encrypted DM messages carry ciphertext, and the `content` the server stores for them is a fallback the server writes itself, so the message rule skips them. Nothing in automod changes the encryption protocol.

When someone reports an encrypted message and the report carries that message's key, the server decrypts it and checks the sender's signature as [e2ee.md](e2ee.md#reporting-encrypted-messages) describes. If the signature verifies, `automod.slurs.actOnVerifiedReports` is on and the text has the slur, the server deletes the reported message and applies the slur action with source `report`. Word lists don't act on reports. An unverified copy never triggers anything.

## Admin page

The Automod page has these sections:

- Counts of actions in the last 24 hours and 7 days by rule, accounts waiting for approval, accounts suspended right now and live incidents.
- Raids, which refreshes every 15 seconds. It lists live incidents, the incidents of the last 7 days 10 per page and the 25 accounts caught most often by spam and raid rules this week. Opening an incident shows every account in it. Delete messages, Suspend, Disable and Ban IP addresses act on the selected accounts, or on all of them when none are selected, after a confirmation that names the count. Each run is written to the automod log with source `admin` and to the incident's history.
- Spam rules and Raid detection forms with every setting from the sections above.
- The log, newest first, 25 per page, filtered by rule, action, reversed state and user ID or username. Each row shows the time, the user, the rule or word list, where it happened, the action with the suspension end and wiped message count, and the masked excerpt. Rows have Open user, Undo and Not a match. Undo lifts the suspension if it is still the one this entry set, marks the violation as invalidated and marks the entry reversed. Not a match does the same and adds the matched text to the allow list. Deleted messages stay deleted.
- Join requests with status tabs, low-effort badges and bulk approve and reject.
- A test box that runs text through the saved rules and says which rule would stop it as a message and as a name, without acting on anyone.
- Separate forms for the slur rule, word lists, the allow list, blocked name words, signups and sign-in protection. Each one saves only its own section through `PATCH /api/v9/admin/automod/settings`.
- The name scan with bulk disable.

The admin user drawer shows the join reason with approve and reject buttons for pending accounts, and a Lift suspension button while a suspension is active. `PATCH /admin/users/:id` accepts `suspended_until` (a date, or `null` to lift) and `join_status`.

## API

All routes are under `/api/v9/admin/automod` and need `MANAGE_USERS`.

| Route                                      | Use                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `GET /`                                    | Settings, counts, pending and suspended account totals.                                   |
| `PATCH /settings`                          | Save one or more of `slurs`, `wordLists`, `allowList`, `identityBlockedTerms`, `registration`, `login`. |
| `POST /test`                               | `{ text }`, returns the message and name match.                                           |
| `GET /actions`                             | The log. Query `rule`, `action`, `user_id`, `reversed=yes or no`, `limit`, `offset`.      |
| `POST /actions/:id/reverse`                | `{ reversal: "undo" or "not_a_match" }`.                                                  |
| `GET /join-requests`, `POST /join-requests` | List by `status` (`pending`, `approved`, `rejected`, `low_effort`, `all`), and approve or reject `user_ids`. |
| `GET /names`, `POST /names/disable`        | Scan names after an id, and disable `user_ids`.                                           |
| `GET /raids`                               | Live incidents, recent incidents (`limit`, `offset`, `days`) and top offenders.           |
| `GET /raids/:id`                           | One incident with every account and how often automod acted on each.                     |
| `POST /raids/:id/action`                   | `{ action, user_ids?, reason? }` with `delete_messages`, `suspend`, `disable` or `ban_ip`. |
| `POST /raids/:id/end`                      | End the incident.                                                                         |

`PATCH /settings` also takes `spam` and `raids`. `delete_messages` needs `MANAGE_MESSAGES` as well. The bulk actions skip your own account and, unless you are an operator, operators. `ban_ip` bans the registration and session IP addresses of local accounts through `InstanceBan`, skips your own address and addresses already banned, signs the accounts out, and blocks accounts from other instances from federating.

## Config keys

| Key                                         | Default | Meaning                                                    |
| ------------------------------------------- | ------- | ---------------------------------------------------------- |
| `automod.slurs.enabled`                     | true    | The slur rule.                                             |
| `automod.slurs.includeSoftA`                | false   | Also act on the soft-A spelling.                           |
| `automod.slurs.suspendDays`                 | 7       | Suspension length.                                         |
| `automod.slurs.deleteAllMessages`           | true    | Wipe the user's messages.                                  |
| `automod.slurs.violationDays`               | 90      | How long the violation shows on Account Standing.          |
| `automod.slurs.actOnVerifiedReports`        | true    | Act on signature-verified encrypted reports.               |
| `automod.wordLists`                         | `[]`    | Extra lists with their own action.                         |
| `automod.allowList`                         | `[]`    | Words automod never acts on.                               |
| `automod.registration.maxAccountsPerIpPerDay` | 0     | Accounts per IP per day, 0 is off.                         |
| `automod.login.maxFailedAttemptsPerAccount` | 10      | Wrong passwords before an account locks, 0 is off.         |
| `automod.login.lockoutMinutes`              | 15      | Lock length.                                               |
| `register.joinReason.required`              | false   | Ask why the person wants to join.                          |
| `register.joinReason.minLength`             | 20      | Shortest answer.                                           |
| `register.joinReason.maxLength`             | 1000    | Longest answer.                                            |
| `register.requireApproval`                  | false   | Hold new accounts for a moderator.                         |
| `automod.spam.<rule>`                       | on      | `everyone`, `mentions`, `flood`, `duplicates`, `links` and `burst`, with the thresholds and actions in Spam rules. |
| `automod.spam.timeoutMinutes`               | 60      | Timeout and instance mute length.                          |
| `automod.spam.suspendHours`                 | 24      | Suspension length.                                         |
| `automod.spam.escalateAfterStrikes`         | 3       | Strikes before the action steps up, 0 is off.              |
| `automod.spam.strikeWindowHours`            | 24      | How long a strike counts.                                  |
| `guild.safety.raidJoinThreshold`            | 15      | Joins in `raidJoinWindowSeconds` (120), 0 is off.          |
| `guild.safety.raidNewAccountJoinThreshold`  | 8       | Joins from accounts younger than `raidNewAccountHours` (24). |
| `guild.safety.raidInviteJoinThreshold`      | 10      | Joins through one invite.                                  |
| `guild.safety.raidPauseInvitesMinutes`      | 60      | Invite pause after a join raid, 0 only alerts.             |
| `guild.safety.dmRaidThreshold`              | 10      | Members starting DMs in `dmRaidWindowSeconds` (300).       |
| `guild.safety.dmRaidPauseDmsMinutes`        | 60      | DM pause after a DM raid, 0 only alerts.                   |
| `guild.safety.mentionRaidThreshold`         | 3       | Mention spammers in `mentionRaidWindowSeconds` (300).      |

The database stores `automod.wordLists` and `automod.allowList` as whole lists, so removing an entry removes it.

## Testing

`bun test scripts/tests/instance-automod.test.cjs` covers the matcher with true and false positives, the soft-A switch, adversarial input timing, word lists and stars, the allow list, excerpt masking, join reason signals, config defaults, the migrations and the admin tab registration. `scripts/tests/identity-moderation.test.cjs` covers names and the hook that logs blocked names.

`bun test scripts/tests/spam-detection.test.cjs` covers each spam rule at its threshold edges, account age exemptions, moderators with the @everyone permission, accounts from other instances, escalation, enforcement, the raid checks, incident grouping and the migrations.

`PORT=3300 RAID_PROBE_DATABASE=<db> bun scripts/dev/raid-probe.mjs` runs against a server on a database you created and refuses any other. It registers an admin and 9 raiders, then checks a join raid through one invite, Discord's pause and resume invite buttons, the disable DMs button, a mention raid and its clear button, an @everyone wave, a flood across 5 channels, a server keyword rule, and the admin raid routes including an IP ban. It restores the spam and raid settings when it ends.
