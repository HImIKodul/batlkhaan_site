# R17.21.4 — Step 06/10: Report controls and score/target cleanup

Scope is limited to the report control surface and current→target score presentation.

## Changed
- PDF control moved to a stable right-side position while the organization name remains visually centered on desktop.
- PDF hover/focus no longer moves the button. It only changes border/background/outline emphasis.
- Report-domain selector icons are larger and easier to identify.
- Domain switching no longer uses keyframe expansion/slide effects; only a short geometry/state transition remains.
- Report content changes use a simple opacity fade, with no scale or slide distortion.
- Report dates are explicitly sorted chronologically from left to right.
- Critical-action score projection is compact and numeric: current score → delta → target score. Labels are available by hover/focus and accessibility text instead of occupying layout width.
- The overall current→target strip above the 365 roadmap uses the same compact numeric treatment and removes the oversized label geometry that caused overlap.
- Tooltips use the MMRI white/green surface rather than black backgrounds.
- Mobile/tablet breakpoints preserve the same hierarchy without geometry jumps.

## Explicitly not changed
- 365-day roadmap stages, wording, actions, completion behavior and print-plan structure.
- Question bank, answer values, scoring or routing.
- Payment/QPay behavior.
- Database schema/migrations.
- Step 02 homepage work.
- Step 03 answer-color interpolation.
- Step 04 finding selection.
- Step 05 AI-ready conclusion behavior.
