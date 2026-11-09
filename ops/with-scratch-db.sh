#!/usr/bin/env bash
# Runs a command with DATABASE_URL pointing at a DISPOSABLE scratch database on the local Postgres, never at backend/.env's database.
#   ops/with-scratch-db.sh <scratch_db_name> -- <command...>
# Guards: name must match ^mmri_(scratch|final|audit|pkg|live|restore)[a-z0-9_]*$ or ^mmri_codexfix_<suffix> (some legacy QA scripts demand 'codexfix'/'test' in the name; the exact name mmri_codexfix is protected); protected names are refused; host must be loopback;
# credentials are taken from MMRI_SCRATCH_BASE_URL (postgresql://user:pass@127.0.0.1:55432) or, if unset, derived once from backend/.env
# WITHOUT ever printing them; the scratch database is created if missing. A throwaway set of random secrets is exported for API processes.
set -euo pipefail
DB="${1:-}"; [ "${2:-}" = "--" ] || { echo "usage: $0 <scratch_db> -- <command...>" >&2; exit 2; }; shift 2
[[ "$DB" =~ ^mmri_(scratch|final|audit|pkg|live|restore)[a-z0-9_]*$ || "$DB" =~ ^mmri_codexfix_[a-z0-9_]+$ ]] || { echo "REFUSED: '$DB' is not a scratch database name" >&2; exit 3; }
case "$DB" in mmri|mmri_v2_qa|mmri_codexfix|mmri_design_test|postgres|template0|template1) echo "REFUSED: protected database" >&2; exit 3;; esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${MMRI_SCRATCH_BASE_URL:-}"
if [ -z "$BASE" ]; then BASE="$(grep -E '^DATABASE_URL' "$ROOT/backend/.env" | cut -d= -f2- | tr -d '"' | sed -E 's#/[^/]*$##')"; fi
HOSTPART="$(node -e 'const u=new URL(process.argv[1]);console.log(u.hostname+":"+u.port)' "$BASE/x")"
case "${HOSTPART%%:*}" in 127.0.0.1|localhost|::1) ;; *) echo "REFUSED: non-loopback host" >&2; exit 3;; esac
export DATABASE_URL="$BASE/$DB?schema=public" MMRI_ENVIRONMENT="${MMRI_ENVIRONMENT:-local}" NODE_ENV="${NODE_ENV:-development}"
r(){ head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
# Throwaway secrets are generated ONCE and reused so an API process, the admin CLI and test scripts agree (password hashes depend on the pepper).
SECRETS="${MMRI_SCRATCH_SECRETS_FILE:-$HOME/.mmri_scratch_secrets}"
if [ ! -f "$SECRETS" ]; then ( umask 077; printf 'ACCESS_TOKEN_SECRET=%s\nPASSWORD_PEPPER=%s\nAUDIT_HASH_SALT=%s\nMETRICS_TOKEN=%s\n' "$(r)$(r)" "$(r)$(r)" "$(r)$(r)" "$(r)$(r)" > "$SECRETS" ); fi
set -a; . "$SECRETS"; set +a
export MMRI_QA_SEED_LOCAL_DB="${HOSTPART}/${DB}" COOKIE_SECURE=false MMRI_BILLING_PROVIDER="${MMRI_BILLING_PROVIDER:-mock}" MMRI_AI_REPORT_PROVIDER="${MMRI_AI_REPORT_PROVIDER:-disabled}"
echo "[scratch] target database: ${HOSTPART}/${DB}" >&2
if command -v docker >/dev/null && docker ps --format '{{.Names}}' | grep -q '^mmri-v3-local-postgres-1$'; then
  U="$(node -e 'console.log(decodeURIComponent(new URL(process.argv[1]).username))' "$BASE/x")"
  docker exec mmri-v3-local-postgres-1 psql -U "$U" -d postgres -Atc "select 1 from pg_database where datname='$DB'" | grep -q 1 || docker exec mmri-v3-local-postgres-1 psql -U "$U" -d postgres -qc "create database $DB"
fi
exec "$@"
