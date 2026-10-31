import type { EngineContracts, SourceKind } from "./types.js";
import { clamp, product } from "./utils.js";

export interface ConfidenceInput {
  reliabilities: number[];
  sourceKinds: SourceKind[];
  directCount: number;
  hardContradiction?: boolean;
}

export function directConfidence(contracts: EngineContracts, input: ConfidenceInput): number {
  if (input.reliabilities.length === 0 || input.directCount === 0) return 0;
  const raw = 1 - product(input.reliabilities.map(r => 1 - clamp(r, 0, 1)));
  // Independence is methodology-versioned. Historical v1/v2 contracts treated
  // path source-kind diversity as an evidence bonus. v3 explicitly disables that
  // bonus because multiple paths from one respondent are corroborating self-report,
  // not independent sources. This keeps historical assessments reproducible while
  // enforcing the corrected v3 semantics.
  const diversityDisabled = Boolean(contracts.confidence.independencePolicy?.sourceDiversityBonusDisabled);
  const kinds = new Set(input.sourceKinds).size;
  const sourceBonus = diversityDisabled
    ? 0
    : kinds <= 1
      ? Number(contracts.confidence.sourceKindBonus["1"] ?? 0)
      : kinds === 2
        ? Number(contracts.confidence.sourceKindBonus["2"] ?? 0.03)
        : Number(contracts.confidence.sourceKindBonus["3plus"] ?? 0.05);
  const preCap = clamp(raw + sourceBonus, 0, 1);
  const countCaps = contracts.confidence.directCountCaps;
  const capKey = input.directCount >= 4 ? "4" : String(input.directCount);
  let result = Math.min(preCap, Number(countCaps[capKey] ?? 1));
  if (input.hardContradiction) result = Math.min(result, Number(contracts.contradiction.effects.hard.confidenceCap ?? 0.65));
  return result;
}

export function derivedConfidence(contracts: EngineContracts, strengths: number[]): number {
  if (strengths.length === 0) return 0;
  const anchor = Math.max(...strengths);
  const group = Math.min(1, strengths.reduce((a,b) => a+b, 0));
  return Math.min(Number(contracts.confidence.derived.cap ?? 0.45), 0.70 * anchor + 0.30 * group);
}

export function canDirectFinalize(contracts: EngineContracts, args: {
  directCount: number;
  sourceKindCount: number;
  confidence: number;
  hasValue: boolean;
  hasHardContradiction: boolean;
  maxAcceptedAuthority: number;
}): boolean {
  const f = contracts.confidence.finalization;
  const authorityMin = Number(contracts.authority.finalization.requiresAtLeastOneAcceptedDirectAnswerAuthorityAtLeast ?? 0.75);
  return args.directCount >= Number(f.minimumDirectAnswers)
    && args.sourceKindCount >= Number(f.minimumIndependentSourceKinds)
    && args.confidence >= Number(f.threshold)
    && (!f.requiresValue || args.hasValue)
    && (!f.requiresNoContradiction || !args.hasHardContradiction)
    && args.maxAcceptedAuthority >= authorityMin;
}

export function canConfirmNa(contracts: EngineContracts, args: {
  claimCount: number;
  sourceKindCount: number;
  claimConfidence: number;
  hasScoredConflict: boolean;
}): boolean {
  const n = contracts.naDnk.naConfirmation;
  return args.claimCount >= Number(n.minimumClaims)
    && args.sourceKindCount >= Number(n.minimumSourceKinds)
    && args.claimConfidence >= Number(n.minimumConfidence)
    && (!n.requiresNoApplicableScoredConflict || !args.hasScoredConflict);
}
