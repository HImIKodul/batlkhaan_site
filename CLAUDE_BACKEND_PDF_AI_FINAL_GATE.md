PROJECT ROOT:
/home/kirby/MMRI_STEP10_FINAL_WORKING

TASK:
Perform the FINAL BACKEND REPORT/PDF + AI INTEGRATION gate.

CURRENT VERIFIED STATE:
- Frontend final QA completed.
- Frontend production build PASS.
- Frontend Git checkpoint:
  e0643e3 checkpoint: frontend QA responsive accessibility regression pass
- DO NOT MODIFY frontend/.

OPENAI:
backend/.env already contains the real API configuration.

Direct OpenAI Responses API test already succeeded with:
MMRI_AI_REPORT_PROVIDER="openai"
MMRI_AI_REPORT_MODEL="gpt-6.1-terra"
MMRI_AI_REPORT_REQUIRED=false

Direct test result:
MMRI_AI_OK

NEVER print, expose, modify, copy, stage, or commit OPENAI_API_KEY.

============================================================
KNOWN BACKEND ISSUES
============================================================

1. PDF/report request was observed returning HTTP 500:

"Stored PDF artifact source does not match immutable published report"

2. An uncached PDF regeneration took approximately 76 seconds.

3. During that slow PDF generation, subsequent backend/report requests appeared to stall.

Your job:
REPRODUCE -> DIAGNOSE -> FIX -> RETEST -> FULL REGRESSION.

Do not stop after analysis.

============================================================
STRICT PRESERVATION
============================================================

DO NOT change:

- frontend/
- question wording
- question-bank content
- 61,440-question architecture
- methodology versions
- scoring
- adaptive routing
- capability mappings
- domain mappings
- diagnosis business logic
- authentication behavior
- payment logic
- existing published report facts
- deterministic diagnosis results

DO NOT:

- reset PostgreSQL
- delete diagnoses
- destructively reseed data
- run destructive Prisma operations
- run npm audit fix --force
- expose .env
- expose secrets

PDF requirement remains:
EXACTLY 3 PAGES.

============================================================
STEP 1/12 — INSPECT + REPRODUCE
============================================================

Inspect the current backend implementation for:

- report publication
- immutable published reports
- report source/version/hash
- PDF artifact metadata
- PDF cache/storage
- PDF renderer
- retrieval endpoint
- regeneration logic
- artifact validation
- concurrency/locking
- relevant tests

Safely reproduce the stale PDF-artifact failure using an existing completed diagnosis/test fixture if possible.

Record:
- failure path
- expected report source identity
- stored artifact identity
- exact mismatch

Do not expose private data or secrets.

============================================================
STEP 2/12 — PROVE ROOT CAUSE
============================================================

Determine the exact cause of the stale artifact mismatch.

Investigate:

- stale metadata
- wrong hash/version
- artifact generated from older report revision
- incorrect report ID association
- race condition
- non-atomic artifact write
- cache invalidation
- filesystem leftovers
- tenant/report collision
- concurrent generation
- publication timing

Do not guess.

Prove the cause from code/runtime evidence.

============================================================
STEP 3/12 — FIX STALE ARTIFACT HANDLING
============================================================

Required behavior:

VALID cached artifact:
-> return normally.

STALE/MISMATCHED artifact:
-> NEVER serve stale PDF.
-> do not permanently fail with HTTP 500 merely because cache is stale.
-> regenerate from the correct immutable published report.
-> write replacement atomically.
-> verify source identity before serving.

Protect against:

- cross-report mixups
- cross-tenant mixups
- partial writes
- simultaneous generation corruption

Preserve immutable report semantics.

============================================================
STEP 4/12 — PROFILE PDF PERFORMANCE
============================================================

Profile the ~76-second uncached generation.

Measure where time is spent:

- report reconstruction
- renderer/browser startup
- Python/process startup if applicable
- fonts
- images/assets
- serialization
- filesystem
- validation
- repeated computation
- locks
- subprocess execution
- synchronous blocking

Fix the actual bottleneck.

Do NOT improve performance by:

- returning stale PDFs
- skipping validation
- removing report content
- reducing page count
- weakening correctness

TARGETS where reasonably possible locally:

Cached PDF:
< 2 seconds

Uncached PDF:
< 15 seconds

If those targets cannot safely be reached, provide actual timings and the proven reason.

Most importantly:
PDF generation must not unnecessarily block unrelated backend requests.

============================================================
STEP 5/12 — PDF REGRESSION
============================================================

Test:

- valid cached PDF
- stale artifact recovery
- uncached generation
- immediate repeat request
- simultaneous same-report requests
- different reports concurrently
- artifact identity
- tenant/report ownership
- retry after failure
- server restart/cache behavior where supported

Verify every resulting PDF remains EXACTLY 3 pages.

Test all five domains where fixtures/data permit.

Verify:

- overall score
- strengths
- weaknesses
- 5 critical priorities
- 12-month plan
- dates
- long capability names
- status indicators

Do not alter report facts.

============================================================
STEP 6/12 — REAL MMRI AI ADAPTER
============================================================

Verify the REAL APPLICATION PATH:

