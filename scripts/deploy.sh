#!/usr/bin/env bash
set -euo pipefail

# Pulls the latest committed code, backs up first (safety net in case the new build is bad),
# rebuilds the app image, restarts it, and waits for the healthcheck to go green. Meant to be run
# manually (locally or over SSH once on a VPS) - deliberately not wired to a webhook/CI trigger,
# so a deploy only ever happens when someone actually decides it should.
#
# Usage: ./scripts/deploy.sh

cd "$(dirname "$0")/.."

echo "== Pulling latest code =="
git pull --ff-only

echo "== Backing up before deploying =="
./scripts/backup.sh

echo "== Building the app image =="
docker compose build app

echo "== Restarting the app =="
docker compose up -d app

echo "== Waiting for the healthcheck =="
container_id=$(docker compose ps -q app)
for _ in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' "$container_id" 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    echo "Deploy successful - app container is healthy."
    exit 0
  fi
  if [ "$status" = "unhealthy" ]; then
    echo "Container reported unhealthy. Check logs: docker compose logs app" >&2
    exit 1
  fi
  sleep 2
done

echo "Container did not become healthy within 60s. Check logs: docker compose logs app" >&2
exit 1
