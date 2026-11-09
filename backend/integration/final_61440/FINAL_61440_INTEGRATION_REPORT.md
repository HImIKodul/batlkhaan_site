# MMRI final repaired 61,440-question bank — integration (2026-10-29)

Source of truth: `MMRI_FINAL_61440_QUESTION_BANK.csv` (sha256 f086dad5b5d97a6ddabcc93edf12ac2c3def75cdc8daa0bfe1b377609d27b024, identical to the file inside `MMRI_FINAL_61440_QUESTION_BANK.zip`).
Rebuild: `cd backend && python3 -I scripts/build-final-61440-repaired-bundles.py` (deterministic; copies old accepted bundles, replaces only question wording by exact question ID).

| Domain | Methodology | Question bank | Questions | Text changed | Bundle sha256 |
|---|---|---|---|---|---|
| Marketing | 3.0.4 | 3.1.4 | 12,288 | 640 | aa5b2f844bb29249ff1ce6d38a44ad8aba9f8411c346aec30674e7511e287a3b |
| Human Resources | 4.1.5 | BUSINESSMRI-v2.5-HRMRI | 12,288 | 1,256 | 635d538a4043a5c62e18c0ebfeda1730c380015b3070cb39bc8d1305ba572439 |
| Finance | 4.2.5 | BUSINESSMRI-v2.5-FINMRI | 12,288 | 1,093 | 7c7b930f40d388844c6347e15d2b9e6eeeb0dd85683e88ab29bcf9a34c693ff7 |
| Information Technology | 4.3.5 | BUSINESSMRI-v2.5-ISMRI | 12,288 | 1,169 | 263953ab18d4b2d22ee94c01bc76685092d46fef5e1e1588d222789b32b3351b |
| Production & Operations | 4.4.5 | BUSINESSMRI-v2.5-OPMRI | 12,288 | 1,259 | 63ce59dfc7ffdde1590c25de4127e1048cffb422f1a568c0bee2af69fdaf77a1 |

Total 61,440 (5 x 64 capabilities x 48 cells x 4 variants). Marketing question-array sha256 43eae5b8...39cb.

Verified: all CSV question IDs, category IDs, cell IDs, variants and answer counts map 1:1 to the previous bundles; a structural diff of old vs new bundles shows ONLY `textMn` of questions and version metadata differ (0 non-text question diffs). Older bundles (3.0.3 / 4.x.4 / v2.4 and earlier) are untouched for rollback.

Excel `02_HRMRI_64_Categories_12288_Questions.xlsx` (HRMRI only): same 12,288 IDs, but 0 question texts equal the final CSV or the runtime, wording is the older "Category: prefix" template and answer strings use an older format. Not applied; final CSV kept.

Regression: see `REGRESSION_EXIT_CODES_*.txt`. No script passes on the old bundles and fails on the new ones. Scripts failing on both (missing legacy files, missing `typescript` module path, DB/API-dependent gates, engine synthetic tests) are pre-existing and unrelated.

Database NOT modified. Active DB versions are still 3.0.3 / 4.x.4. To activate the new versions non-destructively (new version rows, old ones archived for rollback), after updating the `MMRI_TARGET_*` lines in `backend/.env` to match `.env.example`:
`npm run db:import && scripts/import-five-domain-candidates.sh` then `tsx src/promote-five-domain-methodologies.ts`; verify with `npm run db:verify`.
