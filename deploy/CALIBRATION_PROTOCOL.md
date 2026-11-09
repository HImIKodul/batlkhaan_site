# MMRI Step 24 — Evidence-Gated Calibration Protocol

Step 24 never changes a parameter because a simulation, developer, AI model, or reviewer merely prefers another value. Calibration may begin only from a Step-23 pilot study whose latest analysis is `readyForReview=true` and whose latest human gate decision is `APPROVE`.

## Allowed process
1. Keep the pilot source methodology ACTIVE and immutable.
2. Create a calibration proposal tied to the exact pilot analysis run, its SHA-256, and its APPROVE decision.
3. Every proposed semantic change must state the current value, candidate value, rationale, source path, and one or more Step-23 gate IDs that are `READY`.
4. Use a higher semantic methodology version. Never rewrite an existing version in place.
5. Build/import that candidate bundle through the normal deterministic bundle validator. A non-baseline candidate remains `VALIDATING`, not ACTIVE.
6. A nominated reviewer different from the proposal creator reviews the immutable proposal/candidate.
7. Activation rechecks that the pilot analysis/decision are still the latest, candidate hash matches, import passed, candidate has never been used by an assessment, and source remains ACTIVE.
8. Activation is atomic: source becomes ARCHIVED, candidate becomes ACTIVE, and a SHA-256 release record is written.

## Current state
Real-company evidence in the Step-23 package is **0 companies**. Therefore no real calibration proposal can be created and MMRI v1.0.1 remains ACTIVE.

## Forbidden
- recalibration from synthetic data alone;
- invisible edits to v1.0.1;
- automatic AI/statistical activation;
- activation without independent review;
- using a candidate methodology in assessments before activation;
- using stale pilot analysis after newer evidence exists.
