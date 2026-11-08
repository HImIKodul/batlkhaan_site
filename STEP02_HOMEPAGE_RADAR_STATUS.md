# Step 02/10 — Homepage radar and compact status cleanup

Scope is intentionally limited to the requested homepage radar/status presentation.

## Changed
- Radar category controls are icon-only with no square/tile background.
- Radar hover/focus no longer scales or jumps category icons, result points, or the center circle.
- Hover/focus simply reveals the existing description/score tooltip with a short opacity transition.
- Edge radar tooltips are aligned inward on narrow viewports to avoid clipping.
- Logged-in homepage radar now has one compact top-right status square: loading, no completed result, partial result count, or all five complete. Its meaning is shown only on hover/focus.
- Diagnosis status markers use the same compact square geometry in the card's top-right corner.
- Status marker hover/focus reveals the existing detailed status explanation without moving the marker.
- Legacy duplicate black pseudo-tooltip for diagnosis status is disabled; only the MMRI white/green tooltip remains.
- Mobile/tablet icon/status sizes are explicitly normalized.
- Touch and reduced-motion fallbacks are included.

## Not changed
- Question answer colors (Step 03).
- Scoring/routing/question-bank content.
- Report strengths/weaknesses, conclusion, controls or PDF.
- Settings/dark mode.
- 365-day plan.
- Payment logic/pricing/database schema.
