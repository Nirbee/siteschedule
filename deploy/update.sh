#!/bin/sh
# Pull the latest image, migrate the database and restart. Run in /opt/para.
set -eu
cd "$(dirname "$0")"

docker compose pull app bot
docker compose up -d postgres
docker compose run --rm --no-deps app node dist/scripts/migrate.cjs
docker compose up -d --remove-orphans
docker image prune -f >/dev/null

echo "Waiting for the app to become healthy..."
for i in $(seq 1 30); do
  if docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "OK: $(docker compose images app --format '{{.Tag}} {{.ID}}' 2>/dev/null | head -1)"
    exit 0
  fi
  sleep 2
done
echo "App is not healthy, see: docker compose logs app" >&2
exit 1
