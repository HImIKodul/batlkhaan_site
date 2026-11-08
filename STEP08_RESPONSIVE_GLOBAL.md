# Step 08 / 10 — Responsive/global positioning and cross-device recomposition

This step is restricted to layout geometry, responsive recomposition, viewport safety, touch/focus behavior and browser/device consistency. It does not change diagnosis methodology, scoring, question content, payment business logic, report selection logic, AI conclusion logic, or the frozen 365-day plan.

## What changed

- Added one final responsive authority stylesheet loaded after Step 07.
- Normalized the application frame/gutters so the same hierarchy is preserved on large desktop, laptop, tablet and mobile widths.
- Kept the homepage inside one viewport while allowing the copy, radar and four guide controls to recompose at tablet/mobile sizes.
- Added height-aware homepage rules for short laptop/mobile screens so the radar and guide controls shrink deliberately instead of being clipped.
- Normalized header/menu/notification widths and safe-area behavior so panels stay inside the physical viewport.
- Reworked responsive diagnosis geometry: five columns on wide displays, three/two/one-column recomposition at narrower widths while keeping status squares anchored consistently.
- Normalized questionnaire reading width and action-button layout; Mongolian text is forced to word-based wrapping rather than character splitting.
- Normalized payment header/QR/content grids so price, QR and instructions do not force horizontal overflow.
- Kept report content centered and allowed category/date control rows to scroll horizontally when required rather than compressing or overlapping.
- Normalized settings/payment-history controls and footer actions for narrow screens.
- Added coarse-pointer/touch rules: minimum interactive target size and focus/tap equivalents for hover explanations.
- Added `svh`/safe-area handling for mobile browser chrome and notched devices.

## Viewport classes covered

The stylesheet has explicit recomposition for:

- wide desktop / high-resolution monitors;
- small desktop and laptops up to 1180 px;
- tablet / narrow laptop widths up to 900 px;
- phones up to 620 px;
- short-height screens below 700 px;
- coarse-pointer/touch devices;
- reduced-motion environments.

## Cross-device consistency contract

The layout does not depend on IP address, network origin, or a specific monitor. Public tunnel access and LAN access use the same CSS and component tree. Operating systems can rasterize fonts slightly differently, but component order, alignment, breakpoints, touch targets and interaction meaning are kept stable.

## Frozen areas

Step 08 does not modify the 365-day plan source or core plan CSS. `VERIFY_STEP01_FREEZE.sh` remains the authoritative guard for the plan/methodology baseline.
