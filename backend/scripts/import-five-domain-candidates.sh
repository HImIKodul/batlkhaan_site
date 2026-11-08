#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# Active production domain methodologies (must equal the targets pinned in src/domain-methodology.ts). Marketing 3.0.3 is imported with `npm run db:import`.
D=methodology/businessmri-v2.6-runtime-bundles
for x in "4.1.7:$D/MMRI_HRMRI_Methodology_4.1.7_BUSINESSMRI_V2.json" "4.2.7:$D/MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json" "4.3.7:$D/MMRI_ISMRI_Methodology_4.3.7_BUSINESSMRI_V2.json" "4.4.7:$D/MMRI_OPMRI_Methodology_4.4.7_BUSINESSMRI_V2.json"; do
  v="${x%%:*}"; f="${x#*:}"
  MMRI_EXPECT_METHODOLOGY_VERSION="$v" npx tsx src/import-methodology.ts "$f"
done
