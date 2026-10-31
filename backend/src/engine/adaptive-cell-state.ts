import type {
  CellConfidenceState,
  CellSnapshot,
  DirectEvidence,
  MethodologyDefinition,
  RuntimeSnapshot
} from "./types.js";
import { evaluateContradictions } from "./contradictions.js";
import { canConfirmNa, canDirectFinalize, directConfidence } from "./confidence.js";
import { calculateAggregateSnapshots } from "./scoring.js";
import { mapKey } from "./utils.js";

export function calculateAdaptiveV13RuntimeSnapshot(
  definition: MethodologyDefinition,
  evidence: DirectEvidence[]
): RuntimeSnapshot {
  const runtime = definition.runtimePolicy;
  if (!runtime?.enabled) throw new Error("Adaptive v13 runtime policy is not loaded");

  const evidenceByCell = new Map<string, DirectEvidence[]>();
  for (const item of evidence) {
    const key = mapKey(item.categoryId, item.cellId);
    const rows = evidenceByCell.get(key) ?? [];
    rows.push(item);
    evidenceByCell.set(key, rows);
  }

  const cells = new Map<string, CellSnapshot>();
  for (const category of definition.categories) {
    for (const cell of definition.cells) {
      const key = mapKey(category.id, cell.id);
      const direct = (evidenceByCell.get(key) ?? []).slice().sort((a, b) => a.path - b.path);
      cells.set(key, calculateV13DirectCell(definition, category.id, cell.id, direct));
    }
  }

  // Preserve cross-cell methodology contradiction rules while allowing a v13
  // Q3/Q4 cluster to explicitly resolve same-cell variance (H01).
  const allFindings = definition.categories.flatMap(category =>
    evaluateContradictions(definition, category.id, cells)
  ).filter(finding => {
    if (finding.ruleId !== "H01") return true;
    return finding.affectedCellIds.some(cellId =>
      cells.get(mapKey(finding.categoryId, cellId))?.confidenceState !== "LOCKED"
    );
  });
  applyV13Findings(definition, cells, allFindings);

  // Indirect / many-to-many evidence may fill an unmeasured cell only as
  // ESTIMATED and may never exceed the cell-specific indirect confidence cap.
  for (const category of definition.categories) {
    for (const cell of definition.cells) {
      if (cell.id === "C01") continue;
      const key = mapKey(category.id, cell.id);
      const current = cells.get(key)!;
      if (current.status === "NOT_APPLICABLE" || current.directScore !== null || current.hasHardContradiction) continue;

      const policy = runtime.cellByCategoryCell.get(key);
      if (!policy) throw new Error(`Missing v13 cell policy ${key}`);
      const incoming = definition.incomingEdgesByTarget.get(cell.id) ?? [];
      const contributions: CellSnapshot["derivedContributions"] = [];
      for (const edge of incoming) {
        const source = cells.get(mapKey(category.id, edge.sourceCellId));
        if (!source || source.directScore === null || source.hasHardContradiction || source.status === "NOT_APPLICABLE") continue;
        const strength = edge.coefficient * source.directConfidence;
        if (strength <= 0) continue;
        contributions.push({
          sourceCellId: edge.sourceCellId,
          targetCellId: cell.id,
          sourceValue: source.directScore,
          sourceDirectConfidence: source.directConfidence,
          coefficient: edge.coefficient,
          weightedStrength: strength
        });
      }
      if (contributions.length === 0) continue;

      const denom = contributions.reduce((sum, row) => sum + row.weightedStrength, 0);
      const derivedScore = denom <= 0
        ? null
        : scoreOut(contributions.reduce((sum, row) => sum + row.sourceValue * row.weightedStrength, 0) / denom);
      if (derivedScore === null) continue;

      const strengths = contributions.map(row => row.weightedStrength);
      const anchor = Math.max(...strengths);
      const group = Math.min(1, strengths.reduce((sum, value) => sum + value, 0));
      const derivedConfidence = Math.min(policy.indirectConfidenceCap, 0.70 * anchor + 0.30 * group);

      current.derivedContributions = contributions;
      current.derivedScore = derivedScore;
      current.derivedConfidence = derivedConfidence;
      current.effectiveScore = derivedScore;
      current.effectiveConfidence = derivedConfidence;
      current.status = "DERIVED_PROVISIONAL";
      current.confidenceState = "ESTIMATED";
      current.locked = false;
      current.lockReason = null;
    }
  }

  return { cells, contradictions: allFindings, ...calculateAggregateSnapshots(definition, cells) };
}

