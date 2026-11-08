#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib-checksum.sh"
DEST="${BACKUP_DIR:-$REPO_ROOT/backups/postgres}"; mkdir -p "$DEST"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"; OUT="$DEST/mmri-$STAMP.dump"; TMP="$OUT.tmp"
umask 077
MIGRATION_CHAIN_SHA256="$(node "$SCRIPT_DIR/migration-chain.mjs")"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$TMP"
pg_restore --list "$TMP" >/dev/null
mv "$TMP" "$OUT"; write_sha256_sidecar "$OUT"
DB_SERVER_VERSION="$(psql "$DATABASE_URL" -Atqc 'SHOW server_version;' 2>/dev/null || printf 'unknown')"
cat > "$OUT.meta" <<META
created_at_utc=$STAMP
release_sha=${RELEASE_SHA:-unknown}
migration_chain_sha256=$MIGRATION_CHAIN_SHA256
database_server_version=$DB_SERVER_VERSION
artifact_type=postgres_custom_dump
META
chmod 600 "$OUT" "$OUT.sha256" "$OUT.meta"
printf '%s\n' "$OUT"
