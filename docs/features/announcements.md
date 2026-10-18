# Encrypted announcements

The Announcements page of the admin dashboard, under Instance, sends an [encrypted](e2ee.md) DM from the instance's official account. Only operators can use it. The audience is everyone, staff, or selected users. Selected takes 1 to 100 unique user ids of existing human accounts, and it is the way to test delivery on disposable accounts instead of real users.

Attachments can add up to 10 MiB in total. They are encrypted the same way as in any encrypted DM, and the original file names travel inside the encrypted message.

## Delivery

The server stores each recipient's delivery state and shows queued, sending, delivered and failed counts in the delivery history. A worker delivers up to 16 messages per pass, 4 at a time. A recipient with no active encryption device stays queued until their account has one, with no time limit. A recipient is marked failed after 10 unsuccessful attempts. Announcements from before delivery tracking existed show no progress.

Deleting an announcement through its endpoint cancels queued deliveries, removes the messages already delivered and deletes its stored files.

## Private files and backups

| Variable | Default | Holds |
| --- | --- | --- |
| `E2EE_SYSTEM_KEY_DIR` | `.e2ee-system` next to `CONFIG_PATH` | The official account's private key seed. The Official inbox uses it too. |
| `ANNOUNCEMENT_SPOOL_DIR` | `.announcement-spool` next to `CONFIG_PATH` | Encrypted attachments of each announcement, sealed under a key derived from that seed. |

Both directories must have mode 700 and their files mode 600, and neither may be a symlink. The server creates them with those modes. `.gitignore` excludes the default directories. Keep a custom directory out of version control, logs and anything served publicly.

Back up the database and both directories together, and restore them together. Losing the seed makes the stored attachments unreadable and stops the official account from sending under its existing identity. The server refuses to create a new seed while the official account already has encryption keys, so restore the original file. Don't delete spool files of an announcement that still has queued recipients, because the server then marks those deliveries as failed instead of sending text only.

## Testing

```sh
bun test scripts/tests/system-encryption.test.cjs
ANNOUNCEMENT_DELIVERY_TEST=1 DB_POOL_SIZE=1 bun --env-file=<isolated .env> test ./scripts/tests/announcement-delivery.postgres.cjs
```

The second suite writes to PostgreSQL and refuses to run unless `DATABASE` points at a database named `fosscord_codex_admin`. Announcements go through the normal message path, so run `e2ee-test.mjs` after changing them.
