# MMRI Step 23 — Controlled Real-Company Pilot Protocol

Status: PILOT INFRASTRUCTURE READY; REAL PARTICIPANT EVIDENCE NOT YET COLLECTED.

## Frozen boundary
- Methodology, scoring, routing, confidence thresholds, category/cell weights and question semantics remain unchanged during pilot collection.
- The pilot may produce evidence for a later immutable methodology version. It must never silently mutate v1.0.1.
- Synthetic calibration is engineering evidence only; real-company results are required for empirical claims.

## Stages
1. Cognitive usability: target 8 companies × 1 knowledgeable respondent. Capture 1–5 clarity ratings and burden feedback.
2. Field reliability: target ~20 companies × 2 knowledgeable respondents where feasible. Assess independently; do not weight by job title.
3. Test–retest: target at least 8 companies, same respondent, frozen methodology, 7–14 days after baseline.
4. Outcome baseline: all field-pilot companies where available; store only non-sensitive bands for revenue, profit, customers, market share and brand index.
5. Freeze decision: coordinator reviews the latest append-only analysis and records APPROVE / REVISE / HOLD with rationale.

## Initial evidence gates
- Completion rate >= 85%.
- Median overall DNK <= 10%.
- Per-question applicable DNK < 30%; violations require review.
- Clarity median >= 4/5 and <20% of ratings <=2.
- Single-option concentration >=85% is a review trigger, not an automatic failure because some real distributions can legitimately be concentrated.
- Inter-respondent category difference: median absolute <=10 points.
- Test–retest category difference: mean absolute <=7 points.
- Required maturity coverage >=90%.
- Unresolved MAJOR contradiction families = 0 at normal finalization.

## Governance
- Consent must be explicit before an assessment can be linked to the study.
- Withdrawal excludes the enrollment from current analysis.
- Every linked assessment must belong to the enrolled company and use exactly the frozen study methodology version.
- Retest timing is enforced by the configured 7–14 day window by default.
- Analysis runs are append-only and SHA-256 bound to the deidentified metric snapshot.
- No statistic automatically approves the pilot. Human reviewer decision is required.
- APPROVE is blocked until all evidence gates are READY.
- Deidentified exports omit company name, user name/email and free-text feedback comments.

## Claims that remain blocked until evidence exists
- scientific validation
- predictive validity / ROI causality
- industry benchmarks
- causal root-cause validation
