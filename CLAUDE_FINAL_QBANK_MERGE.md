PROJECT ROOT:
/home/kirby/MMRI_STEP10_FINAL_WORKING

FINAL VALIDATED QUESTION BANK:
/tmp/mmri_final_qbank_merge/MMRI_FINAL_61440_QUESTION_BANK.csv

SOURCE ZIP:
/home/kirby/Downloads/MMRI_FINAL_61440_QUESTION_BANK.zip

ADDITIONAL EXCEL REFERENCE:
/home/kirby/Downloads/02_HRMRI_64_Categories_12288_Questions.xlsx

TASK:
Integrate the finalized repaired five-domain MMRI question bank into the CURRENT main MMRI system.

CRITICAL SOURCE PRIORITY:

1. The CSV extracted from MMRI_FINAL_61440_QUESTION_BANK.zip is the AUTHORITATIVE finalized question-bank dataset.

2. The Excel file is secondary/reference material.
   Do NOT overwrite finalized CSV wording just because the Excel differs.

3. If the Excel contains apparently newer human-reviewed content, first compare IDs, category IDs, cell IDs, question IDs, answers and scoring metadata.
   Only apply Excel wording if it can be mapped deterministically to the exact same question IDs and does NOT alter architecture, scoring, routing or validated structure.

4. If there is uncertainty or conflict, KEEP THE FINALIZED CSV VERSION.

CURRENT MAIN SYSTEM IS AUTHORITATIVE FOR:
- latest Claude frontend/design
- liquid-glass UI
- profile/settings
- current homepage
- current guide popup design
- current CSS/TSX changes
- existing backend functionality outside the question-bank/runtime integration

DO NOT REPLACE THE WHOLE PROJECT.
DO NOT RESTORE AN OLDER FRONTEND.
DO NOT DELETE CURRENT UI WORK.

FINAL REQUIRED DATA ARCHITECTURE:
- 5 domains
- 64 capabilities per domain
- 48 cells/dimensions per capability
- 4 question variants per cell
- 12,288 questions per domain
- 61,440 questions total

DOMAINS:
- Marketing
- Information Technology
- Finance
- Human Resources
- Production & Operations

FINAL RUNTIME VERSION TARGETS:

Marketing:
- methodology 3.0.4
- QBANK 3.1.4

Human Resources:
- methodology 4.1.5
- BUSINESSMRI-v2.5-HRMRI

Finance:
- methodology 4.2.5
- BUSINESSMRI-v2.5-FINMRI

Information Technology:
- methodology 4.3.5
- BUSINESSMRI-v2.5-ISMRI

Production & Operations:
- methodology 4.4.5
- BUSINESSMRI-v2.5-OPMRI

STRICT PRESERVATION:
Do not change:
- question IDs
- category/capability IDs
- cell/dimension IDs
- answer option indexes
- numeric scores
- scoring directions
- routing logic
- weights
- applicability state semantics
- report mappings
- diagnosis behavior

DO NOT regenerate questions with AI.
DO NOT paraphrase the finalized CSV.
DO NOT mass rewrite the dataset.

MERGE PROCESS:

1. Inspect the existing backend methodology/question-bank architecture in:
   /home/kirby/MMRI_STEP10_FINAL_WORKING/backend

2. Inspect the finalized 61,440-row CSV.

3. Inspect the Excel only as a secondary comparison/reference source.

4. Determine the existing runtime JSON/bundle schema from the current system.

5. Convert/import the finalized CSV into the CURRENT runtime bundle structure without changing IDs, scoring or mappings.

6. Preserve existing older runtime bundles for rollback.

7. Create/version the repaired runtime bundles beside the old ones.

8. Make the repaired versions the active defaults.

9. Update only required backend selectors/configuration/import defaults.

10. Preserve the latest frontend completely unless a tiny compatibility adjustment is genuinely required.

11. Do not reset PostgreSQL.

12. Do not delete users, diagnoses, reports or payments.

13. Do not run destructive Prisma commands.

14. Do not run npm audit fix --force.

VALIDATION REQUIRED AFTER MERGE:

A. Dataset:
- total = 61,440
- each domain = 12,288
- each domain = 64 capabilities
- each capability = 48 cells
- each cell = 4 question variants
- no duplicate question IDs
- no blank active question text
- no blank active answer text

B. Runtime:
- active selectors use repaired versions
- no active selector defaults to older Marketing 3.0.3 / QBANK 3.1.3
- no active non-Marketing selector defaults to old 4.x.4 bundles

C. Existing regression:
Run all relevant available validation scripts for:
- adaptive routing
- scoring
- cell reachability
- QUICK hard cap
- findings
- recommendations
- action plan
- report/PDF linkage
- five-domain E2E

D. Frontend:
- run npm build
- confirm latest Claude liquid-glass frontend remains intact
- do not overwrite recent frontend source files with older copies

E. Database:
This task is SOURCE INTEGRATION.
Do NOT destroy or reset the existing local PostgreSQL database.
If DB import/promotion is required, first identify the existing safe import workflow and use versioned/non-destructive import only.

FINAL OUTPUT:

After successful merge, report:
1. files added
2. files modified
3. frontend files intentionally preserved
4. final active versions
5. per-domain question counts
6. total question count
7. regression/build results
8. any Excel-vs-final-CSV differences found
9. whether database was modified
10. exact final archive path
11. SHA-256

CREATE FINAL ARCHIVE:

/home/kirby/Downloads/MMRI_MAIN_SYSTEM_FINAL_61440_REPAIRED_2026-10-29.tar.zst

Create checksum:

/home/kirby/Downloads/MMRI_MAIN_SYSTEM_FINAL_61440_REPAIRED_2026-10-29.tar.zst.sha256

Exclude:
- node_modules
- temporary caches
- old dist artifacts if rebuild generates replacements
- temporary merge directories

KEEP:
- source
- required runtime bundles
- migrations
- scripts
- validation evidence required to reproduce the final state

Do the actual merge now.
Do not stop after analysis.
Do not merely tell me what commands I should run.
Work directly on /home/kirby/MMRI_STEP10_FINAL_WORKING and finish the integration.
