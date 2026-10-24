<p align="center">
  <img src="docs/images/hero.webp" alt="the meowcord app icon in 3D, floating in front of two screens showing a chat channel with users from other instances and the server discovery page" />
</p>
<h1 align="center">FemCord</h1>

**FemCord is a self-hosted discord clone with feature parity, e2e encryption and federation.** it serves a custom patched Discord web client with Equicord from a local copy and rebrands that client as your instance. the default instance name is FemCord, and custom names come from the instance configuration. anyone can sign up on your instance, log in with the real Discord UI and use it the way they use Discord, without a Discord account.

you can also join servers, group chats, and add friends from other instances, as long as they're running meowcord/femcord and have their instance verified.

<table>
  <tr>
    <td><img src="docs/images/chat.webp" alt="a text channel in a meowcord server, with messages, reactions and the member list" /></td>
    <td><img src="docs/images/discovery.webp" alt="the discover page listing servers with banners, descriptions and member counts" /></td>
  </tr>
</table>

**meowcord is currently in very early alpha.** right now it's a big mess and only fit for testing. during the alpha we also allow ai contributions, so that as many people as possible can test it and contribute. else, we'd never get anywhere near discord feature parity.

## join meowcord!!

no matter what instance you pick, you can join servers and group chats and add friends on every other verified instance :3

**start by [picking an instance from this list](instances.md) and signing up.** you can find servers to join in the Discovery tab.

## self-hosting

you need a Linux host with Docker, a domain pointing at it and a public IPv4 address for voice. [the setup guide](docs/self-hosting/setup.md) installs it with Docker Compose, and [the native Linux guide](docs/self-hosting/native.md) runs it under systemd instead. [the verification guide](docs/self-hosting/verification.md) gets your instance listed in [instances.md](instances.md) and global discovery, and [docs/README.md](docs/README.md) indexes every other page.

## contributing

read [CONTRIBUTING.MD](CONTRIBUTING.MD) for the conventions and the commands to run before pushing, and open an issue or pull request for bugs and improvements.

## License

AGPL-3.0-only, see [LICENSE](LICENSE). Code inherited from before this fork is by [Spacebar](https://github.com/spacebarchat/server) and its contributors.
