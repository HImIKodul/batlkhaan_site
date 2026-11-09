#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
command -v docker >/dev/null || { echo "Docker is required"; exit 2; }
docker compose -f docker-compose.local.yml up -d postgres
cd backend
if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
npx prisma generate
npx prisma migrate deploy
npm run validate:bundle
MMRI_EXPECT_METHODOLOGY_VERSION=3.0.4 npx tsx src/import-methodology.ts methodology/MMRI_v3.0.4_QBANK_v3.1.4_FINAL_61440_REPAIRED.json
bash scripts/import-five-domain-candidates.sh
MMRI_FIVE_DOMAIN_PROMOTION_OK=YES MMRI_ENVIRONMENT=local npx tsx src/promote-five-domain-methodologies.ts
npm run build:prod
cd ../frontend
if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
npm run build
echo "STEP6 CONNECTED RELEASE GATE: PASS"
