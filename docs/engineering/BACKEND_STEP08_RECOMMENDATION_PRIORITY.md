# Backend completion 08/20 — Recommendation and priority integrity

Date: 2026-10-24

## Scope

This step hardens the deterministic chain from diagnosis findings to customer-facing actions and the 365-day plan. It does not change frontend design, question wording, scoring weights, category scores, or the frozen diagnosis methodology.

## Changes

1. Added one authoritative `selectRecommendationActions()` rule for:
   - up to 5 critical actions,
   - up to 2 separate evidence/validation actions,
   - the exact action union scheduled by the 365-day plan.
2. Removed three independently maintained action-selection paths that could drift between recommendation output, report payload, and action plan.
3. Fixed a real report/plan mismatch: evidence actions displayed outside the five critical-action slots are now guaranteed to be included in the 365-day plan.
4. Added fail-closed integrity checks for:
   - duplicate action IDs,
   - invalid priority values,
   - missing affected scopes,
   - missing exact recommendation trace IDs,
   - missing exact root-finding trace IDs,
   - report actions absent from the action plan.
5. Preserved the accepted rule that business capacity controls 365-day scheduling/concurrency, not how many grounded critical actions the completed diagnosis may show.
6. Removed a Marketing-specific phrase from cross-category merged recommendations so the same backend logic is valid for IT, Finance, HR, and Operations.
7. Replaced remaining English evidence-plan fallback deliverables with Mongolian wording.
8. Updated legacy recommendation/capacity regression expectations to the current five-action customer contract.

## Verification

- Backend Step 08 static integrity: 15/15 PASS
- Backend Step 08 five-domain regression: 85/85 PASS
- Legacy recommendation regression: 42/42 PASS
- 365-day plan regression: 45/45 PASS
- Critical-action contract: 6/6 PASS
- Step 07 five-domain findings regression: 100/100 PASS
- Step 06 five-domain scoring regression: 55/55 PASS
- AI report acceptance: 59/59 PASS
- Persistence static: 58/58 PASS
- Traceability static: 49/49 PASS
- Security/RBAC static: 54/54 PASS
- Production security acceptance: 29/29 PASS
- API static check: PASS (69 routes)
- Modified TypeScript subset: PASS

## Database

No schema migration is required for this step.
