# Step 09/10 — CSS cleanup + regression protection

Date: 2026-10-29

## Scope

Code/CSS cleanup and regression protection only. No redesign and no changes to scoring, adaptive routing, question selection, findings/recommendations, payment amount/provider, database schema, report methodology, PDF page contract, or question-bank data.

## Cleanup completed

- Consolidated late CSS override fragments into their canonical component/page rules instead of leaving them as extra cascade layers.
- Removed redundant duplicate field-error styling from the shared forms layer.
- Consolidated the shared tag base rule.
- Folded homepage guide safe-area/overscroll behavior into the canonical guide overlay/panel rules.
- Folded Login brand/layout/selected-plan refinements into the canonical Login rules.
- Folded Billing modal safe-area, scroll containment and positioned-dialog behavior into the canonical modal rules.
- Folded Account/Profile late geometry refinements into their canonical selectors.
- Folded Report header, PDF button, history controls and document-surface refinements into their canonical desktop selectors while preserving responsive and print rules.
- Folded Priorities current/target score layout into its canonical selector and removed the late override patch.
- Active non-legacy page/component/design styles now have zero repeated top-level selectors. The only remaining duplicate-selector debt is isolated to the legacy global `styles.css` bridge and is frozen at a maximum of 43 selectors rather than allowed to grow.

## Regression protection added

Added `root-scripts/VERIFY_STEP09_CSS_REGRESSION.sh`, a dependency-free gate that checks:

- exactly 20 active CSS imports and no duplicates;
- every imported stylesheet exists;
- retired repair/release CSS layers are not re-imported;
- structural brace validity for every active stylesheet;
- zero duplicate top-level selectors outside `styles.css`;
- bounded legacy `styles.css` size and duplicate-selector budget;
- undefined custom properties are only the explicitly runtime-injected MMRI variables;
- no silent expansion of the runtime CSS-variable contract;
- `!important` cannot expand beyond the frozen per-file budgets;
- Step 9 canonical-rule consolidations remain in place.

## Validation

- Existing UI/design gate: **120/120 PASS**.
- New Step 9 CSS regression gate: **92/92 PASS**.
- Active page/component/design duplicate top-level selectors: **25 → 0**.
- Total active duplicate top-level selectors: **68 → 43**, all remaining in the bounded legacy `styles.css` bridge.
- No business logic or backend behavior changed.

## Next exact task

Step 10/10 — final freeze/package/acceptance. Run the real guarded install/build on a source machine with dependencies, run all static/regression gates, produce the final handoff archive and checksum, and freeze the package for the Claude continuation.
