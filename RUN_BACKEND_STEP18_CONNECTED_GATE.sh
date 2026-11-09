#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT/backend"
: "${DATABASE_URL:?Set least-privilege runtime DATABASE_URL}"
: "${MIGRATION_DATABASE_URL:?Set migration-owner MIGRATION_DATABASE_URL}"
export NODE_ENV=production
bash scripts/connected-production-db-gate.sh
