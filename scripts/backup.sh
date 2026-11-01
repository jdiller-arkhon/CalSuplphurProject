#!/usr/bin/env bash
# Encrypted backup of the database and uploaded documents.
# Usage: DATABASE_URL=... FILE_STORAGE_DIR=... BACKUP_PASSPHRASE=... scripts/backup.sh /path/to/backups
# Restore: see docs/DEPLOYMENT.md → "Restoring".
set -euo pipefail
OUT="${1:?backup directory required}"
: "${DATABASE_URL:?}" "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE (store it outside this server)}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$WORK/db.dump"
tar -C "$(dirname "${FILE_STORAGE_DIR:-./storage}")" -czf "$WORK/storage.tgz" "$(basename "${FILE_STORAGE_DIR:-./storage}")" 2>/dev/null || tar -czf "$WORK/storage.tgz" -T /dev/null
tar -C "$WORK" -cf - db.dump storage.tgz | gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$OUT/csc-$STAMP.tar.gpg"
sha256sum "$OUT/csc-$STAMP.tar.gpg" > "$OUT/csc-$STAMP.tar.gpg.sha256"
# Keep the 30 most recent backups.
ls -1t "$OUT"/csc-*.tar.gpg 2>/dev/null | tail -n +31 | while read -r f; do rm -f "$f" "$f.sha256"; done
echo "Backup written: $OUT/csc-$STAMP.tar.gpg"
