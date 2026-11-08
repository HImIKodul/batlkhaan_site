# BusinessMMRI.mn final visual / product QA checklist

Use this after applying the ChatGPT polish and again after major Claude batches.

## Global
- [ ] Desktop, tablet, and ~390px mobile: no horizontal overflow or hidden required controls.
- [ ] Green/white atmospheric background visible across customer pages; no old navy theme.
- [ ] Glass hierarchy is consistent, readable, and not used on every tiny element.
- [ ] Hover/focus never shifts major geometry; keyboard focus is visible.
- [ ] Reduced motion, high contrast, font size, density, and forest dark mode actually change the UI.
- [ ] Loading, empty, error, offline, disabled, success states are intentional and Mongolian.

## Homepage
- [ ] Exact frozen hero/subtext and all four guide labels.
- [ ] Radar has no fake fallback values; only completed domains form result geometry.
- [ ] Center average has no `/100`; axis lines do not cross the number.
- [ ] Five domain icons are large, stable, colored, and tappable.
- [ ] Guide modal blurs/dims the page, traps focus, closes with Escape, and fits without avoidable desktop inner scrolling.

## Diagnosis / questionnaire
- [ ] Domain cards centered, consistent, with notification-style top-right status square.
- [ ] Progress shows answered/total + percent accurately.
- [ ] 5-answer palette: green → green-yellow → yellow → yellow-red → red.
- [ ] 4-answer palette: green → green-yellow → yellow-red → red.
- [ ] In-progress questionnaire usable on mobile; no white-on-white or clipped answer labels.

## Results / Report
- [ ] Same overall score and same ordered 5 strengths/5 weaknesses across API, Results, Report, PDF.
- [ ] Actual capability names only; no fabricated findings or duplicates/overlap.
- [ ] No visible `/100`.
- [ ] 5 critical priorities and 12-month plan are readable and non-duplicated.
- [ ] Roadmap cards are tap-to-complete; completed card gets full green outline; no checkbox.
- [ ] Report reading surface stays solid/near-solid; control/navigation surfaces may use glass.

## PDF
- [ ] PDF button stationary and visually integrated; idle/busy/success/error states work; duplicate click guarded.
- [ ] Exactly 3 intentional A4 pages: summary, 5 priorities, 12-month/365-day plan; renderer fails if a fourth page is created.
- [ ] Noto Sans Mongolian rendering, no clipping/overlap/blank page.
- [ ] Five domain accent colors verified with real domain reports.
- [ ] Repeated render of identical source is deterministic.
- [ ] Download filename is clean and meaningful; downloaded blob has a valid PDF signature before save.
- [ ] Demo/browser print fallback hides the app shell and prints the same fixed three-page structure.

## Account / billing
- [ ] Login, Billing, Profile, Settings match the same glass system.
- [ ] Billing start, QR/pending, paid and success modal states visually checked.
- [ ] Payment/retake copy remains 300,000₮ and old report preservation is clear.
- [ ] Success modal receives keyboard focus and can be dismissed/accessed correctly.
- [ ] Profile onboarding/new-company flow checked, not just existing-profile editor.

## Source hygiene
- [ ] `./VERIFY_UI_POLISH.sh` passes.
- [ ] `npm run build` passes.
- [ ] No `.bak` source copies, old `home.css`, or new giant repair stylesheet.
- [ ] `styles.css` remains bounded and structurally valid.
- [ ] `CLAUDE_PROGRESS.md` updated and a git checkpoint created.

### Step 08 responsive/accessibility checks
- [ ] Keyboard-only: skip link, main nav, notifications, account menu, guide modal, Billing success modal, Report selectors.
- [ ] Escape closes modal/popover and returns focus to a sensible trigger.
- [ ] OS reduced-motion preference removes decorative motion.
- [ ] High-contrast/forced-colors mode retains visible boundaries and focus rings.
- [ ] 390px mobile: no hidden domain selectors; Report/history rows horizontally reachable.
- [ ] Safe-area devices: bottom nav and fixed modals do not collide with browser/notch/home-indicator areas.

### Step 09 CSS cleanup/regression checks
- [ ] `root-scripts/VERIFY_STEP09_CSS_REGRESSION.sh` passes.
- [ ] No active page/component/design stylesheet except legacy `styles.css` contains repeated top-level selectors.
- [ ] `styles.css` stays below the frozen size/duplicate-selector budgets; do not add a new repair/override stylesheet.
- [ ] Runtime CSS-variable allowlist does not expand without an explicit TSX/inline-style owner.
- [ ] `!important` counts do not exceed the frozen Step 9 per-file budgets.
- [ ] Retired `release-*`, `repair-*`, `liquid-*`, `experience.css`, `responsive.css`, `simplified.css`, `modern.css`, or `motion.css` layers are not re-imported.
