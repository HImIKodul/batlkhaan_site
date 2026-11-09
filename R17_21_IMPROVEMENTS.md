# R17.21 — consolidated UI, report and responsive correction

This release is a complete clean source delivery. It preserves the frozen Marketing diagnostic methodology and database history while correcting the customer-facing experience requested after R17.20.

## Homepage
- Removed the eyebrow `БИЗНЕСИЙН НЭГДСЭН ОНОШИЛГОО` completely.
- Kept the approved headline and exact supporting sentence.
- Homepage contact information appears once, in the quiet bottom strip.
- Radar category labels navigate to the matching diagnosis/payment route.
- Completed radar nodes navigate to their report.
- Scores are hidden until hover/focus; the center circle reveals the average only on hover/focus.
- Four fixed Option-A guide buttons remain: BUSINESSMMRI.MN, diagnosis guide, result guide, registration/payment guide.
- Each guide opens with the same modal motion family but uses content appropriate to its purpose: staggered statistics, customer journey, deliverables, and payment rules.

## Diagnosis and questionnaire
- Diagnosis uses one canonical large icon per domain; duplicate corner illustrations are removed.
- Ready/progress/completed states use normal status chips rather than a play-like treatment.
- Scored answer choices are presented best-to-worst: top = green and bottom = red for 2, 3, 4, 5 or more scored choices; neutral choices stay gray.
- The demo simulator exposes real variation in question form: core, applicability, conditional, quantitative/evidence, contextual and verification forms.
- Marketing representative samples are now drawn from varied scoring profiles in the frozen 12,288-question Marketing bank rather than repeating one answer shape.
- The demo path remains 20 base questions + 64 representative questions for each of five domains = 340 visible questions.

## Report
- Organization name is the prominent report heading; redundant `Байгууллага` and `Тайлан бэлэн` labels are not used.
- Five domain selectors use the same global domain icons; the selected domain expands with a smooth reveal.
- One informative general summary is used; duplicate summary/conclusion blocks are removed.
- Strengths and weaknesses are ranked from the canonical 64-capability registry; the screen tooltip only explains the capability in simple professional Mongolian.
- The five critical actions keep the instruction as primary content; score movement is secondary and cannot cover the text.
- Customer-facing management terminology is normalized to Mongolian.

## Human-readable 12-month plan
The plan is deliberately written as a management plan rather than a translated software form. It avoids field labels such as `Яг хийх ажил`, `Хэн хариуцах`, and `Хүлээгдэх үр дүн`.

Each phase shows:
- a real calendar period calculated from the diagnosis/report date;
- a short phase name and purpose;
- two concrete actions, not a long machine-generated task list;
- a natural sentence describing what should exist by the end of the period;
- responsibility embedded in the sentence rather than exposed as a form field;
- a simple sentence explaining how progress will be checked.

The five phase windows are 0–14, 15–30, 31–90, 91–180 and 181–365 days. This keeps the plan scannable while still creating clear milestones, owners, deadlines and measurable outcomes.

## PDF
- A4 portrait, five preplanned pages; no browser-dependent auto-shrinking.
- Page 1: company/report identity, domain, diagnosis date, report date, score, one summary and five purpose scores.
- Page 2: full five strengths and five weaknesses with definitions (no hover dependency).
- Page 3: full five critical actions.
- Pages 4–5: complete dated 12-month plan and remeasurement point.
- Print layout uses fixed typographic budgets and explicit page geometry to prevent overlap/clipping.

## Cross-browser/responsive layout
- Final release CSS is loaded last and owns the responsive geometry.
- Native browser select menus on customer pages are replaced by the accessible custom selector.
- Global `box-sizing`, form-control typography, word wrapping, min-width safety and responsive grid rules are normalized.
- Mongolian words are not intentionally split character-by-character.
- Homepage uses a one-viewport composition at desktop/tablet/phone sizes; content scales/recomposes instead of depending on a specific monitor coordinate.
- Report/diagnosis/payment rows reserve structural columns so status length cannot shift unrelated data.

## Research basis for plan structure
The implementation-plan structure follows common execution principles from established transformation/project-management practice: clear actions, ownership, start/end dates, milestones, measurable outcomes, sequencing and periodic adjustment. It intentionally avoids excessive task granularity so a manager can read the plan quickly and still know what must happen next.

## Five-domain content status
The package contains the five-domain source material used by the experience:
- Marketing frozen runtime: 12,288 questions.
- Information Technology repaired bank: 3,072 questions.
- Finance repaired bank: 12,288 questions.
- Human Resources repaired bank: 3,072 questions.
- Operations repaired bank: 3,072 questions.

The five-domain demo/question simulation and canonical report taxonomies are present. The paid production assessment engine remains the frozen Marketing engine; the four additional repaired banks are preserved in-source but are **not falsely mapped into the Marketing scoring engine**. A separate methodology/scoring integration is still required before claiming production-grade paid diagnosis for all five domains.


## R17.21.1 build hotfix

- Fixed a frontend build-blocking duplicate block-scoped identifier in `frontend/src/pages/Report.tsx`.
- Added a mandatory frontend production build smoke test to `START_LOCAL.sh` after dependency installation and before the API/Vite dev servers are started. The launcher now stops immediately if TypeScript or Vite cannot build the current source.
- No product behavior, scoring, question-bank content, report content, plan content, payment logic, or database schema was intentionally changed by this hotfix.

## R17.21.2 TypeScript build hotfix

This hotfix addresses the six TypeScript errors exposed by the clean-build gate on Linux:

- restored Vite `ImportMeta.env` typing with `src/vite-env.d.ts`;
- corrected the priorities page to call the current one-argument `getActionPlan(assessmentId)` API contract;
- completed the demo `AssessmentSummary` object with `assessmentRevision`, `routingRevision`, and `eventSequence` required by the current frontend contract.

The frontend build command now uses `tsc --noEmit && vite build` instead of build-mode TypeScript, so generated `tsconfig.tsbuildinfo` state cannot affect a clean release.

No diagnostic methodology, scoring formula, question-bank content, database schema, payment behavior, report logic, or visual design was intentionally changed in this hotfix.
