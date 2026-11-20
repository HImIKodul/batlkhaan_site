import type { CellSnapshot, ContradictionFinding, DirectEvidence, MethodologyDefinition, RuntimeSnapshot } from "./types.js";
import { readPolicyFlags, type B1Mode, type PolicyFlags } from "./policy-flags.js";
import { judgeContradiction } from "./v2-policy.js";
import { canConfirmNa, directConfidence } from "./confidence.js";
import { calculateAggregateSnapshots } from "./scoring.js";
import { mapKey } from "./utils.js";

/**
 * BusinessMRI v2 runtime.
 *
 * Applicability and N/A are deliberately non-scoring states. A capability or
 * conditional cell loses denominator weight only after the frozen N/A contract
 * confirms the exclusion (3 consistent claims, confidence >= 0.80, no scored
 * conflict). DNK never becomes zero and never proves N/A.
 */
export function calculateBusinessMriRuntimeSnapshot(
  definition: MethodologyDefinition,
  evidence: DirectEvidence[],
  flagsOverride?: PolicyFlags
): RuntimeSnapshot {
  const runtime = definition.runtimePolicy;
  if (!runtime?.enabled) throw new Error("BusinessMRI runtime policy is not loaded");
  // Phase 2.7: unapproved policies (B1/B2) are OFF unless explicitly enabled (policy-flags.ts); OFF = the code paths below are byte-for-byte the previous behaviour.
  const flags = flagsOverride ?? readPolicyFlags();

  const byCell = new Map<string, DirectEvidence[]>();
  for (const item of evidence) {
    const key = mapKey(item.categoryId, item.cellId);
    const rows = byCell.get(key) ?? [];
    rows.push(item);
    byCell.set(key, rows);
  }

  const cells = new Map<string, CellSnapshot>();
  for (const category of definition.categories) {
    // B2: scored evidence in the same capability (non-gate cells). Evaluated only when the flag is ON; OFF keeps the historical constant `false`.
    const categoryHasScored = flags.b2 && definition.cells.some(c => c.id !== "C01" &&
      (byCell.get(mapKey(category.id, c.id)) ?? []).some(item => item.state === "SCORED" && item.score !== null && runtime.questionById.get(item.questionId)?.scoreEligible));
    for (const cell of definition.cells) {
      const direct = (byCell.get(mapKey(category.id, cell.id)) ?? []).slice().sort((a, b) => a.path - b.path);
      cells.set(
        mapKey(category.id, cell.id),
        cell.id === "C01"
          ? applicabilityCell(definition, category.id, direct, categoryHasScored)
          : maturityCell(definition, category.id, cell.id, direct, flags.b1)
      );
    }
  }

  const contradictions: ContradictionFinding[] = [];
  if (flags.b1 !== "OFF" || flags.b2) {
    for (const c of cells.values()) {
      if (!c.hasHardContradiction) continue;
      const gate = c.cellId === "C01";
      contradictions.push({
        ruleId: gate ? "H02" : "H01", type: "HARD", flag: gate ? "SCOPE_CONTRADICTION" : "DIRECT_CONTRADICTION", categoryId: c.categoryId, affectedCellIds: [c.cellId],
        reason: gate ? "Applicability gate claims N/A while scored evidence exists in the same capability (frozen clause requiresNoApplicableScoredConflict)." : `Same-cell scored answers contradict each other (${flags.b1}).`
      });
    }
  }
  return { cells, contradictions, ...calculateAggregateSnapshots(definition, cells) };
}

