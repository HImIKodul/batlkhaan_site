# Step 24 Calibration Release Gate

A candidate may be activated only when all conditions are true:

- latest Step-23 pilot analysis is the proposal's analysis;
- latest pilot decision is the proposal's `APPROVE` decision;
- pilot analysis was ready for review;
- every change cites at least one READY pilot gate;
- proposed semantic version is higher than source;
- candidate bundle was imported successfully and remains `VALIDATING`;
- stored candidate SHA-256 equals imported bundle SHA-256;
- independent nominated reviewer approved the submitted proposal;
- source methodology is still ACTIVE;
- candidate methodology has zero assessment references;
- activation is performed by the proposal creator and creates an append-only CalibrationRelease.

There is no automatic calibration or automatic activation. With zero real-company evidence, the correct gate result is **BLOCKED_NO_REAL_PILOT_EVIDENCE**.
