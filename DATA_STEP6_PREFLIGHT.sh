#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "MMRI Data Step 6/7 preflight"
echo "Base runtime: R17.21.4 Step08"
echo "Marketing: keep existing methodology 3.0.0 / QBANK 3.1.0"
echo "HRMRI/FINMRI/ISMRI/OPMRI: new versioned domain methodologies required"
echo "Step 6 does not activate or migrate production."
"$ROOT/VERIFY_DATA_STEP6_BACKEND_INTEGRATION.sh"
