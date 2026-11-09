# Backend completion — Step 04/20

## Scope
Assessment/diagnosis lifecycle integrity only. The current frontend was not redesigned or functionally rewritten in this step.

## Hardened lifecycle
- Centralized active, terminal-result, terminal, and respondent-mutable status contracts.
- Prevented stale lifecycle residue when starting a PROFILE_PENDING assessment.
- Prevented more than one open/ISSUED question per assessment.
- Validated that `currentQuestionIssueId` always belongs to the same assessment and is ISSUED.
- Terminal routing decisions without another question now auto-finalize the assessment instead of leaving it stuck IN_PROGRESS.
- Non-terminal routing decisions must produce a next question; invalid routing states fail closed.
- Explicit completion cannot proceed while an unanswered question remains open.
- Terminal completion clears drafts, pause/resume state, current question pointer, and writer lease.
- Resume validates the saved question pointer and repairs stale resume state from the authoritative open question.
- Respondents cannot be added/changed after the diagnosis becomes immutable.
- Terminal auto-finalization freezes the immutable AssessmentStateSnapshot and records completion audits.

## Authoritative lifecycle APIs
- Enhanced `GET /api/v1/assessments/:assessmentId/status` with lifecycle phase, action capabilities, terminal snapshot/report readiness, and report generation state.
- Added `GET /api/v1/companies/:companyId/diagnosis-lifecycle` for the authoritative five-domain state view.
- Domain states include LOCKED, AVAILABLE, IN_PROGRESS, PAUSED, COMPLETED_PENDING_SNAPSHOT, REPORT_READY, and AVAILABLE_RETAKE.
- A terminal assessment missing its immutable snapshot is fail-closed: it is not report-ready and is not exposed as retake-ready.
- Report generation/payload endpoints require the immutable terminal snapshot in addition to terminal status.

## Database hardening
Migration: `20261024150000_backend_assessment_lifecycle_hardening`
- Preflight checks for multiple ISSUED questions and invalid current-question pointers.
- Partial unique index enforcing one ISSUED question per assessment.
- Assessment lifecycle trigger protecting state/timestamp/current-question invariants and terminal reopen attempts.
- Question issuance trigger preventing new ISSUED questions on terminal/cancelled assessments.

## Verification
- Step 04 lifecycle static gate: 25/25 PASS.
- API static check: PASS (69 routes; 12 pilot; 7 calibration).
- Step 02 data integrity: 16/16 PASS.
- Step 03 auth/tenant isolation: 18/18 PASS.
- Persistence: 58/58 PASS.
- Traceability: 49/49 PASS.
- Security/RBAC: 54/54 PASS.
- AI report acceptance: 59/59 PASS.
- Production security: 29/29 PASS.
- Modified TypeScript syntax transpilation: PASS (5/5 files).

## Deferred connected check
The migration and connected lifecycle verifier (`npm run db:verify:backend-lifecycle`) must be executed against the real PostgreSQL environment later. This sandbox does not provide the project database/runtime dependencies.
