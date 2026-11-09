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

## 2026-11-03 — Post-redesign QA + blocker fixes
- Backend root cause: `prisma-assessment-engine.ts` wrote `resumeState: null` (resume, terminal-by-answer, forced-complete paths) to a `Json?` column; Prisma 6 stores JSON null, so the lifecycle trigger (23514 "Terminal result assessment lifecycle fields are inconsistent") rejected the terminal update -> no UI-driven diagnosis could finish. Fix: `Prisma.DbNull` at all three writes (value import of `Prisma`). No schema/trigger/scoring change. Verified: fresh 280-question Marketing run, retake run, and a pre-fix stuck assessment all reach COMPLETED; read-only lifecycle verify = 0 anomalies.
- Removed the Small/Normal/Large text-size preference (never scaled most pages; making it global = redesign). `preferences.css` keeps reduced-motion + forced-colors only.
- Results page: accent ink lightened for dark glass (contrast). Save-status colour conflict with legacy `.save-state` removed. Report in-progress % now uses the per-assessment progress endpoint (same as hub). Known backend English errors map to Mongolian (login, writer lease). `/favicon.svg` added.
- CSS hygiene: folded duplicate top-level selectors (pixel-diffed 18 screens before/after: identical except autosave-status timing). Gates updated for intentionally changed design values.
- ENV NOTE: this dev DB has older methodology versions active (it 4.3.4, finance 4.2.4, people 4.1.4, operations 4.4.4) while code targets v2.5 (4.x.5). Only Marketing can start new diagnoses until the v2.5 bundles are promoted to ACTIVE (a release step; IT 4.3.5 was imported as VALIDATING via import-methodology.ts, not activated).