function calculateV13DirectCell(
  definition: MethodologyDefinition,
  categoryId: string,
  cellId: string,
  directEvidence: DirectEvidence[]
): CellSnapshot {
  const runtime = definition.runtimePolicy!;
  const key = mapKey(categoryId, cellId);
  const policy = runtime.cellByCategoryCell.get(key);
  if (!policy) throw new Error(`Missing v13 cell policy ${key}`);

  const policyFor = (item: DirectEvidence) => runtime.questionById.get(item.questionId);
  const scored = directEvidence.filter(item => {
    const questionPolicy = policyFor(item);
    return Boolean(questionPolicy?.scoreEligible && item.state === "SCORED" && item.score !== null);
  });
  const naClaims = directEvidence.filter(item => item.state === "N_A_CLAIM");
  const unknown = directEvidence.filter(item => item.state === "DNK" || item.state === "UNAVAILABLE");
  const answeredDirectIds = new Set(
    directEvidence
      .filter(item => {
        const q = policyFor(item);
        return Boolean(q?.directAskAllowed && q.askStage !== "NEVER_DIRECT");
      })
      .map(item => item.questionId)
  );
  const exhausted = policy.maxDirectQuestions > 0 && answeredDirectIds.size >= policy.maxDirectQuestions;

  // D01 is routing context, never a maturity score. In v3 the selected routing
  // option is converted through the frozen AT-APPLICABILITY-4 relevance map.
  // This prevents a low-relevance answer such as "Огт шаардлагагүй" from being
  // treated as proof that the capability is relevant.
  if (cellId === "C01") {
    const substantive = directEvidence.filter(item => !["DNK", "UNAVAILABLE"].includes(item.state));
    const relevanceMap = definition.contracts.scoring.routingRelevance?.["AT-APPLICABILITY-4"] ?? {};
    const mappedEvidence = substantive
      .map(item => ({ item, relevance: Number(relevanceMap[String(item.optionIndex)]) }))
      .filter(row => Number.isFinite(row.relevance));
    const positiveEvidence = mappedEvidence.filter(row => row.relevance > 0.20);
    const exclusionEvidence = mappedEvidence.filter(row => row.relevance <= 0.20);
    const exclusionConfidence = exclusionEvidence.length > 0
      ? directConfidence(definition.contracts, {
          reliabilities: exclusionEvidence.map(row => row.item.reliability),
          sourceKinds: exclusionEvidence.map(row => row.item.sourceKind),
          directCount: exclusionEvidence.length,
          hardContradiction: positiveEvidence.length > 0
        })
      : 0;
    const exclusionThreshold = Number(
      definition.contracts.companyProfile?.routingLocks?.c01ConfidenceForExclusion
      ?? definition.contracts.confidence.finalization?.threshold
      ?? 0.80
    );
    const exclusionMinimumPaths = Number(
      definition.contracts.companyProfile?.routingLocks?.c01DirectAnswersForExclusion
      ?? 3
    );
    // Frozen v3 profile contract: a capability may never be excluded from one
    // self-report. Three direct low-relevance paths, >=0.80 confidence, and no
    // positive applicability evidence are required. Any positive path proves the
    // capability relevant enough to continue diagnosis.
    const exclusionConfirmed = exclusionEvidence.length >= exclusionMinimumPaths
      && exclusionConfidence >= exclusionThreshold
      && positiveEvidence.length === 0;
    const relevanceConfirmed = positiveEvidence.length > 0;
    const applicabilityRelevance = exclusionConfirmed
      ? 0
      : relevanceConfirmed
        ? positiveEvidence.reduce((sum, row) => sum + row.relevance, 0) / positiveEvidence.length
        : null;

    return baseSnapshot({
      categoryId,
      cellId,
      directEvidence,
      exhausted,
      status: directEvidence.length === 0
        ? "UNASSESSED"
        : exclusionConfirmed
          ? "NOT_APPLICABLE"
          : exhausted && !relevanceConfirmed
            ? "UNRESOLVED"
            : "GATHERING",
      confidenceState: directEvidence.length === 0
        ? "UNASSESSED"
        : exclusionConfirmed
          ? "NOT_APPLICABLE"
          : relevanceConfirmed
            ? "VALIDATED"
            : "UNKNOWN",
      applicabilityRelevance,
      naClaimCount: exclusionEvidence.length,
      naClaimConfidence: exclusionConfidence,
      effectiveConfidence: exclusionConfirmed ? exclusionConfidence : 0,
      evidenceCount: directEvidence.length,
      maxAcceptedAuthority: directEvidence.length ? Math.max(...directEvidence.map(item => item.authority)) : 0
    });
  }

  // Direct use of an INFER_ONLY cell is a contract violation. It should never be
  // reachable through the router, but if historical/manual data introduces it,
  // fail visibly rather than silently scoring it.
  if (policy.applicabilityMode === "INFER_ONLY" && directEvidence.length > 0) {
    return baseSnapshot({
      categoryId,
      cellId,
      directEvidence,
      exhausted: true,
      status: "REVIEW_REQUIRED",
      confidenceState: "UNASSESSED",
      hasHardContradiction: true,
      hardContradictionRuleIds: ["V13_INFER_ONLY_DIRECT_EVIDENCE"],
      evidenceCount: directEvidence.length
    });
  }

  // Conditional N/A is a non-scoring state. A scored answer and N/A claim in the
  // same cell is a scope contradiction and must be resolved rather than averaged.
  if (naClaims.length > 0 && scored.length === 0) {
    const naConfidence = directConfidence(definition.contracts, {
      reliabilities: naClaims.map(item => item.reliability),
      sourceKinds: naClaims.map(item => item.sourceKind),
      directCount: naClaims.length,
      hardContradiction: false
    });
    const naConfirmed = canConfirmNa(definition.contracts, {
      claimCount: naClaims.length,
      sourceKindCount: definition.contracts.confidence.independencePolicy?.sourceDiversityBonusDisabled
        ? (naClaims.length > 0 ? 1 : 0)
        : new Set(naClaims.map(item => item.sourceKind)).size,
      claimConfidence: naConfidence,
      hasScoredConflict: false
    });
    return baseSnapshot({
      categoryId,
      cellId,
      directEvidence,
      exhausted,
      status: naConfirmed ? "NOT_APPLICABLE" : exhausted ? "UNRESOLVED" : "GATHERING",
      confidenceState: naConfirmed ? "NOT_APPLICABLE" : "UNKNOWN",
      naClaimCount: naClaims.length,
      naClaimConfidence: naConfidence,
      effectiveConfidence: naConfirmed ? naConfidence : 0,
      evidenceCount: directEvidence.length,
      maxAcceptedAuthority: Math.max(...naClaims.map(item => item.authority))
    });
  }

  if (scored.length === 0) {
    return baseSnapshot({
      categoryId,
      cellId,
      directEvidence,
      exhausted,
      status: directEvidence.length === 0 ? "UNASSESSED" : exhausted ? "UNRESOLVED" : "GATHERING",
      confidenceState: directEvidence.length === 0 ? "UNASSESSED" : unknown.length > 0 ? "UNKNOWN" : "UNASSESSED",
      naClaimCount: naClaims.length,
      naClaimConfidence: naClaims.length > 0 ? directConfidence(definition.contracts, {
        reliabilities: naClaims.map(item => item.reliability),
        sourceKinds: naClaims.map(item => item.sourceKind),
        directCount: naClaims.length,
        hardContradiction: false
      }) : 0,
      evidenceCount: directEvidence.length,
      maxAcceptedAuthority: directEvidence.length ? Math.max(...directEvidence.map(item => item.authority)) : 0
    });
  }

  const values = scored.map(item => item.score as number);
  const clusterCenter = median(values);
  const range = values.length >= 2 ? Math.max(...values) - Math.min(...values) : 0;
  const threshold = policy.conflictGapThreshold;
  const conflict = values.length >= 2 && range > threshold;
  const hardConflict = values.length >= 2 && range >= Math.max(50, threshold * 2);
  const clusterEvidence = scored.filter(item => Math.abs((item.score as number) - clusterCenter) <= threshold);
  const clusterSize = clusterEvidence.length;
  const scopeConflict = naClaims.length > 0;
  const independentSourceGroups = definition.contracts.confidence.independencePolicy?.sourceDiversityBonusDisabled
    ? (scored.length > 0 ? 1 : 0)
    : new Set(scored.map(item => item.sourceKind)).size;
  const clusterSupportsFinalization = values.length === 3
    ? clusterSize >= 2
    : values.length >= 4
      ? clusterSize >= 3
      : false;

  // Verification evidence may resolve a same-cell outlier, but self-report alone
  // may never overrule the RECORD_CHECK path. For any local conflict, Q3 must be
  // part of the locking cluster. D02/D41/D43/D44 always require usable Q3 evidence
  // even when the three answers are otherwise coherent.
  const recordCheck = scored.find(item => item.path === 3 && item.sourceKind === "RECORD_CHECK");
  const recordCheckInCluster = Boolean(recordCheck && clusterEvidence.some(item => item.questionId === recordCheck.questionId));
  const requiresRecordCheck = ["C02", "C41", "C43", "C44"].includes(cellId);
  const localConflictResolved = conflict && clusterSupportsFinalization && recordCheckInCluster;
  const unresolvedLocalHardConflict = hardConflict && !localConflictResolved;
  const recordCheckGateSatisfied = !requiresRecordCheck || recordCheckInCluster;

  // Score value and confidence resolution are intentionally separate. When a
  // Q3-verified cluster resolves a same-cell outlier, the invalidated outlier
  // must not drag the locked maturity value toward the middle. Otherwise use
  // the arithmetic mean of every valid scored answer, per the scoring contract.
  const scoreEvidence = localConflictResolved ? clusterEvidence : scored;
  const directScore = scoreOut(arithmeticMean(scoreEvidence.map(item => item.score as number)));

  const measuredConfidence = directConfidence(definition.contracts, {
    reliabilities: scored.map(item => item.reliability),
    sourceKinds: scored.map(item => item.sourceKind),
    directCount: scored.length,
    hardContradiction: unresolvedLocalHardConflict || scopeConflict
  });
  const locked = clusterSupportsFinalization
    && recordCheckGateSatisfied
    && canDirectFinalize(definition.contracts, {
      directCount: scored.length,
      sourceKindCount: independentSourceGroups,
      confidence: measuredConfidence,
      hasValue: true,
      hasHardContradiction: unresolvedLocalHardConflict || scopeConflict,
      maxAcceptedAuthority: Math.max(...scored.map(item => item.authority))
    });
  const lockReason: string | null = locked
    ? conflict
      ? values.length === 3 ? "Q3_VERIFIED_2_OF_3_CONFLICT_RESOLUTION" : "Q3_VERIFIED_3_OF_4_CONFLICT_RESOLUTION"
      : values.length === 3 ? "THREE_DIRECT_CONFIDENCE_GATED" : "FOUR_DIRECT_CONFIDENCE_GATED"
    : null;

  const hardConfidenceCap = Number(definition.contracts.contradiction.effects?.hard?.confidenceCap ?? 0.65);
  const confidence = (unresolvedLocalHardConflict || scopeConflict)
    ? Math.min(measuredConfidence, hardConfidenceCap)
    : measuredConfidence;
  const unresolvedConflict = ((conflict && !localConflictResolved) || scopeConflict) && !locked;
  const status: CellSnapshot["status"] = locked
    ? "DIRECT_FINAL"
    : unresolvedConflict || exhausted
      ? "REVIEW_REQUIRED"
      : "DIRECT_PROVISIONAL";

  return baseSnapshot({
    categoryId,
    cellId,
    directEvidence,
    exhausted,
    status,
    confidenceState: locked ? "LOCKED" : "VALIDATED",
    directScore,
    directConfidence: confidence,
    effectiveScore: directScore,
    effectiveConfidence: confidence,
    directAnswerCount: scored.length,
    independentSourceKinds: independentSourceGroups,
    maxAcceptedAuthority: Math.max(...scored.map(item => item.authority)),
    naClaimCount: naClaims.length,
    naClaimConfidence: naClaims.length > 0 ? directConfidence(definition.contracts, {
      reliabilities: naClaims.map(item => item.reliability),
      sourceKinds: naClaims.map(item => item.sourceKind),
      directCount: naClaims.length,
      hardContradiction: false
    }) : 0,
    hasHardContradiction: (unresolvedLocalHardConflict || scopeConflict) && !locked,
    hasSameCellVariance: conflict && !locked,
    hardContradictionRuleIds: scopeConflict && !locked
      ? ["V13_NA_SCORE_CONFLICT"]
      : unresolvedLocalHardConflict && !locked
        ? ["H01"]
        : [],
    locked,
    lockReason,
    scoreDispersion: range,
    clusterSize,
    evidenceCount: directEvidence.length
  });
}

