# Final polish Step 7/10 — Global design-system consistency

Completed 2026-10-29.

## Purpose
Unify the already-improved pages under one durable green/white liquid-glass design contract. No business logic, scoring, payment behavior, report methodology, database schema, or question-bank data was changed.

## Changes
- Replaced the stale gray/purple `design/tokens.ts` mirror with the same green/white values used by `design/tokens.css`.
- Added one canonical five-domain palette to both CSS and TS:
  - Marketing `#FF3D8D` / ink `#C51F67`
  - IT `#00A6FF` / ink `#0076B8`
  - Finance `#FFD000` / ink `#9A7300`
  - People `#7C4DFF` / ink `#5B31D1`
  - Operations `#FF6A00` / ink `#C34D00`
- `areaReportPalette` now consumes `domainVisualTokens` instead of repeating hex values.
- Results domain CSS consumes the canonical `--mmri-domain-*` tokens rather than maintaining a second color table.
- Added shared control-material tokens for glass blur, hover background, hover border, control shadow, hover shadow and focus ring.
- Rebuilt shared button CSS around one geometry/material contract; removed duplicate primary-button definitions.
- Rebuilt shared form/tab CSS around the same control material and focus ring.
- Shell header/navigation/notification/account/mobile controls now consume the same shared blur/shadow/radius tokens.
- Checkbox, account choice controls, Results secondary glass surfaces and Report version controls now consume the same shared material tokens.
- Diagnosis and Report status ornaments now share a single `--mmri-status-square-size` (42px).
- Billing's large domain icon size is tokenized at 72px.
- Updated design README and canonical handoff documentation so future Claude work cannot legitimately reintroduce the retired purple/gray system.

## Regression protection
`VERIFY_UI_POLISH.sh` now additionally rejects:
- retired purple/navy token colors in active TS/TSX/CSS;
- drift between CSS/TS green-white foundation values;
- duplicated domain color tables in Results/report palette;
- buttons/forms/shell controls that stop using shared material tokens;
- inconsistent Diagnosis/Report status-square geometry;
- duplicated primary/secondary shared button definitions.

## Validation
- UI/design static gate: 108/108 PASS.
- TS/TSX parser validation: 37 files, 0 syntax errors.
- Active CSS structural validation: PASS through the static gate.
- Existing Step 1–6 contracts remain green.
