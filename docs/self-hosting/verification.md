# Getting verified

An approved instance federates with every other approved instance, and its admins can verify their servers for global discovery. The registry admins review instances by hand, and each instance's admins answer for the servers they verify. [registry.md](registry.md) covers the registry side.

## Requirements

- The instance runs a recent Meowcord version with federation on, over HTTPS. Registration captchas and pride flags stay on, and nothing is behind a paywall.
- The instance is actively moderated, and the project's moderators can reach you. Put your Discord username in your pull request.
- The instance has a public Terms of Service that bans:
  - sexual content of any kind, including pornography and non-consensual intimate media such as sharing or threatening to share private sexual images, AI-generated or deepfake ones included.
  - harassment, doxxing, threats, incitement to violence, glorifying violent attacks and promoting terrorist or violent extremist groups.
  - attacking or demeaning people for their race, ethnicity, nationality, religion, sex, gender identity, sexual orientation, disability or age, including slurs, misgendering and deadnaming.
  - encouraging or instructing suicide, self-harm or eating disorders. Supportive and recovery discussion is allowed.
  - spam, scams and manipulation: unsolicited advertising, repetitive posting, bot activity, fake engagement, vote or metric manipulation, phishing, fake giveaways, pyramid schemes and deceptive financial offers.
  - misleading impersonation of a person, brand or organization.
  - anything illegal under Portuguese law or applicable EU law.
  - ban evasion, including new accounts made to get around a ban, a suspension or these rules.

An instance that doesn't enforce these rules can be banned from verification for a time or for good. The registry admins can refuse any request and remove any approved instance.

## Requesting approval

Add your instance to `instances.json` at the repository root with `id`, `name`, `url` and `source_url`, run `bun scripts/instances-md.mjs` to regenerate `instances.md`, and open a pull request with both files. See [CONTRIBUTING.MD](../../CONTRIBUTING.MD).

Unless `federation.announce` is off, your instance also announces itself to the registry on start, once a day and when an admin presses Send to registry on the Federation page of the admin dashboard. That puts it in the review queue without publishing anything. The registry imports `instances.json` within an hour of the merge, and other instances fetch the new list within 5 minutes after that.

## Staying approved

- Keep `federation.key` and back it up with `jwt.key`. Both are in the server's working directory, or in the `state` volume under Docker. When an approved instance serves a different key, the registry ignores its discovery list until the registry admins confirm the change with you, so open an issue when you rotate it on purpose.
- Keep updating. An old version can miss protocol changes and stop federating.
- Keep your admin contacts current. Each announce sends up to 10 handles, by default the accounts with the OPERATOR right, which the registry admins see privately and add to a group DM of all instance admins. List other usernames under Registry contacts on the Federation page or in `federation.contacts`.
- Each announce also sends your user, server and daily message counts, which the registry never publishes. `federation.announceStats` set to false, or the matching switch on the Federation page, stops that.
- Answer reports. The registry suspends an instance whose admins don't act on reports, and other instances stop federating with it until it is approved again.

## Verifying a server for discovery

1. The server owner turns on Show on other instances under Server Settings, Other instances. The server needs a text channel, and it gets a permanent invite that people from other instances can use at once.
2. An instance admin presses Verify next to the server on the Federation page, which adds it to `/.well-known/meowcord/discovery`.
3. 30 seconds later the instance announces itself, and the registry publishes the server. Other instances show it within 5 minutes. With `federation.announce` off, the registry only finds it at its hourly checks, which reach each instance every few hours.

The owner sees each state in the same settings section.

Before you press Verify, check that the server's name, icon and description match what it is, that its moderators enforce its rules, that AutoMod and raid protection are on unless it is small, and that its content is fine for anyone. Take back, or the owner turning the switch off, removes it again.

Set `federation.discovery.verification` to `instance` to also verify other instances' servers yourself before your users see them.
