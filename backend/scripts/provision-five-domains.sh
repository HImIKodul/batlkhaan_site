#!/usr/bin/env bash
# Installs (and optionally activates) the five approved methodology bundles into the database named by DATABASE_URL.
# Idempotent: bundles are immutable and an identical re-import is a no-op. Never deletes or rewrites existing rows.
#   MMRI_PROVISION_FIVE_DOMAINS_OK=YES   required acknowledgement
#   MMRI_ENVIRONMENT=<name>              required (passed to the promoter)
#   MMRI_PROVISION_ACTIVATE=YES          also promote the five bundles to ACTIVE (production also needs MMRI_PRODUCTION_PROMOTION_OK=YES)
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ "${MMRI_PROVISION_FIVE_DOMAINS_OK:-}" = "YES" ] || { echo "Set MMRI_PROVISION_FIVE_DOMAINS_OK=YES to acknowledge the target database." >&2; exit 2; }
[ -n "${MMRI_ENVIRONMENT:-}" ] || { echo "MMRI_ENVIRONMENT is required." >&2; exit 2; }
[ -n "${DATABASE_URL:-}" ] || { echo "DATABASE_URL is required (export it; .env is not read implicitly by this script)." >&2; exit 2; }
echo "Target database: $(node -e 'const u=new URL(process.env.DATABASE_URL);console.log(u.hostname+":"+u.port+u.pathname)')"
echo "[1/4] Marketing 3.0.3"; npm run --silent db:import
echo "[2/4] People, Finance, IT, Operations"; bash scripts/import-five-domain-candidates.sh
echo "[3/4] Verify imported structure"; MMRI_EXPECT_DOMAIN_STATUS=ANY npx tsx src/verify-five-domain-provisioning.ts
if [ "${MMRI_PROVISION_ACTIVATE:-}" = "YES" ]; then
  echo "[4/4] Activate"; MMRI_FIVE_DOMAIN_PROMOTION_OK=YES npx tsx src/promote-five-domain-methodologies.ts
  MMRI_EXPECT_DOMAIN_STATUS=ACTIVE npx tsx src/verify-five-domain-provisioning.ts
else
  echo "[4/4] Activation skipped (set MMRI_PROVISION_ACTIVATE=YES)."
fi
