/**
 * Phase 2.7 — flag-gated V2 policy helpers used by businessmri-runtime.ts. Pure; no I/O.
 * Nothing in here runs unless a PolicyFlags field is ON (see policy-flags.ts).
 */
import type { DirectEvidence, MethodologyDefinition } from "./types.js";
import type { B1Mode } from "./policy-flags.js";

export interface ContradictionVerdict {
  hard: boolean;
  /** human-readable basis, also serialized into the contradiction finding */
  basis: string;
  spreadPoints: number;
  levelGap: number | null;
}

/** distinct scored option values of a question, ascending (its ordinal scale) */
export function scaleOf(definition: MethodologyDefinition, questionId: string): number[] {
  const q = definition.questionById.get(questionId);
  if (!q) return [];
  return [...new Set(q.options.map(o => o.score).filter((s): s is number => typeof s === "number"))].sort((a, b) => a - b);
}

/**
 * VARIANT 1 (NUMERIC_50): literal frozen contract — hard when max - min >= contract sameCell.hardRangePoints (inclusive).
 * VARIANT 2 (ORDINAL_2_LEVELS): each answer is placed on ITS OWN question's ordinal scale (rank of its score among the question's
 *   distinct scored options, 0..n-1). For two answers on scales of n1 and n2 levels, positions are normalised to p = rank/(n-1)
 *   and the gap is expressed in levels of the COARSER scale: gap = |p1 - p2| * (min(n1, n2) - 1). Hard when gap >= 2.
 *   Equal scales therefore reduce to "at least two ordinal levels apart" (3-level scale: only worst-vs-best; 5-level: two steps).
 *   For a cell with more than two answers the largest pairwise gap decides (order independent). Scales with < 2 levels never contradict.
 * This variant is NOT the frozen contract text; it exists for owner review.
 */
export function judgeContradiction(
  definition: MethodologyDefinition,
  scored: DirectEvidence[],
  mode: B1Mode
): ContradictionVerdict {
  const values = scored.map(e => e.score as number);
  const spread = values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
  if (mode === "OFF" || scored.length < 2) return { hard: false, basis: "none", spreadPoints: spread, levelGap: null };
  if (mode === "NUMERIC_50") {
    const limit = Number(definition.contracts.contradiction.sameCell.hardRangePoints ?? 50);
    return { hard: spread >= limit, basis: `spread ${spread} >= ${limit}`, spreadPoints: spread, levelGap: null };
  }
  let maxGap = 0;
  for (let i = 0; i < scored.length; i++) for (let j = i + 1; j < scored.length; j++) {
    const a = scored[i], b = scored[j];
    const sa = scaleOf(definition, a.questionId), sb = scaleOf(definition, b.questionId);
    if (sa.length < 2 || sb.length < 2) continue;
    const pa = sa.indexOf(a.score as number) / (sa.length - 1), pb = sb.indexOf(b.score as number) / (sb.length - 1);
    if (sa.indexOf(a.score as number) < 0 || sb.indexOf(b.score as number) < 0) continue;
    maxGap = Math.max(maxGap, Math.abs(pa - pb) * (Math.min(sa.length, sb.length) - 1));
  }
  const gap = Math.round(maxGap * 1e9) / 1e9;
  return { hard: gap >= 2, basis: `ordinal level gap ${gap} >= 2`, spreadPoints: spread, levelGap: gap };
}
