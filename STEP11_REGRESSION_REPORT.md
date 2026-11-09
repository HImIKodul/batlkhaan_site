# MMRI Step 11/12 — Regression Gate

**Status: SOURCE/RUNTIME-HARNESS PASS; CONNECTED RUNTIME HOLD.**

## Passed on this exact integrated candidate

- Marketing wording integration and rollback integrity: PASS.
- Engine TypeScript compilation: PASS.
- Strategy TypeScript compilation: PASS.
- Adaptive routing: **40/40**.
- Confidence: **48/48**.
- Scoring: **2,342/2,342**.
- Cell reachability: **3,797/3,797**.
- Targeted synthetic weak/mid/strong/N/A/DNK/contradiction/low-authority scenarios: **27/27**.
- Recommendations: **43/43**.
- 365 action-plan regression: **45/45**.
- Persistence: **58/58 static + 29/29 runtime**.
- Traceability: **49/49 static + 30/30 runtime**.
- Security/RBAC/session: **54/54 static + 38/38 runtime**.
- API static acceptance: PASS with **68 routes**.
- Billing/retake/QPay static contract: **24/24**. Both diagnostic and retake remain 300,000₮.
- Current responsive/report/PDF/radar static verifiers: PASS, including the current four-page PDF contract.

## Connected gate not executed here

This execution environment has no Docker command, so Step 11 does **not** claim a live PostgreSQL/import/promotion/payment/browser certification. The candidate includes `backend/scripts/step11-connected-release-gate.sh`; on the user's Linux environment it performs migrations, five-domain imports/promotion, active DB verification, persistence/trace/report DB verifiers, demo surfaces, backend production build and frontend production build.

Live QPay bank settlement is also an external-provider acceptance requiring actual merchant credentials. The local/static QPay callback, payment-verification, partial-payment, callback-token and entitlement guards pass.

## Stale tests corrected/superseded

Several packaged tests encoded older releases instead of current product requirements. The release entry point now uses `VERIFY_STEP11_FULL_REGRESSION.sh` rather than forcing the current engine/UI to satisfy obsolete assertions. Examples include the old 67-route count, pre-v3 engine edge counts, old five-page/2+3 PDF staging, and tests that demanded English/internal methodology disclosures.

## Additional regression finding

The Step-9 **question/answer/category/dimension** language remains clean. However an audit of older Marketing 365-day action-plan/report contract fields found **808 mixed-English customer-text occurrences across 334 unique strings** (for example `checklist`, `KPI`, `owner`, `metric`, `handoff`). This predates the Step-10 question integration. It does not alter scoring or question correctness, but it means the whole legacy report-template layer cannot yet be described as 100% Mongolian. The evidence is in `STEP11_REPORT_LANGUAGE_AUDIT.json`.

## Step-11 verdict

The integrated wording candidate passes the complete dependency-free/source regression available in this environment. Production-final certification remains blocked by the connected Docker/PostgreSQL gate and the known legacy report-language warning.
