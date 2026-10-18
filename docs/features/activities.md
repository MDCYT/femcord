# Activities

Activities are embedded apps that run in an iframe inside a voice channel or a DM call. The client already has Discord's shelf, panel and Embedded App SDK bridge, and the server provides the data and hosts the apps.

## Hosting

The client loads an activity from `<application id>.<activity host>`. The activity host is `client.activityApplicationHost`, and when that is empty it is the instance's own host, so on `chat.example.com` the Whiteboard loads from `https://1234567890123456789.chat.example.com`. That needs a wildcard DNS record and a wildcard certificate. Set `client.activityApplicationHost` to a host such as `activities.example.com` to keep activities on their own domain. In development `*.localhost` resolves to 127.0.0.1, so `http://<id>.fosscord.localhost:3202` works with no setup.

The server answers a request on an activity host from that application's URL mappings, with or without Discord's `/.proxy` prefix, and the longest matching prefix wins:

- A `builtin://<name>` target serves an activity bundled with the server.
- Any other target, an `https://` URL or a bare domain with an optional path, is reverse proxied. The proxy forwards the method, the body and content and caching headers, but not cookies. It needs `externalRequests.thirdParty`, refuses targets that resolve to a private address unless `security.allowPrivateNetworkRequests` is on, and gives up after 15 seconds. Request bodies are capped at 8 MiB and responses at 32 MiB. WebSocket upgrades are not proxied.

## Your own activities

Developers turn activities on for an app in the developer portal at `/developers`, under Activities. The same page edits the URL mappings, the supported platforms and the age gate. Turning activities off keeps the settings but stops the activity host and launches from answering.

A new activity is unreleased. Only the owner and the app testers can start it, and it shows up in their shelf. Testers are added under Applications, App Testers, must be friends of the owner, and are capped at 50. Anyone in the channel can join a running instance. Releasing it to everyone lets anyone start it from its `launch` command. The global shelf is curated: an operator sets `on_shelf` on the `embedded_activities` row to list an activity there for everyone.

## Launching and joining

Starting an activity needs a voice state in the channel, and in a server the Use Activities permission. Each application has one instance per channel, and a user is in at most one instance. Leaving the voice channel or closing the gateway takes the user out, and the instance ends when the last participant leaves. A bot can also start its activity by answering an interaction with callback type 12, `LAUNCH_ACTIVITY`.

The iframe URL carries a signed `discord_proxy_ticket` that is valid for 12 hours. An activity backend can check who is in an instance with `GET /applications/:id/activity-instances/:instance_id` and its bot token.

## Whiteboard

The server ships one activity, a shared whiteboard. On first start the server registers it as an application owned by the `official` system account. Boards live in the memory of the process that serves the activity host, and a board is gone once its instance ends.

## Not done yet

- The RPC `AUTHORIZE` and `AUTHENTICATE` commands, so activities only get the handshake and the commands that need no OAuth2 scope.
- Proxying WebSocket upgrades to external targets.
