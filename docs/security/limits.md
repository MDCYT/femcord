# Upload and fetch limits

This page lists the limits the server puts on uploads, on URLs it fetches for users and on images it decodes, with the config keys and environment variables that change them and what a user sees when one is hit. Config keys go in `config.json` or the admin dashboard and environment variables in `.env`, see [setup.md](../self-hosting/setup.md).

## Attachments

| Key                                  | Default | Effect                                                                                                                       |
| ------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `cdn.maxAttachmentSize`              | 500 MiB | Largest file the client can upload. A larger file is refused with "Request entity too large" before the upload starts.        |
| `limits.message.maxAttachments`      | 15      | Files per message, and per upload request up to a hard cap of 100.                                                           |
| `limits.message.maxAttachmentSize`   | 1 GiB   | Largest file in a multipart message request, the path bots use.                                                              |

The client uploads files to upload slots first and then sends the message. Each user may hold at most:

| Uploads                                              | Count | Bytes                                       |
| ---------------------------------------------------- | ----- | ------------------------------------------- |
| Unfinished uploads                                   | 32    | The larger of `cdn.maxAttachmentSize` and 1 GiB |
| All uploads the server keeps, finished or not        | 512   | The larger of `cdn.maxAttachmentSize` and 2 GiB |

Past either limit the server answers 429 with "Too many pending uploads. Finish or cancel an upload first." Finishing an upload frees its unfinished slot but not its place in the second row, so a user over that limit has to remove unused uploads.

Creating an upload slot needs View Channel and Attach Files in the channel. Only the user who uploaded a file can attach it to a message, only in the channel where they uploaded it, and only while they still have both permissions.

## Upload memory on the CDN

Each CDN process buffers uploads in memory and admits them against a byte budget and a concurrency cap:

| Variable                         | Default         | Accepted values             |
| -------------------------------- | --------------- | --------------------------- |
| `CDN_UPLOAD_BUFFER_BUDGET_BYTES` | 1073741824, 1 GiB | A positive integer in bytes |
| `CDN_UPLOAD_MAX_CONCURRENT`      | 16              | 1 to 64                     |

A client upload reserves twice its file size plus 64 KiB, so the default budget fits one 500 MiB file at a time. To raise `cdn.maxAttachmentSize`, raise the budget to at least twice the new size plus 64 KiB. Uploads from the API to the CDN reserve up to 100 MiB plus 64 MiB each.

An upload that can never fit the budget gets 413. When the budget or the concurrency cap is in use, the CDN answers 503 with `Retry-After: 1`. An invalid value in either variable makes every upload fail with 503 until it is fixed. The budget covers upload buffers only, not the whole process, and each CDN process has its own pool, so size it for the memory each process has left.

## Storage quotas

`cdn.storageQuota` caps total storage on local disk or S3, with these defaults:

| Key                | Default |
| ------------------ | ------- |
| `instanceBytes`    | 100 GiB |
| `instanceObjects`  | 100,000 |
| `principalBytes`   | 10 GiB per account |
| `principalObjects` | 10,000 per account |
| `cacheBytes`       | 1 GiB   |
| `cacheObjects`     | 10,000  |

Webhook and application uploads count toward their owner's account. A write past an instance or account limit fails with 413 "Storage quota exceeded". The cache holds Discord assets the CDN fetches on demand and evicts the least recently used ones instead of failing. [setup.md](../self-hosting/setup.md) covers sizing.

## Fetching URLs that users pick

The server fetches link previews, webhook avatars, the `/external` media proxy, Web Push endpoints and similar URLs that users and bots choose. Every one of these fetches goes through `PUBLIC_FETCH_PROXY`, which [external-services.md](../self-hosting/external-services.md) describes. Link previews, webhook avatars and Web Push also need `externalRequests.thirdParty`, which is off by default.

The server resolves each hostname itself, refuses it when any address is private or reserved, and connects only to the address it checked. It checks every redirect the same way, follows at most 3 by default, and drops cookies and authorization headers when a redirect changes origin. It refuses URLs with credentials, schemes other than HTTP and HTTPS, and compressed responses, so a site has to send its bytes without a content encoding. `security.allowPrivateNetworkRequests`, off by default, lifts the private address check and nothing else.

| Fetch                          | Bytes                                                       | Time       |
| ------------------------------ | ----------------------------------------------------------- | ---------- |
| Link previews and their media  | `limits.message.maxEmbedDownloadSize`, default 5 MiB, at most 32 MiB | 15 seconds |
| `/external` media proxy        | 50 MiB                                                      | 15 seconds |
| Image proxy                    | 10 MiB                                                      | 5 seconds  |
| Other callers                  | 5 MiB                                                       | 15 seconds |

A fetch that breaks a limit fails, and the message simply has no embed for that link.

## Images the server decodes

The server decodes images itself for instance branding, email images and the colors of burst reactions. These limits are fixed:

| Use                         | Bytes | Time        | Image size                                   |
| --------------------------- | ----- | ----------- | -------------------------------------------- |
| Branding and email images   | 8 MiB | 5 seconds   | 8,192 pixels per side, 16,777,216 pixels, 256 GIF frames |
| Burst reaction colors       | 1 MiB | 1.5 seconds | 1,024 pixels per side, 1,048,576 pixels      |

A branding image over a limit falls back to the default artwork, and an email image is served unconverted. A burst reaction over a limit, or arriving while 32 color jobs are already running, gets fallback colors. BigTIFF files are refused.

Branding versions include the file's modification time and size, so replacing `client.icon` or `client.logo` at the same path refreshes the rendered images.

## Gateway buffers

Each gateway connection keeps its last 250 events, up to 8 MiB, so a client that reconnects can resume without missing any. A connection that drops is held for 90 seconds and queues up to 5,000 events or 16 MiB for the resume. Two config keys cap what all of these buffers hold together:

| Key                                         | Default | What it caps                                     |
| ------------------------------------------- | ------- | ------------------------------------------------ |
| `limits.gateway.retainedDispatchBytes`      | 1 GiB   | Kept and queued events across the whole process  |
| `limits.gateway.retainedDispatchBytesPerUser` | 64 MiB  | Kept and queued events across one account's connections |

When a budget is full, a live connection drops its oldest kept events, and a dropped connection that is waiting for a resume is released. A client that then tries to resume from before an event that was dropped gets an invalid session and identifies again, so it never resumes with a gap. Bytes are measured as the JSON size of each event.