function applicabilityCell(
  definition: MethodologyDefinition,
  categoryId: string,
  directEvidence: DirectEvidence[],
  scoredConflict = false
): CellSnapshot {
  // BusinessMRI bundles encode the affirmative C01 choice as UNAVAILABLE
  // because C01 is context-only. Therefore applicability must be derived from
  // the governed option position/state, not from the maturity signal-state name.
  const positiveClaims = directEvidence.filter(item => item.optionIndex === 1 && item.state !== "DNK" && item.state !== "N_A_CLAIM");
  const naClaims = directEvidence.filter(item => item.state === "N_A_CLAIM");
  const answeredQuestionIds = new Set(directEvidence.map(item => item.questionId));
  const exhausted = answeredQuestionIds.size >= 4;

  const naConfidence = directConfidence(definition.contracts, {
    reliabilities: naClaims.map(item => item.reliability),
    sourceKinds: naClaims.map(item => item.sourceKind),
    directCount: naClaims.length,
    hardContradiction: positiveClaims.length > 0
  });
  const sourceKindCount = definition.contracts.confidence.independencePolicy?.sourceDiversityBonusDisabled
    ? (naClaims.length > 0 ? 1 : 0)
    : new Set(naClaims.map(item => item.sourceKind)).size;
  const naConfirmed = positiveClaims.length === 0 && canConfirmNa(definition.contracts, {
    claimCount: naClaims.length,
    sourceKindCount,
    claimConfidence: naConfidence,
    hasScoredConflict: scoredConflict
  });
  const applicable = positiveClaims.length > 0;
  if (scoredConflict && positiveClaims.length === 0 && canConfirmNa(definition.contracts, { claimCount: naClaims.length, sourceKindCount, claimConfidence: naConfidence, hasScoredConflict: false })) {
    // B2 (flag ON only): enough N/A claims, but scored evidence exists in the same capability => NOT a confirmed exclusion; stays applicable and is flagged for review.
    return { ...base({
      categoryId, cellId: "C01", directEvidence, status: "REVIEW_REQUIRED", confidenceState: "UNKNOWN", applicabilityRelevance: null, directConfidence: 0, effectiveConfidence: 0,
      naClaimCount: naClaims.length, naClaimConfidence: naConfidence, locked: false, lockReason: null, evidenceCount: directEvidence.length, exhausted,
      maxAcceptedAuthority: directEvidence.length ? Math.max(...directEvidence.map(item => item.authority)) : 0
    }), hasHardContradiction: true, hardContradictionRuleIds: ["H02"] };
  }

  return base({
    categoryId,
    cellId: "C01",
    directEvidence,
    status: applicable
      ? "DIRECT_FINAL"
      : naConfirmed
        ? "NOT_APPLICABLE"
        : directEvidence.length === 0
          ? "UNASSESSED"
          : exhausted
            ? "UNRESOLVED"
            : "GATHERING",
    confidenceState: applicable
      ? "LOCKED"
      : naConfirmed
        ? "NOT_APPLICABLE"
        : directEvidence.length > 0
          ? "UNKNOWN"
          : "UNASSESSED",
    applicabilityRelevance: applicable ? 1 : naConfirmed ? 0 : null,
    directConfidence: applicable ? 1 : 0,
    effectiveConfidence: applicable ? 1 : naConfirmed ? naConfidence : 0,
    directAnswerCount: positiveClaims.length,
    independentSourceKinds: applicable ? 1 : 0,
    maxAcceptedAuthority: directEvidence.length ? Math.max(...directEvidence.map(item => item.authority)) : 0,
    naClaimCount: naClaims.length,
    naClaimConfidence: naConfidence,
    locked: applicable || naConfirmed,
    lockReason: applicable
      ? "BUSINESSMRI_APPLICABLE"
      : naConfirmed
        ? "BUSINESSMRI_NOT_APPLICABLE_CONFIRMED"
        : null,
    evidenceCount: directEvidence.length,
    exhausted
  });
}

