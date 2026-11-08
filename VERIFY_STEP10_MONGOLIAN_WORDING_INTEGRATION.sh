#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$ROOT/backend/integration/step10/VERIFY_STEP10_INTEGRATION.py"
bash -n "$ROOT/START_LOCAL.sh"
bash -n "$ROOT/backend/scripts/import-five-domain-candidates.sh"
echo "PASS: Step 10 Mongolian wording integration static gate"
