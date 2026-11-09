# MMRI canonical design foundation

`tokens.css` is the rendering authority for the BusinessMMRI green/white design system. `tokens.ts` mirrors the same values for TypeScript/SVG consumers. They must stay synchronized.

Use the canonical token families instead of introducing page-local visual systems:

- `--mmri-color-*` - green/white foundation and semantic states
- `--mmri-type-*` - typography scale
- `--mmri-space-*` - spacing rhythm
- `--mmri-radius-*` - geometry
- `--mmri-glass-*` - glass surfaces, blur and depth
- `--mmri-control-*` - shared control dimensions
- `--mmri-domain-*` - the five business-domain colors and accessible ink variants
- `--mmri-layout-*` / `--mmri-page-gutter` - shared page composition

Five domain colors are product semantics, not decoration. TS code must consume `domainVisualTokens` from `tokens.ts`; CSS must consume the matching `--mmri-domain-*` variables.

Shared buttons/forms/shell controls must use the control-material tokens (`--mmri-glass-control-*`, `--mmri-focus-ring`, `--mmri-radius-control`) instead of creating a new blur/shadow/radius recipe.

Compatibility aliases still exist for older live selectors in `styles.css`. Do not add new aliases. `styles.css` is compatibility debt and should shrink during cleanup work, never become the place for new page design.
