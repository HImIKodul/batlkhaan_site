# MMRI Step 5/7 — Lineage Freeze Manifest

**Status:** `FREEZE_CANDIDATE_NOT_PRODUCTION_FINAL`  
**Manifest version:** `MMRI-QBANK-LINEAGE-STEP5-v1.0.0`  
**Created:** 2026-10-10  

## Canonical dataset

- Domains: 5
- Categories: 320 total / 64 per domain
- Dimensions per category: 48
- Variants per dimension: 4
- Questions per domain: 12,288
- Questions total: 61,440
- Unique Question IDs: 61,440
- Canonical content SHA-256: `34337d26022965045515d57030ba1f1d2b01a1df5642c77a87d2890a12acac25`

## Domain fingerprints

| Domain | Questions | Unique IDs | Categories | Dimensions | Content SHA-256 |
|---|---:|---:|---:|---:|---|
| MARKETING | 12,288 | 12,288 | 64 | 48 | `52007846e67945f9e4f7eaca18f703d26bc2347d8f85a86de573f2727a7475c9` |
| HRMRI | 12,288 | 12,288 | 64 | 48 | `0d4c2d83034e6a790ea3b034298e108de9bc2980faef32816936563a49526a79` |
| FINMRI | 12,288 | 12,288 | 64 | 48 | `befa78bc470c05a288df12e52f3ce9f122ab8abbf0a63a06a38e3a6db0b39ab5` |
| ISMRI | 12,288 | 12,288 | 64 | 48 | `7eb9bab0b27f5b7c21521ffadd1fc254abcb7ad94cd84104394c1a29d6fa5acc` |
| OPMRI | 12,288 | 12,288 | 64 | 48 | `c7254a76bc604db1c1a858221ace5101df96f4f1430f1061302ccfb98284968f` |

## Why this is not the final production freeze

- Step 1 identified minor residual Marketing wording cleanup.
- Steps 2–3 identified targeted semantic/style review for the four non-Marketing banks.
- Runtime scoring, normalization, routing and DB mappings still require the working system ZIP.

## Change-control rules

- `doNotEditFrozenFilesInPlace` = `True`
- `anyQuestionOrAnswerEditRequiresNewVersion` = `True`
- `anyQuestionOrAnswerEditRequiresNewContentHash` = `True`
- `preserveQuestionIDsUnlessMeaningChanges` = `True`
- `preserveCategoryIDs` = `True`
- `preserveDimensionIDs` = `True`
- `preserveVariantOrder` = `True`
- `preserveAnswerOrder` = `True`
- `doNotInferScoreFromAnswerPosition` = `True`
- `productionApprovalBlockedUntilSteps6And7AndRuntimeVerification` = `True`

Any later question/answer edit must generate a new version and new content hash.
