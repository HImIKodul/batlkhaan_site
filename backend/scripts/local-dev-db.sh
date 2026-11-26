#!/usr/bin/env bash
# LOCAL DEVELOPMENT ONLY. Creates ONE clean local database (default name mmri_dev_clean) inside the local PostgreSQL container, applies the committed Prisma migrations
# and installs + activates the five approved methodology bundles. It never drops, truncates or modifies any other database; if the target already exists it stops.
#   usage: backend/scripts/local-dev-db.sh [database_name]
#   env:   MMRI_LOCAL_PG_CONTAINER (default mmri-v3-local-postgres-1), MMRI_LOCAL_PG_PORT (default 55432)
# The database password is read from the container's own environment at run time; it is never printed and never written by this script.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${1:-mmri_dev_clean}"; C="${MMRI_LOCAL_PG_CONTAINER:-mmri-v3-local-postgres-1}"; PORT="${MMRI_LOCAL_PG_PORT:-55432}"
[[ "$DB" =~ ^mmri_dev_[a-z0-9_]+$ ]] || { echo "database name must match mmri_dev_[a-z0-9_]+" >&2; exit 2; }
PGUSER_="$(docker exec "$C" printenv POSTGRES_USER | tr -d '\n')"; PW="$(docker exec "$C" printenv POSTGRES_PASSWORD | tr -d '\n')"
exists="$(docker exec "$C" psql -U "$PGUSER_" -d postgres -Atc "select 1 from pg_database where datname='$DB'")"
[ -z "$exists" ] || { echo "Database $DB already exists: nothing was changed." >&2; exit 3; }
echo "[1/3] create database $DB"; docker exec "$C" psql -U "$PGUSER_" -d postgres -qc "create database $DB"
export DATABASE_URL="postgresql://${PGUSER_}:${PW}@127.0.0.1:${PORT}/${DB}?schema=public"
echo "[2/3] apply committed migrations"; npx prisma migrate deploy
echo "[3/3] install and activate the five methodology bundles"
MMRI_ENVIRONMENT=development MMRI_PROVISION_FIVE_DOMAINS_OK=YES MMRI_PROVISION_ACTIVATE=YES bash scripts/provision-five-domains.sh
echo "Done. Database: $DB (host 127.0.0.1:${PORT})"
