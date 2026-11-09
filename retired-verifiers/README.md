# Retired verifiers (kept for reference, not run)

These three scripts verified source files that no longer exist (`release-r1721-4-step07/08/11.css`, `BusinessRadar.tsx`) and could not
even start. Audit of what each covered and where that coverage lives now:

| Script | What it asserted | Verdict |
|---|---|---|
| STEP07_SETTINGS_DARK_MODE | Settings live-preview / restore-on-leave / save-only / dirty-guard for technical preferences, plus dark-mode CSS coverage for every screen | **Obsolete.** The technical-preferences panel (font, motion, contrast, density, dark theme) no longer exists in `Settings.tsx`, and the dark theme was removed by the White Prism migration. Nothing left to verify. |
| STEP08_RESPONSIVE_GLOBAL | Breakpoints (1180/900/620/short height/coarse pointer), safe areas, per-screen responsive contracts, brace balance | **Concept still valid, implementation gone.** Re-expressed against the current files in `VERIFY_FRONTEND_WHITE_PRISM.sh`, and exercised for real by the 7-viewport browser sweep (overflow, off-screen/clipped controls, hidden popup close buttons). |
| STEP11_RESPONSIVE_REPORT_PDF_INTERACTION | PDF has a 4th roadmap page; no visible "/100"; tappable roadmap card; old checkbox removed; radar tooltip rules | **Partly stale, partly still meaningful.** The "4th PDF page" assertion contradicts the frozen 3-page PDF contract and is now asserted the other way round. "/100", tappable roadmap card (now a native `<button aria-pressed>`), checkbox removal and radar removal are carried into `VERIFY_FRONTEND_WHITE_PRISM.sh`. |

Counts and strings were not edited to make these pass; the new script asserts the current product behaviour and is run on its own.
