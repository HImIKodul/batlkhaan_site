# MMRI Step 12/15 — End-to-End Traceability & Audit Trail

Trace contract: `MMRI-TRACE-1.0`.

## Publication chain

`Question -> QuestionIssue -> AnswerEvent -> Cell -> Category/Purpose -> RootFinding -> Recommendation -> Milestone -> ReportClaim -> Report`

Every published report is also pinned to the exact immutable `AssessmentStateSnapshot` and methodology `VersionBundle` (id + SHA-256). The trace graph is canonicalized and SHA-256 hashed before publication. Once frozen, a mismatch is a publication error rather than an automatic rewrite.

## Guardrails

- Response drafts are never evidence.
- Secondary evidence is explicitly marked and cannot masquerade as primary direct evidence.
- Trace output excludes respondent display names, email addresses, and raw respondent identifiers.
- AI may render claims only from pre-existing trace sources and cannot create provenance.
- Every factual report claim receives a deterministic `reportClaimId` and one or more valid `sourceTraceIds`.
- Root findings, recommendations, and milestones retain their deterministic upstream source traces.
- Published trace graphs are immutable and hash-verified.

## API

`GET /api/v1/assessments/:assessmentId/trace`

Allowed roles: OWNER, ADMIN, CONSULTANT. It returns the frozen trace graph after publication or a current non-published inspection graph before report publication.

## Connected database verification

After applying migrations:

```bash
npm run db:verify:traceability
```

This verifies Step-12 schema/backfill fields and confirms that every already-published report has a matching frozen trace graph hash.
