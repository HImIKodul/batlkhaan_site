# MMRI Step 6/6 — Final Accepted Integration Regression Report

Date: 2026-10-23
Release: R17.21.8 / v3.1.20

## Integrated methodology targets
- Marketing: 3.0.3 / QBANK 3.1.3
- Human Resources: 4.1.4 / BUSINESSMRI-v2.4-HRMRI
- Finance: 4.2.4 / BUSINESSMRI-v2.4-FINMRI
- Information Technology: 4.3.4 / BUSINESSMRI-v2.4-ISMRI
- Production & Operations: 4.4.4 / BUSINESSMRI-v2.4-OPMRI

## Acceptance source
The integrated master contains 61,440 question rows (12,288 per domain). Step 5/6 completed with 0 CRITICAL, 0 HIGH and 0 MEDIUM residual defects. Accepted master SHA-256: `4897b0218d51abf0d5aab28a13521b83f98ad5fd859a368aceaaff817abdd75d`.

## Executed gates in this environment
- Exact accepted-master → runtime integration: PASS, 61,440/61,440 rows.
- Per-domain IDs/text/options: PASS, 12,288/12,288 each.
- BusinessMRI score/value/state mapping: PASS, 0 mismatches.
- D26 factual N/A coverage: 256/256 each in HR, Finance, IT, Operations.
- D31 factual N/A coverage: 256/256 each in HR, Finance, IT, Operations.
- Duplicate answer options: 0.
- Raw Latin in customer-facing question/answer fields: 0.
- Frontend sample surface: 320 total, 64/domain.
- Engine TypeScript compile: PASS.
- Strategy TypeScript compile: PASS.
- Adaptive routing regression: 40/40 PASS.
- Confidence regression: 48/48 PASS.
- Scoring regression: 2,342/2,342 PASS.
- Cell reachability regression: 3,797/3,797 PASS.
- Recommendation regression: 43/43 PASS.
- 365-day action-plan regression: 45/45 PASS.
- Persistence static/runtime: 58/58 + 29/29 PASS.
- Traceability static/runtime: 49/49 + 30/30 PASS.
- Security static/runtime: 54/54 + 38/38 PASS.
- API static gate: PASS, 68 routes.
- Answer color static/runtime gate: PASS.
- Responsive/global static gate: PASS.
- Homepage stationary radar geometry: PASS.
- Report/PDF polish static gate: 23/23 PASS.
- Linux package structural verifier: PASS.

## Not executed here
Docker is not installed in this execution environment. PostgreSQL migration/import/promotion therefore was not run here. A fresh frontend/backend dependency installation also cannot be completed here because the inherited project has no package-lock files and network installation did not complete in the execution window.

`RUN_STEP6_CONNECTED_RELEASE_GATE.sh` is included for the deployment Debian host. It starts PostgreSQL, installs dependencies (`npm ci` when a lockfile exists, otherwise `npm install`), applies migrations, imports/promotes all five methodologies, builds the backend, and builds the frontend.

This release is therefore the final accepted **source integration freeze**. Production deployment certification remains conditional on the connected gate passing on the target host.
