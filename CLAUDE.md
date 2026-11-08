# BusinessMMRI.mn — Claude Code working rules

Read `MMRI_DESIGN_SYSTEM_HANDOFF.md` and the latest section of `CLAUDE_PROGRESS.md` before changing UI code. Do not re-audit completed work unless a regression requires it.

## Context / token discipline
- Do not recursively read the repository.
- Ignore `node_modules`, `dist`, logs, archives, generated PDFs, database dumps, and large methodology/question-bank JSON files unless a specific bug requires one.
- Use search/grep first, then read only the relevant ranges/files.
- Do not print whole files into chat.
- Keep `CLAUDE_PROGRESS.md` current before compaction or switching tasks.

## Frozen product rules
- Customer-facing UI is Mongolian.
- Five domains only: Marketing, Information Technology, Finance, Human Resources, Production & Operations.
- Do not change scoring, capability/cell methodology, adaptive selection, payment policy, database schema, or question-bank data during visual work.
- Diagnosis and retake are each 300,000₮; retake preserves the old report.
- Results, Report and PDF must use the same backend-derived score/findings; frontend must not independently invent/rank findings.

## Canonical visual direction
Premium modern light glass, not flat and not the old navy theme:
- green + white foundation
- atmospheric soft green background
- translucent light surfaces with controlled backdrop blur
- thin semi-transparent borders, inner highlights, soft realistic shadows
- strong readable typography
- five domain colors only where meaningful
- stable geometry: no hover translate/scale/jump on domain icons or PDF control
- report reading paper stays solid/near-solid; actual PDF never uses glass
- no generic AI dashboard, neon, giant glow, excessive gradients, excessive blur, or stacked repair CSS

Exact homepage copy and detailed UI/PDF rules live in `MMRI_DESIGN_SYSTEM_HANDOFF.md`.

## CSS architecture
- Reuse `design/tokens.css`, `components/glass.css`, and existing page/component styles.
- `design/preferences.css` is the intentional final preference/accessibility layer and must remain the last CSS import.
- Prefer editing/removing obsolete rules over appending another override layer.
- Do not restore deleted `.bak` files or `pages/home.css`.

## Validation for UI batches
Run targeted checks while working. At meaningful milestones:
1. `./VERIFY_UI_POLISH.sh`
2. `cd frontend && npm run build`
3. visually check desktop and ~390px mobile when browser/runtime is available
4. update `CLAUDE_PROGRESS.md`
5. create a git checkpoint

For Report/PDF changes also run the existing targeted backend PDF/report regressions and verify a real generated PDF. Current PDF generator baseline: `MMRI-PDF-1.5-BUSINESS-REPORT`, exactly 3 A4 pages; executive conclusion target 80–160 words. Never weaken a regression merely to make it green; first determine whether the expectation is stale or production behavior is wrong.

## Safe workflow
Work one coherent surface/batch at a time. Preserve business behavior. If source differs from the latest checkpoint, inspect the diff before overwriting. Do not delete user data, reset PostgreSQL, change `.env`, or alter production credentials for a design task.
