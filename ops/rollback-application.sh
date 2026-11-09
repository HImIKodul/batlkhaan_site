#!/usr/bin/env bash
set -euo pipefail
[[ "${MMRI_ROLLBACK_APPLICATION:-NO}" == "YES" ]] || { echo 'Refusing rollback without MMRI_ROLLBACK_APPLICATION=YES' >&2; exit 90; }
[[ "${MMRI_ROLLBACK_SCHEMA_COMPATIBLE:-NO}" == "YES" ]] || { echo 'Refusing application rollback until schema compatibility is explicitly confirmed with MMRI_ROLLBACK_SCHEMA_COMPATIBLE=YES' >&2; exit 91; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
ENV_FILE="${MMRI_PRODUCTION_ENV_FILE:-deploy/.env.production}"; [[ -f "$ENV_FILE" ]] || exit 92
set -a; source "$ENV_FILE"; set +a
: "${PREVIOUS_MMRI_API_IMAGE:?previous immutable API image required}"
: "${PREVIOUS_MMRI_WEB_IMAGE:?previous immutable web image required}"
[[ "$PREVIOUS_MMRI_API_IMAGE" =~ @sha256:[a-f0-9]{64}$ ]] || { echo 'previous API image must be immutable' >&2; exit 93; }
[[ "$PREVIOUS_MMRI_WEB_IMAGE" =~ @sha256:[a-f0-9]{64}$ ]] || { echo 'previous web image must be immutable' >&2; exit 94; }
BACKUP_SET="$(bash ops/backup-all.sh)"; bash ops/verify-backup-set.sh "$BACKUP_SET"
export MMRI_API_IMAGE="$PREVIOUS_MMRI_API_IMAGE" MMRI_WEB_IMAGE="$PREVIOUS_MMRI_WEB_IMAGE"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f deploy/docker-compose.production.yml)
"${COMPOSE[@]}" pull api web
"${COMPOSE[@]}" up -d --no-deps api
for i in $(seq 1 30); do "${COMPOSE[@]}" exec -T api node -e "fetch('http://127.0.0.1:4000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" && break; [[ "$i" == 30 ]] && exit 95; sleep 2; done
"${COMPOSE[@]}" up -d web
node ops/smoke-test.mjs
node ops/stability-check.mjs
echo 'APPLICATION ROLLBACK PASS. Database migrations were NOT reversed.'
