# Change your instance's URL

An instance's id is the lowercase host of its address, with the port when it isn't 443. Other instances store it in every user, server and message they copied from yours, such as `name@your.id` and `@<snowflake>@your.id`. This page moves all of that to a new address without losing anyone's DMs, servers or friends. It works because `federation.key` signs a move statement from the old id to the new one, which other instances and the registry check against the key they recorded for the old id.

## Before you start

- Back up `federation.key` and `jwt.key` and keep them. A new key turns the move into a key change that people have to approve, see [If you lost the key](#if-you-lost-the-key).
- Point the new domain at the server and get a certificate for it.
- If you still control the old domain, keep it pointing at the same server for at least a week. Instances that haven't heard of the move keep sending to it, and your instance accepts requests signed for any of its previous ids.

## Steps

1. Set `general.serverName`, `api.endpointPublic`, `cdn.endpointPublic` and `gateway.endpointPublic` to the new address, in `config.json` or on the Site settings page of the admin dashboard.
2. Add the old id under Previous ids on the Federation page of the admin dashboard, or to `federation.previousIds`. It takes up to 10 ids.
3. Restart the server. About 10 seconds after start, it serves a signed move statement for each previous id in `moved_from` of `/.well-known/meowcord` and sends it to every instance it shares users, servers, queued events or a peer entry with, then again every 24 hours. The Instance moves card on the Federation page shows each instance's answer.
4. Open a pull request to `instances.json` that changes your entry's `id` and `url`, adds `previous_ids` and removes the old entry, because the registry refuses a move while the old id has an entry of its own. Run `bun scripts/instances-md.mjs` and commit both files:

    ```json
    { "id": "new.example", "name": "Meow", "url": "https://new.example", "source_url": null, "previous_ids": ["old.example"] }
    ```

5. Within an hour of the merge, the registry checks the statement, carries your approval, discovery servers, admin contacts and counts over to the new id and publishes the move. Other instances fetch it within 5 minutes, unless your instance told them first.

## What other instances rewrite

Each instance checks the move against the key it recorded for the old id and refuses it when the registry names a different key. It then rewrites its id mappings, so `@123@old.id` becomes `@123@new.id`, and its shadow users, so `name@old.id` becomes `name@new.id`. It also moves mirror servers and channels, group DM members, cached encryption keys, queued events, servers its admins verified for discovery and `federation.peers` to the new id. Blocks are copied to the new id and kept on the old one, so a move never lifts a block.

A rewrite that stops halfway, for example on a restart, continues at the next registry check. A user someone looked up under the new id before the move arrived exists twice, so the rewrite merges the newer copy into the older one and leaves a deleted account named `moved-<id>`. The Federation page lists these merges. Old ids keep finding the same users, and encrypted messages sent before the move still verify.

## If you lost the key

1. Follow the steps above, and explain what happened in the pull request.
2. A registry admin confirms that you run both addresses and approves the move, and the registry publishes it as approved by an admin.
3. Other instances apply a key change only after that. Until then it shows as Needs an admin on their Federation page, and their admins can press Apply once they checked with you.

A statement signed with the old key that names a new key is a key change too.

## Limits

- Nobody can move an id that already moved, or move to an id whose recorded key differs from the statement's.
- A move back to an earlier id ends the old alias. Chains of moves are followed for at most 8 hops.
- Bookmarks and invite links keep pointing at the old domain. Redirect it to the new one if you can.
