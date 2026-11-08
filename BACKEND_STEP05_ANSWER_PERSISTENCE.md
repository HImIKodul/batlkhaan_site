# Backend completion — Step 05/20

Scope: question/answer persistence, resume, Back/Undo, duplicate prevention, draft consistency, and immutable answer-event integrity.

## Hardening added
- Normalizes `clientRequestId` and `questionIssueId` before persistence.
- Makes idempotent answer retries payload-safe: reusing a request ID for a different answer now fails instead of returning an unrelated acknowledgement.
- Requires persisted acknowledgements for replayed answer requests.
- Adds PostgreSQL partial uniqueness for one active answer per assessment/question.
- Adds DB guards for answer → assessment/methodology/respondent lineage.
- Adds DB guards for evidence → answer/assessment/methodology lineage.
- Adds DB guards for response-draft → issued-question lineage.
- Adds DB guards for AnswerEvent lineage and RETRACTED semantics.
- Makes AnswerEvent rows append-only at the database layer.
- Adds a connected-database verifier for active-answer/latest-event agreement.

## Existing behavior retained
- Back/Undo retracts evidence without deleting history.
- Previous answer is restored as a draft when reopening a question.
- Resume returns a draft only when it belongs to the currently open question.
- Progress counts active answers, not historical revisions.
- Frontend design is unchanged.

## Verification performed in this checkpoint
- Step 05 answer-persistence static gate: 26/26 PASS.
- Existing persistence static gate: 58/58 PASS.
- Persistence runtime simulation: 30/30 PASS.
- Step 02 data-integrity static gate: 16/16 PASS.
- Step 03 auth/tenant static gate: 18/18 PASS.
- Step 04 lifecycle static gate: 25/25 PASS.
- AI report acceptance: 59/59 PASS.
- Production security acceptance: 29/29 PASS.
- API static check: PASS, 69 routes.
- Modified TypeScript syntax transpilation: PASS.

The connected PostgreSQL verifier and migration are prepared, but require the live/container PostgreSQL environment and are intentionally deferred to the connected-database release gate.
