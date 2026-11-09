# MMRI Backend Step 07/20 — 64-Category Findings Integrity

Date: 2026-10-24
Status: PASS
Frontend redesign: none
Scoring methodology change: none
Question-bank change: none

## Purpose
Separate customer-facing category strengths/weaknesses from cell-level root-cause findings and prove that the frozen report payload sent to AI/PDF contains the correct canonical 64-category findings.

## Implemented
- Added a dedicated category-level `weaknesses` result alongside existing `strengths`.
- Strength and weakness names come directly from the canonical 64-category methodology names.
- Added five-category findings presentation policy: `MMRI-REPORT-FINDINGS-1.0-FIVE-CATEGORY`.
- Report payload upgraded to `MMRI-REPORT-PAYLOAD-1.3`.
- Report payload now carries up to five strengths and five weaknesses separately from root-cause findings.
- Weaknesses are selected deterministically from sufficiently evidenced, applicable, resolved categories below the frozen weakness threshold.
- Strengths exclude N/A, review-required, and unresolved categories.
- Added frozen trace IDs for each weakness (`weakness:WEAK-<categoryId>`).
- AI input now receives `strengths`, `weaknesses`, and `rootFindings` as separate authoritative objects.
- AI instructions explicitly forbid substituting cell/root findings for the category weakness list or re-ranking findings.
- Narrative validator requires canonical name, order, count, and trace binding for S04/S05.
- Deterministic fallback now renders up to five canonical strengths and five canonical weaknesses.
- Findings presentation policy participates in the frozen report binding hash for new reports.
- Updated stale QUICK/review wording regression to current Mongolian customer-facing terminology.

## Verification
- Step 07 static findings gate: 18/18 PASS
- Step 07 five-domain findings regression: 100/100 PASS
- Legacy results/diagnosis regression: 57/57 PASS
- Existing five-domain score→findings regression: 65/65 PASS
- AI report acceptance: 59/59 PASS
- Step 06 scoring regression: 55/55 PASS
- Step 02 integrity: 16/16 PASS
- Step 03 auth/tenant: 18/18 PASS
- Step 04 lifecycle: 25/25 PASS
- Step 05 answers: 26/26 PASS
- Persistence static: 58/58 PASS
- Traceability static: 49/49 PASS
- Security/RBAC static: 54/54 PASS
- Production security: 29/29 PASS
- API static: PASS, 69 routes
- Strategy TypeScript build: PASS using Node 22.16.0 / TypeScript 5.8.3 with available Node type roots

## Important semantic separation
- `strengths` / `weaknesses`: customer-facing 64-category findings.
- `rootFindings`: cell-level diagnostic/root-cause hypotheses used for explanation and recommendation grounding.
- `priorityActions`: recommendation-engine output tied to frozen diagnostic evidence.

AI is not allowed to calculate, re-rank, rename, or replace any of these objects.
