# Runtime internals

This page keeps the event transport, shutdown and JSON worker limits of the server process for contributors. Operators only ever set `EVENT_TRANSMISSION`, `EVENT_SOCKET_PATH` and `JSON_WORKERS`, and a single-process instance needs none of them.

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

## JSON workers

Asynchronous JSON conversions start workers on demand. `JSON_WORKERS` accepts integers from 1 through 128, and the default is the CPU count capped at 128. Synchronous conversion starts no workers. Accepted requests keep workers referenced until completion and take part in the shared callback drain. Idle workers are unreferenced and terminated during final cleanup. A worker failure or the 60 second request deadline rejects that worker's pending requests, and later requests start a replacement.

JSON stream decoding keeps UTF-8 characters intact across byte chunks and rejects malformed bytes. Array enumeration parses one entry at a time, and full value decoding still buffers the whole document. Web readers release locks and cancel unfinished input on errors or early return. File readers close on early return and respect `autoClose: false` after normal completion. Enumerable output uses backpressure, closes successful output and aborts failed output with the original error. Undefined, function and symbol entries become `null` in arrays.

Worker deserialization transfers parsed values through structured clone. Numeric values match synchronous `JSON.parse`, including negative zero, overflow and underflow.

Each worker pool accepts at most 1,024 pending requests. Overflow rejects with `JSON_QUEUE_FULL` before allocating a timeout or posting the request. Pending deserialization requests also share a 128 MiB UTF-8 input budget per pool, and serialization snapshots share that budget through weighted graph accounting that counts shared references once per request. Growable buffers reserve their maximum size. This is a logical input budget, not native wire size or process memory.

Whole value decoding from file and web streams enforces the same 128 MiB UTF-8 ceiling while it accumulates text. Incremental array decoding caps each unfinished entry at 128 MiB and resets between entries, so an array can stream past 128 MiB in total. Active whole value and array entry accumulators share a 128 MiB retained text budget and at most 1,024 active reader slots, including readers waiting for their first byte. Overflow rejects with `JSON_QUEUE_FULL` and closes or cancels the reader.
