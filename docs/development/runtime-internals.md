# Runtime internals

This page keeps the event transport, shutdown, background job and JSON worker limits of the server process for contributors. Operators only ever set `EVENT_TRANSMISSION`, `EVENT_SOCKET_PATH` and `JSON_WORKERS`, and a single-process instance needs none of them.

## Unix event transport

`EVENT_TRANSMISSION=unix` uses `EVENT_SOCKET_PATH` as a writable shared directory. The directory must support Unix sockets and hard links. Each reader advertises a `.sock` name linked to its private bound socket. Native close removes the private path, and cleanup removes the advertised name only when its socket identity still matches. A replacement reader's socket is preserved. Startup probes existing socket paths and refuses to replace an active listener.

When `EVENT_TRANSMISSION` is set, which `THREADS` above 1 also does, or RabbitMQ is configured, the API processes share their rate limit counts through the `rate_limits` table. Every process counts in memory and writes the hits it saw to the table in one batch every 250 ms, then takes the shared totals back. Other processes can admit the requests they get within one of those 250 ms rounds before they see that a limit was reached. A single process writes nothing for limits shorter than a minute.

Each Unix writer retains at most 1,024 events or 16 MiB of encoded frames across offline backlog, queued publications and active writes. Admission snapshots the payload and rejects overflow with `IPC_QUEUE_FULL` without evicting accepted events. Capacity is released after write callbacks settle. These limits count retained frames, not kernel buffers or copies per recipient. Offline admission is not durable delivery, and final cleanup discards undelivered backlog.

The `rabbitmq-single` writer also limits pending publications to 1,024 events or 16 MiB of encoded payloads. It snapshots each payload at admission and rejects overflow with `IPC_QUEUE_FULL`. Publications run in admission order, waiting for channel drain after backpressure before publishing the next event. Failures release their reservations and don't block later queued publications. These limits don't bound broker queues, and ordinary channel publication is not a broker confirmation.

The legacy RabbitMQ adapter uses the same pending publication limits and ordered drain. It snapshots data and event type, propagates publication failures and retries channel setup at most once. A buffered publication is already accepted by the channel and is never resent if drain fails. Stopping and final close wait for admitted work before broker cleanup, and final close rejects later admissions.

## Shutdown

The server drains lifecycle work on SIGTERM and SIGINT. The cluster supervisor forwards shutdown to its workers and doesn't restart intentional exits. Compose allows 35 seconds for the server to stop, and the process has a 30 second deadline that exits with status 1 when startup or cleanup can't finish.

Accepted event callbacks and emit hooks return tracked promises across local, process, Unix socket and both RabbitMQ transports. Finalization enters a callback draining phase after component stopping and before database cleanup. It refuses unrelated new callbacks while draining accepted work and callbacks started by that work. Callback failures are isolated and logged without event payloads. Direct Unix and single RabbitMQ reader close also waits for its accepted callback promises. RabbitMQ receipt acknowledgements keep their timing. Concurrent finalization calls share completion, and recursive calls from finalization listeners don't dispatch cleanup again.

JWT key file checks share one active restoration pass. A shutdown request cancels the periodic checker, and component stopping waits for accepted writes or makes one final missing file check. Restoration writes the loaded signing keys, and initialization and restoration wait for both file writes to settle before reporting failure.

## Background jobs

Every job below runs in every process that starts it. `src/bundle/start.ts` forks `THREADS` workers, 1 by default, and each worker runs the API, CDN, gateway and voice server, so with `THREADS=4` each job runs 4 times. No job elects a leader. Jobs that must not repeat work claim rows with `FOR UPDATE SKIP LOCKED`, a lease column or a conditional update. Each job keeps an in-process guard so a slow run doesn't overlap the next tick, except the AFK mover and the federation inbox pruning and presence refresh. Every job registers a `stopping` listener on `ProcessLifecycle` that clears its timers and, where it has one, waits for the run in progress. The AFK mover is the exception, and `WebrtcServer.stop()` stops it.

