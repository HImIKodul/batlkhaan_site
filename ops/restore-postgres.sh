#!/usr/bin/env bash
set -euo pipefail
: "${1:?usage: restore-postgres.sh backup.dump}"
if [[ "${ALLOW_DESTRUCTIVE_RESTORE:-}" != "YES" ]]; then echo 'Refusing destructive restore: set ALLOW_DESTRUCTIVE_RESTORE=YES' >&2; exit 40; fi
TARGET_URL="${RECOVERY_DATABASE_URL:-}"
[[ -n "$TARGET_URL" ]] || { echo 'RECOVERY_DATABASE_URL is required; restore drills must target an isolated recovery database' >&2; exit 43; }
if [[ "${NODE_ENV:-}" == "production" && "${ALLOW_PRODUCTION_RESTORE:-}" != "YES" ]]; then echo 'Refusing restore while NODE_ENV=production without ALLOW_PRODUCTION_RESTORE=YES' >&2; exit 44; fi
FILE="$1"; [[ -f "$FILE" ]] || { echo 'backup not found' >&2; exit 41; }; [[ -f "$FILE.sha256" ]] || { echo 'checksum sidecar missing' >&2; exit 42; }
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-checksum.sh"
verify_sha256_sidecar "$FILE" || { echo "checksum mismatch" >&2; exit 45; }
pg_restore --list "$FILE" >/dev/null
pg_restore --dbname="$TARGET_URL" --clean --if-exists --no-owner --no-acl "$FILE"
printf 'restore completed into isolated recovery database from %s\n' "$FILE"
