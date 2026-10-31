#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
D=methodology/businessmri-v2.5-runtime-bundles
for x in "4.1.5:$D/MMRI_HRMRI_Methodology_4.1.5_BUSINESSMRI_V2.json" "4.2.5:$D/MMRI_FINMRI_Methodology_4.2.5_BUSINESSMRI_V2.json" "4.3.5:$D/MMRI_ISMRI_Methodology_4.3.5_BUSINESSMRI_V2.json" "4.4.5:$D/MMRI_OPMRI_Methodology_4.4.5_BUSINESSMRI_V2.json"; do
  v="${x%%:*}"; f="${x#*:}"
  MMRI_EXPECT_METHODOLOGY_VERSION="$v" npx tsx src/import-methodology.ts "$f"
done
