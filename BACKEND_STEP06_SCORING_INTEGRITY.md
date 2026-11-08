# Backend 6/20 — Scoring integrity

This step hardens the deterministic answer → cell → 64-category → module → domain score pipeline without changing the frozen scoring methodology.

Implemented:
- Canonical evidence validation at the scoring boundary.
- One effective evidence record per question; duplicates fail closed.
- Question/category/cell/path/source/scoring-profile/option/state/score metadata must match the frozen methodology definition.
- Explicit authority is clamped to [0,1] and reliability must match the canonical authority/path calculation.
- Runtime snapshot score/confidence/range/count invariants are asserted.
- Category→module and module→overall contribution lineage must reconcile exactly within floating tolerance.
- Five-domain regression proves answer replacement recalculates instead of accumulating, input order is deterministic, and tampered evidence is rejected.

No frontend changes. No scoring weights, thresholds, question wording, category weights, or report-selection methodology were changed.

## Verification performed
- New Step 06 scoring-integrity static gate: 10/10 PASS.
- New Step 06 five-domain tamper/recalculation regression: 55/55 PASS.
- Marketing frozen scoring regression: 2342/2342 PASS.
- Hierarchical aggregation regression: 395/395 PASS.
- Five-domain real answer → score regression: 110/110 PASS.
- Five-domain applicability/denominator regression: 98/98 PASS.
- Five-domain score → findings regression: 65/65 PASS.
- Step 05 answer-persistence static: PASS.
- Step 04 lifecycle: 25/25 PASS.
- Step 03 auth/tenant: 18/18 PASS.
- Step 02 integrity: 16/16 PASS.
- Persistence: 58/58 PASS.
- Traceability: 49/49 PASS.
- Security/RBAC: 54/54 PASS.
- Production security: 29/29 PASS.
- AI report acceptance: 59/59 PASS.
- API static check: PASS (69 routes).

Connected PostgreSQL score/materialization verification remains part of the later connected-database release gate; this step does not require a schema migration.
