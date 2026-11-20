/**
 * PHASE 2.6 — TEST-ONLY adapter: applies the proposed B1/B2/B3 policies to the snapshot the CURRENT V2 runtime produced,
 * then re-aggregates with the production `calculateAggregateSnapshots`. It reuses only fields the engine already has
 * (status, hasHardContradiction, effectiveConfidence, locked), so what it demonstrates is exactly what a flagged runtime change would do.
 * Not imported by any runtime file (guard test). Default flags = all off = identical to production.
 */
import type { CellSnapshot, DirectEvidence, MethodologyDefinition, RuntimeSnapshot } from "../types.js";
import { calculateRuntimeSnapshot } from "../calculation.js";
import { calculateAggregateSnapshots } from "../scoring.js";
import { mapKey } from "../utils.js";
import { evaluateProposedCell, type ScoredAnswer } from "./phase025-policy.js";

export interface PolicyFlags { b1Contradiction?: boolean; b2ScoredConflict?: boolean; b3Confidence?: boolean }

export interface AdaptedResult {
  snapshot: RuntimeSnapshot;
  hardContradictionCells: string[];
  exclusionConflictCategories: string[];
  excludedCategories: string[];
}

export function runWithPolicies(def: MethodologyDefinition, evidence: DirectEvidence[], flags: PolicyFlags = {}): AdaptedResult {
  const base = calculateRuntimeSnapshot(def, evidence);
  if (!flags.b1Contradiction && !flags.b2ScoredConflict && !flags.b3Confidence) {
    return { snapshot: base, hardContradictionCells: [], exclusionConflictCategories: [], excludedCategories: [...base.categories.values()].filter(c => c.confirmedNotApplicable).map(c => c.categoryId) };
  }
  const cells = new Map<string, CellSnapshot>();
  for (const [k, v] of base.cells) cells.set(k, { ...v });
  const hard: string[] = [], conflict: string[] = [];
  const contracts = def.contracts;

  for (const category of def.categories) {
    let anyScored = false;
    for (const cellDef of def.cells) {
      if (cellDef.id === "C01") continue;
      const key = mapKey(category.id, cellDef.id);
      const cell = cells.get(key)!;
      const scored: ScoredAnswer[] = cell.directEvidence
        .filter(e => e.state === "SCORED" && e.score !== null && def.runtimePolicy?.questionById.get(e.questionId)?.scoreEligible)
        .map(e => ({ questionId: e.questionId, path: e.path, score: e.score as number, reliability: e.reliability }));
      if (scored.length === 0 || cell.status === "NOT_APPLICABLE") continue;
      anyScored = true;
      const p = evaluateProposedCell(scored, contracts);
      if (flags.b3Confidence) { cell.effectiveConfidence = p.confidence; cell.directConfidence = p.confidence; }
      if (flags.b1Contradiction && p.hardContradiction) {
        cell.hasHardContradiction = true; cell.hardContradictionRuleIds = ["H01"]; cell.status = "REVIEW_REQUIRED"; cell.locked = false;
        cell.lockReason = null; cell.confidenceState = "ESTIMATED";
        cell.effectiveConfidence = Math.min(cell.effectiveConfidence, p.confidence); cell.directConfidence = cell.effectiveConfidence;
        hard.push(key);
      }
    }
    if (flags.b2ScoredConflict && anyScored) {
      const gate = cells.get(mapKey(category.id, "C01"))!;
      if (gate.status === "NOT_APPLICABLE") {
        // same mechanism Marketing uses for scope contradiction (H02): a flagged gate is not a confirmed N/A, so the capability stays in the denominator
        gate.hasHardContradiction = true; gate.hardContradictionRuleIds = ["H02"]; gate.status = "REVIEW_REQUIRED"; gate.locked = false; gate.lockReason = null;
        conflict.push(category.id);
      }
    }
  }
  const agg = calculateAggregateSnapshots(def, cells);
  const snapshot: RuntimeSnapshot = { cells, contradictions: base.contradictions, ...agg };
  return { snapshot, hardContradictionCells: hard, exclusionConflictCategories: conflict, excludedCategories: [...agg.categories.values()].filter(c => c.confirmedNotApplicable).map(c => c.categoryId) };
}
