# MMRI shared component system - R16.07

This directory now owns reusable interactive primitives. `components.css` is loaded after the transitional page stylesheet, and `UI.tsx` exposes the React API. New screens must use these primitives instead of adding another button/input/tab/menu/dialog implementation.

## Canonical primitives

- `Button`, `IconButton`
- `Card`
- `Pill`, `StatusBadge`
- `ProgressBar`, `SaveStatus`
- `Field`, `Input`, `Textarea`, `Select`, `Checkbox`
- `RadioGroup`
- `Tabs`
- `Menu`, `Popover`, `Dialog`, `Tooltip`
- `Table`

## Rules

1. Primary buttons use Signal Indigo and appear once per decision surface.
2. Secondary actions use `secondary` or `ghost`; destructive actions use `danger`.
3. Controls use the canonical 44px height; touch-critical controls may opt into `size="touch"`.
4. Fields keep visible labels. Placeholder text never substitutes for a label.
5. Status color is semantic only; status meaning must also be written in text.
6. Tabs use arrow-key, Home and End navigation.
7. Menus use menu/menuitem semantics, arrow-key navigation and Escape focus return.
8. Dialogs are modal, close with Escape, trap Tab focus while open, and return focus on close.
9. Native radio/input/select semantics are preserved rather than recreated with generic divs.
10. Shared component CSS contains no `!important`, raw font sizes, raw numeric font weights, or hard-coded color literals. Visual values resolve from `design/tokens.css`.
11. Page-specific layout may position a component, but must not redefine its shared color, typography, focus, disabled or semantic state language.
12. Legacy screen-specific `.btn`/input/tab overrides remain transitional and are removed when those screens are rebuilt in Steps 8–16 and 19.
