#!/usr/bin/env bash
set -euo pipefail

# Restores a Postgres backup made by backup.sh. DESTRUCTIVE: overwrites the current database.
# Usage: ./scripts/restore-postgres.sh backups/postgres_20260906_030000.sql.gz

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path-to-postgres-backup.sql.gz>" >&2
  exit 1
fi

backup_file="$1"
if [ ! -f "$backup_file" ]; then
  echo "File not found: $backup_file" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

read -r -p "This will OVERWRITE the current fulldev_bot database with $backup_file. Type 'yes' to continue: " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo "Restoring Postgres from $backup_file..."
gunzip -c "$backup_file" | docker compose exec -T postgres psql -U fulldev -d fulldev_bot
echo "Done. Restart the app container so it picks up the restored data: docker compose restart app"