| Job | Source | Every | Work per run | Across processes | On failure |
| --- | --- | --- | --- | --- | --- |
| Scheduled messages | `src/api/util/handlers/ScheduledMessages.ts` | 15 s | 100 due messages | A 5 minute lease in `claim_token` and `claim_until`, renewed every 100 s while sending | A send error stores an `ERROR_*` state. A crashed sender's lease expires and another process retries the message |
| Announcement delivery | `src/api/util/utility/announcementDelivery.ts` | 5 s | 16 deliveries, 4 at a time | A 10 minute lease token, renewed every 30 s | Backoff from 5 s doubling to 5 minutes, failed after 10 attempts |
| Message purge | `src/api/util/handlers/MessagePurge.ts` | 60 s | 500 messages per transaction until the queue is empty | `FOR UPDATE SKIP LOCKED` on queue rows | The queue row stays and the next run retries it |
| Thread auto-archive | `src/api/util/handlers/Thread.ts` | 60 s | Pages of 500 active threads, loading a full thread only when it is due | The archive is a conditional update on `archived = false`, so one process emits each `THREAD_UPDATE` | Logged, retried next run |
| Temporary sessions | `src/api/util/handlers/Instance.ts` | 5 minutes | 500 sessions older than 1 hour | `FOR UPDATE SKIP LOCKED` | Logged, retried next run |
| Scheduled event sweep | `src/database/voice/ScheduledEvents.ts` | 30 s | Batches of 100 due events, at most 10 batches | No claim | Logged, retried next run |
| Guild insights rollups | `src/database/insights/GuildInsights.ts` | 1 hour | One day per step, up to 120 days back | `INSERT ... ON CONFLICT DO NOTHING` decides which process writes a day | Logged, retried next run |
| Discovery index | `src/api/util/handlers/Discovery.ts` | 10 minutes | Pages of 500 guilds through every guild | No claim, the rewrite is idempotent | Logged, retried next run |
| Federation registry | `src/api/util/utility/federation.ts` | 5 minutes | 200 peers, 4 at a time | No claim | Logged, retried next run |
| Federation outbox | `src/api/util/utility/federationEvents.ts` | Per peer, at once while rows remain | 100 events per request, 30 s per request | No claim, so two processes can send the same rows | Backoff from 1 s doubling to 5 minutes, rows dropped after 24 hours |
| Scam domain list | `src/api/util/utility/scamGuard.ts` | Checked every 60 s, fetched every 6 hours by default | One fetch of at most 8 MiB within 20 s | No claim | The error is kept for the admin dashboard and the next fetch waits for its due time |
| Rate limit pruning | `src/api/middlewares/RateLimit.ts` | 60 s | Expired buckets | Deletes are idempotent | Logged |
| Presence sweep | `src/gateway/util/Utils.ts` | 15 s | Every stale session, one `UPDATE ... RETURNING` | The update returns each row to one process | Logged |
| AFK mover | `src/webrtc/util/AfkMover.ts` | 15 s | The voice sessions of its own process | Each process owns its sessions | Logged |
| Poll expiry | `src/api/util/utility/polls.ts` | A timer set to the earliest expiry | Every expired poll, recovered in batches of 100 at startup | No claim | Each failure is logged and the next poll runs |

The presence sweep's update has no row limit, and the discovery index, scheduled event sweep, federation registry and federation outbox are the jobs that repeat work when several processes run.

## JSON workers

Asynchronous JSON conversions start workers on demand. `JSON_WORKERS` accepts integers from 1 through 128, and the default is the CPU count capped at 128. Synchronous conversion starts no workers. Accepted requests keep workers referenced until completion and take part in the shared callback drain. Idle workers are unreferenced and terminated during final cleanup. A worker failure or the 60 second request deadline rejects that worker's pending requests, and later requests start a replacement.

JSON stream decoding keeps UTF-8 characters intact across byte chunks and rejects malformed bytes. Array enumeration parses one entry at a time, and full value decoding still buffers the whole document. Web readers release locks and cancel unfinished input on errors or early return. File readers close on early return and respect `autoClose: false` after normal completion. Enumerable output uses backpressure, closes successful output and aborts failed output with the original error. Undefined, function and symbol entries become `null` in arrays.

Worker deserialization transfers parsed values through structured clone. Numeric values match synchronous `JSON.parse`, including negative zero, overflow and underflow.

Each worker pool accepts at most 1,024 pending requests. Overflow rejects with `JSON_QUEUE_FULL` before allocating a timeout or posting the request. Pending deserialization requests also share a 128 MiB UTF-8 input budget per pool, and serialization snapshots share that budget through weighted graph accounting that counts shared references once per request. Growable buffers reserve their maximum size. This is a logical input budget, not native wire size or process memory.

Whole value decoding from file and web streams enforces the same 128 MiB UTF-8 ceiling while it accumulates text. Incremental array decoding caps each unfinished entry at 128 MiB and resets between entries, so an array can stream past 128 MiB in total. Active whole value and array entry accumulators share a 128 MiB retained text budget and at most 1,024 active reader slots, including readers waiting for their first byte. Overflow rejects with `JSON_QUEUE_FULL` and closes or cancels the reader.
