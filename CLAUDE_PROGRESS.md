# CANONICAL FINAL VISUAL SPECIFICATION (user, authoritative — supersedes every earlier design rule below)
Modern, premium, glass-like, visually rich (polished iOS/macOS feel) on BusinessMMRI green + white. ONE shared system: tokens in `design/tokens.css` (`--mmri-glass-*`, `--mmri-canvas-wash`, `--mmri-glass-bg-overlay`), utilities `components/glass.css`, controls `components/forms.css` + `components/buttons.css`. Never add override layers; edit/replace the owning rule.
- BACKGROUND: never plain white. `html{background:var(--mmri-canvas-wash)}` = soft blurred green forms + light green gradient; body/.mmri-shell/.mmri-home2 transparent. No navy/dark.
- GLASS HIERARCHY: major containers = soft glass (`--mmri-glass-bg`, blur 18px); important controls = stronger (`--mmri-glass-control-bg`, gradient green primary buttons with inset highlight); popups/menus = `--mmri-glass-bg-overlay` + strong blur; report reading sheet = near-solid (.94). Thin translucent border + outline edge, inner highlight, soft shadow. Not every small element is a card.
- ICONS: large, consistent line icons. Domain colours (only these five, strong): marketing #FF3D8D, it #00A6FF, finance #FFD000, people #7C4DFF, operations #FF6A00 (text uses `ink` variant, finance #B88B00). Domain colour is never used for status; status = green/amber/red. Icons never move/scale on hover (only ring/glow/background).
- HOME RADAR: five 88px glass icon tiles with domain-colour ring + always-visible colour-ink name pill (Мэдээллийн технологи / Маркетинг / Санхүү / Хүний нөөц / Үйл ажиллагаа); only completed domains form the polygon; centre average = 64px number, no box, no /100, hover text "дундаж оноо"; geometry fixed. Mobile: 56px tiles, 11px labels, 44px number.
- HOME GUIDE CONTROLS: four large glass tiles (28px radius, 64px green squircle icon, 17px title), hover = depth/highlight only. Labels fixed: BusinessMMRI.mn гэж юу вэ? / Оношилгоо яаж хийлгэх вэ? / Оношилгооны үр дүн юу вэ? / Төлбөр хэрвээ… (short label "Төлбөр, бүртгэл хэрхэн хийх вэ?").
- MODALS: scrim `rgba(10,46,33,.38)` + `backdrop-filter:blur(14px)`; panel 32px radius, .88 glass + strong blur; 52px round close with 28px X; opacity-only fade (`mmri-fade`, disabled for reduced motion); desktop 1366x720 shows no inner scrollbar for all 4 guides (payment guide uses 2-column steps).
- MOTION: opacity/highlight/shadow only. No translate/scale/bounce/float; spinner only for loading.
- PDF BUTTON (`.report-top-download`): fixed 200x44 glass-green, download icon; states idle / busy (spinning icon, disabled, aria-busy) / done ("PDF татагдлаа", green, 3 s) / failed ("Дахин оролдох", red + alert). One request per click burst (ref lock). File name MMRI_<Company>_<Area>_<MM-DD-YYYY>.pdf.
- GENERATED PDF: no glass. Clean A4, 3 pages (summary / 5 priorities / 12-month plan, full-width horizon blocks), Noto Sans embedded, deterministic (fixed dates). Domain colour (fill/stroke/eyebrow/score ring via `set_domain`) comes from `render.domainCode` written OUTSIDE the hashed source (so stored artifacts stay valid); strengths stay green, weaknesses red. Generator version 1.4.
- MOBILE: same identity at 390px, nothing removed, no horizontal overflow, modals usable.
- QA: audit harness covers 10 routes x 1366/820/390 (no overflow / small / clipped / dark boxes; keyboard focus rings visible).

# CLAUDE_PROGRESS (MMRI frontend redesign)

## Design rules
- Customer UI Mongolian. Base = green + white (tokens in `frontend/src/design/tokens.css`, `--mmri-color-*`).
- 5 domain colours only (`areaReportPalette` in `data/reportExperience.ts`): marketing #FF3D8D, it #00A6FF, finance #FFD000, people #7C4DFF, operations #FF6A00.
- SUPERSEDED by DESIGN DIRECTION UPDATE below (flat/no-glass rule is void).
- DESIGN DIRECTION UPDATE (user, latest, authoritative): modern premium liquid-glass UI on a green+white foundation. Translucent light surfaces, controlled backdrop blur, subtle inner highlights, thin semi-transparent borders, soft realistic shadows, crisp high-contrast text, polished restrained interaction states, 5 strong domain colours, clean modern icons, premium app-like (not admin-dashboard).
  - Hierarchy: primary containers = refined glass; important controls = stronger glass; report/document reading areas stay more solid; backgrounds clean; text contrast always strong.
  - AVOID: dark/navy glass, giant glowing gradients, over-transparency, everything-a-rounded-card, neon, heavy blur, heavy animation, stacked override CSS layers, generic AI dashboard look.
  - Apply to all remaining pages AND revisit earlier pages (home, diagnosis, questionnaire, results, report, buttons, shell) in the final global design pass. Business logic/data unchanged.
- Preserve business logic, scoring, payments, question bank. Do NOT add override layers: strip old rules, write clean CSS.
- Radar: avg score has no /100, only completed domains form polygon, icons do not move on hover.

## Root problem found
`main.tsx` imports ~55 stacked CSS files (1.28 MB: release-r1721-*, design/liquid-*, design/repair-*) that fight each other; the "liquid" layers force a navy glass theme globally (body bg, glass cards) – for non-home pages too.
Backup of original CSS: scratchpad `css_backup_orig.tgz` (may be gone; no git history – dir is untracked).

## Tooling
- `frontend/scripts/strip-css.cjs "<regex>"` removes every matching selector from all `src/**/*.css` (postcss). Run from `frontend/`.
- Build: `cd frontend && npm run build` (tsc + vite). Preview: `npx vite preview --port 4173`.
- Screenshots: `google-chrome --headless=new --no-sandbox --disable-gpu --virtual-time-budget=4000 --window-size=1366,900 --screenshot=<abs path> http://localhost:4173/` (hash routes, e.g. `/#/analysis`).

## Files changed
- Stripped from all old CSS: `mmri-home2|mmri-guide2|business-radar|mmri-modal-open` and `mmri-shell|mmri-brand|mmri-primary-nav|mmri-notification|mmri-account|mmri-public|mmri-bottom-nav|mmri-skip-link|mmri-offline|app-shell`.
- NEW clean: `src/components/shell.css`, `src/components/radar.css`, `src/pages/landing.css` (imported in main.tsx after pages/home.css).
- `src/pages/Landing.tsx`: hero text, lead paragraph, removed liquid/glow spans, guide tiles (icon + title + arrow).

## Completed
- Homepage (desktop + 390px mobile), shell header/nav/notifications/account menu/bottom nav, radar, 4 guide controls + dialog CSS. Build passes.

- Diagnosis hub: stripped `diagnosis-(square|status|domain|pay)` selectors, new clean `pages/diagnosis.css`; `DiagnosisHub.tsx` now shows "answered/total · %" line (`.diagnosis-square__meta`). Build passes. NOT yet visually verified (needs logged-in session; backend on :4000, dev server :5173; no credentials known).

- Git: repo initialised in project root; checkpoint commit 36d9ff7 "checkpoint: homepage and diagnosis redesign pass 1". .gitignore excludes node_modules/dist/logs/pdf/zip/db/.env and backend/methodology + backend/integration (1.3 GB datasets – NOT in git).
- Diagnosis batch (verified with real demo login demo@mmri.mn at 1366px and 390px, no horizontal overflow):
  - `pages/diagnosis.css` hub: heading added, titles top-aligned, status square top-right, "answered/total · %" line, mobile single column.
  - Shared Button restyled flat green: new `components/buttons.css` (old `.mmri-button*` and `.btn*` rules stripped everywhere – affects ALL pages).
  - Questionnaire (`AssessmentInline`, shown at `#/questions`): old `mmri-questionnaire|mmri-radio|mmri-progress|mmri-save-status|mmri-badge|progress-(track|fill|wrap)` rules stripped; clean `pages/questionnaire.css`; answers use `--answer-color/--answer-soft` from `data/answerTone.ts` (green→yellow→red); progress shows `answered/total · %`.

## Test harness notes
- `scratchpad/shot.mjs <w> <h> <hash> <out.png> [full]` – CDP script: logs in as demo, navigates, optional env CLICK/EVAL/BODY. Uses dev server :5173 (proxies /api to :4000). Fixed writer id `FIXEDWRITER-harness-1`; backend assessment writer lease is 120 s, so a different writer id gets 409 "another active writer" until it expires (not an app bug).

