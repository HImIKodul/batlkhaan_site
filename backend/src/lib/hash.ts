import { createHash } from "node:crypto";

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(",")}}`;
}

export function sha256Json(value: unknown): string {
  return sha256Text(stableJson(value));
}

/**
 * The Prisma/PostgreSQL JSON write path keeps at most 16 significant digits, so a double that needs 17
 * (e.g. 0.30000000000000004) is stored as a different number than the one that was hashed. Rounding to 15
 * significant digits before hashing and persisting makes the stored JSON hash-reproducible.
 * Applies to NEW freezes only: historical snapshots and their hashes must never be rewritten.
 */
export function normalizeJsonNumbers<T>(value: T): T {
  if (typeof value === "number") return (Number.isInteger(value) || !Number.isFinite(value) ? value : Number(value.toPrecision(15))) as unknown as T;
  if (Array.isArray(value)) return value.map(normalizeJsonNumbers) as unknown as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeJsonNumbers(v)])) as T;
  return value;
}

export function isJsonNumberNormalized(value: unknown): boolean {
  return stableJson(value) === stableJson(normalizeJsonNumbers(value));
}

export type ResultHashClass = "REPRODUCIBLE" | "LEGACY_FLOAT_TRUNCATED" | "MISMATCH_ON_NORMALIZED";

/**
 * Version-aware policy for stored diagnosis snapshots (see docs/DIAGNOSIS_HASH_POLICY.md). Never used to rewrite data.
 *  - REPRODUCIBLE: the hash recomputes from the stored result.
 *  - LEGACY_FLOAT_TRUNCATED: it does not, and the stored numbers are not 15-significant-digit-stable, i.e. the snapshot was frozen before number
 *    normalization and PostgreSQL JSON storage truncated 17th digits. Integrity then rests on the stored hash, the DIAGNOSIS_FROZEN audit event,
 *    downstream bindings and backups.
 *  - MISMATCH_ON_NORMALIZED: it does not recompute although the numbers are stable. This is a genuine integrity failure.
 */
export function classifyResultHash(result: Record<string, unknown>, storedHash: string): ResultHashClass {
  if (sha256Json({ ...result, resultHash: "" }) === storedHash) return "REPRODUCIBLE";
  return isJsonNumberNormalized(result) ? "MISMATCH_ON_NORMALIZED" : "LEGACY_FLOAT_TRUNCATED";
}
