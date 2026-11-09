# Diagnosis result hash — version-aware integrity policy

Implemented in `src/lib/hash.ts` (`normalizeJsonNumbers`, `isJsonNumberNormalized`, `classifyResultHash`), used by `freezeDiagnosisResultOnce`
(`src/services/prisma-strategy-report-service.ts`) and `src/verify-diagnosis-result.ts`. Regression: `scripts/qa-hash-normalization-regression.ts`.

## The defect this policy handles

A diagnosis result is hashed (`resultHash`, SHA-256 over canonical sorted-key JSON with `resultHash:""`) from exact JavaScript doubles and then written
through Prisma to a PostgreSQL JSON column. That write path keeps at most 16 significant digits, so a double that needs 17 (for example
`0.30000000000000004`) is stored as a different number than the one that was hashed. The stored result therefore cannot be re-hashed to the stored
hash. This is deterministic and affects every snapshot frozen before the fix (all 113 in the operational database at 2026-11-08), with no sign of
tampering: the hash embedded in the result equals the `resultHash` column and the `DIAGNOSIS_FROZEN` audit event in every row.

## Rules

1. **Stored data is never rewritten.** No `result`, `resultHash`, report or PDF of an existing snapshot is modified, re-hashed or re-frozen in place.
2. **New freezes are normalized.** Before hashing and persisting, every non-integer number is rounded to 15 significant digits (`Number(x.toPrecision(15))`).
   15 digits survive the write path exactly (20,000 random doubles round-tripped identically on PostgreSQL), so new snapshots recompute exactly.
   Scoring calculations are unchanged: this is the precision of the *stored copy* only.
3. **Classification is by content, never by guesswork** (`classifyResultHash`):
   - `REPRODUCIBLE` — the hash recomputes from the stored result.
   - `LEGACY_FLOAT_TRUNCATED` — it does not, and the stored numbers are not 15-digit-stable, i.e. the snapshot predates normalization. Integrity rests on:
     the stored hash being unchanged, the matching `DIAGNOSIS_FROZEN` audit event (`entityId` = hash), the downstream bindings
     (strategy/plan/report `diagnosisResultHash`), and backups. The verifier prints a labelled WARN and passes the check; it never hides the class.
   - `MISMATCH_ON_NORMALIZED` — it does not recompute although the numbers are stable. This is a **genuine integrity failure**; the verifier fails.
4. **Detection limit (accepted risk):** recomputation cannot prove a *legacy* snapshot is unchanged, because it never recomputed. If someone edited a
   legacy snapshot and left its numbers non-normalized, the verifier would still classify it `LEGACY_FLOAT_TRUNCATED`. The controls for legacy rows are
   therefore comparison, not recomputation: the stored `resultHash` against the `DIAGNOSIS_FROZEN` audit event and against the verified backups.
5. **Optional future step (only if recomputable proof for old reports is ever required):** append a re-frozen revision under a new `schemaVersion`; the
   original row stays byte-identical. Never an in-place rewrite.

## Operational check

`npm run db:verify:diagnosis -- <assessmentId>` per snapshot; aggregate classification can be produced read-only with `classifyResultHash` over the
`diagnosis_snapshots` table. Run it before and after any restore or migration; the counts per class must not change.
