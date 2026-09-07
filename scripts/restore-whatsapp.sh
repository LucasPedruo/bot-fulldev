#!/usr/bin/env bash
set -euo pipefail

# Restores a WhatsApp session backup made by backup.sh. DESTRUCTIVE: replaces the current paired
# session - only useful if the current one is lost/corrupted, since restoring an OLD session that
# WhatsApp has since invalidated just forces a fresh re-pair anyway.
# Usage: ./scripts/restore-whatsapp.sh backups/whatsapp_auth_20260906_030000.tar.gz

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path-to-whatsapp-auth-backup.tar.gz>" >&2
  exit 1
fi

backup_file="$1"
if [ ! -f "$backup_file" ]; then
  echo "File not found: $backup_file" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

read -r -p "This will REPLACE the current WhatsApp session with $backup_file. Type 'yes' to continue: " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo "Stopping the app so nothing writes to the session while restoring..."
docker compose stop app

echo "Restoring WhatsApp auth session from $backup_file..."
docker compose run --rm --no-deps --entrypoint sh app -c "rm -rf /app/data/whatsapp/* && tar xzf - -C /app/data/whatsapp" <"$backup_file"

echo "Starting the app back up..."
docker compose start app
echo "Done."
