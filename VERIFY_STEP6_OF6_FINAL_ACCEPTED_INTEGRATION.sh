#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$ROOT/backend/integration/step6_of6/VERIFY_STEP6_FINAL_ACCEPTED_INTEGRATION.py"
python3 -m json.tool "$ROOT/backend/methodology/businessmri-v2.4-runtime-bundles/manifest-step6of6-five-domain-accepted.json" >/dev/null
echo "STEP6/6 FINAL ACCEPTED INTEGRATION: PASS"
