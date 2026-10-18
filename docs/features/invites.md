# Instance invites

An instance invite is a code that lets someone create an account, while a server invite adds an existing account to a server. The server records who invited whom, so staff can follow an invite tree and disable a whole branch of spam accounts at once.

## Invite-only registration

Make the instance invite-only, under Registration in Site settings, sets `register.requireInvite`. While it is on, registration refuses a signup without a code with `INVITE_ONLY`, and one with a revoked, expired, used up or unknown code with `INVALID_INVITE`. Server invites don't count, and a registration token skips the check. Two people can't both take the last use of an invite, and a signup that fails after claiming a use gives it back. An invite stops working once its creator's account is disabled or deleted.

With invite-only off, a valid code still records who brought the person in, and an invalid one is ignored. Signup needs the captcha either way, see [signup.md](signup.md).

A link has the form `https://<instance>/register?instance_invite=<code>`. The FosscordInvites plugin adds an Invite code field to the signup form when the instance is invite-only or the link carries a code, and the field shows who sent the invite or that the code doesn't work. The lookup behind it, `GET /api/v9/auth/instance-invite`, needs no sign-in and allows 30 requests per IP per minute.

## Invites for members

Members make their own links in User Settings, under Invites below Data & Privacy, with a number of uses and an expiry. The page lists their links and the people who joined through them.

A member's total is the instance default plus any extra invites staff gave them. Each person who joined with one of their invites uses one, and the unused uses of their working links are held back, so a member with 3 invites can make one link for 3 people or 3 links for one each. Revoking an unused link gives its uses back. Staff invites never count against anyone, and bots can't make instance invites.

| Key                                          | Default | Meaning                                                                               |
| -------------------------------------------- | ------: | ------------------------------------------------------------------------------------- |
| `register.instanceInvites.perUser`           |       3 | Invites each member gets.                                                             |
| `register.instanceInvites.minAccountAgeDays` |       7 | Days an account has to exist before it gets the default. Extra invites apply at once. |
| `register.instanceInvites.maxUsesPerInvite`  |       3 | Most people one member link can let in.                                               |
| `register.instanceInvites.maxAgeDays`        |      30 | Longest a member link can last. 0 allows links that never expire.                     |

Site settings shows these under Registration. Member links last at least 1 hour. The routes under `/api/v9/users/@me/instance-invites` share the rate limit in `limits.rate.routes.instanceInvite`, 10 writes and 60 reads per user per minute by default.

## Admin dashboard

Instance invites, under People & servers, lists every invite with its creator, uses, expiry and state. Create invite makes a staff invite with up to 10,000 uses or 0 for no limit, an expiry of up to a year or none, and a note only staff see. Opening an invite shows everyone who joined with it and a revoke form that can also disable those accounts, or everyone below the invite in the tree.

The user drawer has an Invites card with the account's chain of inviters, its remaining invites, an Extra invites field from -1000 to 10000, the tree of accounts it brought in and Disable everyone they brought in.

Disabling a branch disables each account, revokes their working invites and signs them out everywhere. It skips accounts with `OPERATOR`, `MANAGE_USERS` or `MANAGE_GUILDS` and the staff member doing it. It follows a branch 32 levels deep and up to 10,000 accounts, and the drawer shows the first 500 accounts down to 8 levels.

The admin routes are under `/api/v9/admin/instance-invites` and `/api/v9/admin/users/<id>/invites`. Reading needs `VIEW_USERS`, creating, revoking and setting extra invites need `MANAGE_USERS`, and disabling a branch from the user drawer needs `MODERATE_USERS`.

Deleting an account keeps the history of its invites and of the people it invited, with the creator or inviter set to null. `scripts/tests/instance-invites.test.cjs` covers the feature.
