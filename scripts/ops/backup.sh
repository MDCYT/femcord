#!/bin/sh
set -eu
umask 077
backup_dir=${1:?usage: scripts/ops/backup.sh NEW_DIRECTORY}
mkdir "$backup_dir"
state_volume=$(bun scripts/ops/compose-resource.mjs state)
storage_volume=$(bun scripts/ops/compose-resource.mjs storage)
database_user=$(bun scripts/ops/compose-resource.mjs user)
database_name=$(bun scripts/ops/compose-resource.mjs database)
docker compose stop server
docker compose exec -T postgres pg_dump -Fc -U "$database_user" "$database_name" > "$backup_dir/database.dump"
docker run --rm -v "$state_volume:/state:ro" -v "$storage_volume:/storage:ro" alpine tar czf - -C / state storage > "$backup_dir/files.tar.gz"
(cd "$backup_dir" && shasum -a 256 database.dump files.tar.gz > SHA256SUMS)
docker compose start server
printf 'Backup saved in %s\n' "$backup_dir"
