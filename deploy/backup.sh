#!/bin/sh
# Nightly backup: database dump + uploaded files, kept for 14 days. Run by cron as root.
set -eu
cd "$(dirname "$0")"
DEST=/var/backups/para
STAMP=$(date +%Y-%m-%d_%H%M)
mkdir -p "$DEST"

docker compose exec -T postgres pg_dump -U para -d para --format=custom > "$DEST/db-$STAMP.dump"
docker run --rm -v para_storage:/data:ro -v "$DEST":/backup alpine \
  tar -czf "/backup/storage-$STAMP.tar.gz" -C /data .

find "$DEST" -type f -mtime +14 -delete
echo "Backup done: $DEST/db-$STAMP.dump"