## 2026-11-03 (2) — Version-bundle hash stamping, v2.5 promotion, first-visit freeze race
- Root cause: engine stamped every terminal snapshot with `TARGET_METHODOLOGY_BUNDLE_SHA256` (Marketing's hash), so non-Marketing reports failed `T10_PAYLOAD_BINDING`. Fix: `MethodologyDefinition.bundleSha256` is set by the DB cache loader from `methodology_versions.bundleSha256`; the five snapshot writes use `requireBundleSha256(definition)` (throws if absent). Gate untouched; Marketing hash is unchanged (4ec42fb9…).
- Promoted v2.5 via `promote-five-domain-methodologies.ts` (it/finance/people/operations 4.x.5 ACTIVE; 4.x.4 ARCHIVED). Historical assessments + frozen snapshots checksum-identical before/after.
- `PrismaStrategyReportService.freezeDiagnosisResult/freezeStrategyPlan` are now single-flight per assessment (parallel /recommendations + /action-plan on first visit returned a spurious 400).
- Report domain-switcher chip max-width on <=520px (IT report overflowed by 11px).
- OPEN (content): every shipped bundle (v2.0-v2.5) has Marketing `categoryObjectives` (MS01..MS64) in each non-Marketing recommendation contract -> 0 recommendation candidates -> empty priorities / no 12-month plan / frontend PDF guard refuses. Legacy demo Finance (completed on 4.2.4 before the fix) keeps a frozen snapshot with the wrong hash; its report 500s by design (not repaired).

## 2026-11-03 (3) — Recommendation layer for Finance / IT / People / Operations
- Root cause: every v2.0–v2.5 non-Marketing bundle shipped Marketing's recommendation contract (`categoryObjectives` MS01–MS64, Marketing role labels in the authority contract) -> objective lookup failed -> 0 candidates. Only objectives (64/domain) + role labels were wrong; the 47 cell interventions are domain-neutral constructs (6 neutralised).
- New content (authored, not translated from Marketing): `backend/methodology/recommendation-contracts/{finance,it,people,operations,_shared}.json` -> `scripts/build-domain-recommendation-bundles.py` derives `methodology/businessmri-v2.6-runtime-bundles/*_4.x.7_*.json` from the v2.5 bundles (questions/categories/cells/scoring/authority matrices byte-identical; asserted). 4.x.6 was imported first, then superseded by 4.x.7 (pure-Mongolian text) — published versions are never edited.
- Guards: `recommendationContractIssues()` in `lib/validate-bundle-core.ts` (runs inside the importer) + `npm run verify:recommendation-contracts` (45 checks incl. negative control: legacy v2.5 bundle must be rejected).
- Provenance: `MethodologyDefinition.questionBankVersion` (stored in methodology_versions.validation at import, else the declared release table for that exact domain+version, else refuse). Snapshot/event payloads no longer carry Marketing's 3.1.3 for every domain.
- Promoted 4.2.7 / 4.3.7 / 4.1.7 / 4.4.7 via promote-five-domain-methodologies.ts; historical tables checksum-identical before/after.
- Open: retake has no frontend entry point; profile (onboarding) questions are Marketing-worded for all domains; Many_to_Many mapping contract in non-Marketing bundles still keyed MSxx (inert for recommendations); numeric authority matrices are positional copies of Marketing's (labels fixed, numbers untouched — scoring-adjacent).

## 2026-11-03 (4) — Retake UI, AI/report latency, low-risk fixes
- Retake: completed card (meta line) + detail dialog + report version strip now offer "Дахин оношилгоо · 300,000₮" -> existing Billing retake mode. Report strip shows №N + Одоогийн/Өмнөх when >1 version. Hub start handler is lock-guarded; a PAID-but-PROFILE_PENDING retake is now started on resume instead of stranding the entitlement. Verified through the UI end to end (old assessment untouched, previous report still opens, exactly one PAID invoice/assessment).
- AI: credentials were never the problem. Key present server-side only (0 matches in dist/src/API responses/logs/git history; .env ignored). Real structured narrative takes ~52-55 s vs MMRI_AI_REPORT_TIMEOUT_MS=45000 in .env -> every report aborted and fell back after the 75 s budget. Working values: TIMEOUT_MS=120000, TOTAL_TIMEOUT_MS=200000, MAX_RETRIES=1 (NOT written to .env; apply it yourself or export them for the API process). Provider-error text is now redacted before it is stored/returned.
- Latency: first-time report ~60-66 s = AI narrative ~54 s (88%) + payload/recommendation freeze 5-9 s + trace ~2 s + publish <0.03 s. API now waits <=25 s (MMRI_REPORT_REQUEST_WAIT_MS) then answers the existing 409 REPORT_GENERATION_IN_PROGRESS; frontend getReport polls it; report is pre-generated at completion (MMRI_REPORT_PREWARM=false disables). nginx proxy_read_timeout is 35 s.
- Low risk: Mongolian dates YYYY.MM.DD (payment history + notifications), login brand 44 px target, provisional-banner contrast, GET-only retry on HTTP 429.

## White Prism Studio homepage (2026-11-04)
- Homepage is white (`data-env="prism"` in glass.css); black editorial type, black-glass CTA, three white/silver glass guide controls, frosted-white guide popups. No domain buttons on the homepage (domains stay under "Оношилгоо").
- Hero = ONE path-traced sculpture (Blender Cycles, built outside the repo): faceted slate-sapphire crystal with an ice core, a polished black ring, and the five domain forms threaded onto the ring as beads (coral knot, cyan glass cube, champagne coin stack, amethyst spheres, jade hex nut).
- `components/PrismHero.tsx` cross-dissolves 7 rendered viewpoints (`assets/hero/prism-0..6.webp`, ~35 KB each) on a canvas: pointer parallax + slow idle sway. Middle frame is the static poster (reduced-motion, data-saver, no-canvas).
- Customer-facing figures kept at validated values: 320 capabilities, 61,440 questions, 192-280 selected, 12-month plan.

## White Prism v2: one-graphic hero + shared entry design system (2026-11-04)
- Hero = `components/MmriCore.tsx`: one frontal graphic. Glass lens + faceted crystal core, thin black orbit, five small domain modules on the orbit. Seven path-traced transparent layers (`assets/hero/core-*.webp` + `core.json` manifest, ~170 KB). Replaces the 7-frame viewpoint hero (`PrismHero`, removed).
- Motion: per-layer pointer parallax (CSS vars --px/--py), travelling lens highlight, slow idle float; modules are buttons with hover lift + domain label; off for coarse pointers / reduced motion.
- `design/prism.css` + `design/prismPage.ts` (`usePrismPage`, scopes `body.mmri-prism-page`): glass recipe, hover language, header, notification bell, sign-in, onboarding, fields/tabs/cards/choice cards. Applied to Landing, Login, Profile. Dark app pages untouched.
- Notification bell: was white-on-white (shell colours assumed a dark page); now a silver-glass circle with ink icon, badge inside header, panel restyled.

---
# HANDOFF FOR NEXT SESSION — written 2026-11-04 (end of White Prism entry-pages session)
Read this block first, then the "CANONICAL FINAL VISUAL SPECIFICATION" at the top of this file. NOTE the top spec (green+white glass) and the 2026-10-29/31 dark/powder-blue liquid-glass sections are history for the ENTRY pages: Landing, Login and Profile now follow White Prism (below). The inner app pages still carry the older dark-glass system. Resolve this split deliberately (see "Remaining screens"); do not mix the two systems on one page.
Memory note: `mmri-design-direction` (green+white premium glass) predates White Prism and is outdated for entry pages. Confirm with the user which direction wins for the inner pages before redesigning them.

## 1. Current status
- Backend: functionally complete and frozen (20-step backend freeze, v2.5/4.x.7 methodology promoted, recommendation layer for all 5 domains, PDF 3-page A4 generator v1.5, AI narrative boundary). No backend changes this session.
- Frontend: Landing, Login, Profile are on White Prism. Billing/DiagnosisHub/account got small edits (below). Report, Results, Questionnaire, Priorities, Settings, States, Diagnosis visuals are still the dark liquid-glass system.
- `cd frontend && npx tsc --noEmit` exits 0 (checked at handoff). `npm run build` was not re-run at handoff; `frontend/dist` exists from an earlier build.
- Running at handoff: Vite dev server :5173 (pid 332873), backend API :4000 (pid 203845). Postgres is NOT listening on :5432 here; local compose uses :55432 (not checked).
- Last commit: 135328f (2026-11-03) "fix: complete MMRI functional production blockers". Nothing from this session is committed; no push done.

## 2. White Prism Studio design direction (entry experience)
Scope: `body.mmri-prism-page`, set by `usePrismPage()` (`design/prismPage.ts`), which also sets `html[data-env="prism"]` (white, no ambient pseudo-elements; `glass.css` lines ~78-84). Remove the hook and the page reverts to the dark system.
Principles (header comment of `design/prism.css`): white room, ink type; glass ONLY on controls and key surfaces, never a page-wide panel; one glass recipe; one motion language (2px lift, shadow deepens, edge light brightens, soft pointer highlight on `[data-sheen]`). Black-glass primary CTA. Domains are NOT buttons on the homepage; they live in the hero graphic and under "Оношилгоо".
Customer figures kept at validated values: 320 capabilities, 61,440 questions, 192-280 selected, 12-month plan.

## 3. Homepage + 3D visual implementation
- `pages/Landing.tsx`: hero copy ("Бизнесийнхээ бодит дүр зургийг хар. / Дараагийн 12 сарынхаа зөв алхмыг тодорхойл."), black CTA, THREE guide controls (about / diagnosis / payment — result + payment guides were merged into "Хэрхэн бүртгүүлж, төлбөр төлөх вэ?"), frosted-white guide popups, `<MmriCore onPick={startDiagnosis}/>` in `.mmri-home2__art`.
- `components/MmriCore.tsx`: ONE frontal graphic = glass lens + faceted crystal core, thin black orbit ring, five domain modules at 72° steps (marketing 0°, it 72°, finance 144°, people 216°, operations 288°). Modules are `<button>`s with aria-label + hover tag (domain name); click -> existing diagnosis navigation.
- Assets (path-traced in Blender Cycles OUTSIDE the repo; the .blend/scripts are not in git): `src/assets/hero/core-{ring,core,marketing,it,finance,people,operations}.webp` (~170 KB total) + `core.json` (1600px canvas, per-layer x/y/w/h used for % positioning). Loaded via `import.meta.glob`. To change the art you must re-render and update `core.json`.
- The earlier 7-viewpoint canvas hero (`PrismHero`, `prism-0..6.webp`) was removed.
- Motion (CSS in `pages/landing.css`, JS in MmriCore): pointer parallax via `--px/--py` (lerp 0.1, clamped -1..1, paused off-screen by IntersectionObserver), travelling lens glint, slow idle float (`mmri-core-float`, ±4px), entrance `mmri-core-in` (scale .97->1). Disabled for `prefers-reduced-motion` and `pointer: coarse` (static composition). Popups: `mmri-fade` / `mmri-pop`.

## 4. Design tokens, colours, materials, animations (White Prism, all in `design/prism.css`)
Colours: ink `#0B0F14`, ink2 `#3B4656`, ink3 `#667085`, mist `#F5F7FA`, silver `#D9DFE8`, silver2 `#C4CCD8`, ice rgb `127,166,255`. Page bg `#fff`.
Materials: `--wp-glass` (white .96->.82 vertical gradient), `--wp-spec` (top half-height white specular), `--wp-edge` (135° gradient edge light via masked ::before ring), `--wp-bevel` (inset top white / bottom cool shade / ice under-glow), `--wp-shadow-1/2` (resting/hover), `--wp-black` (CTA gradient `#323C4D -> #161C27 -> #0B0F14`). Blur `--wp-blur:14px` + saturate 150%; menus/panels 22px.
Radii/motion: `--wp-r-sm/md/lg` 14/22/28, pill buttons 999px; `--wp-dur:.26s`, `--wp-ease:cubic-bezier(.2,.7,.2,1)`. Hover = translateY(-2px) + deeper shadow + brighter edge; active = back to 0. Focus ring: 3px ink, 3px offset.
Glass recipe applies to: `.mmri-home2__guide`, `.mmri-shell-primary`, `.mmri-guide2__close`, `.mmri-button--secondary`, notification/public-menu/account triggers. Bell/menu = 46px silver-glass circles with ink icon, unread badge inside the header (ink fill, white 2px border). Notification panel and account menu = frosted white.
Also covered in prism.css: header/nav underline-on-hover, sign-in/registration (`.auth*`), onboarding, fields/tabs/cards/choice cards. Reduced-motion and reduced-transparency blocks exist (prism.css ~145-150, landing.css ~146-147).
Legacy (dark system) tokens still live in `design/tokens.css`, `tokens.ts`, `components/glass.css` (`.content-surface/.glass-regular/.glass-clear/.cat-tile`, `html[data-env]` worlds), domain palette in `domainVisualTokens` (Marketing #E21D2D/#DC2626 era values vary — inspect tokens.css before reuse; backend PDF uses its own accents).

## 5. Files modified but NOT committed (git status at handoff)
Modified: `CLAUDE_PROGRESS.md`, `VERIFY_UI_POLISH.sh`, `frontend/src/components/glass.css` (prism env), `frontend/src/design/environment.ts` (+'prism' env), `frontend/src/main.tsx` (imports prism.css), `pages/Billing.tsx`, `pages/DiagnosisHub.tsx`, `pages/Landing.tsx`, `pages/Login.tsx` (usePrismPage), `pages/Profile.tsx` (usePrismPage), `pages/account.css`, `pages/landing.css`.
New/untracked (frontend): `src/assets/hero/*` (7 webp + core.json), `components/MmriCore.tsx`, `components/BusinessNameFields.tsx`, `data/legalForms.ts`, `design/prism.css`, `design/prismPage.ts`.
Untracked (project root, long-standing, mostly release/step docs + scripts): many `BACKEND_STEP*.md`, `STEP*.md`, `VERIFY_*.sh`, `backend/dist-*`, `backend/integration/`, `backend/methodology/*.json` etc. Do not blindly `git add -A`: backend/methodology + backend/integration are ~1.3 GB and gitignore'd by design; review `git status` per directory. `.env` must never be committed.
Suggested checkpoint when the user allows: commit the 11 modified files + the 6 new frontend files only.

## 6. Remaining frontend screens requiring redesign (decision needed first)
All still dark liquid-glass (powder-blue/indigo sheet, white text) and visually inconsistent with the white entry pages: Diagnosis hub (category cards `.cat-tile`, status capsule + 4-step track, domain dialog), Questionnaire (`AssessmentInline`), Results, Report (+ near-solid paper, category-tinted sheet), Priorities, Billing (only touched lightly), Settings, Support/States, mobile bottom nav, app header once logged in (prism header applies only on prism pages).
Approach: extend `design/prism.css` scoping (or generalise `usePrismPage` to those routes); replace owning rules, do NOT stack overrides (CLAUDE.md rule). Keep: report paper solid; actual PDF never glass; status = green/amber/red only; domain colours only where meaningful; no hover movement on icons/PDF control (note: prism controls DO lift 2px — fine for buttons, not for domain icons/PDF button; make sure the PDF button stays stationary 200x44).
Also pending from earlier: retake entry point exists (Diagnosis card/dialog + report version strip); profile onboarding questions are Marketing-worded for all domains.

## 7. Known bugs and warnings
1. `VERIFY_UI_POLISH.sh` CRASHES: FileNotFoundError `frontend/src/components/OpalGlass.tsx`. The gate (lines ~54 and ~56) still references an abandoned hero (`OpalGlass`, `mmri-glass3d__hit`). Fix = rewrite those two checks for `MmriCore.tsx` (`mmri-core__module`, `aria-label`); do not weaken them. Until fixed the whole UI gate cannot report. Also check the edited guide-modal check (`env(safe-area-inset-bottom)`, `max-height:100%`) against landing.css.
2. Stale gate elsewhere: `VERIFY_STEP09_CSS_REGRESSION.sh` / `VERIFY_STEP10_FINAL_FREEZE.sh` expectations (import count 19, variable contract) likely stale after prism.css was added; run and update intentionally.
3. Not visually re-verified after the last prism edits: Login submit flow, Profile onboarding, notification panel on mobile, guide popups at 390px, MmriCore at 390px/820px, all in-browser. No screenshot QA was done at handoff.
4. Coarse-pointer / reduced-motion path of MmriCore is untested on a real touch device. WebKit/Safari was never testable on this host (`backdrop-filter`, `mask-composite` edge ring need a Safari check).
5. `.env` AI settings: `MMRI_AI_REPORT_TIMEOUT_MS` in backend/.env is still the old 45000 -> real AI narrative (~55 s) aborts and falls back. Recommended: TIMEOUT_MS=120000, TOTAL_TIMEOUT_MS=200000, MAX_RETRIES=1 (documented 2026-11-03 (4); not written to .env). nginx `proxy_read_timeout` 35 s vs report generation up to ~66 s (frontend polls the 409 REPORT_GENERATION_IN_PROGRESS).
6. Dev DB: Finance legacy demo assessment (completed on 4.2.4) has a frozen snapshot with the wrong bundle hash; its report 500s by design. Report 2026-09-08 (older Marketing) -> 500 "Stored PDF artifact source does not match immutable published report". Not repaired.
7. Content: numeric authority matrices in non-Marketing bundles are positional copies of Marketing's (scoring-adjacent, left untouched); Many_to_Many contract still keyed MSxx (inert). Narrative text "81.7" vs tile "82" (frozen narrative).
8. Notifications are client-side only (localStorage per company); backend has no notification API.
9. Hero source art (Blender scene) is not version-controlled; losing the 7 webp layers means re-rendering.

## 8. Backend and methodology areas that MUST remain unchanged
Scoring engine and aggregation; capability/cell methodology and adaptive question selection; question bank (61,440 questions; v2.5 / 4.x.7 bundles; `backend/methodology/**` published versions are immutable — publish a new version, never edit); recommendation contracts (`methodology/recommendation-contracts`, `businessmri-v2.6-runtime-bundles`); findings logic (strict VALIDATED first, then RELATIVE_RANK completion); report payload/trace gates (T09/T10) and frozen snapshots; PDF generator (`pdf_renderer/render_report_pdf.py`, `report/pdf-artifact.ts`, version 1.5, exactly 3 A4 pages, no glass); payment policy (diagnosis 300,000₮, retake 300,000₮, retake keeps old report); DB schema + lifecycle trigger (`Prisma.DbNull` fix stays); AI boundary (key server-side only; never expose); `backend/.env`, PostgreSQL data, production credentials. Results, Report and PDF must keep showing the same backend-derived score/findings; frontend must not rank findings itself.

## 9. Exact commands
Install/run full local stack (needs Docker + Node 22.16): `cd ~/MMRI_STEP10_FINAL_WORKING && ./START_LOCAL.sh` (Postgres :55432, migrations, import, API, UI). Stop: `./STOP_LOCAL.sh`. Safe installer: `./SAFE_INSTALL_AND_RUN.sh`.
Manual dev (what is running now): backend `cd backend && npm run api:dev` (:4000; restart after backend edits; avoid `pkill -f` patterns that match your own shell). Frontend `cd frontend && npm run dev` (:5173, proxies /api -> :4000). Preview of the production build: `cd frontend && npm run build && npx vite preview --port 4173`.
Checks: `cd frontend && npx tsc --noEmit` (OK at handoff); `npm run build` (tsc + vite); `./VERIFY_UI_POLISH.sh` (currently crashes, see bug 1); `./VERIFY_STEP09_CSS_REGRESSION.sh`; `./VERIFY_STEP10_FINAL_FREEZE.sh`.
Backend tests: rebuild first (scripts import compiled dist): `cd backend && npx tsc -p tsconfig.production.json && npx tsc -p tsconfig.strategy.json`, then e.g. `node scripts/findings-fallback-regression.mjs` (105 checks), step12 PDF regression/static, task08-report-contract-regression, `npm run verify:recommendation-contracts` (45), `npm run api:verify`, `npm run strategy:verify`, `npm run security:verify`.
Screenshots: `google-chrome --headless=new --no-sandbox --disable-gpu --virtual-time-budget=4000 --window-size=1366,900 --screenshot=<abs path> http://localhost:5173/` (hash routes e.g. `/#/analysis`; 390x844 for mobile). Demo login `demo@mmri.mn` (dev only; password is in the local seed, not recorded here). Backend assessment writer lease is 120 s (different writer id -> 409 until expiry).
Unlock AI report timeouts for the API process (do not edit .env unless asked): `MMRI_AI_REPORT_TIMEOUT_MS=120000 MMRI_AI_REPORT_TOTAL_TIMEOUT_MS=200000 MMRI_AI_REPORT_MAX_RETRIES=1 npm run api:dev`.

## 10. Remaining production-readiness tasks
1. Fix `VERIFY_UI_POLISH.sh` (OpalGlass references) and re-baseline CSS/freeze gates; get all gates green.
2. Visual QA of the White Prism pages at 1366/820/390 + keyboard focus rings + reduced-motion + Safari/WebKit.
3. Decide and execute the design direction for inner pages (section 6), then re-run the 10-route x 3-width audit (no overflow / small targets / clipped text / contrast).
4. Run `npm run build`, commit a checkpoint (user approval), keep `.env`, datasets and dist output out of git.
5. Apply the AI timeout values in the real environment and raise nginx `proxy_read_timeout` above report generation time (or rely on 409 polling and verify it end to end).
6. Repair or regenerate legacy demo reports that 500 (Finance 4.2.4 snapshot; 2026-09-08 Marketing PDF artifact) — or remove them from demo data.
7. Server-side notifications (optional), profile onboarding questions per domain, prune the ~200 KB legacy `styles.css`.
8. Real PostgreSQL connected gate (`RUN_STEP12_CONNECTED_RELEASE_GATE.sh`, `npm run postgres:gate`), Docker build of `backend/Dockerfile.production`, backup/restore drill (`BACKEND_STEP18_DATABASE_RECOVERY.md`), real payment-provider test (local mock via `ENABLE_LOCAL_PAYMENT_MOCK.sh` must be off in production).
9. Back up the Blender source for the hero art into the repo or shared storage.

## 2026-11-04 Hero redesign (White Prism)
- `components/MmriCore.tsx` rewritten as ONE SVG composition (no webp): glass lens + five-facet domain crystal, five glass ring segments (coral/cyan/gold/violet/jade), links, glass chip anchors. Layers parallax by depth; chips/segments cross-highlight on hover/focus. `assets/hero/*` and `core.json` are now UNUSED (kept, not deleted).
- `prism.css`: header geometry (60px shell, bell 46px, badge inside), light mobile bottom nav, glass highlight sweep on hover. Gold accent now #E2B03C.
- Not touched: dark inner pages (Diagnosis hub etc.), VERIFY_UI_POLISH.sh (still references OpalGlass).

## 2026-11-04 (2) White Prism across the whole app
- `usePrismBody()` (AppShell) puts `mmri-prism-page` on every shell route. `design/prism-app.css` (imported before preferences.css) re-points the legacy dark tokens + their `:root` aliases to the light palette, floors the page in pearl white and skins dialogs/priorities. Page CSS (results/report/account/billing/questionnaire/support/priorities/diagnosis/glass) had hard-coded white text/borders/dark panels converted to tokens in place.
- Diagnosis cards (`.cat-tile`) = pearl glass card + ONE glossy domain-colour panel; stationary on hover (frozen rule). Area dialog + generic `.mmri-dialog` are frosted white. Report paper is solid white (no blur); the PDF is untouched (3 pages verified).
- Domain colours unified everywhere (tokens.css + tokens.ts): coral #F2705F, cyan #36C2E8, gold #E2B03C, violet #8E63D9, jade #2FA67A.
- Dev QA account: `cd backend && npm run qa:seed` (local DB only; refuses NODE_ENV=production / non-local DATABASE_URL). Seeds one company with 2 completed diagnoses (first + retake) for all five domains, plans, frozen reports, payment history states. Password is random (or MMRI_QA_PASSWORD) and lives only in git-ignored `backend/.qa-credentials.local` (mode 600). Legacy `demo@mmri.mn` seed still has its password in source (pre-existing).
- Gates updated intentionally: VERIFY_UI_POLISH (hero checks -> MmriCore, report paper/tabs, domain tokens), VERIFY_STEP09 (21 imports, runtime vars --ox/--oy), VERIFY_STEP10 (96/96). STEP07/08/11 scripts reference long-deleted files (pre-existing, not touched).

## 2026-11-04 (3) FINAL VERIFIED STATE: White Prism across the app + dev QA account  [supersedes the "remaining screens" list in section 6 above]

### Design status
White Prism now covers every shell route (`usePrismBody()` in AppShell; tokens re-pointed in `design/prism-app.css`; page CSS converted in place). Homepage hero = ONE integrated SVG (`MmriCore.tsx`: lens + 5-facet crystal + 5 glass ring segments + chips). Diagnosis cards, dialogs, results, priorities, report (solid white paper, no blur), billing, profile, settings, login, notifications, mobile bottom nav all migrated. Domain colours unified (tokens.css + tokens.ts): coral #F2705F, cyan #36C2E8, gold #E2B03C, violet #8E63D9, jade #2FA67A. `color-scheme` is now `light` (was a leftover `dark`). Diagnosis profile-gate banner crowding fixed (flex column; banner height comes out of the cards).

### Dev QA account (local only)
- Account: `qa.local@mmri.test`, company "QA Локал Компани ХХК". **5 domains x 2 completed diagnoses = 10** (first 2026-03-15, retake 2026-09-08), each with frozen diagnosis, recommendations, 12-month plan, payment history (paid, created, pending, failed, cancelled), retake history.
- Password: random (or `MMRI_QA_PASSWORD`), stored ONLY in `backend/.qa-credentials.local` (git-ignored at .gitignore:70, mode 600, not in any log or tracked file). Read it with `cat backend/.qa-credentials.local`.
- **Exact (re)run command:** `cd backend && MMRI_QA_SEED_LOCAL_DB=127.0.0.1:55432/mmri npm run qa:seed`   (add `-- --reset` to rebuild everything; the one-time cascaded delete is slow, ~13 min).
- Safety (all tested): refuses NODE_ENV/MMRI_ENV/APP_ENV containing "prod"; requires a loopback host AND the typed `MMRI_QA_SEED_LOCAL_DB=<host:port/db>` key (covers an SSH tunnel to a remote DB); QA email must be on `@mmri.test` and an existing non-QA user with that email is refused (the override could otherwise have reset a real user's password, closed); every delete is scoped to the QA company after `assertDedicatedQaCompany` (flag + tag + name + sole member) and billing deletes to the `QA-LOCAL-` prefix; idempotent (re-run: 40 assessments unchanged, credentials file hash and tokenVersion unchanged); per-domain fixture fingerprints rebuild only changed domains.
- Fixture design: controlled per-module inputs (`SCENARIOS`) through the real scoring/root-cause/recommendation/plan pipeline; nothing writes actions directly. Rotating measured cell per category; only UNCONDITIONAL cells (`naPolicy==="DISALLOWED"`); marketing needs 3 answers/cell (confidence contract minimumDirectAnswers=3, 256 answers, inside QUICK 192-280), v2 domains 2 answers/cell (192).

### Marketing QA fixture failure and resolution
Symptom: `GET /assessments/:id/report` and `/report/pdf` returned HTTP 500 for Marketing only. Root cause (reproduced once, direct service call): report integrity gate `T05_ROOT_PROVENANCE` / `T06_RECOMMENDATION_PROVENANCE`: my fixture answered CONDITIONAL cell MS46:C45 without resolving applicability, so the engine flagged REVIEW_REQUIRED and emitted trace `contradiction:MS46:C45`; the fast demo materialiser does not persist contradiction rows, so the trace could not resolve. Fixture bug, not an application bug; the integrity gate was NOT weakened. Fix: QA selection excludes conditional cells (selection logic `rotating-cell/v2-unconditional`).
Earlier Priorities-empty cause: old fixture produced only evidence actions (5 evidence / 0 execution). Non-marketing bundles have no root-cause graph edges, so execution actions can only be LOCAL_IMPROVEMENT (cell value <40, confidence >=0.8); marketing needs finalised cells.

### Verified results (final)
- Recommendations: all 10 diagnoses = 5 execution (LOCAL_IMPROVEMENT) + 2 evidence actions. Priorities page populated for all five domains (viewed Finance 1600px, Marketing 1366px).
- Reports: all 10 `GET /report` = 200. PDFs: all 10 `GET /report/pdf` = 200, exactly 3 pages each (marketing/it/finance/people/operations x first+retake). PDF page 2 viewed for Finance retake: 5 actions, QA company footer.
- Frontend: `tsc --noEmit` OK, `npm run build` OK. Backend `tsc --noEmit` OK.
- Gates: VERIFY_UI_POLISH 121/121; VERIFY_STEP09_CSS_REGRESSION 96/96; VERIFY_STEP10_FINAL_FREEZE PASS (now also runs the new prism gate); VERIFY_FRONTEND_WHITE_PRISM 31/31.
- Backend regressions: pdf-static 21/21, pdf-regression 23/23, findings-fallback 105/105, step08 recommendation 85/85, step09 action-plan 115/115, step07 findings 100/100.
- Browser: 7-viewport sweep (1920,1600,1366,1024,768,390,360; 16 captures each) = no overflow / off-screen or clipped controls / hidden popup close / JS errors (last full sweep before the final fixture rebuild; only small CSS colour fixes since). Keyboard-focus audit: every focusable on 9 pages has a ring. Hover audit done; contrast audit: no real failures. Reduced-motion verified.
- Visual review set: 87 screenshots in `~/Downloads/MMRI_FINAL_VISUAL_REVIEW/{1600x1000,1366x768,390x844}/` (home, guides, login, diagnosis, dialog, notifications, results/priorities/report x5 domains, billing, settings, payment history, profile, questionnaire).

### Verification scripts: retired and replaced
`VERIFY_STEP07_SETTINGS_DARK_MODE.sh`, `VERIFY_STEP08_RESPONSIVE_GLOBAL.sh`, `VERIFY_STEP11_RESPONSIVE_REPORT_PDF_INTERACTION.sh` moved to `retired-verifiers/` (README explains each; they tested deleted `release-r1721-4-*.css`/`BusinessRadar.tsx`, a removed dark theme and Settings technical-preferences panel, and a stale 4-page PDF). Replacement: `VERIFY_FRONTEND_WHITE_PRISM.sh` (responsive breakpoints/safe areas/touch, reduced motion+transparency, focus rings, prism-app load order, no hard-coded white text, report paper solid, PDF button geometry, tile stationary, color-scheme light, no "/100", tappable roadmap card as native button, no 4th PDF page, radar gone). Counts were not edited to pass. Frozen counts changed intentionally: STEP09 imports 20->21 (prism-app.css), runtime vars --i -> --ox/--oy, UI polish 120->121 (new banner check), STEP10 92->96 / 120->121.

### Uncommitted source files (NOTHING is committed; stash list empty)
Modified (tracked): `.gitignore`, `VERIFY_UI_POLISH.sh`, `CLAUDE_PROGRESS.md`, frontend/src: `components/{AppShell.tsx,components.css,forms.css,glass.css}`, `design/{environment.ts,tokens.css,tokens.ts}`, `main.tsx`, `pages/{Billing,DiagnosisHub,Landing,Login,Profile}.tsx`, `pages/{account,billing,diagnosis,landing,login,priorities,questionnaire,report,results,support}.css`.
New (untracked) frontend: `src/assets/hero/*` (UNUSED old art, kept), `components/{MmriCore.tsx,BusinessNameFields.tsx}`, `data/legalForms.ts`, `design/{prism.css,prism-app.css,prismPage.ts}`.
New (untracked) backend/root: `backend/src/seed-qa-account.ts`, `backend/package.json` (untracked in git; contains the `qa:seed` script), `VERIFY_FRONTEND_WHITE_PRISM.sh`, `VERIFY_STEP09_CSS_REGRESSION.sh`, `VERIFY_STEP10_FINAL_FREEZE.sh` (step scripts are untracked, so no git diff baseline), `retired-verifiers/`. Never `git add -A` (large methodology/dist/backup trees; `.env` and `backend/.qa-credentials.local` must stay out).

### Remaining limitations / untested
Safari/WebKit and real touch devices untested. Non-marketing QA scores are position-based synthetic values; Priorities rows are all LOCAL_IMPROVEMENT with showcase milestone statuses (QA data). Dev-only `demo@mmri.mn` seed still has its password in source (pre-existing). AI report timeouts (.env 45 s) and nginx proxy_read_timeout are unchanged (see section 7). Old hero webp assets unused. `qa:seed` host check cannot detect a tunnel by itself; the typed key is the mitigation. The final 87-screenshot set was only spot-viewed.

### UPCOMING TASKS (preserve, in order)
1. Finish and visually verify the three homepage guide popups to the user's latest requirements.
2. Implement the researched ten Mongolia-related business facts with non-repeating random rotation.
3. Verify the complete White Prism design across all pages.
4. Safe Git checkpoint (explicit file list, no `-A`).
5. Full security and production-readiness audit.
6. `/code-review ultra` (user-triggered; formerly /ultrareview) after critical issues are resolved.

## 2026-11-04 (4) Homepage guides redesign + loading facts (NOT committed; awaiting user visual review)
- Guides now live in `frontend/src/pages/HomeGuides.tsx` (AboutGuide / ReportGuide / HowToGuide); `Landing.tsx` keeps the triggers, focus trap, Escape, animated close and renders the dialog through a portal to `document.body` (so it covers the header). Labels: "BusinessMMRI.mn гэж юу вэ?", "Оношилгооны тайлангаар юу харах вэ?" (popup heading "Оношилгооны үр дүн"), "Хэрхэн оношилгоо хийлгэх вэ?" (popup heading "Бүртгүүлэх, төлбөр төлөх заавар"). Guide CSS = end of `pages/landing.css` (one shared glass material, 28px margins desktop / 10px mobile).
- Guide 2 table is illustrative text only (labelled ЖИШЭЭ); no scores. Guide 3 uses real screenshots `frontend/public/guide-shots/{1..7}-*-{d,m}.jpg` captured from the local QA company (no e-mail/password/token visible). Step 5 image is the app's own example-question component (`#/states`), because no live in-progress assessment exists in QA data.
- Loading facts: `data/mongoliaFacts.ts` (10 World Bank WDI / ADB facts with year+source+URL, shuffle-bag in sessionStorage `mmri.loadingFacts.v1`), `components/LoadingFact.tsx`, rendered inside `SkeletonScreen` only (never error/empty). 600 ms grace, swap every 9 s. Added missing skeleton wrapper CSS (sr-only label, light boot ground) in components.css.
- Gates updated intentionally (copy/contract changed): VERIFY_UI_POLISH labels + `height:100%`; STEP09 guide safe-area now top+bottom env(); WHITE_PRISM breakpoint 900->820; VERIFY_LINUX_PACKAGE labels. Results: UI polish 121/121, STEP09 96/96, STEP10 FINAL FREEZE PASS, tsc OK, build OK.
- Review screenshots: `~/Downloads/MMRI_GUIDES_FINAL_REVIEW/`.

## 2026-11-04 (5) Pearl Mist + layout refinement (NOT committed; awaiting user review)
- Pearl Mist tokens (`--pm-*`, deep ink #162333) in prism.css; floor + faint glass segments (`assets/bg/glass-segments.svg`, html::after) in prism-app.css. Shared interaction tokens `--ix-*` (prism.css); hover never moves controls (VERIFY_INTERACTION_SYSTEM.sh).
- Hero: no filters on SVG segments (nested-filter risk), halo/tint/edge strokes driven by `--w` (angular falloff set in MmriCore.setWeights); chips stationary; leave hysteresis 70ms.
- Guides: popup margin 28px; zig-zag spine (38%) in Guide 1; Guide 3 = 22% column (steps + notice) / 78% (copy + screenshot sized by viewport height via --ar); Guide 2 table clip shell + scroller; report date tabs are date-only.
- Diagnosis cards: grid rows 12/36/18/12/14 fr, score dial from real score (--v).
- Gate edits: runtime vars --v,--w,--ar added; focus-ring token; ink #162333.
- Review: ~/Downloads/MMRI_LAYOUT_REFINEMENT_REVIEW/ (also MMRI_PEARL_MIST_REVIEW/).

## 2026-11-04 (6) Live UI refinement (NOT committed)
- Em dash removed from all frontend source and gates; server text normalised in api/client.ts (noEmDash). Guide 3 = accordion steps (Алхам N, label on active), 32/68 columns, notice under steps. Diagnosis cards larger (38vw cap 640px), centred titles. Animated glass backdrop (assets/bg/glass-a.svg, glass-b.svg). Hero gradients vivid (acc-based stops). Screenshots: ~/Downloads/MMRI_LIVE_UI_REFINEMENT/.

## 2026-11-04 (7) Mongolian wording audit (NOT committed; full report in ~/Downloads/MMRI_WORDING_AUDIT/WORDING_AUDIT_REPORT.md)
- Checked 5,140 source strings (2,802 unique, 86 files), 472 DB columns (2.22M Cyrillic cells, read-only), 80 methodology JSON files, 10 PDFs.
- Fixed: "Хүчтэй тал" -> "Давуу тал" (Report.tsx x3, PDF renderer heading); PDF "Анхаарах талын" -> "Сул талын"; PDF text() strips em dashes; fallback narrative S01 em dash. Stale check in VERIFY_STEP12_STATUS_PDF_HOVER_REFINEMENT.sh updated.
- New test: backend/scripts/wording-terminology-regression.mjs (27 checks, mutation-checked). UI polish 121/121, pdf-static 21/21, builds OK.
- Open (not changed): recommendations.ts:276 em dash in hash-bound evidence titles (146k DB rows); root-cause label disagreement Results.tsx vs content/mongolian.ts; AI S05 headings drift in 16 frozen snapshots (prompt lacks exact titles). Backend dist not rebuilt (fallback-renderer change needs build).
- VERIFY_STEP12_STATUS_PDF_HOVER_REFINEMENT.sh is broken by a deleted CSS file (pre-existing); candidate for retirement.

## 2026-11-05 (8) Holographic Liquid Glass redesign finished (NOT committed; awaiting user review)
- Backup: ~/MMRI_BACKUPS/MMRI_PRE_HOLOGRAPHIC_DESIGN_2026-11-04 (verified; restore steps in its RESTORE_INSTRUCTIONS.md, incl. frontend-only restore). Earlier interrupted attempt saved under interrupted_partial_attempt/.
- Tokens in design/prism.css (--hg-*), materials in design/holo.css, popups in pages/landing.css, backgrounds GlassStage.tsx. This pass: lighter guide scrim, guides stack <=900px, guide-3 step strip wraps, gate counts updated (122, 100).
- Results: tsc/build OK; gates 122/122, 31/31, 100/100, 23/23, freeze PASS; browser 29/29; 9 viewports x 14 pages no overflow; axe 0 violations (1440, 390).
- Review pack: ~/Downloads/MMRI_HOLOGRAPHIC_DESIGN_REVIEW/. Dev servers (backend :4000 with extra ALLOWED_ORIGINS env, vite :5173, preview :4173) left running.

## 2026-11-05 (9) Complete system validation (NOT committed; evidence in ~/Downloads/MMRI_COMPLETE_SYSTEM_VALIDATION/)
- 817 test rows: 759 PASS, 6 FAIL, 31 WARNING, 17 NOT TESTED, 4 INFO. Verdicts in FINAL_VERDICT.md; blockers in RELEASE_BLOCKERS.md. Not claimed: real QPay, real AI, Safari/devices, native Mongolian review, legal.
- Fixed with regression tests: PAY-CONC-3 invoice race (advisory lock, billing-service.ts), fallback executive conclusion >160 words caused HTTP 500 (fallback-renderer.ts), malformed URL 500 (app.ts), root-cause labels (Results.tsx), canonical PDF/web terms "Тэргүүлэх 5 ажил" / "12 сарын төлөвлөгөө". New tests: backend/scripts/qa-live-api-regression.mjs, qa-fallback-conclusion-length-regression.mjs.
- INPUT-TRAVERSAL was a harness stale-socket artifact (not a product bug).
- Open: engine:verify (legacy hard-contradiction smoke, needs scoring owner), strategy:verify (strength cap 3 vs 5, stale), no password recovery, no privacy/terms, no deletion/export, backend/package.json + lock untracked in git, stale backend/.env.backup-before-ai-* with a live key, 29 FK columns unindexed.
- IMPORTANT: for validation the dev API was started with MMRI_AI_REPORT_PROVIDER=disabled and OPENAI_API_KEY="" (env only, .env untouched) so no paid call could occur. Restart without those overrides only when AI testing is approved.

## 2026-11-05 (10) Six validation failures addressed (NOT committed; stopped at user request)
- Done: password recovery (mock mail only), Privacy/Terms drafts (legal approval pending), data export + erasure (payments/audit retained, retention undecided), .gitignore for generated dist dirs, engine:verify and strategy:verify repaired, AI mock grounding tests + gated real-AI smoke script (not run). Stale backend/.env.backup-before-ai-* removed (secrets were identical to working .env).
- Open: engine rules H04/H05 are dead in live banks (owner decision, not changed); real mail provider; real AI; legal text approval; retention decisions; commit of the checkpoint files (evidence/six-failures/release-checkpoint-candidate-files.txt).
- Not written (stopped): SIX_FAILURES_RESOLUTION.md, UPDATED_RELEASE_BLOCKERS.md, UPDATED_STAGING_VERDICT.md. Existing: ~/Downloads/MMRI_COMPLETE_SYSTEM_VALIDATION/UPDATED_TEST_EVIDENCE.json, DATA_LIFECYCLE at backend/docs/DATA_LIFECYCLE.md.
- Dev API runs with AI disabled via env overrides; two additive DB migrations applied to the local DB (20261105120000, 20261105121000).

## 2026-11-05 (11) Recovery checkpoint before the admin phase
- ~/MMRI_BACKUPS/MMRI_CHECKPOINT_PRE_ADMIN_2026-11-05_2044 (source, separate secrets archive, DB dump with 27 migrations, SHA256SUMS, RESTORE_INSTRUCTIONS.md). Verified: gzip, full extract diff identical, DB restored into scratch DB with identical counts, scratch dropped. Commit candidate list: commit_candidate_files.txt (483 files, no credentials). Nothing committed.
- H04/H05 recorded as unresolved methodology issues (UNRESOLVED_METHODOLOGY_ISSUES.md in the checkpoint). Scoring rules unchanged.

## 2026-11-06 (12) Admin Center, questionnaire autosave, answer colours and review workflow implemented (NOT committed; stopped for inspection)
- Delivery folder: ~/Downloads/MMRI_ADMIN_COMPLETE/ (18 documents + evidence/). Resume file: ADMIN_PROGRESS.md. Backup before the work: ~/MMRI_BACKUPS/MMRI_CHECKPOINT_PRE_ADMIN_2026-11-05_2044.
- Built: admin login with password + TOTP MFA (CLI-only bootstrap, 3 roles, re-auth, lockout, audit), 48h review workflow behind MMRI_REPORT_REVIEW_REQUIRED (default false), 3-column editor with immutable revisions and optimistic concurrency, evidence viewer, AI proposals (mock only), notifications with dedupe and reminders, companies, payments and disputes (refund approval only), support cases, audit log. Migration 20261106100000_admin_system (additive, rollback tested). Questionnaire: no Save buttons, automatic saving with retry, semantic answer colours (61,440 questions verified), corrupted-text root cause fixed (raw server errors reached the UI). Customer Report/Results pages show the pending-review notice.
- Tests: review E2E 35/35 (IT) and 32/32 each for 4 other domains; admin API 30/30; admin UI browser 35/35 (7 viewports, axe 0); questionnaire browser 16/16; earlier suites still pass (password recovery, data lifecycle, AI mock grounding, step17, step13, step10, step12, routing, scoring, engine contract, api-static-check).
- Not tested / limits: real e-mail, real AI (provider disabled, proposals are mock rules), real QPay and refunds, customer pending notice in a browser, Safari/real devices, 1280 and 320 widths, qa-live-api-regression with the flag on. Strengths/weaknesses are topped up by RELATIVE_RANK in QUICK mode (coverage about 7%); methodology unchanged (H04/H05 still open).
- Dev API runs with MMRI_REPORT_REVIEW_REQUIRED=true, AI disabled env overrides, admin QA accounts all DISABLED. Admin login: http://localhost:5173/#/admin/login ; create first admin: cd backend && npm run admin:bootstrap -- --email <address>.

## 2026-11-06 (13) Codex audit repairs: 7 HIGH + 2 MEDIUM (NOT committed; stopped for the independent FINAL AUDIT)
- Baseline: HEAD 135328f (main), 335 dirty entries before the final audit; old folder /home/kirby/MMRI_STEP10_FINAL_WORKING untouched (no newer files). The Codex report itself is not on disk, so which source version it read cannot be proven; all nine findings were re-verified against the saved source and ALL NINE REPRODUCED (none false positive, none already fixed).
- Customer login (earlier task) re-verified in a real browser for QA + demo on the new stack; fix is `frontend/src/pages/Login.tsx` (auth vs post-login errors). Root cause was the OLD backend on :4000 refusing Origin :5174 (CORS_ORIGIN_DENIED) - see Phase 4.
- Findings (root cause -> fix): H01 review created only in /complete after the fact, errors swallowed -> `services/report-review-policy.ts` enqueues the review INSIDE the terminal transaction of all 3 production completion paths (last answer, explicit complete, lifecycle auto-finalize); read gate fails closed (creates missing review, 409 REPORT_PENDING_REVIEW); action-plan PATCH now gated. H02 owner export returned drafts/scores -> derived content withheld unless PUBLISHED (`derivedContent`). H03 publish "claim" only bumped version; edits/return still allowed; final update unguarded -> exclusive `PUBLISHING` state, approval stores `approvedRevision` + `approvedNarrativeHash`, guarded final update, rollback + recovery in maintenance. H04 malformed COPY silently overwrote runtime package.json with the lockfile (Docker does NOT reject it); runtime lacked poppler-utils (pdfinfo); slim image lacked OpenSSL so Prisma could not load its engine (image could not query the DB); no .dockerignore -> fixed in Dockerfile.production/.migrate, schema binaryTargets, .dockerignore. H05 report_reviews FK RESTRICT + append-only revisions blocked erasure; ALSO unindexed cascade FKs made erasing one full assessment take 286 s then 500 -> erasure deletes review content under a transaction-local trigger exemption, keeps content-free admin_audit_events, 3 additive indexes, 120 s tx budget (now 277 ms). H06 reset did not touch admin sessions -> revoked in the same transaction. H07 cancel overwrote PAID with CANCELLED -> provider pre-check + guarded transition; a provider-verified payment after a cancel is reconciled. M01 button only read cached status -> POST reconcile (auth + per-user/invoice limiter 6/min, 429 message, pending state, fallback for mock/manual). M02 approval accepted REPAIR_REQUIRED which the customer page rejects -> approve+publish require PASS; validator V29/V30/V31/V36/V37 compare titles modulo the em-dash display rule (without it every draft with em-dash action titles was unpublishable). Validator VERSION constant deliberately NOT bumped (would regenerate stored reports).
- Migration `20261106120000_review_hardening` (additive): 2 columns, revision trigger function, status CHECK adds PUBLISHING, 3 indexes. Frozen fingerprints updated (deploy/ and backend/prisma/MIGRATION_CHAIN_SHA256.txt). NOT APPLIED TO THE LIVE `mmri` DATABASE (28 migrations, counts unchanged); applied only to the scratch clone `mmri_codexfix`. New code needs it applied first.
- Tests (all on scratch DB, AI disabled, mock billing/mail): `backend/scripts/run-codex-repair-gate.sh` (MMRI_TEST_DB=mmri_codexfix) = 12/12 suites PASS: tsc BE+FE, static guards 18, migration chain, billing race+reconcile 11, review policy 9, admin API 30, password recovery 17, admin reset sessions 5, data lifecycle 23, codex findings e2e 28, admin review e2e 35. Mutation-checked: H07 guard, H06 revocation. Also: UI polish 122/122, frontend build OK, step17 19/19, step12 pdf static, step13 payment, step04, api-static. Docker image builds; in the image: PDF 3 pages, approved text, deterministic, pdfinfo present.
- Test harness fixes (stale/test-side, not production): LC-8 retained-list assertion by name; PWR/LC scripts honour PGDATABASE; step11 `landing_states_retake_300k` fails on Landing copy - PRE-EXISTING, untouched.
- Phase 4 cutover: `backend/scripts/dev-backend-cutover.sh check|prepare|switch`. Health alone cannot tell old from new (both "ok"/releaseSha dev); new non-production header `x-mmri-release` + RELEASE_SHA prove the revision to a browser. `check` run for real (:4000 = OLD source). `prepare`/`switch` rehearsed on a stand-in process + scratch DB only; NOT executed against :4000 or the live DB.
- Open / decisions: audit-evidence retention + dispute/support-case redaction (owner/legal, docs/DATA_LIFECYCLE.md items 8-9); real QPay, real mail, real AI, Safari/devices untested; the :4001/:5175 stack from the login task runs pre-repair code against the live DB - stop it after cutover; scratch DB mmri_codexfix (2 GB) and image mmri-api-codexfix-test:local kept for the audit.

## 2026-11-06 (14) Independent source audit (A1-A8) verified and repaired (NOT committed)
- Audit files: ~/Downloads/MMRI_AUDIT_FOR_CLAUDE/. Test stack (isolated, loopback only): API :4010 on scratch DB `mmri_codexfix`, Vite :5176. Live `mmri` DB only read (SELECT of question_options). Not restarted: :4000/:4001 services.
- Verdicts. A1 CONFIRMED (three layers competed: questionnaire.css rules were dead behind prism.css/holo.css; visuals were differentiated but weak) -> single contract in pages/questionnaire.css (rest 30% / hover 42% / selected 56% + ring + filled mark), prism.css/holo.css carry no answer-card rules. A2 LATENT, not live: guessed `reverse()` branch is hit by 0 of 208,896 question rows (61,440 live + other methodology versions); guess removed (unknown order = listed order, neutral colour; explicit `listedOrder` param). A3 CONFIRMED statically (navy remnant in forms.css, white text on UA tint); fixed with dark-ink/white-inset autofill rules; real Chrome autofill NOT triggerable headlessly (verified by CSSOM rule only). A4 CONFIRMED: pseudo-random QR removed; real QR via qrcode-generator@2.0.4 from provider qrText (decoded back with jsQR at 1280 and 390); MOCK shows explicit non-payable state. A5 CONFIRMED release blocker (only mock|disabled mail), not implemented, no fake delivery. A6 CONFIRMED: frontend DTO unions now equal backend provider/enum (MANUAL, REFUNDED, manualMode). A7 CONFIRMED: API binds 127.0.0.1 unless NODE_ENV=production/API_HOST; demo button needs VITE_MMRI_SHOW_DEMO_LOGIN=true; PUBLISH_TEMPORARY_LINUX.sh needs MMRI_PUBLIC_PREVIEW_ACK=STAGING_ONLY; demo seed refuses production. A8 CONFIRMED: demo questionnaire now uses buildDemoAnswerLayout (same contract).
- New tests: qa/audit-fix-static.mjs (18, corpus optional via options.tsv), qa/answer-contrast.mjs (min 6.57:1), qa/ui-audit-fixes.mjs, qa/ui-auth-register.mjs; qa/ui-answer-colors.mjs and ui-questionnaire-autosave.mjs now take BASE/API/ORIGIN/VW/VH env.
- Open: real mail provider (blocker), real QPay sandbox/callback, real autofill, Safari/devices, demo-mode questionnaire in a browser, profile onboarding tone direction (Profile.tsx positionalAnswerStyle worst-first assumption, left unchanged), restart of :4000/:4001 needs approval, package.json/lock gained qrcode-generator.
- Final results (after machine restart, stack rebuilt): answer-colour browser 10/10 for each of 5 domains at 1280 and 390; ui-audit-fixes 14/14; ui-auth-register 7/7; questionnaire autosave 16/16 (axe 0, 44px targets); audit-fix-static 18/18 incl. 208,896-question corpus; contrast min 6.57; UI polish 122/122; frontend build OK; run-codex-repair-gate 12/12. Test servers :4010/:5176 stopped.

## 2026-11-06 (15) Browser login 403 from dev origin :5174 fixed (NOT committed)
- Root cause: `.env` ALLOWED_ORIGINS lists only :5173; `applyCors` / `requireTrustedBrowserOrigin` (backend/src/api/app.ts) throw 403 CORS_ORIGIN_DENIED for any other Origin (login and refresh both). Requests without Origin pass (curl), hence the 200 vs 403. Vite proxy forwards the browser Origin unchanged (changeOrigin:false) and is not at fault.
- Fix: backend/src/api/config.ts adds http://localhost|127.0.0.1 :5173-5176 only when NODE_ENV != production (`.env` untouched; production still exactly the configured https origins, verified by loading the production config: only https://businessmmri.mn). Checks stay on.
- Evidence (isolated API :4012, scratch DB, .env-equivalent ALLOWED_ORIGINS with 5173 only): Origin 127.0.0.1:5174 and localhost:5174 login 200 / refresh 401(no cookie); evil.example and :9999 -> 403 on login and refresh. qa/ui-dev-origin-login.mjs 10/10 in Chrome: login, reload persistence via refresh cookie, logout 204, post-logout refresh 401, unknown origin 403. step17 and api-static-check pass; tsc OK.
- NOT YET ACTIVE on the running service: the :4000 process (started 14:43) still has the old code and returns 403 for :5174. It must be restarted with approval (e.g. stop that process and `cd backend && npm run api:dev`). Nothing was restarted.

## 2026-11-06 (16) Grey answers: applicability gate rendered neutral (NOT committed)
- ROOT CAUSE: `classifyOptions` (frontend/src/data/answerTone.ts) mapped the lone substantive applicability answer ("Тийм, хамаарна." etc., state UNAVAILABLE next to N_A_CLAIM + DNK) to role `neutral-main`, which renders `is-neutral-tone` (gray, dashed). 4,096 question rows (every non-marketing domain: 256 per methodology version x 16 versions) have exactly this shape, and a diagnosis opens with these gates, so the first screens (e.g. Q9/280) were entirely gray. Scored/semantic/ordered-scale questions were already coloured (earlier browser tests only skipped the gate screens, which is why they stayed green while the user saw grey). Computed-style check: classes, --answer-color, cascade (questionnaire.css contract) were correct; no inline/cascade override involved.
- FIX (frontend/src/data/answerTone.ts only): new role `affirmative` -> quality 1 (green), listed first; "no, does not apply" (N_A_CLAIM) and "unknown" (DNK) stay special neutral gray. Scoring/routing/question bank/backend untouched.
- Mapping: 5 scored = green/light green/yellow/orange/red; 4 = green, yellow-green, orange, red; 3 = green, yellow, red; 2 scored = by score (polarity from score, not Yes/No; no 2-graded question exists in the bank); gate = green + 2 gray; unknown order = listed order, no colour (never guessed). Order independent: colours come from score/state, shuffles do not change them (test G2).
- Coverage (qa/answer-domain-coverage.mjs, 208,896 questions): per domain-version 3-graded 1,536, 4-graded ~260, 5-graded ~10,236, gate 256 (marketing v3.0.3: 3/4/5/6-graded, no gate questions); 0 questions with every answer grey (4,096 before).
- Browser (real Chrome, isolated API): qa/ui-answer-first-questions.mjs all 5 domains at 1280 and 390 (computed border/bar/--answer-color green for the affirmative, dashed gray for others, hover no transform, selected keeps tone, Continue+Back restores the saved answer); ui-answer-colors 10/10 x5 domains + mobile; autosave 16/16; audit-fixes 14/14; auth 7/7; dev-origin login 10/10; static 21/21; UI polish 122/122; frontend build OK.
- Unverified: user's own :5174 browser session (needs hard reload; the :4000 backend restart for the origin fix still pending approval), 2-option polarity (no data), dark/reduced-transparency modes.

## 2026-11-06 (17) Verified Defect Repair Program, PHASE 1 (MMRI-01/02/03/04/06/11) (NOT committed)
- Audit: ~/Downloads/MMRI_COMPLETE_AUDIT_FLAWS.md (43 findings). Every Phase 1 finding was re-verified against the active source first; ALL SIX were still present. Tests ran only on scratch DB `mmri_codexfix` (live `mmri` untouched), AI disabled, mock/fake billing. No migration, no schema change.
- MMRI-01 (partial): operator routes (manual payment confirm, refunds, pilot/calibration) now authorize by immutable user id `MMRI_OPERATOR_USER_IDS`; `MMRI_OPERATOR_EMAILS` is honoured only outside production and production startup/preflight refuse it (config.ts, auth/access.ts, ops/preflight.mjs, .env examples, docs). NOT fixed: company membership is still added by e-mail and registration does not verify e-mail ownership; that needs e-mail verification which depends on a real mail provider (MMRI-05, not implemented) -> REQUIRES APPROVAL / design decision. Deployment impact: set MMRI_OPERATOR_USER_IDS before deploying, remove MMRI_OPERATOR_EMAILS.
- MMRI-02 (partial): validator V02 now checks every number against the data the claim is bound to (its own strength/weakness/purpose/root/action/milestone/risk via source traces; overall+methodology only for S01/S02/S10) instead of any number in the payload. Unsupported prose that merely carries valid traces is still not detected -> deterministic rendering of numbers/facts remains open (Phase 4). VERSION constant not bumped.
- MMRI-03: relative-rank strength padding excludes validated weaknesses and any capability scoring below the weakness threshold (fewer strengths allowed, 0 possible); applied in diagnosis/result.ts and report/payload.ts; fallback wording says "relatively higher score, not a demonstrated strength" for RELATIVE_RANK ones. Customer-visible effect: quick estimates may show fewer than five strengths.
- MMRI-04: AssessmentInline.tsx selection-generation counter bumped on every choose/clear; an acknowledgement only settles UI/local record for the same generation; clearing is stored as an explicit local "cleared" marker until the server acknowledges.
- MMRI-06: query-service list/detail/status apply derivedContentWithheld (scores nulled, reportAvailable=false, lifecycle.reviewPending, reportReady false); AppShell report-ready notice requires reportAvailable!==false. Browser rendering of the notice not tested.
- MMRI-11: invoice creation and payment activation share one advisory lock per company/domain (`mmri-purchase:`); eligibility (active assessment, prior completion, usable entitlement) is re-decided under it.
- New tests: backend/scripts/qa-phase1-report-regression.mjs (12), qa-phase1-billing-purchase-race.ts (5), qa-phase1-access-regression.ts (9), qa/ui-phase1-autosave.mjs (8, real Chrome); step17 now 21/21. Each was mutation-checked: with the fix removed the tests fail exactly as the audit describes (UI shows B while server holds A; duplicate initial invoice; scores disclosed under review; zero-scored strengths). Added to run-codex-repair-gate.sh.

## 2026-11-08 (18) FINAL FUNCTIONAL REPAIR PHASE (NOT committed; recovery point first)
- Recovery: `06_RELEASE_ARCHIVES/MMRI_ACTIVE_PRE_FUNCTIONAL_REPAIR_*.tar.gz` (+ .sha256). Inventory of the 350 pre-existing uncommitted paths: ~/Downloads/MMRI_FUNCTIONAL_REPAIR/baseline/UNCOMMITTED_INVENTORY.md. The 31 untracked methodology bundles and the review-hardening migration are production-critical and exist only in this working tree: commit them.
- Audit (51 findings) reconciled against current code; ledger: ~/Downloads/MMRI_FUNCTIONAL_REPAIR/REPAIR_LEDGER_AND_VERIFICATION_REPORT.md. Fixed this phase: MMRI-07,09,10,12,13,16,17,18,19,20,21,22,23,25,26,27,28,29,30,31,43 (+ partial 08, 24-backend, 02). Verified already fixed: A1-A4,A6-A8, MMRI-03,04,06,11. Blocked/declined: A5/MMRI-05 (mail provider), MMRI-01 remainder (needs e-mail verification), MMRI-14/15/32-42 (methodology content, owner decision).
- Isolation: private scrubbed database clones mmri_ws_a..h (made from mmri_glass_integration, which was scrubbed of all customer rows); agents used only their own clone and port. Nothing was written to mmri, mmri_codexfix or mmri_design_test.
- INCIDENT: one invocation of qa-admin-regression.mjs (shared helper defaulted to :4000 and DB `mmri`) sent 7 failed admin-login attempts for non-existent throw-away accounts to the live :4000 API (7 ADMIN_LOGIN FAILURE audit rows, append-only; no data changed, only SELECTs ran against mmri). lib/admin-qa.mjs now refuses :4000 / `mmri` unless MMRI_QA_ALLOW_SHARED=YES.
- Test-contract updates (each reviewed, not weakened): api-static-check (+3 reviewed routes), step13 (refresh clears context only on 401/403; 13 public routes incl. the two reviewed password-reset endpoints), step12 (per-methodology pinned bundle hash), ui-audit-fixes A3 (contrast >= 7:1 instead of an exact old ink colour), answer tints (40/52/66%, contrast 5.52:1).
- Own regression found and fixed: crystal.css forced a white border on answer cards, overriding the semantic-colour contract (caught by qa/ui-answer-first-questions.mjs).
- NEW OPEN FINDING: stored diagnosis resultHash cannot be re-derived from the stored result (0/149 historical, 10/10 seeded) - pre-existing; db:verify:diagnosis "recomputed resultHash" fails for every domain.
- Gates at end: tsc 0/0, build OK, UI polish 124/0, STEP09 101/0, backend static 28/32 (4 stale legacy fixtures), browser 74/74, 41/41, 58/58, 18/18, five-domain answer flow 10/10, admin regression 30/30.

## 2026-11-08 (19) CONTINUATION: hash root cause, member UI, QA isolation, readiness report (NOT committed)
- resultHash root cause: Prisma/PostgreSQL JSON write keeps <=16 significant digits, hash was over exact doubles -> historical snapshots cannot be recomputed. Forward fix: `normalizeJsonNumbers` (15 digits) in `lib/hash.ts`, used in `freezeDiagnosisResultOnce`. Historical rows/hashes untouched; verifier labels them LEGACY_UNVERIFIABLE_FLOAT_PRECISION. Regression `backend/scripts/qa-hash-normalization-regression.ts` (mutation-checked). Verifier module count now methodology-aware (3.x=8, 4.x=5).
- step14 ops script was superseded by step19; package.json step14:operations:* now alias step19. step1-4 static suites need fixtures that exist nowhere: left as-is, decision requested.
- Member management UI: `frontend/src/pages/CompanyMembers.tsx` on Settings > data; browser test `qa/ui-company-members.mjs` 12/12 on isolated clone stack (API 4111 / vite 4211, stopped).
- QA isolation: 4 more scripts now refuse :4000 unless MMRI_QA_ALLOW_SHARED=YES.
- Deps: vite 6.4.5 (frontend 0 vulns), vitest 3.2.7; remaining backend advisories need Prisma 7 / vitest 5 majors (deferred).
- Live :4000 (pid 166723) runs from THIS folder but with Nov-6 code; review_hardening migration already applied on mmri.
- Reports: ~/Downloads/MMRI_PRODUCTION_READINESS/{PRODUCTION_READINESS_REPORT.md,GIT_COMMIT_PLAN.md}.
- Gates: tsc 0/0 both, build OK, UI polish 123/0, ops step19 22/22, step12/13 static OK.

## 2026-11-08 (20) GIT FINALIZATION & REPRODUCIBILITY (2 commits; rest NOT committed)
- Commits: fbaabdc (backend/prisma: schema.prisma, 29 migrations + rollback.sql, migration_lock, MIGRATION_CHAIN_SHA256) and 69283bc (9 bundles whose SHA equals live methodology_versions.bundleSha256: 3.0.3, 4.x.4, 4.x.6; + v2.4/v2.5 manifests). All migration checksums match live _prisma_migrations (29/29); live DB structure == fresh migrated DB.
- Fresh snapshot (tracked + uncommitted, no .env): npm ci, prisma generate, migrate deploy on empty DB mmri_fresh_checkout_20261108, 3.0.3 import+verify, tsc x2, frontend build, UI polish 123/0 all OK. A pure `git archive HEAD` lacks backend/package-lock.json, .nvmrc, ops/, deploy/, Docker files, so HEAD alone is NOT reproducible.
- schema.prisma drifted from migrations (174 lines incl. billing_invoices.refundReference unique). Not fixed; migrations authoritative.
- 149 snapshots = mmri_codexfix; live mmri = 113, all LEGACY_FLOAT_TRUNCATED, 0 unexplained.
- New backend/scripts/current-methodology-contract-static.mjs (130/130, mutation-checked) replaces step1-4 static suites; package.json: legacy:stepN:*:static + methodology:contract:static (uncommitted). step2-4 engine regressions exit 0.
- Sensitivity findings: harness env-clean.txt reuses production secrets; MMRI_PRE_DESIGN_20261106 archive (664) contains backend/.env; flags.bin hold NO key (earlier claim retracted).
- Report: ~/Downloads/MMRI_GIT_FINALIZATION/GIT_FINALIZATION_REPORT.md

## 2026-11-08 (21) FINAL VISUAL ADJUSTMENTS (NOT committed)
- One glass material across surfaces: `design/crystal.css` tokens `--gl-overlay` (shared specular) and `--gl-frost` (the sheet's baked frost field, registered to the viewport) + `--cr-sheet-edge` rim; used by the sheet, guide slabs and diagnosis tiles. No new override layer; edited the existing rules.
- Brightness: sheet fill retuned (less grey wash, stronger cyan/violet/pink light), stage `filter:saturate(1.35) brightness(1.18)`, stronger rim glow.
- Alive background: stage light drifts (`cr-drift`, 44s) and a new `.mmri-shell-aurora` layer (AppShell.tsx, one decorative span) drifts inside the sheet (`cr-aurora`, 38s). Transform-only, no blur/filter animation; off for reduced motion, hidden in print.
- Hero figure: static (removed pointer drift JS, `--px/--py`, hover sweep, `preserve-3d`/`translateZ`); fixed tilt, floor pool + contact shadow + two mirrored reflections (mirrors hidden <=1000px). Pixel-identical across 5 hover positions with motion off.
- Guide slabs: strong blue / violet / pink glass with the same overlay, frost and rim, glow + under-shadow; no movement on hover.
- Diagnosis tiles: deeper accent bodies (less white), stronger glow (58-76px), luminous dial arcs. Report: richer mint/pink finding columns, stronger score-ring glow, near-solid paper with rim/under-light.
- 3rd guide: all 14 screenshots recaptured from the current UI (`qa/capture-guide-shots.mjs`, isolated clone stack, demo company); step 5 text/alt corrected (no A-E letters; real buttons are «Үргэлжлүүлэх»/«Буцах»/«Сонголтыг буцаах»), step-5 image 1440x1090 (aspect 1.32); browser frame now shrink-wraps the image. Old images backed up in the session scratchpad only.
- Gates: tsc 0, build OK, UI polish 123/0, qa/ui-answer-first-questions (it) 8/0, no horizontal overflow at 390px on home/diagnosis/report.

## 2026-11-08 (22) VISUAL ROUND 2 (by-eye comparison against the reference; NOT committed)
- Found: :5176 and :5180 serve the OLD 07_DESIGN_WORKSPACE copy (Nov 7), not the active source; only :5174 shows these changes.
- Sheet fill rebuilt: luminous clean left zone, deep saturated right, crisp diagonal beams; stronger aurora drift (26s, +-7%).
- Hero figure: clearer saturated glass, aura glow (rgp::after), true reflection inside the tilted stack (fixed my own flip-origin bug), contact shadow; still static.
- Guide slabs: deep cobalt/violet/magenta, gloss reduced (it had made them paler), stronger halo.
- Diagnosis tiles: 2px colour ring, 92-120px halo, 64-70px floor glow. Report: tinted near-solid paper, thicker (24px) luminous score ring.
- Guide screenshots recaptured against the final styles (qa/capture-guide-shots.mjs).
- Before/after pairs: ~/Downloads/MMRI_VISUAL_BEFORE_AFTER/PAIR-*.png.

## 2026-11-08 (23) FINAL ENGINEERING PASS (NOT committed)
- task12-fresh-user-final-gate.mjs defaulted to live :4000 + backend/.env DB: now fail-closed (3 refusals proven). Stale 250-300 word conclusion check -> 80-160 (validator V27).
- Fresh-user gate on isolated clone: 611 checks pass except roadmap count. NEW OPEN FINDING F-ROADMAP: milestones get horizon DEFERRED_BEYOND_V1 by capacity/priority; Marketing (3.0.3) clones have 0 scheduled, fresh evidence-poor Marketing user has 2; other 4 domains schedule 12. Product decision; assertion left failing.
- Five-domain real PDF consistency 55/55 (3 A4 pages, scores consistent). AccountData/members: works direct, hard reload, new tab (~6s restore).
- Consolidated report: ~/Downloads/MMRI_FINAL_STATUS/FINAL_STATUS_REPORT.md. Live :4000 and mmri untouched.

## 2026-11-08 (24) FINALIZATION: decisions applied, everything committed, clean-checkout proof
- Decisions applied: F-ROADMAP fixed (evidence/validation never chained behind root-cause executions + deterministic compaction to the earliest feasible horizon; capacity/scoring untouched; frozen plans rehydrate, not recompute); hash policy = `classifyResultHash` + backend/docs/DIAGNOSIS_HASH_POLICY.md; production methodology = 3.0.3 everywhere (3.0.4 stays an ignored on-disk provenance file); schema.prisma realigned to the DB (0 drift live and fresh; NO migration needed; refundReference uniqueness is a partial unique index); harness secrets replaced and QA accounts re-sealed (qa-harness-rekey.ts); archives with .env set to 600; mmri_codexfix preserved as a verified 600 dump (not deleted).
- Git: 20 commits since 135328f; only an empty UNCOMMITTED_CHANGES.patch is untracked. 37 large provenance files stay on disk, ignored, listed with sha256 in backend/methodology/PROVENANCE_MANIFEST.sha256. RECENT_CHANGE_SUMMARY.txt (owner's personal e-mail) is ignored on purpose.
- Clean checkout (git archive HEAD) proof: npm ci, `npm run build`, tsc x2, frontend build, 29 migrations on an empty DB (0 drift), five methodologies imported with pinned hashes, API started from the checkout, five-domain fresh-user gate 612 checks each (roadmap 5), QA seed + real PDFs 55/55 (3 A4 pages), 10/10 fresh snapshots REPRODUCIBLE.
- Defects the clean checkout caught: .env.* ignore swallowed deploy/.env.production.example and frontend/.env.production; api-static-check matched schema whitespace; gate needs compiled dist; weight-rounding scanned v2.2; import script loaded archived 4.x.5; People/Operations plans had an empty first 30 days; report conclusion trace cap (slice 12) could BLOCK report generation.
- Open: one unreproduced 63 s 500 on strategy/generate (error code now logged); mail provider not implemented; QPay/OpenAI never exercised live; connected release gate and preflight need the real server env.
- Docs: deploy/DEDICATED_SERVER_SETUP.md, deploy/EXTERNAL_REQUIREMENTS.md. Report: ~/Downloads/MMRI_FINAL_VERIFIED/FINAL_VERIFIED_REPORT.md

## 2026-11-08 (25) CRYSTALLINE DESIGN PASS (BUSINESSMRI_FINAL_DESIGN_APPLY_NOW spec A-O)
- Font: Inter Variable (@fontsource-variable/inter, self-bundled; IBM Plex files removed); display weight 700, tracking -0.025em. Icons: lucide-react (Megaphone/Cpu/Landmark/UsersRound/Factory) via components/DomainIcon.tsx + hero + hub badges + guide stages.
- Home: new components/HeroCrystal.tsx (reference 02: 3 prismatic plates + clear five-area window; old ReportGlassPreview + all .rgp CSS removed). The window is a REAL cutout: `.mmri-shell::before` is masked by a JS-built SVG hole (--hx-hole, `.has-hx-hole`). Guide buttons all one periwinkle family; footer compacted; home fits 1600x1000 and 1366x768 without page scroll (--mmri-chrome +120px, main margin-bottom 10px).
- Background: wash cross-fade 2s cubic-bezier(.22,1,.36,1); shared buttons/nav pill no longer recolour per domain (--btn-*-t overrides removed).
- PERF (measured, headless Chrome, report, real wheel): 206 ms/frame -> 19 ms (p95 16.8). Causes: colour-grade `filter` on the animated .crystal-stage (moved to a static ::before) and two large drifting layers behind many blurred panels; long scroll pages (report/results/assessment/priorities/settings/billing/profile) now keep the drift static (components/glass.css); short pages keep it. `html.is-hidden` pauses ambient motion.
- Guides: periwinkle panel/overlay, navy text, 56px close; 3-stage ribbon (SVG route + lucide icons, moving pulse); matrix columns tinted; PDF note copy rewritten. RimSheen (components/RimSheen.tsx + glass.css .mmri-rim) = travelling edge light on hero window, guide panel and the selected answer card (with check mark).
- Report ring cyan-green-blue; finding columns white-outlined; notification panel tinted + header sweep; profile tiles periwinkle.
- VERIFY_UI_POLISH.sh: two hero checks rewritten for HeroCrystal (old expectations were for the removed component). 123/123.
- Evidence: ~/Downloads/BUSINESSMRI_FINAL_DESIGN_EVIDENCE/

## 2026-11-08 (26) REMAINING DESIGN ITEMS
- Header: floating ice-to-sapphire rail (crystal.css `.mmri-shell-inner`), static specular edge, one small transform-only glint (static on long pages), active-nav light bar; same routes/mobile behaviour.
- Notifications: restructured markup (sapphire title band with bell badge, kind tags, clock chips, actions, ring-illustrated empty state, mobile stacked actions); old scattered notification CSS in prism.css replaced by one block.
- Report: static glass rims + reflections on strengths/weaknesses and score ring; real-wheel scroll still 19 ms avg / p95 16.8.
- Questionnaire: measured label contrast on 390px was 3.0-3.7:1 (desktop >=5.5); added a localized dark label scrim -> worst 5.51:1 (12 labels, 360/390/1440, it+finance). Hero tilt verified (<=4 deg, resets, slot geometry stable, hole follows resize).

## 2026-11-08 (27) FINAL TARGETED CORRECTION PASS
- Whole-page category atmosphere: 5 full-area colour fields inside the sheet (`.mmri-shell-aurora i[data-d]`, AppShell) + full-bleed stage washes, 2.2 s opacity cross-fade; hero vertex hover sets the domain theme.
- Hero 2.5D: extruded pentagon, parallax layers, bobbing vertices, nearest-vertex highlight + label, tilt +-7deg.
- Guides: periwinkle liquid glass buttons with moving glint; guide 1 = facts left / 3 steps all right; guide 2 lighter glowing matrix; guide 3 = 4 essential screenshots (steps 2,4,7 text-only), screenshots adjacent, warning under last step; mobile head/tabs recoloured.
- Answers: brighter panel + faces, stronger glow, label scrim >= 5.4:1 measured (12 labels, 360/390/1440).
- Report: breathing rim on findings panels + slowly turning score ring light. Header band animation REMOVED (it cost 19 -> 52 ms/frame).
- Mobile hub: tiles no longer stretched to viewport height; badge hidden <=700.
- PERF: invalid `:is(...::pseudo)` selectors fixed (pause rules had never applied); stage light drift removed (hidden under opaque sheet); aurora translate-only + stepped (~10 fps); rim/plate/bob animations stepped; modal open = background animations OFF (not merely paused); guide overlay + panel backdrop-filters removed, bloom + route pulse static. Home idle 57 -> 24 ms, guide dialog 190 -> 51 ms (desktop software render), mobile 16.7 ms everywhere.
