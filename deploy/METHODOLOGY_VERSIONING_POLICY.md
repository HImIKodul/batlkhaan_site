# MMRI Immutable Methodology Versioning Policy

- An imported methodology version is identified by semantic version plus immutable bundle SHA-256.
- Re-importing the same version with a different hash is rejected.
- The original baseline `1.0.1` may auto-activate only when no methodology is active.
- Any later imported version remains `VALIDATING` until Step-24 evidence-gated activation.
- Any semantic calibration change requires a new methodology version. This includes routing coefficients, confidence/evidence thresholds, contribution strengths, stop rules, information-value priors, profile-fit multipliers, uncertainty bands, question wording/mapping, category/cell weights, and scoring rules.
- Existing assessments keep their original methodologyVersionId permanently, so archiving an old methodology never rewrites historical results.
- At activation, exactly the governed source is archived and the independently approved candidate is activated atomically.
- A release manifest binds the pilot evidence SHA, source bundle SHA, candidate bundle SHA, proposal, review, and release SHA-256.
