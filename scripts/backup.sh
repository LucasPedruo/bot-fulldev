#!/usr/bin/env bash
set -euo pipefail

# Backs up the WhatsApp session (paired-device credentials) and the Postgres database to
# ./backups on the HOST filesystem - deliberately outside any Docker volume, so a corrupted or
# accidentally-removed volume doesn't take the backups down with it too.
#
# Reads through the already-running "app" and "postgres" compose services (docker compose exec)
# instead of touching the named volumes directly, so it works regardless of the Docker Compose
# project name / volume name prefix on whatever machine it runs on.
#
# Usage: ./scripts/backup.sh
# Intended to run on a schedule once deployed (see README's "Backup e recuperacao" section for
# the crontab line) - it is NOT invoked automatically by the app itself.

cd "$(dirname "$0")/.."
mkdir -p backups
timestamp=$(date +%Y%m%d_%H%M%S)

echo "Backing up WhatsApp auth session..."
docker compose exec -T app tar czf - -C /app/data/whatsapp . >"backups/whatsapp_auth_${timestamp}.tar.gz"

echo "Backing up Postgres database..."
docker compose exec -T postgres pg_dump -U fulldev -d fulldev_bot | gzip >"backups/postgres_${timestamp}.sql.gz"

echo "Pruning backups older than 14 days..."
find backups -type f -mtime +14 -delete

echo "Done. Backups saved to ./backups:"
ls -lh backups | tail -n +2