function applyV13Findings(definition: MethodologyDefinition, cells: Map<string, CellSnapshot>, findings: ReturnType<typeof evaluateContradictions>): void {
  for (const finding of findings) {
    for (const cellId of finding.affectedCellIds) {
      const cell = cells.get(mapKey(finding.categoryId, cellId));
      if (!cell) continue;
      if (finding.type === "HARD") {
        cell.hasHardContradiction = true;
        if (!cell.hardContradictionRuleIds.includes(finding.ruleId)) cell.hardContradictionRuleIds.push(finding.ruleId);
        if (cell.status === "NOT_APPLICABLE") {
          cell.status = cell.exhausted ? "REVIEW_REQUIRED" : "GATHERING";
          cell.confidenceState = "UNKNOWN";
          cell.effectiveConfidence = 0;
        } else if (cell.directScore !== null) {
          cell.status = "REVIEW_REQUIRED";
          cell.confidenceState = "VALIDATED";
          const hardCap = Number(definition.contracts.contradiction.effects?.hard?.confidenceCap ?? 0.65);
          cell.directConfidence = Math.min(cell.directConfidence, hardCap);
          cell.effectiveConfidence = Math.min(cell.effectiveConfidence, hardCap);
          cell.locked = false;
          cell.lockReason = null;
        }
      } else {
        cell.hasSecondaryTension = true;
        if (!cell.tensionRuleIds.includes(finding.ruleId)) cell.tensionRuleIds.push(finding.ruleId);
      }
    }
  }
}