- Results + Report batch (verified demo login, 1366px + 390px, no horizontal overflow):
  - Results (terminal view, `Results.tsx` TerminalResults): stripped `.result-*` rules, new `pages/results.css`; green/white, score without /100 (also removed "0–100" wording). Terminal view only reachable once an assessment is complete; to preview use harness env PRE="localStorage.setItem('mmri.assessmentId.<companyId>','<completedId>')" (demo marketing completed id cmvo350gh0ff4gacr1ku6iyap).
  - Report (`Report.tsx` PageOne/PageThree/FindingColumn/ScoreCircle simplified; `pages/report.css` rewritten): sheet layout 01/02/03, score panel (no /100), 5 strengths | 5 weaknesses with actual capability names, 5 priorities (now→target), roadmap stage cards tap-to-complete (green full outline when done, no checkbox, state text), PDF button fixed 200x44 in header, domain-tab status badge on top-right corner. Stripped all screen `.report-*` rules with `KEEP_PRINT=1 node scripts/strip-css.cjs` (leaves @media print + `.pdf-*` + `.report-print-*` intact).
  - PDF: backend PDF generated via API (200, 5 pages, valid, Mongolian). Not modified. Observed: its page 3 strengths/weaknesses tables are empty ("Мэдээлэл алга") for the seeded demo assessment; Results page also shows no confirmed strengths for it, while the Report screen derives 5/5 from capability scores. Likely seed-data/payload issue, not investigated.
  - Known data quirk: Results module detail shows "0 дэд чиглэл" for the seeded assessment (capabilities list empty in payload).

- Results/Report data consistency (classification E, multiple causes; production-impacting):
  1. Policy gap: strengths/weaknesses required coverage>=0.7 & confidence>=0.8. A QUICK assessment (~3 answers/capability, coverage 0.14, conf 0.28 – the demo seed mirrors normal QUICK burden) never meets it -> backend Results + payload + PDF gave 0 strengths/weaknesses. Fix: `diagnosis/result.ts` and `report/payload.ts` keep strict (VALIDATED) findings first, then complete to 5 from the actual capability scores (top for strengths, bottom for weaknesses, no overlap), each flagged `basis:"RELATIVE_RANK"`. No scoring change. Types: `basis?` on DiagnosisStrength/Weakness (+ report StrengthFinding/WeaknessFinding, frontend api/types.ts).
  2. Frontend mapping: Report screen ranked capabilities itself (ties broken differently from backend). `Report.tsx` now binds positives/flaws to `payload.strengths/weaknesses` when 5 exist (fallback to local ranking otherwise). `Results.tsx` shows capability strengths/weaknesses with honest headings ("Хамгийн өндөр/бага оноотой чадавх … нотолгоо урьдчилсан" when RELATIVE_RANK) and raw capability names.
  3. Latent backend bug: `services/traceability-service.ts` never added weakness nodes to the trace graph, so PDF/report generation failed gate T09 (500) whenever a payload had weaknesses with `weakness:` claim traces. Added weaknessNodes.
  4. Demo seed rot (demo-only): `seed-demo-company.ts` used planCode DIAGNOSTIC for all 3 runs (engine now requires RETAKE after a completed assessment) -> RETAKE for runs 2-3; `materializeDemoTerminalAssessment` (demo-only, prod-disabled) wrote resumeState JSON-null -> Prisma.DbNull (DB lifecycle trigger). Demo company re-seeded (3 completed Marketing assessments 46.7/66.7/81.7; my UI-test in-progress assessment deleted).
  - Verified on latest completed Marketing assessment (id in scratchpad aid): score 81.7/82 identical in Results, Report, payload, PDF; same 5 strengths and 5 weaknesses (actual capability names) in API results, report payload, Results page, Report page and PDF (5 pages, 200).
  - Tests: task07-score-findings-regression, step7-diagnosis-result-smoke, backend-step07-findings-integrity-static, backend-step12-report-pdf-static pass. task08-report-contract-regression fails identically on the pre-change code ("Recommendation REC1 is missing affected scope") – pre-existing, unrelated.
  - Backend dev server must be restarted after backend edits (`cd backend && npx tsx src/api/server.ts`; do not use `pkill -f` patterns that match your own shell).

