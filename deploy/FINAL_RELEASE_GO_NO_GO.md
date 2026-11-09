# MMRI Production GO / NO-GO — Backend Step 19

## Source-ready conditions
- `bash ops/release-gate.sh` passes.
- Secret scan is clean.
- Lockfiles and migration fingerprint are exact.
- Steps 17, 18, and 19 gates pass.
- Immutable image references and production configuration pass preflight.

## Connected GO conditions
A real production GO additionally requires all of the following evidence:
- connected migration/database gate PASS;
- least-privilege runtime PostgreSQL role PASS;
- coordinated backup verified;
- isolated PostgreSQL + report-storage restore drill PASS before initial launch;
- API `/ready` stable after deployment;
- smoke and stability checks PASS against the intended release SHA;
- persistent report storage PASS;
- QPay/manual production payment mode configured correctly;
- real OpenAI key installed only in server-side secret environment;
- release manifest stored with image digests and migration-chain hash.

If any connected item is missing, status is **NO-GO / NOT YET VERIFIED**, not production-ready by assumption.
