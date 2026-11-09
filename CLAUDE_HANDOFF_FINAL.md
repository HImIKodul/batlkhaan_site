# BusinessMMRI.mn — Final ChatGPT → Claude handoff

This is the completed ChatGPT 10/10 refinement checkpoint dated 2026-10-29. Treat this package as the new source baseline.

## Read first

Read `CLAUDE.md`, `MMRI_DESIGN_SYSTEM_HANDOFF.md`, the latest section of `CLAUDE_PROGRESS.md`, and `STEP_10_OF_10_FINAL_FREEZE_ACCEPTANCE.md`. Do not infer design rules from deleted legacy CSS or older release notes when they conflict with those files.

## Frozen rules

- Five domains only: Marketing, Information Technology, Finance, Human Resources, Production & Operations.
- Customer-facing product language is Mongolian.
- Base visual system: green + white premium light glass with the five canonical domain colors.
- Domain icons and the PDF control must remain geometrically stationary on hover.
- Report reading surface stays solid/near-solid; generated PDF does not use glass.
- Diagnosis and retake are each 300,000₮; retake keeps the previous report.
- Results, Report and PDF must stay grounded in the same backend-derived score/findings/action data.
- PDF generator contract is `MMRI-PDF-1.5-BUSINESS-REPORT`, exactly three A4 pages.
- Do not change scoring, capability/cell methodology, adaptive selection, question-bank data, payment policy, or DB schema while doing frontend/design work unless explicitly requested.

## CSS ownership

Active frontend source has exactly 20 imported CSS layers. `design/preferences.css` is the final preference/accessibility layer. Do not recreate `release-*`, `repair-*`, `liquid-*`, `experience.css`, `responsive.css`, `modern.css`, `motion.css`, `simplified.css`, or `pages/home.css`. Fix the owning canonical rule instead of appending another patch layer.

The legacy `styles.css` bridge is intentionally bounded. All non-legacy active page/component/design styles have zero repeated top-level selectors. Keep the Step 9 duplicate and `!important` budgets from expanding.

## Required gates after edits

At meaningful checkpoints run:

```bash
./VERIFY_UI_POLISH.sh
./VERIFY_STEP09_CSS_REGRESSION.sh
./VERIFY_STEP10_FINAL_FREEZE.sh --source-only
cd frontend && npm run build
```

For backend/report/PDF changes, also run the relevant backend regressions and then the complete release harness. Do not weaken a gate merely to make it pass; determine whether production code or the expectation is stale.

## Environment note

ChatGPT completed all dependency-free/static acceptance checks. npm registry access and Docker were unavailable in the ChatGPT container, so clean npm builds and connected PostgreSQL/provider gates must be run on the source machine. `SAFE_INSTALL_AND_RUN.sh` is the canonical guarded path for that.

## Next work

The 10-step ChatGPT polish sequence is complete. Continue only with new improvements/bugs requested by the user. Preserve the frozen behavior and visual system unless the user explicitly changes it.
