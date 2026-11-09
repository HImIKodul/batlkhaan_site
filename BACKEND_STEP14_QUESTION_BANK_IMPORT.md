# Backend Step 14 — Human-reviewed question-bank import boundary

Status: COMPLETE

## Purpose

The final human wording review is allowed to change only customer-facing wording:

- 64 category names
- question text
- answer-option labels

It is **not** allowed to change the diagnostic methodology by accident.

Protected fields include question/category/cell IDs, question path, source kind, option count/order, score/state, scoring profile, coefficients, secondary targets, weights, routing policy, N/A logic, contracts and runtime rules.

## Safe release flow later

1. Keep the current five active bundles unchanged.
2. Export an overlay template from each active base bundle.
3. Convert the reviewed Excel content into the overlay by exact IDs. This conversion can be done separately when the final five Excel files are provided.
4. Run the overlay validator in strict Mongolian mode.
5. Build a new immutable candidate methodology bundle. The current active version is never overwritten.
6. Verify that the candidate structural fingerprint is identical to the base structural fingerprint.
7. Import the candidate as `VALIDATING`; active diagnoses continue using the current active bundles.
8. Run the existing five-domain scoring/routing/report regressions against the candidates.
9. Promote all five only after all five candidates pass. Existing assessments retain their original methodology version.

## Operator commands

Export a review overlay template:

```bash
npm run qbank:overlay:export -- <base-bundle.json> <new-methodology-version> <new-qbank-version> <overlay.json>
```

Validate and build a candidate bundle:

```bash
MMRI_QBANK_MONGOLIAN_ONLY=YES npm run qbank:overlay:prepare -- <base-bundle.json> <overlay.json> <candidate-bundle.json>
```

Run Step-14 release gate:

```bash
npm run backend:step14:qbank:verify
```

The generated `<candidate-bundle.json>.manifest.json` records the base SHA, protected structural fingerprints, wording fingerprints, candidate SHA, counts and warnings.

## Excel handoff

The eventual five human-reviewed Excel files do not need to contain scoring internals. They can remain reviewer-friendly. When they are supplied, they are converted to the strict overlay by matching their category/question identifiers. The overlay importer then proves that only wording changed. This avoids rebuilding the backend or manually editing production database rows.
