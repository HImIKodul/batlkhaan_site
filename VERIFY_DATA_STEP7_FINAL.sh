#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$ROOT/backend/scripts/verify-step7-final.py"
find "$ROOT" -type f -name '*.sh' -print0 | xargs -0 -n1 bash -n
echo 'MMRI DATA STEP 7/7 STATIC PACKAGE VERIFICATION: PASS'
