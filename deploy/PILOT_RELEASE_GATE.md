# MMRI Step 23 — Pilot Release Gate

A source build can be **PILOT-READY** when Step 23 source/runtime checks pass. This does not mean the methodology is empirically validated.

A real pilot can be **READY_FOR_REVIEW** only when the configured cognitive, field and retest sample targets and the initial evidence gates are satisfied. The analysis service never returns automatic approval.

A coordinator may record:
- `APPROVE` — only against the latest analysis run and only when all gates are READY.
- `REVISE` — evidence indicates a change is needed.
- `HOLD` — evidence is insufficient or operationally incomplete.

Any change to question semantics, mappings, score/confidence thresholds, routing, applicability or weights after pilot evidence must create a new immutable methodology version. v1.0.1 must remain reproducible.

Scientific, predictive/ROI, benchmark, or causal-validation claims remain blocked until separately governed evidence supports them.
