#!/usr/bin/env bash
set -euo pipefail
: "${1:?usage: restore-backup-set.sh backup-set-directory}"
: "${RECOVERY_DATABASE_URL:?RECOVERY_DATABASE_URL is required}"
: "${RECOVERY_REPORT_STORAGE_DIR:?RECOVERY_REPORT_STORAGE_DIR is required}"
if [[ "${ALLOW_DESTRUCTIVE_RESTORE:-}" != "YES" ]]; then echo 'Set ALLOW_DESTRUCTIVE_RESTORE=YES for an isolated recovery drill' >&2; exit 80; fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SET_DIR="$1"
"$SCRIPT_DIR/verify-backup-set.sh" "$SET_DIR" >/dev/null
MANIFEST="$SET_DIR/BACKUP_SET.manifest"
get(){ awk -F= -v k="$1" '$1==k{sub(/^[^=]*=/,"");print;exit}' "$MANIFEST"; }
DB="$SET_DIR/$(get postgres_file)"; REPORT="$SET_DIR/$(get report_file)"
"$SCRIPT_DIR/restore-postgres.sh" "$DB"
"$SCRIPT_DIR/restore-report-storage.sh" "$REPORT"
printf 'backup set restored to isolated recovery targets: %s\n' "$SET_DIR"
