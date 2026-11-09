# MMRI Step 23 — Pilot Data Dictionary

## Study
`code`, `title`, frozen `methodologyVersionId`, lifecycle status, cognitive/field/retest targets and retest window.

## Enrollment
One company per study. `deidentifiedCode` is the research identifier. Consent state is `PENDING`, `CONSENTED`, `DECLINED`, or `WITHDRAWN`.

## Assessment roles
- `COGNITIVE`: wording/usability stage.
- `BASELINE`: main field assessment.
- `SECOND_RATER`: independent knowledgeable respondent in the same company.
- `RETEST`: same-condition repeat assessment after the frozen retest window.

Each assessment can belong to only one pilot link. Each enrollment can have at most one assessment per role.

## Feedback
Dimensions: `CLARITY`, `BURDEN`, `DIAGNOSIS_USEFULNESS`, `RECOMMENDATION_USEFULNESS`. Ratings are integers 1–5. Optional research comments may be stored but are excluded from deidentified exports and automated statistics.

## Outcome baseline
Only non-sensitive bands/indices are stored: revenue, profit, customers, market share and brand index. Raw financial/customer records are not required by Step 23.

## Derived metrics
Completion/dropout, question burden, duration, DNK/N/A, per-question DNK, option concentration, coverage, unresolved major contradictions, clarity, usefulness, inter-rater category difference, test–retest category difference, confidence-vs-stability bands and outcome-baseline coverage.

## Export
Research JSON/CSV use only `deidentifiedCode` and derived assessment summaries. They intentionally exclude company name, user names/emails, authentication identifiers and free-text comments.