- FINAL validation pass (checkpoint "final results report consistency validation"):
  - IMPORTANT: backend regression scripts import compiled `backend/dist` and `backend/dist-strategy` (gitignored). Rebuild before testing: `cd backend && npx tsc -p tsconfig.production.json && npx tsc -p tsconfig.strategy.json`. Earlier "pass" results in the previous batch ran on stale builds; all re-run now on fresh builds.
  - New `backend/scripts/findings-fallback-regression.mjs` (105 checks; low/medium/high/mixed/ties synthetic evidence): overall score preserved, 5/5 findings, real capabilities+scores, no duplicates, no overlap, validated-first then true highest/lowest remaining scores, basis flags correct, result.ts == payload.ts order. PASS.
  - task08-report-contract-regression: STALE FIXTURE, not a product bug. Production recommendations (`strategy/recommendations.ts`) always set `affectedScopes` and `root:<findingId>`/`recommendation:<id>` source traces, and payload version is 1.3 (static test confirms). Fixture lacked affectedScopes + root trace and expected payload v1.2. Fixture updated (no assertion weakened). `step7` smoke strength check updated to "VALIDATED items meet thresholds; others flagged RELATIVE_RANK". `task08-live-report-verifier.mjs` still expects v1.2 (not run; stale).
  - Customer wording rule (identical on Results, Report, PDF): findings that are RELATIVE_RANK get the tag "· урьдчилсан" and, if any, one note: "Урьдчилсан гэж тэмдэглэсэн чадавхыг одоогийн хариултын бодит оноогоор эрэмбэлсэн бөгөөд нэмэлт нотолгоо бүрдэх тусам баталгаажна." Validated findings are never tagged. Overall score is labelled "Урьдчилсан" for quick estimates (Results header, PDF tile). No technical terms (coverage/confidence/RELATIVE_RANK/Итгэлцэл/Хамрах хүрээ) shown.
  - Frontend no longer ranks findings itself: Report.tsx reads payload.strengths/weaknesses (+ narrative text by trace id); Results.tsx uses data.strengths/data.weaknesses for lists AND executive-summary facts (removed cell-level/local fallback). Old frozen payloads without findings show "Мэдээлэл бүрдээгүй байна".
  - PDF (`pdf_renderer/render_report_pdf.py`, `report/pdf-artifact.ts`): was 5 pages because page 1 overflowed (hero conclusion box tall + compact lists + "first attention" block + warnings) leaving page 2 almost empty, plus a duplicate detailed 5+5 page and duplicate "first attention" list. Now 3 pages: (1) title, score + type tile, conclusion, 5 strengths | 5 weaknesses (compact, with prelim tag/note) + required warnings; (2) 02 · Нэн тэргүүний 5 ажил; (3) 03 · 12 сарын 365 хоногийн төлөвлөгөө. Removed technical tiles (Итгэлцэл, Хамрах хүрээ). `basis` added to PDF source only when present (keeps old stored artifacts' source hash valid). Stored PDF artifacts are immutable: reports generated before this change keep their old layout; demo artifact was deleted & regenerated.
  - Cross-surface script (ad hoc) verified for assessment in scratchpad/aid: score 82, identical 5/5 names+order across API results, report payload, Results DOM, Report DOM, PDF columns; notes identical; no "/100".

## Remaining (superseded: see Global pass below)
3. Open homepage guide dialog + logged-in homepage and verify visually.
4. `task08-live-report-verifier.mjs` expects payload v1.2 (stale, needs live DB; not run).
5. PDF plan page content is generic "evidence gathering" actions for low-evidence demo data (data, not layout).

## Exact next task
Await user instruction (Billing/Profile/Settings/Login restyle or old-layer cleanup).

## Plan after design update
1. Add glass tokens (surface/strong surface/border/highlight/shadow/blur) to `design/tokens.css` once, reused by all clean CSS.
2. Restyle remaining pages (Login, Billing, Settings, Profile, Priorities, states) with them.
3. Global pass over earlier pages (flat -> refined glass; Report sheet stays solid), then delete old layers.

## Glass foundation + Login (done)
- Tokens: `--mmri-glass-*` + `--mmri-canvas-wash` in `design/tokens.css`. Utilities `components/glass.css` (`.mmri-glass`, `--strong`; solid fallback for no-backdrop / reduced-transparency).
- `components/forms.css` (NEW, shared): `.mmri-field/.mmri-input/.mmri-textarea/.mmri-select/.mmri-tabs` glass styling. Old rules for those stripped everywhere (strip-css regex `mmri-(input|textarea|select|field|tabs)`). CAUTION: strip-css hits new files too — write new CSS AFTER stripping.
- Primary button now glossy green (appended to `components/buttons.css`).
- Login: `pages/login.css`, classes `auth*` (old `experience-login*` stripped, decorative motion span removed from Login.tsx). Verified 1366 + 390, no overflow. Removed navy `html` bg in liquid-final-v5 and `!important` label colours in liquid-app-ui-v3 (old layer still scheduled for deletion).
- Login submit flow not exercised in browser this pass (markup/logic unchanged).
## Exact next task
Billing, then Settings/Profile/Priorities/States, then global glass pass on earlier pages, then delete old layers.

## Billing + Profile + Settings (glass, done)
- Old rules stripped for `billing-domain|billing-payment|billing-success|account-payment|payment-history|technical-settings|company-detail-editor|profile-(company|login|onboarding|question|setup)|mmri-choice-select|font-preview` (618 selectors). No TSX/logic changes.
- NEW `pages/billing.css` (rewritten, accent via `--billing-accent`), NEW `pages/account.css` (Settings, payment history, company editor, onboarding, ChoiceSelect/shared dropdown glass menu). Imported in main.tsx.
- Verified with demo login at 1366 + 390: billing (pending invoice), settings technical, settings payments, profile editor; no horizontal overflow (scrollW==clientW). `tsc + vite build` pass.
- NOT visually verified: Profile onboarding (company-create + question card + setup preview; needs new company) and Billing start/paid/success-modal states. CSS is written for them.
- Known: `.page-container` ignores my `max-width:960px` on these pages (pages are full 1280 wide); harmless, fix in the global pass. Settings checkboxes are still default browser look.
## Exact next task
Priorities + States/loading/support alerts, then global glass pass on earlier pages, then delete old layers.

## Global visual consistency pass (done)
- DELETED all old override layers (git rm): modern, responsive, motion, simplified, experience, release-r1721*, functional-task09-pdf, design/liquid-*, design/homepage-liquid-v2, design/repair-*. main.tsx now imports only: tokens, styles, components, visualizations, home, buttons, shell, radar, glass, forms, landing, login, results, diagnosis, billing, account, questionnaire, report, support. No stacked overrides remain.
- Page ground: `html{background:var(--mmri-canvas-wash)}` (shell.css); body/.mmri-shell transparent; removed `body{background:...!important}` from styles.css. `body{overflow-x:clip}`.
- Glass applied in-place to the clean rules (no new layer) via one-off postcss script: shell header (bar glass), notification/account menus (strong), bottom nav, bell/account triggers (control), home guide tiles + guide dialog, diagnosis domain cards (keep domain-colour border), results panels/tables/facts/evidence, questionnaire panels, report gate. Report reading sheet = near-solid white (.94) with soft shadow; domain colours stay on borders/icons only.
- Radar tooltip now `display:none` until hover (it caused 6px horizontal overflow at 390).
- Verified (demo login, dev server) at 1366 + 390: home, diagnosis, results, report, priorities, billing, profile, settings; scrollW==clientW everywhere. Login verified on preview build. `tsc --noEmit && vite build` pass.
- NOT verified: guide dialog open state, questionnaire in-progress screen, Priorities with real data (only empty state seen), Profile onboarding, Billing start/paid/modal, report print/PDF-from-browser (old print CSS lived in deleted experience.css/repair-06; backend PDF unaffected).
- Known leftovers: `styles.css` is still 200 KB of legacy rules (all green, no navy) – prune unused selectors next; `support.css`/`home.css`/`components.css`/`visualizations.css` not yet audited for flat white surfaces; `.page-container` ignores the 960px max-width set on Settings/Billing/Profile; Settings checkboxes default look.
## Exact next task
Await instruction (suggested: prune styles.css, audit remaining unverified states, Priorities + States restyle).

## Final Report/PDF pass (done)
- PDF button (`.report-top-download`, report.css): glossy green glass control, fixed 200x44, `transform:none`; verified via CDP at 1366: idle/hover/pressed/busy/after/error all x=1119,y=121,w=200,h=44. States: "PDF татах" -> "PDF бэлтгэж байна…" (disabled, aria-busy, icon spins) -> back; error shows server message in `.mmri-support-alert` and button re-enables.
- Duplicate downloads: added `pdfLock` ref in `Report.tsx printPdf` (state-only guard could race). 3 rapid clicks => exactly 1 `/report/pdf` request.
- Download filename: `pdfDownloadName(model, fallback)` -> `MMRI_<Company>_<Area>_<MM-DD-YYYY>.pdf` (spaces->_, illegal chars stripped); backend header name `MMRI-<assessmentId>.pdf` is only the fallback. Not browser-save-dialog tested (headless).
- Renderer: roadmap page was a 2-column grid with uneven blocks + a lone third card and 6.5pt facts. Now one full-width block per horizon (90 days / 6 months / 12 months) with body-size facts. `MMRI_PDF_GENERATOR_VERSION` bumped to 1.3 (ts, py, regression script) so stored 1.1/1.2 artifacts auto-regenerate on next request (old artifacts keep old layout until requested).
- Verified on assessment cmvr1fi3j0ff4gaatc8vzx8mr (backend restarted after tsc rebuild): 3 pages A4, Noto Sans Regular/Bold embedded (Mongolian renders; pdftotext correct), no blank page, no clipping, fixed CreationDate => two downloads byte-identical (sha 4161df07…), content hash stable across regeneration; Results==payload strengths/weaknesses (names+order), all 5+5 and 5 priority titles present in PDF text, score 81.666685 in results/payload, tile 82 in PDF and Report.
- Tests (fresh dist builds): backend-step12-report-pdf-regression PASS(9), backend-step12-report-pdf-static PASS(17/17), findings-fallback-regression 105/105, task08-report-contract-regression PASS. `tsc --noEmit && vite build` pass.
- Known/not changed: narrative paragraph says "81.7 оноо" while score tiles show 82 (frozen narrative text; same on Report and PDF, Results header shows 82). Report screen dates are MM/DD/YYYY, PDF footer is YYYY.MM.DD. Neither is a data mismatch but both are cosmetic inconsistencies worth unifying. Browser print path (test/demo businesses only, window.print) not re-checked; its print CSS was in deleted layers except report.css `@media print`.
## Exact next task
Await instruction.

## Final QA (done)
- Audit harness (scratchpad `audit.mjs`/`tab.mjs`, CDP, demo login): 10 routes x 3 widths (1366 / 820 / 390): no horizontal scroll, no overflowing elements, no tiny (<30px) controls, no clipped labels/headings, no dark boxes. Keyboard Tab-through on 7 routes at 1366: every focused control shows a visible ring.
- Fixed: (1) mobile notification panel was clipped off the left edge -> fixed full-width sheet under 767px; (2) account menu / guide dialog / success modal too translucent -> new token `--mmri-glass-bg-overlay` (.95) for overlays; (3) duplicated glass declarations in shell.css/landing.css cleaned; (4) global zero-specificity `:focus-visible` baseline in glass.css (shell nav/bell/account had no visible ring); (5) hidden root cause of flat inner pages: `body{background:canvas!important}` + mobile body backgrounds + old `html{background:var(--bg)}` in styles.css removed (print rules kept) so the green wash now shows on every page.
- No hover transforms on content (only the tooltip entrance); no decorative animation besides spinner/skeleton.
- Smoke: `tsc --noEmit && vite build` pass; backend step7-diagnosis-result-smoke, task07-score-findings-regression, findings-fallback-regression (105/105), step12 PDF regression + static, task08 report contract all pass (fresh dist). No scoring, DB schema, payment logic or question-bank changes.
- Not covered / known: questionnaire in-progress screen, Profile onboarding, Billing start/paid states, Priorities with real plan data (no suitable demo state without mutating data); `styles.css` still ~200 KB legacy rules (green, harmless but unpruned); `.page-container` max-width not applied on Settings/Billing/Profile; Settings checkboxes default look; narrative text "81.7" vs tile "82"; date formats differ Report (MM/DD/YYYY) vs PDF (YYYY.MM.DD).

## Visual-direction pass 2 (done)
- Fixed real bug: legacy `.route-stage` animation left `transform: matrix(identity)` on the route wrapper, which trapped `position:fixed` modals (guide dialog anchored to page, not viewport, on mobile). Legacy rules stripped, plain `.route-stage{min-height:100vh}` in shell.css.
- Done per spec above: richer atmosphere token, radar (labels, 88px glass tiles, centre score, tooltip fix — it was stuck at display:none), guide tiles, blurred modal + large close + fade, tactile start button, PDF button done/failed states, PDF domain colour (v1.4).
- Verified: tsc+vite build; step12 PDF regression/static, task08 contract, findings-fallback 105/105; PDF 3 pages, byte-identical on repeat, pink domain colour for Marketing; audit clean at 3 widths; guide dialogs no inner scroll at 1366x720/768.
- Not done / open: diagnosis & results cards are still only mildly translucent (could use stronger tint variety); radar centre spoke line crosses the average number; styles.css legacy bulk still unpruned; other domains' PDF colours verified only by code path (only a Marketing assessment exists in demo data); PDF generated for IT/finance/people/operations not eyeballed.

## ChatGPT continuation pass (2026-10-28)
- Restored the exact frozen homepage lead sentence and the full fourth guide label.
- Removed all fake/fallback radar scores; unfinished domains can no longer create a fake polygon or result node.
- Radar spokes now begin outside the center score so lines no longer run through the average number.
- Strengthened the green/white atmospheric background and shared glass material without reintroducing navy/neon styling.
- Upgraded shared secondary buttons to glass controls; primary button behavior unchanged.
- Diagnosis cards/icons now use stronger premium glass/domain depth while remaining stationary on hover.
- Results analytical surfaces now expose more of the glass hierarchy while keeping reading sections legible.
- Settings checkboxes replaced with accessible premium switch controls.
- Billing/Profile/Settings max-width constraints made explicit.
- Report screen date formatting aligned with PDF (YYYY.MM.DD).
- Removed the unused legacy `pages/home.css` import; the active homepage is `Landing.tsx` / `landing.css`, reducing loaded legacy CSS without changing behavior.
- Supporting secondary/QA surfaces now inherit the same glass material instead of solid white where safe.
- No scoring, payment, database, question-bank, report-finding, or PDF-generation logic changed.

### ChatGPT continuation — final secondary-surface polish (2026-10-28)
- Report screen navigation controls (`report-domain-switcher`, report date/version strip) now use the shared premium glass control material while the actual report document remains solid/readable. No report data/PDF logic changed.
- Questionnaire answer controls now use a translucent glass control surface while preserving the existing answer-tone colors, selection semantics, accessibility focus, and green→yellow→red scoring presentation.
- Priorities page legacy flat register/summary/hypothesis/evidence/handoff surfaces were upgraded in-place in `styles.css` to the shared glass material; no priority/recommendation logic changed.
- Static source validation: 37 TS/TSX files parsed with TypeScript 5.8.3, 0 parse errors; all 19 CSS files passed comment/string-aware brace validation.
- Five-domain PDF visual/determinism check completed from the existing ReportLab renderer: Marketing, IT, Finance, People, Operations each render as 3-page A4 PDFs; repeat renders are byte-identical per domain; page-1 domain accents visually differ as intended.
- Full Vite build could not be executed inside the offline ChatGPT container because the snapshot intentionally excludes `node_modules` and the npm cache does not contain all React typings. The apply script runs the real `npm run build` transactionally on the main MMRI laptop before keeping the patch.
- Final accessibility/contrast polish: mobile primary/shell controls now meet the 48px product touch target where appropriate; Billing success dialog receives/traps keyboard focus and supports Escape; Finance domain icons use the darker domain ink token on light glass while retaining the bright yellow accent border (same pattern wired through radar/Diagnosis/Billing).
- Forest dark-mode shell corrected so the sticky header itself uses dark forest glass (white header controls no longer sit on a light header); generic page headings receive readable light glass in dark mode.
- Internal States QA badge changed from English `DEV / QA` to Mongolian `ХӨГЖҮҮЛЭЛТ / ЧАНАР`; remaining direct visible Latin text is the BUSINESSMMRI.MN brand.
- UI polish gate extended with domain-icon contrast contract; current PASS 42/42.

## ChatGPT final pass 1/10 — Homepage polish (2026-10-29)
- Preserved the approved Mongolian hero/subtext and four exact guide labels.
- Reworked the four public guide controls into larger app-style glass tiles with large icon blocks and fixed geometry.
- Strengthened the homepage-only green/white atmospheric glass composition without introducing a new color system.
- Refined radar icon glass/tint/contrast while keeping all icons stationary.
- Corrected radar plotting so real scores use a true 0–100 radius; the old artificial 18% minimum is removed.
- Kept the center score free of a solid white disc and preserved the hover label `дундаж оноо`.
- Strengthened guide-dialog blur/material while preserving Escape, backdrop-close, inert background and focus trap behavior.
- Added regression checks for true-zero radar geometry and app-style guide tile composition.
- Business/scoring/payment/question-bank logic unchanged.


## ChatGPT final pass 2/10 — Diagnosis + Questionnaire polish (2026-10-29)
- Removed visible Diagnosis page title while retaining an accessible hidden H1; domain cards remain the visual focus.
- Locked diagnosis action now includes the frozen price inside the button: `ТӨЛӨХ · 300,000₮`.
- Rebuilt Diagnosis desktop card geometry into an intentional 3+2 centered composition; tablet becomes 2+2+1, mobile becomes one compact icon/title/meta card per row.
- Enlarged/refined domain icon glass surfaces and square notification-style status controls; hover/focus remains stationary.
- Fixed false progress: zero answered questions now display 0%, not artificial 1%/42% fallback progress.
- Questionnaire visible progress is now strictly answered/expected total (terminal=100%); internal diagnostic coverage no longer inflates the customer-facing percent.
- Strengthened questionnaire session/progress/form glass hierarchy and question typography without changing routing, persistence, adaptive selection, or scoring.
- Answer cards now expose the existing green→yellow→red semantic scale through a stable left color rail + prefix while preserving high-contrast text and selected-state semantics.
- Improved save/retry/clear controls, empty/network/error surfaces, and 390px mobile touch/layout behavior.
- Extended `VERIFY_UI_POLISH.sh` with Diagnosis/Questionnaire contracts. Current static gate: 51/51 PASS.
- TypeScript parser validation: 37 TS/TSX files, 0 syntax errors.
- Business/scoring/payment/question-bank/database logic unchanged.

## Final polish Step 3/10 — Results (2026-10-29)
- Results is now five-domain aware: the page heading uses the active assessment domain instead of hard-coded Marketing, and the module comparison uses the actual module count/domain name instead of hard-coded “8”/Marketing wording.
- The canonical 5 strengths / 5 weaknesses surface consumes only `data.strengths.items` and `data.weaknesses.items` from the backend result payload; no frontend re-ranking was introduced for these canonical findings.
- Added a customer-safe provisional-result banner. Only findings carrying `basis=RELATIVE_RANK` receive the “Урьдчилсан” badge; fully validated findings are not tagged.
- Strength and weakness cards now have distinct semantic treatment (green strength / red weakness) while the rest of the Results page follows the active domain accent.
- Root-cause classification codes are no longer exposed directly; known internal values map to natural Mongolian labels before display.
- Fixed additional cross-domain wording: module count and module-detail disclosure no longer assume 8 modules / 64 subareas per module.
- Removed customer-facing “Каноник” jargon from the next-step callout.
- Mobile Results controls, finding rows, provisional labels, and action buttons were tightened for 390px use.
- Extended `VERIFY_UI_POLISH.sh` with eight Results contracts. Current static gate: 59/59 PASS.
- Static validation: 37 TS/TSX files parse with 0 errors; active Results CSS brace structure PASS.
- No scoring, result-generation, database, payment, question-bank, or backend finding logic changed.

## Final polish Step 4/10 — Report screen (2026-10-29)
- Kept the actual report document solid white/readable while refining only the surrounding control layer and on-screen report presentation.
- Report header now uses a stable three-part layout: company left, stationary PDF control centered, square report-ready status ornament top-right outside the white report paper.
- Active report status is only shown after real report data validates (or in demo), preventing a false “ready” signal during failed/incomplete loads.
- Report domain tabs no longer use the thin outlined-box treatment; active state uses domain accent depth/underline, and Finance/icon contrast uses the palette `ink` token.
- Page 1 score is now a centered circular score treatment with no `/100`; active domain/date sit beneath it, and the report page outline follows the selected domain accent.
- Strength/weakness columns remain capability-driven but received cleaner semantic green/red reading surfaces without converting the document into glass cards.
- Page 2 priority rows remain full-width; the visible score arrow was removed. Current and target scores are shown as two clearly labeled values instead.
- Page 3 roadmap remains a native tap-to-complete button model; completed cards retain a full green outline, hover geometry stays stationary, and completion storage is now report/assessment-specific instead of date-only (prevents same-day retakes sharing completion state).
- Report progress gate no longer fabricates a minimum 1% or demo 42%; zero real progress is 0%.
- Report history/date choices now show newest-first, matching the default selected report.
- Locked report gate action now includes the frozen `300,000₮` price.
- Mobile: header reflows safely, PDF control becomes full-width, date history becomes horizontally scrollable, priority/roadmap layouts collapse without horizontal overflow.
- `VERIFY_UI_POLISH.sh` extended with 13 Report contracts; static gate now 72/72 PASS.
- TypeScript parser validation: 37 TS/TSX files, 0 syntax errors. All 20 CSS files passed structural validation.
- No scoring, findings generation, recommendation generation, payment logic, database schema, question-bank data, or backend PDF renderer changed in this step.

## Final polish Step 5/10 — PDF button + generation/converter (2026-10-29)
- Production PDF generator advanced to `MMRI-PDF-1.5-BUSINESS-REPORT`.
- Frozen PDF contract is exactly 3 A4 pages: (1) score + concise executive conclusion + 5 strengths/5 weaknesses, (2) 5 critical priorities with explicit `Одоо` / `Зорилт`, (3) compact 365-day roadmap.
- Replaced the obsolete 250–300-word conclusion requirement with a concise 80–160-word backend contract; frontend only blocks genuinely missing/meaningless conclusions.
- PDF source now carries real current/target scores for each critical action; no score arrow is rendered.
- ReportLab renderer now draws the domain-colored full-page frame and fails closed if page count is not exactly 3.
- Roadmap rendering is grouped/compacted by recommendation so long milestone data cannot silently spill to page 4; no critical action is truncated.
- Production download validates PDF MIME/size and `%PDF-` signature before saving; duplicate-click lock and idle/busy/success/failure states remain.
- Demo/browser print fallback is isolated from the application shell and has its own fixed three-page A4 print stylesheet.
- Five-domain stress render with long Mongolian content: Marketing/IT/Finance/People/Operations all 3-page A4; each domain has a unique accent output; repeated renders are byte-identical.
- Static UI contract after Step 5: 80/80 PASS; frontend TS/TSX parse: 36 files, 0 syntax errors; active CSS structural validation: 20/20 PASS.


## Final polish Step 6/10 — Login + Billing + Profile + Settings + Priorities (2026-10-29)
- Replaced stale Marketing-only billing-plan metadata with five-domain-safe selected-domain wording and updated the feature copy from the obsolete two-page report to the frozen 3-page PDF report.
- Login now includes a compact three-item value proof, displays the selected plan price, and shows explicit 10-character guidance during registration.
- Billing now has a 3-stage visual flow (`Код үүсгэх` → `Төлбөр хийх` → `Эрх нээх`), normalizes invalid stored domain IDs before API use, announces errors accessibly, clarifies automatic payment polling, and includes an accessible close control on the success dialog.
- Profile completion/error copy now uses the actual `orderedIds.length`; empty company names cannot fail silently on dashboard save; save success uses a live status region.
- Payment history no longer silently labels unknown/legacy-domain invoices as Marketing; invalid domain codes resolve to a neutral `Чиглэл тодорхойгүй` state instead.
- Settings switches now expose native `role=switch` semantics; logout is separated into its own account surface rather than mixed with display preference actions.
- Priorities is five-domain safe: Marketing-only fallbacks were removed, stale Strategy-domain demo/owner copy was replaced, current/target scores use explicit labels without arrows, and cross-page CTA arrows were removed.
- `VERIFY_UI_POLISH.sh` extended for Step 6 contracts. Current static gate: 95/95 PASS.
- Frontend TS/TSX parser validation: 37 files, 0 syntax errors. Active CSS structural checks PASS. ReportLab renderer compile PASS.
- No scoring, routing, payment amount/provider, database, question-bank, findings, or PDF page-contract logic changed.

## Final polish Step 7/10 — Global design-system consistency (2026-10-29)
- Synchronized `design/tokens.ts` with the canonical green/white `design/tokens.css`; removed the dormant retired purple/gray token set so future TS-driven UI cannot resurrect it.
- Centralized the five domain colors/accessible ink values in `domainVisualTokens` (TS) and matching `--mmri-domain-*` CSS variables. `areaReportPalette` and Results now consume these canonical sources instead of maintaining separate color tables.
- Added one shared control-material contract: glass control blur, base/hover background, border, shadow, hover shadow and focus ring. Shared Button, form inputs/tabs, shell controls, checkbox/choice controls, Results secondary glass and Report version controls now consume it.
- Unified cross-page geometry: Diagnosis + Report status ornaments both use `--mmri-status-square-size:42px`; large Billing domain icon uses `--mmri-domain-icon-size-large:72px`.
- Normalized shell header/nav/menu/account material and control radii to shared tokens; no hover translation was introduced.
- Updated `design/README.md` and `MMRI_DESIGN_SYSTEM_HANDOFF.md` with the canonical CSS/TS/domain/material ownership rules and explicit retired-color prohibition.
- `VERIFY_UI_POLISH.sh` extended with 13 Step-7 consistency contracts. Current gate: 108/108 PASS.
- TypeScript parser validation: 37 TS/TSX files, 0 syntax errors. Existing CSS structural checks remain PASS.
- No scoring, adaptive routing, result generation, payment provider/amount, database schema, question-bank data, report methodology, or PDF contract changed.

## 2026-10-29 — Step 08/10 Responsive + Accessibility final pass

Completed:
- Domain-aware Results screen-reader labels and module score context.
- Billing success dialog keyboard focus cycle + Escape + focus restoration.
- Report date/history selection semantics.
- System reduced-motion and forced-colors support.
- 44/48px interaction geometry, mobile safe-area bottom clearance, route heading scroll offset.
- Mobile report domain/date horizontal reachability with scroll snap.
- Safe-area/overscroll hardening for homepage and Billing modals.
- Responsive support stepper/account grids.
- `VERIFY_UI_POLISH.sh` expanded to 120 checks; 120/120 PASS.

Validation: 37 TS/TSX parser PASS, CSS structural PASS, PDF renderer compile PASS. Real Vite build remains a source-machine/final-installer check because this review snapshot intentionally has no node_modules and registry install timed out.

Next exact task: Step 09/10 — code/CSS cleanup + regression protection. Do not redesign or change business logic.

## 2026-10-29 — Step 09/10 CSS cleanup + regression protection

Completed:
- Consolidated late override fragments in Landing, Login, Billing, Account/Profile, Report and Priorities into canonical selectors; no redesign or business-logic change.
- Removed redundant shared field-error CSS and consolidated the shared tag rule.
- Active non-legacy CSS now has zero duplicate top-level selectors. Total active duplicate-selector count fell from 68 to 43; the remaining 43 are isolated to the bounded legacy `styles.css` bridge.
- Added dependency-free `VERIFY_STEP09_CSS_REGRESSION.sh` covering active import count/uniqueness, retired-layer protection, brace structure, duplicate-selector budget, runtime custom-property contract, bounded `!important` usage and cleanup signatures.
- Existing `VERIFY_UI_POLISH.sh`: 120/120 PASS.
- New Step 9 regression gate: 92/92 PASS.

Next exact task: Step 10/10 — final freeze/package/acceptance, including a real guarded npm/Vite build when dependencies are available. Do not redesign in Step 10.

## 2026-10-29 — Step 10/10 final freeze + complete-project handoff

- Rebased the reviewed Step 1–9 refinement snapshot onto the complete `MMRI_FINAL_20_20_SAFE_2026-10-27` source package.
- Overlay result: 323 mapped files; 51 updated, 31 new, 241 already identical.
- `frontend/src` is now byte-for-byte identical to the reviewed Step 9 frontend snapshot (59 files); 44 retired CSS/theme files from the older full base were removed.
- Removed 18 inert source backup files from active frontend/backend source trees.
- Fixed `VERIFY_STEP09_CSS_REGRESSION.sh` for both review-bundle and canonical full-repo layouts.
- Added `VERIFY_STEP10_FINAL_FREEZE.sh`; `VERIFY_FINAL_20_OF_20_SOURCE.sh` now delegates to the current freeze contract instead of checking obsolete repair CSS imports.
- Safe installer now removes stale backend dist output before rebuilding, includes the new UI/CSS gates in the full regression harness, and requires a post-build Step 10 freeze pass.
- Static acceptance: UI 120/120 PASS; CSS 92/92 PASS; PDF 21/21; billing/retake 24/24; AI boundary 26/26; AI reliability 22/22; operations 36/36; TS/TSX parser 144 files clean; frontend relative imports 132 clean.
- npm registry access and Docker are unavailable in the ChatGPT environment, so clean npm/Vite/connected-Postgres gates are explicitly deferred to `SAFE_INSTALL_AND_RUN.sh` on the source machine rather than falsely certified.
- This is the final ChatGPT 10/10 handoff baseline. Do not restart the ten-step polish sequence.

## 2026-10-29 — Blue glass redesign (CLAUDE_GLASS_UI_REDESIGN_BRIEF.md)
- Palette switched from green+white to soft blue + white (user-confirmed override of the earlier green direction): `tokens.css`/`tokens.ts` brand `#1B63D8`, canvas `#F2F7FE`, new blue canvas wash; all hard-coded greens in active CSS hue-shifted to blue. Success/answer-scale greens intentionally kept green. Five domain colors unchanged (IT stays `#00A6FF` to match the backend PDF renderer).
- Homepage: one hero text block (lead paragraph removed, h1 rewritten); 4 guide cards rebuilt as translucent glossy glass squares with custom SVG glyphs and bottom text; guide popup is blurred blue glass; radar icon/text white backings and the glass blob removed.
- Diagnosis: domain icon/name open a glass sheet (`Dialog` now accepts `className`/`style`) over a backdrop tinted with the domain color; the in-card action button is unchanged. Report: `.mmri-area-tint` softly tints the page by selected domain; the report paper stays solid.
- Status chips (Diagnosis + Report) restyled as compact glass; notification badge centered (flex + line-height 1).
- `VERIFY_UI_POLISH.sh` / `VERIFY_STEP09_CSS_REGRESSION.sh` expectations updated for the new hero copy, blue tokens and guide geometry. UI 120/120, CSS gate clean, `npm run build` OK.
- Not done: visual browser check (desktop + 390px); backend PDF colors untouched.

## 2026-10-29 — Liquid-glass pass (second, substantial redesign)
- New reusable system in `components/glass.css`: registered `@property` ambient/domain tokens (`--ambient-1..3`, `--ambient-base`, `--domain-primary/secondary/glow`, `--glass-*`), animated multi-layer ambient background, `.lg`/`.lg--strong` liquid-glass material (blur+saturate, specular `::before`, reflected `::after`, rim/inner-light/glow shadows) and the `.mmri-glyph` styles. `design/environment.ts` (`useAmbientEnvironment`) sets `html[data-env]` to retarget the whole environment (guides: about/diagnosis/result/payment; domains: marketing/it/finance/people/operations).
- `components/Glyphs.tsx`: one custom 64-grid glyph family for 5 domains (megaphone+signal, chip, coin stack+growth, people, gear), 4 guides and 4 statuses (locked/ready/progress/report). Used on homepage cards, radar, Diagnosis, Report tabs/gate, Billing header.
- Homepage: single hero line; guide cards are large liquid-glass tiles with ~70% icon and a frosted bottom strip; clicking a guide changes the page environment and opens a large glass sheet. Radar icons/text have no backing.
- Diagnosis: liquid-glass domain cards with big glyphs; selecting opens a glass sheet over a page-wide domain-colored environment. Report: selected domain sets the environment; header, tabs, gate and paper are floating glass/near-solid.
- Finance identity is now emerald `#10B981` (frontend only; backend PDF renderer still uses the old Finance yellow — not changed). Added `secondary` per domain (`--mmri-domain-*-2`).
- Gates: `VERIFY_UI_POLISH.sh` 120/120, CSS regression clean, `npm run build` OK. Visually verified with headless Chrome at 1440 and 390 using a mock API (no DB writes).

## 2026-10-29 — Liquid-glass pass 3 (deep indigo/violet environment)
- Environment is now deep blue/indigo/violet with ribbons + drifting light; `.lg` is see-through dark-tint glass with white text. Per-guide/per-domain `data-env` worlds are deep and saturated.
- One-screen layouts: homepage, 4 guide popups, Diagnosis (5-up row desktop, 2-col compact mobile). Guide tiles smaller, wider gaps, large centered light glyphs, frosted text strip. Radar has no text labels.
- Diagnosis tiles use strong domain gradients; `StatusRing` (solid disc + ring, progress arc) replaces glass status squares; report tab chips use the same glyph/ring tones.
- Report: see-through glass paper (white text tokens, `--report-accent-light`), full-width summary, header reduced to company + PDF button.
- Header/nav, login and page headings restyled for the deep background; gate expectations updated (paper-solid-white rule intentionally replaced by the user's glass request).

## 2026-10-29 — Liquid-glass pass 4 (refinement)
- Guides: environment no longer changes on open; cards smaller/wider-spaced; popup has hidden scrollbar and flex step-flow with glass arrows for the Diagnosis (5) and Payment (4) guides.
- Radar center is a glass orb with white score; radar has no labels.
- Shared buttons rewritten (pill, luminous primary, white-glass secondary, brightness-only hover); Diagnosis buttons, report PDF/date controls follow it. Report: toolbar row (domain tabs + segmented date pill), frosted frame around dark-glass paper, StatusRing on tabs.
- Payment history: glass rows with domain glyph tile, date, amount and status pill.
- Gate scripts updated for the new button/report/guide contracts: UI 120/120, CSS clean.

## 2026-10-29 — Production-readiness audit pass
- Global token flip (`design/tokens.css`): surfaces/borders/text/semantic colors are now translucent-on-dark (white text, light accent `--mmri-color-accent`, soft semantic tints), so every legacy page (Profile, Billing, Questionnaire, Results, Priorities, menus, dialogs, tables, empty/loading/error states) inherits the liquid-glass look. Forms rewritten as glass inputs; ~28 hard-coded light backgrounds swept to glass.
- Settings reduced to text size (instant) + account links (company info, payment history) + logout. Removed theme/density/motion/contrast UI and their CSS/attribute code (`preferences.css` keeps text-size scale, system reduced-motion and forced-colors only; `main.tsx`/`App.tsx` simplified).
- Profile (company editor + onboarding) rebuilt on `.lg .lg--soft` panels with avatar, glass inputs/selects, sticky glass save bar. Header controls (bell/account/menu) share one glass recipe; overlays more opaque for legibility; mobile bottom nav is dark glass (fixed a cascade bug that hid it); notification badge shows `9+`.
- Gates updated for the new contracts: UI 120/120, CSS clean.

## 2026-10-29 — Powder-blue liquid-glass background (CLAUDE_LIQUID_GLASS_BACKGROUND_TASK.md)
- `glass.css`: deep indigo ambient replaced by powder-blue (#AFC3D8/#7E98B3/#5F7996/#EAF4FF/#8FE7FF) field with crossed diagonal bevelled diamond seams (`html::before`), top-left/right soft reflections, vignette. Category tint = one registered `--tint` token set per `html[data-env]`; all `--ambient-*` derive from it. New `--popup-*` tokens; glass panels darkened slightly for white-text legibility.
- Landing: four guides share one tone (`guideTone`); guide popup uses frosted popup tokens, 34px radius, 22px backdrop blur, rounded-square close chip. Diagnosis domain sheet uses same popup recipe.
- Gates: UI polish no FAIL, CSS regression clean, `npm run build` OK. Not visually checked in browser.

## 2026-10-29 — Final repaired 61,440 question bank integrated (source only)
- New bundles beside old ones: Marketing 3.0.4/3.1.4, HR 4.1.5, Finance 4.2.5, IT 4.3.5, Ops 4.4.5 (`BUSINESSMRI-v2.5-*`). Only question wording changed (CSV is authoritative; Excel not applied). Details: `backend/integration/final_61440/FINAL_61440_INTEGRATION_REPORT.md`.
- Selectors updated: `src/methodology-target.ts`, `src/domain-methodology.ts`, `.env.example`, `START_LOCAL.sh`, `package.json` db scripts, regression scripts. Frontend untouched (build + UI gate pass).
- `backend/.env` and PostgreSQL NOT modified: .env still pins old MMRI_TARGET_* values; DB still has 3.0.3/4.x.4 ACTIVE. Import + promote steps are in the report.

## 2026-10-29 — Sharp liquid-glass pass (CLAUDE_SHARP_LIQUID_GLASS_REDESIGN brief)
- Domain palette replaced by the brief's vivid colors (tokens.css/tokens.ts): Marketing #E21D2D, IT #0A3D91, Finance #FFB21E, HR #7A5CFF, Operations #20E0B2 (+ highlights). `--category-*` aliases and `--glass-radius/-edge/-glow/-shadow-deep/-border-highlight/-inner-highlight` tokens in `glass.css`.
- `glass.css`: ambient fields carry more tint (vivid category atmosphere), stronger bevelled seams, dark top-left/right corner pockets + reflected light in the `html` background; `.lg` rim is category-tinted with layered glow; hover/active/selected only change glow/rim (no transform).
- Floating glass header (shell.css, 26px blur), category tiles (diagnosis.css), guide popup/close chip (landing.css) updated. Gates: UI polish 0 FAIL (domain-color expectations updated), CSS regression clean, build OK. Visually checked landing at 1440/390 only.

## 2026-10-29 — Liquid-glass REDO (visual acceptance)
- Palette from reference samples: Marketing #CB1B23/#DE4245/deep #AF0508; IT #10456F (deep #1C3F79, highlight #3C7FB5); Finance #FB9B40/#FAC287/deep #F2791B; HR #5F4CDC/#7772E8; Operations #24B69F/#44D1C0. Blur 24px/saturate 135% everywhere primary (popup too; overlay 8px only), 12% highlight layer + narrow specular edge.
- glass.css: quilted diamond facets + crossed bevelled seams (html::before), top-left/right corner pockets with reflected arcs (html::after), category envs raise tint share to 78–86% so the whole environment changes. New "glass objects" block for `.mmri-home2__guide.lg` / `.diagnosis-square.lg` (colour body, ::before specular, ::after lower pool, 8-layer shadow, glow-only hover). Header, popup, close chip rebuilt (shell.css/landing.css). Landing.tsx `guideTone` -> dark blue family (it was hard-coded inline and overrode CSS). Old `.diagnosis-square` background/hover rules removed.
- Gates: UI polish 0 FAIL (palette checks updated again: they hard-coded the previous palette), CSS regression clean, build OK. Headless screenshots 1440/390 for default + categories.

## 2026-10-29 — Exact-reference liquid glass (three-layer model)
- NOTE: `claude_refs/liquid_glass_reference.png` / `button_states_reference.png` do not exist on disk (folder empty); built from the written spec + sampled colours only, no image comparison.
- Layers: (1) blue acrylic wall (`html::before`, ~200px diamonds, bevelled seams, category colour only in seams/pocket glow), dark pockets TOP-RIGHT + BOTTOM-LEFT (`html::after`, #2E5073/#284662); (2) page sheet = `.mmri-shell-main::before/::after` (pseudo-elements so blur is not a fixed-position containing block); (3) content.
- Tiles: `.diagnosis-square.lg` swatch (deep→main→reflection, frosted `.diagnosis-square__label` strip — DiagnosisHub.tsx now wraps h2/meta/button in it, passes `--domain-deep`), guides `.mmri-home2__guide.lg` clear cyan crystal (Landing.tsx guideTone #1E526F/#65E9F5). Header/close/menu chips steel-blue acrylic #4E6D8A.
- Fixed popup blur: overlay opacity animation/backdrop-filter made it a backdrop root; fade+dim now on `.mmri-guide2::before`.
- Palette (main/reflection/deep): Mkt #C0272D/#EB4C50/#B70302, IT #36789B/#64ACC5/#154575, Fin #F8A464/#FFD36A/#E4962A, HR #6B5CE3/#8683DC/#595EC6, Ops #50D1C1/#7ADACF/#2CB89E. Gates: UI 0 FAIL (2 palette checks updated), CSS clean, build OK.

## 2026-10-29 — Category colour = environmental light, not sheet fill (CLAUDE_FIX_CATEGORY_BACKGROUND)
- Root cause: `.report-three-page` (report.css) filled with `linear-gradient(150deg,color-mix(--report-accent 20%,rgba(14,18,80,.46)),…)` + `inset 0 -40px 60px accent 16%` and blur(40px)/saturate(185%) — indigo overlay mixed with red = mauve; plus a nested second sheet `.report-three-pages` and a dead fixed wash `.mmri-area-tint-legacy`. Removed/neutralised all three.
- New separated variables (glass.css): neutral `--page-glass-bg/upper/border/highlight`; category light `--environment-category-bloom/-seam`, `--glass-category-rim/-reflection`; per-env `--bloom` 30% (placed at left/right/bottom edges behind the sheet), `--seam-tint` 38%, `--pocket-glow` 46%. `.lg` category fill 16%→6%, glow 50%→26%; Diagnosis area dialog no longer recolours the page.
- Report stayed layout/data-identical. Gates: UI polish 0 FAIL (2 report checks rewritten: they asserted the old 40px blur and the 16% accent fill), CSS clean, build OK.

## 2026-10-29 — Modern clear-glass redo (CLAUDE_MODERN_GLASS_REDO)
- Blur: all `blur(>6px)` backdrop values normalised to 4px (tokens `--mmri-glass-*` = blur(4px) saturate(125%)); sheet/popup panel/report paper 3-4px, header 4px, guide crystals 3px, popup overlay 2px. Decorative `filter:blur(70px)` light blobs kept (restored after a regex clobbered them; login orb set to 24px).
- Environment: whole background takes the category family via `--env-deep/main/hi` (+20% dark shade, seams 30% hi); default blue when no category. Sheet (`.mmri-shell-main::before/::after`) is clear: transparent body, bright rim, cyan/dark inner edges, diagonal sheen, deep cast shadow — never category-coloured.
- Header thinner (--mmri-shell-height 52px) + 38px clear chips. Guide crystals re-built (transparent, specular rim, iridescent glint, 4-layer shadow incl. cyan under-light). Category cards: one architecture, clean surface + translucent deep label strip (h2 fixed 3-line height). Report: scores in chips, success #20D98B / danger #FF4D5E.
- Gates: UI polish 0 FAIL (3 checks updated: old 14/24px blur values), CSS clean, build OK.

## 2026-10-29 — Modern glass final refinement
- Palette (deep/main/bright): Mkt #991B1B/#DC2626/#EF4444, IT #075985/#0284C7/#38BDF8, Fin #B45309/#F59E0B/#FBBF24, HR #5B21B6/#7C3AED/#A855F7, Ops #047857/#10B981/#34D399 (IT blue vs HR purple now clearly separate).
- Background: `html::after` radial corner pockets and arcs removed; long corner-to-corner linear gradients (dark toward top-right and bottom-left) + diagonal light wash; seams hairline (1px bright + 2px soft dark), faint plane shading. Base = deep/main mix + 10% dark shade.
- Shared tokens: `--radius-control/button/card/surface` (12/14/24/32), `--border-light/strong/refract`, `--shadow-contact/ambient`. Header 48px, chips 36px/12px radius. Guides: thick 3D crystal (tight contact + cast + ambient + faint cyan under-light, no halo). Category cards: single two-tone surface, one gloss, neutral info zone. Radar: hairline grid, 5px nodes, lens centre (no label). Report: 212px score lens with 92px "82", status #22C55E/#4ADE80 and #EF4444/#FB7185 in chips.
- Gates: UI polish 0 FAIL (guide-height and palette checks updated to the new design), CSS clean, build OK.

## 2026-10-29 — Full system liquid-glass language (three materials)
- Materials in glass.css: `.content-surface` (= legacy `.lg/.lg--soft/.lg--strong`, calm, 4px), `.glass-regular` (header, guide popup; 5px, `--gr-under` local dimming), `.glass-clear` (4 guide buttons; 2px, thick crystal; Landing.tsx className `mmri-home2__guide glass-clear`; AppShell header + popup panel get `glass-regular`). Tokens: `--blur-clear/regular/content`, `--radius-control/button/card/surface/modal` (12/14/22/30/32), shared contact+ambient shadows offset down/right (light from upper-left).
- Legacy removed: indigo shadows `rgba(6,8,60/70..)`→neutral steel, opaque indigo dropdown/dialog bg, indigo @supports/reduced-transparency fallbacks, `.lg` outer glow/category spill + `.lg::after`. Reduced-transparency + mobile (no backdrop on clear glass, no sheet sheen) paths added. Report chips now carry ▲/▼ (status not by colour alone).
- Gates: UI polish 0 FAIL (guide class + report blur checks updated to the new contract), CSS clean, build OK.

## 2026-10-29 — Reference-first rebuild
- Blur ceiling 3px everywhere (sheet 1px, clear glass 1px, regular 3px, content 3px). Background base = category MAIN colour (#DC2626/#0284C7/#F59E0B/#7C3AED/#10B981) at 6% shade; ~310px panels, hairline reflective edge only, two light shafts; corner depth = linear gradients only.
- Guides: reference-block material (#174E70/#5FA6C8/#67E8F9/#E6FAFF/#F0A6D2) with bottom/left wall insets for thickness and contact+cast+cyan under-light shadows. Category cards: flat solid colour + soft top highlight + flat info zone + one shadow. Radar grid ~7-9% opacity. Nav 44px, bare pill container, flat active capsule; primary button flat, secondary transparent. Text shadows removed (none remain). Report score lens 232px / 108px number.
- Gates: UI polish 0 FAIL (blur pins moved 4px→3px), CSS clean, build OK.

## 2026-10-30 — Reference-image redesign (reference_bg / reference_blue_buttons / reference_purple_cards, inspected directly)
- Background (`glass.css`): ~170px diamond tile floor (bright+dark bevel seam pair), broad upper-left light shaft, dark top-right + left edge via linear gradients; default env #4F7596/#86A6C2/#C4DAEC. Category envs lightened (`--env-main` 82% + white) — same geometry, only colour family changes.
- Floating sheet (`.mmri-shell-main::before/::after`): frosted light acrylic, 1.5px bright rim, lower thickness lip, hard 3px edge + long soft cast shadow.
- Guides: horizontal royal-blue slabs (#2F6FF0→#0A2E9E), bright cyan rim, lighter lower lip, solid #08205F extrusion + dark contact + blue under-glow; icon left/title right; white glyphs (`guideTone`). Tapping a guide sets `data-env` (about→it, diagnosis→operations, result→finance, payment→people) via `useAmbientEnvironment` in Landing.tsx.
- Radar: thin glass panel (`.mmri-home2__radar`), 0.7px cool grid, glowing cyan shape, pentagon-clipped conic sweep (CSS only, disabled for reduced motion), smaller centre lens.
- Category cards: gradient glass (secondary→primary→deep) + sheen + frosted light label strip + category-coloured light pool; button takes the family gradient.
- Gate: stale "tall guide tile" check replaced with new horizontal-slab check. Not visually checked: logged-in Diagnosis/Report pages (need auth; cards verified in a static harness with built CSS).

## 2026-10-30 (2) — Radar removed, category tiles, blue guide mode, one-screen layouts
- `reference_category_tiles.png` and `reference_3d_glass_guide.png` were NOT on disk; used the swatch grid of reference_bg.png + reference_blue_buttons.png as stand-ins. Re-tune when the files exist.
- Radar deleted: `components/BusinessRadar.tsx`, `components/radar.css` (+ imports in main.tsx, ds-entry.css/tsx). Home right side = 5 `.cat-tile` tiles (3+2, identical size; Landing.tsx `tileOrder`). Hover/focus previews the category environment; click keeps the old billing/report navigation.
- `.cat-tile` (glass.css) is the single category component for home tiles AND Diagnosis cards (Diagnosis dropped `.lg`).
- Guides: all four open `data-env="guide"` (cobalt, glass.css) — not per-guide/category colours; closing restores the page env. Popup backdrop blur 20px, panel = shiny glass 4px. Dropdown panels 22px local blur on dense dark glass.
- Header: no container (non-sticky, transparent); minimal text nav with underline active state; controls borderless. Top 120px of environment carries a dark contrast band (`html::after`).
- Hero copy changed per brief (h1 + `.mmri-home2__lead`), local dark scrim behind text. CTA = cobalt glass slab.
- Scroll: header margin collapse fixed (padding-top), sheet/stage/diagnosis heights = `100dvh - 82px`; verified scrollHeight==innerHeight at 1440x900, 1366x768, 1280x720, 1920x1080 (home); Diagnosis harness 1440x900/1280x720.
- Billing now sets the category environment. Report: score lens 120px number, status-coloured ring, denser reading scrim.
- Gates: UI polish 118/118; CSS regression clean (import count 19, `--radar-*` removed from variable contract); build OK. Not visually checked with real data: logged-in Diagnosis/Report/Profile/Settings/Priorities/Support.

## 2026-10-30 (3) — Cast shadows, bigger header, hanging status tags
- All `-webkit-box-reflect` mirrors removed. Light is top-left, so every floating object (sheet, popup, guides, category tiles, Diagnosis cards, CTAs) now has an extrusion + soft cast shadow offset right/down (positive x and y), plus a blue/category light spill.
- Header: `--mmri-shell-height` 64px on >=768px, `--mmri-chrome` (= shell height + 38px) now drives sheet min-height, home stage and Diagnosis page height. Nav 18px, brand 19px, controls 44px. "Миний хэсэг" text removed (aria-label kept).
- Diagnosis: intro paragraph removed (h1 stays sr-only). Status ring replaced by a hanging tag (`.diagnosis-status-tag`: lanyard hole, state colour band, notched tail, clean stroke icons; progress shows %). Hover only deepens shadow + tooltip; no movement. `StatusRing` still exported from Glyphs.tsx (unused by Diagnosis).

## 2026-10-30 (4) — Diagnosis status = capsule + 4-step track (replaces hanging tag/ring/tooltip). Added --fill to CSS var contract; retired ring/tooltip gate checks; card meta line now only shows answered count for in-progress cards.

## 2026-10-30 (5) — Responsive audit. Header compact range 901-1279px + phone header (<=520). Homepage/Diagnosis one-screen layout only when width>1000 AND height>=640 (else stacked, natural scroll). Phones: guides 1 column, tile label 68px, CTA one line. Verified by script (overflow/clip/collision) at 16 homepage sizes and 12 Diagnosis sizes; logged-in pages other than Diagnosis (Report, Billing, Profile, Settings, Priorities, Support, Questionnaire) NOT checked at phone sizes.

## 2026-10-30 (6) — Full frontend QA pass (Playwright: Chromium + Firefox; WebKit NOT runnable on this host)
Harness lives outside the repo (session scratchpad `pw/`: qa1 viewport matrix, qa2 interactions, qa3/qa7 pixel-contrast, qa5 perf, qa6 functional). Demo account `demo@mmri.mn`; backend `npm run api:dev` was restarted (it had died); no DB writes beyond normal app reads/PDF artifact generation.
Defects found + fixed:
- Session lost on reload: two concurrent `POST /auth/refresh` (StrictMode + no single-flight) -> 2nd rejected as replay. `api/client.ts` now shares one in-flight refresh.
- Content pages (questionnaire, results, priorities, billing, profile, settings, payments, states) had 101/171 low-contrast text samples (white on light liquid-glass sheet). Sheet now dark-glass tinted on every page except Homepage/Diagnosis (`:has()` in glass.css); `--mmri-color-text-muted` .74->.88; `--mmri-color-accent` lighter; badges = dark chips w/ coloured border; danger button darker red; secondary button dark glass; questionnaire context chip dark; support error alert readable. Now 2/165 @1440, 1/136 @390 (disabled button + measurement-border noise).
- Hero 2nd line, guide popup text (esp. phone), Diagnosis CTA on gold/green: contrast fixed (scrim .7/.52, popup under-dark .68, CTA deep gradient).
- Header collisions 901-1279px; phone header (<=520, <=360) overflowed at 320 in Firefox -> compact rules.
- Report domain switcher hid 2 of 5 buttons on phones (scroll strip) -> wraps.
- Diagnosis: CTA/pill clipped at 1000-1280px, title buttons <32px touch height, 320px two cramped columns -> fixed (1 column <=380px).
- Homepage/Diagnosis one-screen layout only when width>1000 and height>=640; otherwise natural reflow.
- ChoiceSelect dropdown opened off-screen / behind sticky bar + bottom nav on phones, and was clipped by overflow:hidden panels -> opens toward roomier side, panel overflow visible while open; legacy indigo menu + mobile bottom nav recoloured to shared dark glass.
- Primary buttons now cobalt glass (same family as guides/CTA). Orphan `AnalyticalRadar.tsx` + `.mmri-viz-radar*` CSS removed (unreferenced).
Known/not frontend: report 2026-09-08 PDF -> backend 500 "Stored PDF artifact source does not match immutable published report" (stale stored artifact); the two older versions generate valid 3-page PDFs. UI fails gracefully (report stays, inline error, retry). Backend static PDF regression 21/21.
Gates: UI polish 118/118 (radar/guide/hero/status checks rewritten for the new design), CSS regression clean (import count 19, `--radar-*` removed from var contract).
- (QA wrap-up) Also fixed: report date strip hid versions on phones (wraps now). Final evidence on final code: Chromium matrix 130/130 pages clean (13 viewports x 10 pages), interactions 75/75 (Chromium) + 75/75 (Firefox), Firefox matrix 80/80 + post-fix spot-check 6/6, contrast 33/33 + secondary pages 2/172 (desktop) 1/136 (phone; disabled button + a dev-only reference page), perf LCP 1.1-1.4s @4x CPU throttle / CLS 0. PDF: 2 of 3 stored versions -> valid 3-page PDFs; newest (2026-09-08) -> backend 500 "Stored PDF artifact source does not match immutable published report"; uncached regeneration took up to 76s and blocks other API requests meanwhile (backend finding). WebKit could not be launched on this host (missing system libs) -> untested.

## 2026-10-31 — Final visual pass (physical elevation, colour-only categories, questionnaire, notifications, PDF confirm)
- Elevation: `--shadow-contact/--shadow-ambient` re-defined once (contact + down-right ambient + feathered far + underside env reflection); `--elev-object/-hover/-overlay` aliases used by tiles, panels, notification/dialog layers. No per-component ad-hoc shadows added.
- Category identity is colour only: Landing tiles + Diagnosis cards show the score (or % progress) in large type on the family gradient (`.cat-tile__value`; finance/operations use dark ink for contrast). Glyphs removed from Landing, Diagnosis, Billing, Settings payment rows and the Report switcher. Guide buttons: typography only (01–04 numerals), same blue material.
- Questionnaire: slim header (Question N / T + progress + "Хадгалаад гарах"), big question, full-card answer colouring from the existing semantic tone scale (3/4/5 verified: G/Y/R; G/YG/O/R; G/YG/Y/O/R), selected = white rim + colour ring (no movement), controls Back (ghost) < Save (glass) < Continue (primary). Applicability Yes/No/Unknown questions stay neutral by design (not a quality scale).
- Report: sheet tint is now category-coloured (`.mmri-shell-main:has(.report-v3)::before`) so the category shows through; data mapping and 3-page PDF untouched. PDF button opens a confirmation Dialog ("PDF тайлан татах уу?" Болих/Татах) — no request/download before confirm.
- Notifications: backend has NO notification API (derived client-side from billing + assessments). Added per-browser (localStorage, per company) read / mark-all-read / dismiss / clear-all / close, unread dot + badge. No server persistence — report if a real API is wanted.
- Login/Home: one-shot entrance (rise + single specular sweep), reduced-motion zeroes delays; login card = clear liquid glass; headline on a local scrim.
- Gates: tsc OK, build OK, UI polish 118/118 (two obsolete checks rewritten: glyph-ink check → colour-only tiles; mobile action min-height 50→52), qa2 interactions 75/75, 110-page overflow matrix (11 viewports × 10 pages) 0 issues, notification functional 9/9, PDF confirm 4/4.
- Note: manual test runs advanced the demo account's in-progress Finance assessment by a few answers (dev data only).
