#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
[[ -f BACKEND_STEP20_FINAL_FREEZE.md ]] || { echo 'Missing final handoff'; exit 1; }
grep -q '20/20 COMPLETE' BACKEND_20_STEP_PROGRESS.txt
grep -q 'Variable name: `OPENAI_API_KEY`' BACKEND_STEP20_FINAL_FREEZE.md
node ops/scan-secrets.mjs
bash ops/release-gate.sh
printf '%s\n' 'BACKEND STEP 20/20 FINAL SOURCE FREEZE: PASS'