completed diagnosis
-> deterministic diagnosis result
-> MMRI report data
-> MMRI AI adapter
-> OpenAI Responses API
-> response validation
-> final report
-> PDF compatibility

Do NOT count another standalone curl request.

Verify:

MMRI_AI_REPORT_PROVIDER=openai

actually selects the OpenAI adapter.

Verify:

MMRI_AI_REPORT_MODEL

is actually consumed by the adapter.

Verify the configured Responses endpoint is used.

Use a safe existing completed diagnosis/test fixture.

Run at least ONE real request THROUGH MMRI'S OWN AI/report adapter.

Prove:

OPENAI PROVIDER USED

and

FALLBACK NOT USED

for the successful real-AI test.

============================================================
STEP 7/12 — AI GROUNDING
============================================================

Compare the AI-enhanced report against deterministic MMRI facts.

AI MUST NOT invent/change:

- overall score
- capability scores
- domain
- diagnosis identity
- strengths
- weaknesses
- critical priorities
- deterministic findings

AI may interpret/explain/recommend only from supplied deterministic data.

Validate where applicable:

- summary
- strengths
- weaknesses
- critical priorities
- recommendations
- 12-month plan

Check:

- valid Mongolian Unicode
- valid structure/JSON
- required sections populated
- no placeholders
- no corrupted characters
- no obvious irrelevant English leakage

============================================================
STEP 8/12 — AI FALLBACK
============================================================

Verify:

MMRI_AI_REPORT_REQUIRED=false

behavior.

If OpenAI fails or AI validation fails:

- deterministic fallback remains usable
- no partial/corrupt AI result is published
- report generation remains safe

Prefer existing automated failure/fallback tests.

Do not modify .env simply to manufacture a failure unless absolutely necessary and safely reversible.

============================================================
STEP 9/12 — CONCURRENCY / RELIABILITY
============================================================

Test:

- 2 simultaneous requests for same PDF
- immediate request after generation
- concurrent requests for different reports
- cached request after restart where supported

Ensure:

- no artifact corruption
- no mismatched source
- no duplicate conflicting writes
- no deadlock
- no unnecessary global lock
- unrelated API endpoints remain responsive

============================================================
STEP 10/12 — EXISTING BACKEND REGRESSIONS
============================================================

Run all relevant existing tests for:

- findings
- recommendations
- 12-month plan
- report generation
- report publication
- AI boundary
- AI reliability
- PDF generation
- PDF artifact validation
- authentication/report authorization where applicable

Do not weaken tests just to obtain PASS.

If a test encodes an obsolete implementation detail, update it only if the underlying business requirement remains fully preserved and explain why.

============================================================
STEP 11/12 — SECRET / CHANGE-SCOPE CHECK
============================================================

Verify:

- backend/.env remains ignored
- OPENAI_API_KEY is absent from source
- OPENAI_API_KEY is absent from logs
- OPENAI_API_KEY is absent from staged Git files
- temporary diagnostic artifacts contain no secrets

Never print the actual key.

Check source changes.

FRONTEND FILES CHANGED MUST BE ZERO.

QUESTION-BANK / METHODOLOGY FILES CHANGED MUST BE ZERO.

DESTRUCTIVE DATABASE OPERATIONS MUST BE ZERO.

============================================================
STEP 12/12 — FINAL FULL RERUN
============================================================

After all fixes:

rerun the complete relevant backend report/PDF/AI test suite.

Do not declare PASS based on one successful PDF or one successful AI call.

============================================================
ALLOWED CHANGES
============================================================

Allowed:

- backend source
- backend tests
- narrowly related report/PDF utilities
- narrowly related non-destructive test/ops scripts

Forbidden:

- frontend/
- methodology/question-bank data
- destructive database operations
- secrets

============================================================
FINAL OUTPUT
============================================================

Provide:

STEP | STATUS | ISSUE FOUND | FIX MADE | FINAL RESULT

Then explicitly report:

1. stale PDF root cause
2. stale PDF fix
3. cached PDF timing
4. uncached PDF timing
5. concurrent request behavior
6. whether unrelated API requests remain responsive during PDF generation
7. exact PDF page-count result
8. domains tested
9. real OpenAI adapter verification
10. proof fallback was NOT used in successful AI test
11. AI grounding result
12. deterministic fallback result
13. tests run
14. tests passed
15. tests failed
16. backend files changed
17. frontend files changed — MUST BE ZERO
18. methodology/question-bank files changed — MUST BE ZERO
19. destructive DB operations — MUST BE ZERO
20. secret exposure — MUST BE ZERO

Explicitly state:

- stale-artifact HTTP 500 fixed: YES/NO
- stale PDF ever served: YES/NO
- uncached PDF generation improved: YES/NO + timing
- PDF blocks unrelated requests: YES/NO
- PDFs exactly 3 pages: YES/NO
- real MMRI OpenAI adapter succeeded: YES/NO
- deterministic MMRI facts remain authoritative: YES/NO
- fallback remains operational: YES/NO

FINAL STATUS MUST BE EXACTLY ONE OF:

PASS — BACKEND REPORT/PDF + AI GATE APPROVED

or

HOLD — BACKEND REPORT/PDF + AI GATE HAS REMAINING FAILURES

Perform the actual repairs and tests now.
Do not stop after analysis.
