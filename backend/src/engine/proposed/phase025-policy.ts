/**
 * PHASE 2.5 — PROPOSED V2 policies (B1 contradiction, B2 applicability, B3 evidence/confidence).
 *
 * ISOLATED: nothing in the runtime imports this file. Production scoring is unchanged until the owner
 * approves B1/B2/B3 and the runtime is wired to it behind an explicit flag (see ENGINEERING_AUDITS/PHASE_025_*).
 * Pure functions only: no I/O, no database, no clock.
 */
import type { EngineContracts } from "../types.js";
import { directConfidence } from "../confidence.js";

export interface ScoredAnswer {
  questionId: string;
  path: number;
  score: number;
  reliability: number;
}

// ---------------------------------------------------------------- B1 contradiction
export interface ContradictionPolicy {
  /** Frozen contract: sameCell.hardRangePoints (inclusive boundary, as in the Marketing evaluator `>=`). */
  hardRangePoints: number;
  /** Frozen contract: effects.hard.confidenceCap. */
  hardConfidenceCap: number;
  /** Frozen contract: sameCell.varianceRangePoints — soft variance, informational only. */
  varianceRangePoints: number;
}

export const FROZEN_CONTRADICTION_POLICY: ContradictionPolicy = {
  hardRangePoints: 50,
  hardConfidenceCap: 0.65,
  varianceRangePoints: 25
};

export function contradictionPolicyFromContracts(contracts: EngineContracts): ContradictionPolicy {
  const c = contracts.contradiction;
  return {
    hardRangePoints: Number(c.sameCell.hardRangePoints ?? FROZEN_CONTRADICTION_POLICY.hardRangePoints),
    hardConfidenceCap: Number(c.effects.hard.confidenceCap ?? FROZEN_CONTRADICTION_POLICY.hardConfidenceCap),
    varianceRangePoints: Number(c.sameCell.varianceRangePoints ?? FROZEN_CONTRADICTION_POLICY.varianceRangePoints)
  };
}

export type ProposedCellStatus = "UNASSESSED" | "DIRECT_PROVISIONAL" | "REVIEW_REQUIRED";

export interface ProposedCell {
  score: number | null;
  scoredAnswerCount: number;
  spread: number | null;
  hardContradiction: boolean;
  softVariance: boolean;
  confidence: number;
  /** V2 has only two score-eligible paths, so a contradiction can never be resolved by a third scored answer. */
  status: ProposedCellStatus;
  locked: false;
  /** every answer retained untouched: the proposal never deletes or edits evidence (contract: autoDeleteEvidence=false). */
  evidenceTrace: ScoredAnswer[];
}

/**
 * Order-independent. Score stays the arithmetic mean (contract: autoChangeScore=false); what changes is that a
 * >= hardRangePoints spread is flagged, capped at hardConfidenceCap and can no longer be locked/final.
 * Confidence otherwise follows the frozen Confidence Contract (path reliability combined, directCountCaps),
 * instead of the flat 1.0 the V2 runtime currently assigns.
 */
export function evaluateProposedCell(
  answers: ScoredAnswer[],
  contracts: EngineContracts,
  policy: ContradictionPolicy = contradictionPolicyFromContracts(contracts)
): ProposedCell {
  const trace = answers.slice().sort((a, b) => a.path - b.path || a.questionId.localeCompare(b.questionId));
  if (trace.length === 0) {
    return { score: null, scoredAnswerCount: 0, spread: null, hardContradiction: false, softVariance: false, confidence: 0, status: "UNASSESSED", locked: false, evidenceTrace: trace };
  }
  const values = trace.map(a => a.score);
  const spread = values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
  const hard = values.length > 1 && spread >= policy.hardRangePoints;
  const soft = values.length > 1 && spread >= policy.varianceRangePoints;
  const confidence = directConfidence(contracts, {
    reliabilities: trace.map(a => a.reliability),
    sourceKinds: trace.map(() => "SELF_REPORT" as const),
    directCount: trace.length,
    hardContradiction: hard
  });
  return {
    score: values.reduce((s, v) => s + v, 0) / values.length,
    scoredAnswerCount: trace.length,
    spread,
    hardContradiction: hard,
    softVariance: soft,
    confidence,
    status: hard ? "REVIEW_REQUIRED" : "DIRECT_PROVISIONAL",
    locked: false,
    evidenceTrace: trace
  };
}

// ---------------------------------------------------------------- B2 applicability
export interface CapabilityApplicabilityInput {
  capabilityId: string;
  nameMn?: string;
  weightPct: number;
  /** N/A claims on the gate that would, under today's rule, confirm exclusion. */
  gateExclusionConfirmedByClaims: boolean;
  /** count of scored (non-DNK) answers in the same capability's non-gate cells. */
  scoredAnswerCount: number;
  /** mean of those scored answers, for disclosure only. */
  scoredMean?: number | null;
}

export type ExclusionDecision = "APPLICABLE" | "EXCLUDED" | "EXCLUSION_CONFLICT_REVIEW";

export interface ApplicabilityDisclosure {
  applicableCount: number;
  excludedCount: number;
  conflictCount: number;
  totalWeightPct: number;
  excludedWeightPct: number;
  conflictWeightPct: number;
  excludedShareOfWeight: number;
  items: Array<{ capabilityId: string; nameMn?: string; weightPct: number; decision: ExclusionDecision; scoredAnswerCount: number; scoredMean: number | null }>;
}

/**
 * Frozen clause `requiresNoApplicableScoredConflict`: an exclusion is NOT confirmed when scored evidence exists in the
 * same capability. A capability that is claimed N/A but has scored evidence is surfaced as EXCLUSION_CONFLICT_REVIEW and
 * is NOT removed from the denominator (it stays applicable and contributes its scored evidence).
 */
