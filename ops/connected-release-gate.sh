#!/usr/bin/env bash
set -euo pipefail
[[ "${MMRI_CONNECTED_RELEASE_GATE:-NO}" == "YES" ]] || { echo 'Set MMRI_CONNECTED_RELEASE_GATE=YES only in the real production-like environment' >&2; exit 90; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
ENV_FILE="${MMRI_PRODUCTION_ENV_FILE:-deploy/.env.production}"; [[ -f "$ENV_FILE" ]] || exit 91
set -a; source "$ENV_FILE"; set +a
node ops/preflight.mjs
node ops/scan-secrets.mjs
node ops/verify-lockfiles.mjs
node ops/migration-chain.mjs --verify
bash backend/scripts/connected-production-db-gate.sh
BACKUP_SET="$(bash ops/backup-all.sh)"; bash ops/verify-backup-set.sh "$BACKUP_SET"
node ops/smoke-test.mjs
node ops/stability-check.mjs
node ops/create-release-manifest.mjs
echo 'CONNECTED PRODUCTION RELEASE GATE PASS'
