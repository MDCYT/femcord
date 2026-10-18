<p align="center">
  <img src="docs/images/hero.webp" alt="the meowcord app icon in 3D, floating in front of two screens showing a chat channel with users from other instances and the server discovery page" />
</p>
<h1 align="center">Meowcord</h1>

meowcord is a self-hosted discord clone with feature parity, e2e encryption and federation.

it serves a custom patched Discord web client with Equicord from a local copy and rebrands that client as your instance. anyone can sign up on your instance, log in with the real Discord UI and use it the way they use Discord, without a Discord account.

you can also join servers, group chats, and add friends from other instances, as long as they're running meowcord and have their instance verified.

**meowcord is currently in very early alpha.** right now, it's a big mess and not recommended for production use or anything other than testing. during this alpha, we'll also have an extremely permissive ai contribution policy, so that we can get as many people as possible to test it and contribute to it. else, we'd never get anywhere near discord feature parity.

## join meowcord!!

since meowcord is federated, no matter what instance you pick, you'll always be able to talk to anybody else, even on other instances :3

**start by [picking an instance from this list](instances.md) and signing up.** you can find servers to join in the Discovery tab.

## self-hosting

you need a Linux host with Docker, a domain pointing at it and a public IPv4 address for voice. copy `.env.example` to `.env`, set `DOMAIN`, `POSTGRES_PASSWORD` and `WRTC_PUBLIC_IP`, then run:

```sh
docker compose up -d --build
```

register an account, then make it the operator with its numeric account ID: `docker compose exec server bun scripts/ops/operator.mjs grant <account-id>`. the first signup gets no special rights.

[the setup guide](docs/self-hosting/setup.md) covers the rest: ports, every variable, your own reverse proxy, backups, updates and SQLite. to run without Docker, follow [the native Linux guide](docs/self-hosting/native.md). to get your instance listed in [instances.md](instances.md) and in global discovery, read [the verification guide](docs/self-hosting/verification.md). [docs/README.md](docs/README.md) indexes every other page.

## contributing

agent contributions are allowed during the alpha. please read [CONTRIBUTING.MD](CONTRIBUTING.MD) for development conventions and verification commands, and open an issue or pull request for bugs and improvements.

## License

AGPL-3.0-only, see [LICENSE](LICENSE). Code inherited from before this fork is by [Spacebar](https://github.com/spacebarchat/server) and its contributors.