function baseSnapshot(args: {
  categoryId: string;
  cellId: string;
  directEvidence: DirectEvidence[];
  exhausted: boolean;
  status: CellSnapshot["status"];
  confidenceState: CellConfidenceState;
  directScore?: number | null;
  directConfidence?: number;
  effectiveScore?: number | null;
  effectiveConfidence?: number;
  directAnswerCount?: number;
  independentSourceKinds?: number;
  maxAcceptedAuthority?: number;
  naClaimCount?: number;
  naClaimConfidence?: number;
  applicabilityRelevance?: number | null;
  hasHardContradiction?: boolean;
  hasSameCellVariance?: boolean;
  hardContradictionRuleIds?: string[];
  locked?: boolean;
  lockReason?: string | null;
  scoreDispersion?: number | null;
  clusterSize?: number;
  evidenceCount?: number;
}): CellSnapshot {
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
    hasHardContradiction: args.hasHardContradiction ?? false,
    hasSameCellVariance: args.hasSameCellVariance ?? false,
    hasSecondaryTension: false,
    hardContradictionRuleIds: args.hardContradictionRuleIds ?? [],
    tensionRuleIds: [],
    directEvidence: args.directEvidence,
    derivedContributions: [],
    exhausted: args.exhausted,
    confidenceState: args.confidenceState,
    locked: args.locked ?? false,
    lockReason: args.lockReason ?? null,
    scoreDispersion: args.scoreDispersion ?? null,
    clusterSize: args.clusterSize ?? 0,
    evidenceCount: args.evidenceCount ?? args.directEvidence.length
  };
}


function scoreOut(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  const nearestInteger = Math.round(clamped);
  return Math.abs(clamped - nearestInteger) <= 1e-10 ? nearestInteger : clamped;
}

function arithmeticMean(values: number[]): number {
  if (values.length === 0) throw new Error("arithmeticMean requires at least one value");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) throw new Error("median requires at least one value");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
