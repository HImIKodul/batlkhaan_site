#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

need(){ command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 is required." >&2; exit 1; }; }
need node
need npm
need python3

NODE_VERSION="$(node -p 'process.versions.node')"
NPM_VERSION="$(npm -v)"
[[ "$NODE_VERSION" == 22.16.* ]] || { echo "ERROR: Node 22.16.x required by engine-strict. Current: v$NODE_VERSION" >&2; exit 1; }
[[ "$NPM_VERSION" == 10.9.* ]] || echo "WARNING: npm 10.9.x is recommended; current: $NPM_VERSION"

echo "[1/8] Source verification before dependency install"
./VERIFY_FINAL_20_OF_20_SOURCE.sh

echo "[2/8] Clean backend dependencies"
cd "$ROOT/backend"
rm -rf node_modules
npm ci --no-audit --no-fund

echo "[3/8] Backend production + strategy builds"
npm run build:prod
npm run strategy:typecheck
npm run engine:typecheck

echo "[4/8] Backend deterministic PDF regression"
npm run backend:step12:pdf:verify

echo "[5/8] Clean frontend dependencies"
cd "$ROOT/frontend"
rm -rf node_modules dist
npm ci --no-audit --no-fund

echo "[6/8] Frontend production build"
npm run build

echo "[7/8] Full source/runtime regression harness (connected DB/browser gate remains optional)"
cd "$ROOT"
bash VERIFY_STEP11_FULL_REGRESSION.sh

echo "[8/8] Final source verification after builds"
./VERIFY_FINAL_20_OF_20_SOURCE.sh

echo
echo "============================================================"
echo " MMRI FINAL 20/20 INSTALL + BUILD: PASS"
echo " Next: ./START_LOCAL.sh"
echo "============================================================"