export function decideExclusion(c: CapabilityApplicabilityInput): ExclusionDecision {
  if (!c.gateExclusionConfirmedByClaims) return "APPLICABLE";
  return c.scoredAnswerCount > 0 ? "EXCLUSION_CONFLICT_REVIEW" : "EXCLUDED";
}

export function buildApplicabilityDisclosure(caps: CapabilityApplicabilityInput[]): ApplicabilityDisclosure {
  const items = caps.map(c => ({ capabilityId: c.capabilityId, nameMn: c.nameMn, weightPct: c.weightPct, decision: decideExclusion(c), scoredAnswerCount: c.scoredAnswerCount, scoredMean: c.scoredMean ?? null }));
  const sum = (f: (i: (typeof items)[number]) => boolean) => items.filter(f).reduce((s, i) => s + i.weightPct, 0);
  const total = sum(() => true);
  const excluded = sum(i => i.decision === "EXCLUDED");
  return {
    applicableCount: items.filter(i => i.decision === "APPLICABLE").length,
    excludedCount: items.filter(i => i.decision === "EXCLUDED").length,
    conflictCount: items.filter(i => i.decision === "EXCLUSION_CONFLICT_REVIEW").length,
    totalWeightPct: total,
    excludedWeightPct: excluded,
    conflictWeightPct: sum(i => i.decision === "EXCLUSION_CONFLICT_REVIEW"),
    excludedShareOfWeight: total > 0 ? excluded / total : 0,
    items
  };
}

/** Score recomputed from per-capability scores honouring the proposed exclusion (disclosure/what-if only). */
export function weightedScore(caps: Array<{ weightPct: number; score: number | null; decision: ExclusionDecision }>): number | null {
  let num = 0, den = 0;
  for (const c of caps) {
    if (c.decision === "EXCLUDED" || c.score === null) continue;
    num += c.weightPct * c.score; den += c.weightPct;
  }
  return den > 0 ? num / den : null;
}

// ---------------------------------------------------------------- B3 evidence / headline
export interface EvidenceInput {
  totalCapabilities: number;
  /** capabilities with >= 1 scored cell. */
  capabilitiesWithScoredEvidence: number;
  excludedCapabilities: number;
  totalCells: number;
  scoredCells: number;
  answered: number;
  dnkAnswers: number;
  hardContradictionCells: number;
  officialScoreAvailable: boolean;
  /** mean cell confidence over scored cells (proposed, contract-faithful). */
  meanScoredCellConfidence: number;
}

export type HeadlineMode = "OFFICIAL" | "PRELIMINARY" | "WITHHELD";

export interface EvidenceThresholds {
  /** minimum share of applicable capabilities that must carry >= 1 scored cell for a PRELIMINARY headline. */
  minCapabilityCoverage: number;
  /** below this share the headline is withheld outright. */
  withholdBelowCapabilityCoverage: number;
}

export interface EvidenceAssessment {
  capabilityCoverage: number;
  cellCoverage: number;
  dnkShare: number;
  headline: HeadlineMode;
  /** coverage-aware confidence, never 1.0 unless the score is official and uncontested. */
  confidence: number;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW";
  reasons: string[];
}

/**
 * The thresholds are INPUTS, not constants: Phase 2.5 recommends values from the empirical distribution of 280-question
 * runs (see 04_EVIDENCE_COVERAGE_AND_CONFIDENCE.md) but they require owner approval (B3).
 */
export function assessEvidence(e: EvidenceInput, t: EvidenceThresholds): EvidenceAssessment {
  const applicable = Math.max(0, e.totalCapabilities - e.excludedCapabilities);
  const capabilityCoverage = applicable > 0 ? e.capabilitiesWithScoredEvidence / applicable : 0;
  const cellCoverage = e.totalCells > 0 ? e.scoredCells / e.totalCells : 0;
  const dnkShare = e.answered > 0 ? e.dnkAnswers / e.answered : 0;
  const reasons: string[] = [];

  let headline: HeadlineMode;
  if (e.officialScoreAvailable && e.hardContradictionCells === 0) headline = "OFFICIAL";
  else if (capabilityCoverage < t.withholdBelowCapabilityCoverage) { headline = "WITHHELD"; reasons.push("CAPABILITY_COVERAGE_BELOW_WITHHOLD_LIMIT"); }
  else if (capabilityCoverage < t.minCapabilityCoverage) { headline = "PRELIMINARY"; reasons.push("CAPABILITY_COVERAGE_BELOW_MINIMUM"); }
  else headline = "PRELIMINARY";
  if (!e.officialScoreAvailable) reasons.push("NO_OFFICIAL_SCORE");
  if (e.hardContradictionCells > 0) reasons.push("UNRESOLVED_CONTRADICTION");
  if (dnkShare >= 0.5) reasons.push("MAJORITY_UNKNOWN_ANSWERS");
  if (e.excludedCapabilities / Math.max(1, e.totalCapabilities) > 0) reasons.push("CAPABILITIES_EXCLUDED_AS_NOT_APPLICABLE");

  // Confidence = (evidence quality of what exists) x (how much of the business that evidence reaches).
  let confidence = e.meanScoredCellConfidence * capabilityCoverage;
  if (e.hardContradictionCells > 0) confidence = Math.min(confidence, 0.65);
  if (!e.officialScoreAvailable) confidence = Math.min(confidence, 0.95);
  confidence = Math.max(0, Math.min(1, confidence));
  const confidenceBand = confidence >= 0.8 ? "HIGH" : confidence >= 0.55 ? "MEDIUM" : confidence >= 0.3 ? "LOW" : "VERY_LOW";
  return { capabilityCoverage, cellCoverage, dnkShare, headline, confidence, confidenceBand, reasons };
}
