#!/usr/bin/env bash
set -euo pipefail
: "${MMRI_DEPLOY_PRODUCTION:?set MMRI_DEPLOY_PRODUCTION=YES to deploy}"
[[ "$MMRI_DEPLOY_PRODUCTION" == "YES" ]] || { echo 'Refusing production deployment without MMRI_DEPLOY_PRODUCTION=YES' >&2; exit 90; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
ENV_FILE="${MMRI_PRODUCTION_ENV_FILE:-deploy/.env.production}"
[[ -f "$ENV_FILE" ]] || { echo "production env file not found: $ENV_FILE" >&2; exit 91; }
set -a; source "$ENV_FILE"; set +a
: "${RELEASE_SHA:?RELEASE_SHA is required}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f deploy/docker-compose.production.yml)
echo '[1/9] Source/security/preflight gates'
node ops/scan-secrets.mjs
node ops/verify-lockfiles.mjs
node ops/migration-chain.mjs --verify
node ops/preflight.mjs
node backend/scripts/backend-step19-production-operations-static.mjs

echo '[2/9] Coordinated pre-deploy backup'
BACKUP_SET="$(bash ops/backup-all.sh)"; bash ops/verify-backup-set.sh "$BACKUP_SET"
printf '%s\n' "$BACKUP_SET" > /tmp/mmri-last-predeploy-backup

echo '[3/9] Pull immutable images'
"${COMPOSE[@]}" pull migrate api web

echo '[4/9] Run one-shot migration/integrity gate'
"${COMPOSE[@]}" run --rm migrate

echo '[5/9] Start API only'
"${COMPOSE[@]}" up -d --no-deps api

echo '[6/9] Wait for API readiness'
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T api node -e "fetch('http://127.0.0.1:4000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then break; fi
  [[ "$i" == 30 ]] && { echo 'API did not become ready' >&2; exit 92; }
  sleep 2
done

echo '[7/9] Start web'
"${COMPOSE[@]}" up -d web

echo '[8/9] Smoke + stability checks'
node ops/smoke-test.mjs
node ops/stability-check.mjs

echo '[9/9] Write immutable release manifest'
node ops/create-release-manifest.mjs
"${COMPOSE[@]}" ps
echo "PRODUCTION DEPLOYMENT PASS — release $RELEASE_SHA"