function maturityCell(
  definition: MethodologyDefinition,
  categoryId: string,
  cellId: string,
  directEvidence: DirectEvidence[],
  b1: B1Mode = "OFF"
): CellSnapshot {
  const runtime = definition.runtimePolicy!;
  const cellDef = definition.cells.find(cell => cell.id === cellId)!;
  const scored = directEvidence.filter(item => {
    const policy = runtime.questionById.get(item.questionId);
    return Boolean(policy?.scoreEligible && item.state === "SCORED" && item.score !== null);
  });
  const naClaims = directEvidence.filter(item => item.state === "N_A_CLAIM");
  const values = scored.map(item => item.score as number);
  const score = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  const cellPolicy = runtime.cellByCategoryCell.get(mapKey(categoryId, cellId));
  const directAskable = Math.max(0, Number(cellPolicy?.maxDirectQuestions ?? 0));
  const answeredQuestionIds = new Set(directEvidence.map(item => item.questionId));
  const exhausted = directAskable > 0 && answeredQuestionIds.size >= directAskable;

  const naConfidence = directConfidence(definition.contracts, {
    reliabilities: naClaims.map(item => item.reliability),
    sourceKinds: naClaims.map(item => item.sourceKind),
    directCount: naClaims.length,
    hardContradiction: score !== null
  });
  const naSourceKinds = definition.contracts.confidence.independencePolicy?.sourceDiversityBonusDisabled
    ? (naClaims.length > 0 ? 1 : 0)
    : new Set(naClaims.map(item => item.sourceKind)).size;
  const naConfirmed = cellDef.naPolicy !== "DISALLOWED" && canConfirmNa(definition.contracts, {
    claimCount: naClaims.length,
    sourceKindCount: naSourceKinds,
    claimConfidence: naConfidence,
    hasScoredConflict: score !== null
  });

  if (naConfirmed) {
    return base({
      categoryId,
      cellId,
      directEvidence,
      status: "NOT_APPLICABLE",
      confidenceState: "NOT_APPLICABLE",
      directScore: null,
      effectiveScore: null,
      directConfidence: 0,
      effectiveConfidence: naConfidence,
      directAnswerCount: 0,
      independentSourceKinds: 0,
      maxAcceptedAuthority: naClaims.length ? Math.max(...naClaims.map(item => item.authority)) : 0,
      naClaimCount: naClaims.length,
      naClaimConfidence: naConfidence,
      locked: true,
      lockReason: "BUSINESSMRI_CELL_NOT_APPLICABLE_CONFIRMED",
      clusterSize: 0,
      evidenceCount: directEvidence.length,
      exhausted
    });
  }

  // B1 (flag ON only): unresolved same-cell contradiction => REVIEW_REQUIRED, not locked, confidence capped; mean score and all evidence are kept (frozen contract: autoChangeScore=false, autoDeleteEvidence=false).
  if (b1 !== "OFF" && score !== null) {
    const verdict = judgeContradiction(definition, scored, b1);
    if (verdict.hard) {
      const cap = Number(definition.contracts.contradiction.effects.hard.confidenceCap ?? 0.65);
      return { ...base({
        categoryId, cellId, directEvidence, status: "REVIEW_REQUIRED", confidenceState: "ESTIMATED", directScore: score, effectiveScore: score,
        directConfidence: cap, effectiveConfidence: cap, directAnswerCount: scored.length, independentSourceKinds: new Set(scored.map(item => item.sourceKind)).size,
        maxAcceptedAuthority: Math.max(...scored.map(item => item.authority)), naClaimCount: naClaims.length, naClaimConfidence: naConfidence, locked: false, lockReason: null,
        scoreDispersion: verdict.spreadPoints, clusterSize: scored.length, evidenceCount: directEvidence.length, exhausted
      }), hasHardContradiction: true, hardContradictionRuleIds: ["H01"] };
    }
  }

  return base({
    categoryId,
    cellId,
    directEvidence,
    status: score !== null
      ? "DIRECT_FINAL"
      : exhausted
        ? "UNRESOLVED"
        : directEvidence.length
          ? "GATHERING"
          : "UNASSESSED",
    confidenceState: score !== null ? "LOCKED" : directEvidence.length ? "UNKNOWN" : "UNASSESSED",
    directScore: score,
    effectiveScore: score,
    directConfidence: score !== null ? 1 : 0,
    effectiveConfidence: score !== null ? 1 : 0,
    directAnswerCount: scored.length,
    independentSourceKinds: new Set(scored.map(item => item.sourceKind)).size,
    maxAcceptedAuthority: scored.length
      ? Math.max(...scored.map(item => item.authority))
      : directEvidence.length
        ? Math.max(...directEvidence.map(item => item.authority))
        : 0,
    naClaimCount: naClaims.length,
    naClaimConfidence: naConfidence,
    locked: score !== null,
    lockReason: score !== null ? "BUSINESSMRI_FROZEN_NUMERIC_EVIDENCE" : null,
    scoreDispersion: values.length > 1 ? Math.max(...values) - Math.min(...values) : 0,
    clusterSize: scored.length,
    evidenceCount: directEvidence.length,
    exhausted
  });
}

function base(
  args: Partial<CellSnapshot> & Pick<CellSnapshot, "categoryId" | "cellId" | "directEvidence" | "status">
): CellSnapshot {
  return {
    categoryId: args.categoryId,
    cellId: args.cellId,
    status: args.status,
    directScore: args.directScore ?? null,
    directConfidence: args.directConfidence ?? 0,
    derivedScore: null,
    derivedConfidence: 0,
    effectiveScore: args.effectiveScore ?? null,
    effectiveConfidence: args.effectiveConfidence ?? 0,
    directAnswerCount: args.directAnswerCount ?? 0,
    independentSourceKinds: args.independentSourceKinds ?? 0,
    maxAcceptedAuthority: args.maxAcceptedAuthority ?? 0,
    naClaimCount: args.naClaimCount ?? 0,
    naClaimConfidence: args.naClaimConfidence ?? 0,
    applicabilityRelevance: args.applicabilityRelevance ?? null,
    hasHardContradiction: false,
    hasSameCellVariance: false,
    hasSecondaryTension: false,
    hardContradictionRuleIds: [],
    tensionRuleIds: [],
    directEvidence: args.directEvidence,
    derivedContributions: [],
    exhausted: args.exhausted ?? false,
    confidenceState: args.confidenceState,
    locked: args.locked ?? false,
    lockReason: args.lockReason ?? null,
    scoreDispersion: args.scoreDispersion ?? null,
    clusterSize: args.clusterSize ?? 0,
    evidenceCount: args.evidenceCount ?? args.directEvidence.length
  };
}
