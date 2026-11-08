#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib-checksum.sh
source "$SCRIPT_DIR/lib-checksum.sh"
ROOT="${BACKUP_SET_DIR:-$REPO_ROOT/backups/sets}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SET_DIR="$ROOT/mmri-backup-set-$STAMP-$$"
mkdir -p "$SET_DIR"; chmod 700 "$SET_DIR"
export BACKUP_DIR="$SET_DIR"
DB_FILE="$($SCRIPT_DIR/backup-postgres.sh)"
REPORT_FILE="$($SCRIPT_DIR/backup-report-storage.sh)"
MIGRATION_CHAIN_SHA256="$(node "$SCRIPT_DIR/migration-chain.mjs")"
DB_BASE="$(basename "$DB_FILE")"; REPORT_BASE="$(basename "$REPORT_FILE")"
DB_SHA="$(sha256sum "$DB_FILE" | awk '{print $1}')"; REPORT_SHA="$(sha256sum "$REPORT_FILE" | awk '{print $1}')"
cat > "$SET_DIR/BACKUP_SET.manifest" <<META
format=MMRI-BACKUP-SET-1.0
created_at_utc=$STAMP
release_sha=${RELEASE_SHA:-unknown}
migration_chain_sha256=$MIGRATION_CHAIN_SHA256
postgres_file=$DB_BASE
postgres_sha256=$DB_SHA
report_file=$REPORT_BASE
report_sha256=$REPORT_SHA
META
write_sha256_sidecar "$SET_DIR/BACKUP_SET.manifest"
chmod 600 "$SET_DIR/BACKUP_SET.manifest" "$SET_DIR/BACKUP_SET.manifest.sha256"
"$SCRIPT_DIR/verify-backup-set.sh" "$SET_DIR" >/dev/null
printf '%s\n' "$SET_DIR"
