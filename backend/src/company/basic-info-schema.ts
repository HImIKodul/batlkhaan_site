/* DX-02: server-side schema of the 20 basic-information questions (B01..B20): type and number of options. Every stored answer is validated against it (index range, single-select cardinality, uniqueness).
   Kept in step with frontend/src/data/basicInfoQuestions.ts by tests/basic-info-schema.test.ts (a drift fails the test run). */
export const BASIC_INFO_SCHEMA: Readonly<Record<string, { type: "SINGLE_SELECT" | "MULTI_SELECT"; options: number }>> = {
  B01: { type: "SINGLE_SELECT", options: 5 }, B02: { type: "SINGLE_SELECT", options: 5 }, B03: { type: "SINGLE_SELECT", options: 5 }, B04: { type: "SINGLE_SELECT", options: 5 }, B05: { type: "SINGLE_SELECT", options: 5 },
  B06: { type: "SINGLE_SELECT", options: 5 }, B07: { type: "SINGLE_SELECT", options: 5 }, B08: { type: "SINGLE_SELECT", options: 5 }, B09: { type: "SINGLE_SELECT", options: 7 }, B10: { type: "SINGLE_SELECT", options: 5 },
  B11: { type: "SINGLE_SELECT", options: 5 }, B12: { type: "SINGLE_SELECT", options: 5 }, B13: { type: "SINGLE_SELECT", options: 5 }, B14: { type: "SINGLE_SELECT", options: 6 }, B15: { type: "SINGLE_SELECT", options: 5 },
  B16: { type: "SINGLE_SELECT", options: 5 }, B17: { type: "SINGLE_SELECT", options: 5 }, B18: { type: "SINGLE_SELECT", options: 5 }, B19: { type: "SINGLE_SELECT", options: 5 }, B20: { type: "SINGLE_SELECT", options: 6 },
};
/** Returns the validated, de-duplicated, sorted option indexes, or null when the answer is not valid for that question. */
export function validateBasicInfoAnswer(questionId: string, rawIndexes: unknown): number[] | null {
  const spec = BASIC_INFO_SCHEMA[questionId]; if (!spec || !Array.isArray(rawIndexes)) return null;
  const nums = rawIndexes.map(x => (typeof x === "number" ? x : NaN));
  if (nums.some(n => !Number.isInteger(n) || n < 1 || n > spec.options)) return null;
  const unique = [...new Set(nums)].sort((a, b) => a - b);
  if (unique.length !== nums.length || unique.length === 0) return null;          // duplicates / empty
  if (spec.type === "SINGLE_SELECT" && unique.length !== 1) return null;           // single select: exactly one
  return unique;
}
