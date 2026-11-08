#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
echo '[1/7] Secrets scan'; node ops/scan-secrets.mjs
echo '[2/7] Lockfile reproducibility'; node ops/verify-lockfiles.mjs
echo '[3/7] Migration chain'; node ops/migration-chain.mjs --verify
echo '[4/7] Step 17 production security'; (cd backend && node scripts/backend-step17-production-security-static.mjs && node scripts/backend-step17-production-security-regression.mjs)
echo '[5/7] Step 18 DB/recovery readiness'; (cd backend && node scripts/backend-step18-database-readiness-static.mjs && node scripts/backend-step18-backup-recovery-regression.mjs)
echo '[6/7] Step 19 operations readiness'; (cd backend && node scripts/backend-step19-production-operations-static.mjs && node scripts/backend-step19-production-operations-regression.mjs)
echo '[7/7] API route/static gate'; (cd backend && node scripts/api-static-check.mjs)
if [[ "${MMRI_CONNECTED_RELEASE_GATE:-NO}" == "YES" ]]; then exec bash ops/connected-release-gate.sh; fi
echo 'SOURCE RELEASE GATE PASS — connected production checks still required before GO.'
