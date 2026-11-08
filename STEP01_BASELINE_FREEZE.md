# MMRI Improvement Batch — Step 01/10: Baseline Freeze

This step intentionally makes **no customer-facing UI or business-logic change**. It freezes the R17.21.3 runtime baseline before the requested correction batch.

## Frozen during Steps 02–10
- 365-day plan content, plan action wording, plan stage structure, completion behavior and print-plan structure.
- All question-bank/methodology source files.
- Scoring and calibration engine behavior.
- Prisma schema and migration history.
- Payment transaction logic and the 300,000₮ pricing contract.
- Canonical 64-capability dictionaries.

## Explicitly allowed in the remaining batch
1. Homepage radar/status layout, tooltips and restrained hover behavior.
2. Answer **presentation colors** only; no score/value/routing change.
3. Report 5 strengths + 5 weaknesses display, deterministic tie-breaking and removal of duplicated findings.
4. One improved conclusion/explanation layer, AI-ready with deterministic fallback.
5. Report target/control layout and fixed-position PDF-button hover treatment.
6. Settings live preview vs saved state and complete dark-mode coverage.
7. Cross-browser/device responsive normalization.
8. Background safety/edge-case handling only where required by the requested surfaces.
9. Final regression checks and packaging.

## Non-negotiable regression boundaries
- No redesign of the 365-day plan.
- No change to question text/answer values/scoring/routing.
- No new category palette or decorative color system.
- No pricing/payment-flow change.
- No schema/migration change.
- No unrelated navigation or product-flow change.

`STEP01_FROZEN_BASELINE.json` contains SHA-256 fingerprints of frozen full files/directories plus targeted source fragments for the 365-day plan. `VERIFY_STEP01_FREEZE.sh` can be run after each later step to catch accidental edits.
