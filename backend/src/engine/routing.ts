import type {
  AdaptiveApplicabilityStatus,
  CellRuntimePolicyDef,
  CellSnapshot,
  MethodologyDefinition,
  QuestionRuntimePolicyDef,
  RankedQuestion,
  RoutingDecision,
  RoutingInput
} from "./types.js";
import { calculateProfileRelevance } from "./profile-relevance.js";
import { cellWeightPct, mapKey, questionKey } from "./utils.js";
import { routeNextQuestion as routeLegacyNextQuestion } from "./legacy-routing.js";

export { classifyQuickStop, classifyFullTerminal, rankCandidateQuestions } from "./legacy-routing.js";

export function routeNextQuestion(definition: MethodologyDefinition, input: RoutingInput): RoutingDecision {
  const answeredIds = new Set(input.evidence.map(e => e.questionId));
  const openIssued = [...input.askedQuestionIds].find(id => !answeredIds.has(id));
  if (openIssued) {
    return { state: "AWAITING_CURRENT_QUESTION", nextQuestion: null, stopReason: `Question ${openIssued} is already issued and unanswered.` };
  }
  if (hasAdaptiveV13Policy(definition)) return routeAdaptiveV13(definition, input);
  return routeLegacyNextQuestion(definition, input);
}

export function hasAdaptiveV13Policy(definition: MethodologyDefinition): boolean {
  return Boolean(
    definition.runtimePolicy?.enabled &&
    definition.runtimePolicy.questionById.size > 0 &&
    definition.runtimePolicy.cellByCategoryCell.size > 0
  );
}

export function questionBudgetTarget(relevantCapabilityCount: number): number {
  const n = Math.max(0, relevantCapabilityCount);
  if (n <= 12) return Math.round(84 + 8 * n);
  if (n <= 20) return Math.round(180 + 8 * (n - 12));
  if (n <= 25) return Math.round(244 + 7.2 * (n - 20));
  if (n <= 30) return Math.round(280 + 6.8 * (n - 25));
  return Math.round(314 + 6 * (n - 30));
}

export function softQuestionCap(relevantCapabilityCount: number): number {
  // v3 keeps the validated reference burden as the normal target. Extra headroom
  // is proportional to relevant scope so low-authority/DNK/conflict cases can ask
  // direct follow-ups without sacrificing broad diagnostic coverage.
  const n = Math.max(0, relevantCapabilityCount);
  return questionBudgetTarget(n) + Math.max(20, 3 * n);
}

export function routeAdaptiveV13(definition: MethodologyDefinition, input: RoutingInput): RoutingDecision {
  if (!definition.runtimePolicy) throw new Error("Adaptive v13 runtime policy is not loaded");
  return input.mode === "FULL"
    ? routeAdaptiveV13Full(definition, input)
    : routeAdaptiveV13Quick(definition, input);
}

function routeAdaptiveV13Quick(definition: MethodologyDefinition, input: RoutingInput): RoutingDecision {
  // QUICK has one authoritative total-answer ceiling. The legacy routing
  // contract, progress API, integration gate and customer UI all expose 280.
  // Adaptive scope calculations may choose an earlier stop, but must never
  // expand the questionnaire beyond this contract.
  const configuredHardMaximum = Number(definition.contracts.companyProfile?.routingLocks?.quickMaxQuestions ?? 280);
  const hardMaximum = Number.isFinite(configuredHardMaximum) && configuredHardMaximum > 0
    ? Math.floor(configuredHardMaximum)
    : 280;
  const totalAnsweredCount = input.evidence.length;
  if (totalAnsweredCount >= hardMaximum) {
    return {
      state: "QUICK_LIMIT_REACHED",
      nextQuestion: null,
      stopReason: `ADAPTIVE_V13_QUICK_HARD_MAXIMUM:${hardMaximum}`
    };
  }

  const relevantCount = resolveRelevantCapabilityCount(definition, input);
  const target = questionBudgetTarget(relevantCount);
  const cap = softQuestionCap(relevantCount);
  const routingScreenCount = input.evidence.filter(e => e.cellId === "C01").length;
  const diagnosticCount = input.evidence.filter(e => e.cellId !== "C01").length;
  // D01 normally resolves with one screen per capability, but DNK recovery may
  // legitimately consume paths 2-4. Reserve the actual maximum available D01
  // paths instead of assuming only 64 routing-screen answers can ever exist.
  const totalSafetyCap = cap + maximumRoutingScreenAnswers(definition);

  if (diagnosticCount >= cap || input.evidence.length >= totalSafetyCap) {
    return {
      state: "QUICK_LIMIT_REACHED",
      nextQuestion: null,
      stopReason: `ADAPTIVE_V13_QUICK_SOFT_CAP:${cap};ROUTING_SCREENS:${routingScreenCount}`
    };
  }

  const candidates = rankAdaptiveV13Questions(definition, input);
  const top = candidates[0] ?? null;
  const scope = capabilityScopeState(definition, input);
  if (!top) {
    if (scope.relevant === 0 && scope.unknown === 0) {
      return { state: "NO_APPLICABLE_SCOPE", nextQuestion: null, stopReason: "ALL_CAPABILITIES_NOT_APPLICABLE" };
    }
    if (scope.unknown > 0) {
      return {
        state: "FULL_EVIDENCE_INCOMPLETE",
        nextQuestion: null,
        stopReason: `QUICK_APPLICABILITY_EVIDENCE_EXHAUSTED:${scope.unknown}`
      };
    }
    return { state: "QUICK_COMPLETE", nextQuestion: null, stopReason: "NO_ELIGIBLE_V13_QUESTION" };
  }

  // At/above the reference budget, stopping requires BOTH broad value coverage
  // and adequate direct screening evidence for the three critical dimensions.
  // Inferred values alone are therefore not a sufficient stopping condition.
  const broadCoverage = relevantEffectiveValueCoverage(definition, input);
  const needsBreadth = broadCoverage < 0.999999;
  const hasCriticalRepair = hasCriticalDirectConfidenceRepair(definition, input);
  // Any QUICK-eligible Q3/Q4 is, by construction, a repair path (critical, low
  // authority, DNK/N-A, or contradiction). Do not stop merely because a lower-
  // stage breadth/confirmation question happens to rank above that repair path.
  const hasRepairCandidate = candidates.some(candidate => {
    const policy = definition.runtimePolicy!.questionById.get(candidate.question.id);
    return policy ? ["CONFLICT", "FALLBACK"].includes(policy.askStage) : false;
  });
  if (
    diagnosticCount >= target &&
    !hasRepairCandidate &&
    !hasCriticalRepair &&
    !needsBreadth
  ) {
    return {
      state: "QUICK_COMPLETE",
      nextQuestion: null,
      stopReason: `ADAPTIVE_V3_REFERENCE_TARGET:${target}`
    };
  }

  return { state: "ADAPTIVE_V13_RUNNING", nextQuestion: top };
}

function routeAdaptiveV13Full(definition: MethodologyDefinition, input: RoutingInput): RoutingDecision {
  const candidates = rankAdaptiveV13Questions(definition, input);
  const top = candidates[0] ?? null;
  const scope = capabilityScopeState(definition, input);

  // FULL has no arbitrary question cap. It keeps collecting eligible direct
  // evidence until cells lock, become N/A, or exhaust their governed paths.
  if (top) return { state: "FULL_RUNNING", nextQuestion: top };

  if (scope.relevant === 0 && scope.unknown === 0) {
    return { state: "NO_APPLICABLE_SCOPE", nextQuestion: null, stopReason: "ALL_CAPABILITIES_NOT_APPLICABLE" };
  }
  if (scope.unknown > 0) {
    return {
      state: "FULL_EVIDENCE_INCOMPLETE",
      nextQuestion: null,
      stopReason: `FULL_APPLICABILITY_EVIDENCE_EXHAUSTED:${scope.unknown}`
    };
  }

  const terminal = fullAdaptiveTerminalState(definition, input);
  return { state: terminal.state, nextQuestion: null, stopReason: terminal.reason };
}

function maximumRoutingScreenAnswers(definition: MethodologyDefinition): number {
  const runtime = definition.runtimePolicy;
  if (!runtime) return definition.categories.length;
  return definition.categories.reduce((sum, category) => {
    const policy = runtime.cellByCategoryCell.get(mapKey(category.id, "C01"));
    return sum + Math.max(1, policy?.maxDirectQuestions ?? 1);
  }, 0);
}

function capabilityScopeState(definition: MethodologyDefinition, input: RoutingInput): { relevant: number; notApplicable: number; unknown: number } {
  let relevant = 0;
  let notApplicable = 0;
  let unknown = 0;
  for (const category of definition.categories) {
    const status = capabilityApplicability(definition, input, category.id);
    if (status === "TRUE") relevant++;
    else if (status === "FALSE") notApplicable++;
    else unknown++;
  }
  return { relevant, notApplicable, unknown };
}

function fullAdaptiveTerminalState(definition: MethodologyDefinition, input: RoutingInput): { state: string; reason: string } {
  const runtime = definition.runtimePolicy!;
  let scoredApplicable = 0;
  let missingValues = 0;
  let reviewRequired = 0;

  for (const category of definition.categories) {
    if (capabilityApplicability(definition, input, category.id) !== "TRUE") continue;
    for (const cell of definition.cells) {
      if (cell.id === "C01" || !cellHasScoreEligibleQuestion(definition, category.id, cell.id)) continue;
      const key = mapKey(category.id, cell.id);
      const state = input.snapshot.cells.get(key);
      const policy = runtime.cellByCategoryCell.get(key);
      if (!state || !policy || state.status === "NOT_APPLICABLE") continue;
      scoredApplicable++;
      if (state.effectiveScore === null) missingValues++;
      // Derived values are valid for governed INFER_ONLY cells. For direct-
      // askable cells, exhaustion without a lock or an unresolved contradiction
      // must be surfaced as review rather than silently called fully validated.
      if (policy.applicabilityMode !== "INFER_ONLY" && (
        state.status === "REVIEW_REQUIRED" ||
        state.hasHardContradiction ||
        (state.exhausted && state.status !== "DIRECT_FINAL")
      )) reviewRequired++;
    }
  }

  if (scoredApplicable === 0) return { state: "NO_APPLICABLE_SCOPE", reason: "NO_APPLICABLE_SCORED_CELLS" };
  if (missingValues > 0) {
    return { state: "FULL_EVIDENCE_INCOMPLETE", reason: `EVIDENCE_EXHAUSTED_WITH_NULL_VALUES:${missingValues}` };
  }
  if (reviewRequired > 0) {
    return { state: "FULL_COMPLETE_WITH_REVIEW", reason: `EVIDENCE_EXHAUSTED_WITH_REVIEW:${reviewRequired}` };
  }
  return { state: "FULL_COMPLETE", reason: "ALL_APPLICABLE_EVIDENCE_PATHS_RESOLVED" };
}

export function rankAdaptiveV13Questions(definition: MethodologyDefinition, input: RoutingInput): RankedQuestion[] {
  const runtime = definition.runtimePolicy;
  if (!runtime) return [];

  const profileRelevance = calculateProfileRelevance(definition, input.profileAnswers ?? []);
  const ranked: Array<RankedQuestion & {
    stageOrder: number;
    selectionPriority: number;
    uncovered: number;
    categoryCoverage: number;
    projectedCoverageGain: number;
    categoryWeight: number;
    cellWeight: number;
  }> = [];

  for (const question of definition.questions) {
    const policy = runtime.questionById.get(question.id);
    if (!policy) continue;
    const cellPolicy = runtime.cellByCategoryCell.get(mapKey(question.categoryId, question.cellId));
    if (!cellPolicy) continue;
    const state = input.snapshot.cells.get(mapKey(question.categoryId, question.cellId));
    const category = definition.categories.find(c => c.id === question.categoryId);
    const cell = definition.cells.find(c => c.id === question.cellId);
    if (!state || !category || !cell) continue;
    if (!eligibleAdaptiveQuestion(definition, input, question.categoryId, question.cellId, policy, cellPolicy, state)) continue;

    const categoryImportance = category.weightPct / definition.maxCategoryWeight;
    const maturityScoredCell = cellHasScoreEligibleQuestion(definition, question.categoryId, question.cellId);
    const cellImportance = question.cellId === "C01" || !maturityScoredCell ? 0 : cellWeightPct(definition, category.id, cell.id, cell.weightPct) / definition.maxScoredCellWeight;
    const relevance = profileRelevance.get(question.categoryId) ?? 1;
    const uncertainty = 1 - state.effectiveConfidence;
    const coverageGap = question.cellId === "C01" || !maturityScoredCell || state.status === "NOT_APPLICABLE" || state.effectiveScore !== null ? 0 : 1;
    const categoryCoverage = currentCategoryCoverage(definition, input, question.categoryId);
    const projectedCoverageGain = projectedGainForQuestion(definition, input, question.categoryId, question.cellId);
    const criticalRepair = criticalDirectConfidenceNeedsRepair(definition, question.cellId, state);
    const urgentRepair = state.hasHardContradiction || state.hasSameCellVariance || state.naClaimCount > 0 || state.status === "REVIEW_REQUIRED";
    const priority = 100 * (
      0.30 * categoryImportance +
      0.20 * cellImportance +
      0.20 * relevance +
      0.20 * uncertainty +
      0.10 * coverageGap
    );

    ranked.push({
      question,
      priority,
      reason: {
        categoryImportance,
        cellImportance,
        profileRelevance: relevance,
        uncertainty,
        finalizationProximity: state.directAnswerCount === 0 ? 0.6 : state.directAnswerCount === 1 ? 0.8 : 1,
        coverageGap,
        eventBoost: 0,
        eventFlags: [`V13_${policy.askStage}`, policy.isAnchor ? "V13_ANCHOR" : "V13_POLICY"]
      },
      stageOrder: askStageOrder(policy.askStage, projectedCoverageGain, criticalRepair, urgentRepair),
      selectionPriority: policy.selectionPriority,
      uncovered: coverageGap,
      categoryCoverage,
      projectedCoverageGain,
      categoryWeight: category.weightPct,
      cellWeight: cellWeightPct(definition, category.id, cell.id, cell.weightPct)
    });
  }

  ranked.sort((a, b) =>
    a.stageOrder - b.stageOrder ||
    a.categoryCoverage - b.categoryCoverage ||
    b.projectedCoverageGain - a.projectedCoverageGain ||
    b.uncovered - a.uncovered ||
    a.selectionPriority - b.selectionPriority ||
    b.categoryWeight - a.categoryWeight ||
    b.cellWeight - a.cellWeight ||
    a.question.sourceRow - b.question.sourceRow ||
    a.question.id.localeCompare(b.question.id)
  );

  return ranked.map(({ stageOrder, selectionPriority, uncovered, categoryCoverage, projectedCoverageGain, categoryWeight, cellWeight, ...item }) => item);
}

function eligibleAdaptiveQuestion(
  definition: MethodologyDefinition,
  input: RoutingInput,
  categoryId: string,
  cellId: string,
  questionPolicy: QuestionRuntimePolicyDef,
  cellPolicy: CellRuntimePolicyDef,
  state: CellSnapshot
): boolean {
  if (!questionPolicy.directAskAllowed || questionPolicy.routingState === "INFER_ONLY" || questionPolicy.askStage === "NEVER_DIRECT") return false;
  if (input.askedQuestionIds.has(questionPolicy.questionId)) return false;

  const question = definition.questionById.get(questionPolicy.questionId);
  if (!question) return false;
  const contextOnly = cellId !== "C01" && !questionPolicy.scoreEligible;

  const category = input.snapshot.categories.get(categoryId);
  if (!category || category.confirmedNotApplicable) return false;
  if (state.status === "NOT_APPLICABLE") return false;
  // A scored cell that already locked normally stops receiving direct evidence.
  // FULL may still collect a governed non-scoring context path (for example
  // D44-Q4 benchmark position) after the maturity cell itself has locked.
  if (state.status === "DIRECT_FINAL" && !(input.mode === "FULL" && contextOnly)) return false;

  const capabilityState = capabilityApplicability(definition, input, categoryId);
  if (questionPolicy.askStage === "PROFILE_SCREEN") return capabilityState === "UNKNOWN";
  if (capabilityState !== "TRUE") return false;

  let cellApplicability = resolveCellApplicability(input, categoryId, cellPolicy);
  // A conditional cell must never disappear merely because a pre-profile gate is
  // unavailable. Its first direct question doubles as the applicability screen
  // because every conditional v13 question carries an explicit non-scoring N/A
  // option. Once a scored direct answer exists, applicability is proven TRUE; an
  // N/A answer is already handled above by state.status === NOT_APPLICABLE.
  if (cellApplicability === "UNKNOWN" && cellPolicy.applicabilityMode === "CONDITIONAL") {
    // Any answered direct path (scored, N/A, or DNK) opens the governed follow-up
    // sequence. Otherwise a first N/A/DNK could strand the cell before Q2/Q3,
    // making N/A confirmation and uncertainty resolution unreachable. This does
    // not assert applicability; the cell state still decides NOT_APPLICABLE vs
    // scored/review outcomes after enough evidence is collected.
    const answeredAnyDirect = (state.evidenceCount ?? state.directEvidence.length) > 0;
    if (answeredAnyDirect || state.directAnswerCount > 0 || state.effectiveScore !== null) cellApplicability = "TRUE";
    else if (["ANCHOR", "PRIMARY_GAP_FILL"].includes(questionPolicy.askStage)) cellApplicability = "TRUE";
  }
  if (cellApplicability !== "TRUE") return false;

  const confidence = state.effectiveConfidence;
  const directCount = state.directAnswerCount;
  const answeredPathCount = state.directEvidence.filter(item => {
    const p = definition.runtimePolicy!.questionById.get(item.questionId);
    return Boolean(p?.directAskAllowed && p.askStage !== "NEVER_DIRECT");
  }).length;

  // Context-only paths do not increase maturity confidence, so they must not use
  // score-confidence conditions to decide whether another context question is
  // eligible. QUICK takes at most the first standalone context path; FULL may
  // collect the complete governed context sequence. D44-Q4 is therefore FULL-
  // eligible after Q1-Q3 even when the scored benchmark cell has already locked.
  if (contextOnly) {
    if (input.mode === "QUICK") return question.path === 1 && answeredPathCount === 0;
    return question.path === answeredPathCount + 1 && answeredPathCount < cellPolicy.maxDirectQuestions;
  }

  const critical = isCriticalDirectConfidenceCell(definition, cellId);
  const criticalConfig = resolveCriticalDirectConfidenceConfig(definition);
  const criticalFloor = critical ? criticalConfig.confidenceFloor : cellPolicy.lockThreshold;
  const criticalMinimumDirect = critical ? criticalConfig.minimumDirectAnswers : 3;
  const authorityMinimum = Number(definition.contracts.authority.finalization?.requiresAtLeastOneAcceptedDirectAnswerAuthorityAtLeast ?? 0.75);
  const lowAuthorityRepair = directCount > 0 && state.maxAcceptedAuthority < authorityMinimum;

  switch (questionPolicy.askStage) {
    case "ANCHOR":
    case "PRIMARY_GAP_FILL":
      // Critical dimensions require at least one genuinely direct answer even when
      // a secondary edge has already supplied an estimated value.
      return answeredPathCount === 0 && directCount === 0 && (
        critical || confidence < cellPolicy.primaryConfidenceFloor
      );
    case "CONFIRM":
      // Q2 is the next distinct evidence path after a scored Q1 OR a Q1 DNK/N-A claim.
      return answeredPathCount >= 1 && answeredPathCount < 2 && (
        directCount < 2 || confidence < criticalFloor || state.naClaimCount > 0
      );
    case "CONFLICT":
      // FULL deliberately collects the third scored path for every direct-askable
      // maturity cell so it can reach the 3-answer finalization gate. QUICK uses
      // Q3 only for critical, low-authority, DNK/N-A, or contradiction repair.
      return answeredPathCount >= 2 && answeredPathCount < 3 && (
        (input.mode === "FULL" && directCount < 3) ||
        (critical && (directCount < criticalMinimumDirect || confidence < criticalFloor)) ||
        lowAuthorityRepair || directCount < 2 || state.naClaimCount > 0 ||
        state.hasSameCellVariance || state.hasHardContradiction || state.status === "REVIEW_REQUIRED"
      );
    case "FALLBACK":
      // Q4 is reserved for unresolved confidence, low authority, DNK/N-A, or
      // contradiction repair. FULL reaches it whenever Q3 did not lock the cell.
      return answeredPathCount >= 3 && answeredPathCount < cellPolicy.maxDirectQuestions && (
        (critical && (directCount < criticalMinimumDirect || confidence < criticalFloor)) ||
        lowAuthorityRepair || directCount < 3 || confidence < cellPolicy.lockThreshold ||
        state.naClaimCount > 0 || state.hasSameCellVariance || state.hasHardContradiction ||
        (input.mode === "FULL" && state.status !== "DIRECT_FINAL")
      );
    default:
      return false;
  }
}

function capabilityApplicability(
  definition: MethodologyDefinition,
  input: RoutingInput,
  categoryId: string
): AdaptiveApplicabilityStatus {
  const category = input.snapshot.categories.get(categoryId);
  if (!category || category.confirmedNotApplicable) return "FALSE";
  const c01 = input.snapshot.cells.get(mapKey(categoryId, "C01"));
  if (!c01) return "UNKNOWN";
  if (c01.status === "NOT_APPLICABLE") return "FALSE";
  if (c01.applicabilityRelevance !== null) {
    // Positive D01 evidence is enough to continue diagnosis. Low-relevance D01
    // evidence alone remains UNKNOWN until the three-path exclusion gate has
    // actually confirmed NOT_APPLICABLE in the cell state.
    return c01.applicabilityRelevance > 0.20 ? "TRUE" : "UNKNOWN";
  }

  // Explicit gate input can resolve capability relevance before D01 is asked.
  const explicit = input.applicabilityByGate?.get(`${categoryId}:CAPABILITY_RELEVANT`)
    ?? input.applicabilityByGate?.get("CAPABILITY_RELEVANT");
  if (explicit) return explicit;

  // No explicit decision: fail closed so D01 profile-screen questions resolve it first.
  return "UNKNOWN";
}

function resolveCellApplicability(
  input: RoutingInput,
  categoryId: string,
  policy: CellRuntimePolicyDef
): AdaptiveApplicabilityStatus {
  if (policy.applicabilityMode === "INFER_ONLY") return "FALSE";
  if (policy.applicabilityMode === "STANDARD" || policy.applicabilityGateKey === "CAPABILITY_RELEVANT") return "TRUE";

  return input.applicabilityByGate?.get(`${categoryId}:${policy.applicabilityGateKey}`)
    ?? input.applicabilityByGate?.get(policy.applicabilityGateKey)
    ?? "UNKNOWN";
}

function cellHasScoreEligibleQuestion(definition: MethodologyDefinition, categoryId: string, cellId: string): boolean {
  if (cellId === "C01") return false;
  // Maturity membership belongs to the diagnostic construct, not direct-ask
  // eligibility. INFER_ONLY D45 retains numeric scoring semantics even though
  // its question policies are non-direct/non-scoring at runtime. Context-only
  // D42 has no numeric options and remains excluded. Keep routing coverage in
  // exact alignment with scoring.ts so QUICK cannot stop with hidden scored gaps.
  for (let path = 1; path <= 4; path++) {
    const q = definition.questionByCategoryCellPath.get(questionKey(categoryId, cellId, path));
    if (!q) continue;
    if (q.options.some(option => option.score !== null)) return true;
  }
  return false;
}

function currentCategoryCoverage(definition: MethodologyDefinition, input: RoutingInput, categoryId: string): number {
  const cells = definition.cells.filter(cell => cell.id !== "C01");
  if (cells.length === 0) return 1;
  let known = 0;
  let applicable = 0;
  for (const cell of cells) {
    if (!cellHasScoreEligibleQuestion(definition, categoryId, cell.id)) continue;
    const state = input.snapshot.cells.get(mapKey(categoryId, cell.id));
    if (!state || state.status === "NOT_APPLICABLE") continue;
    applicable++;
    if (state.effectiveScore !== null) known++;
  }
  return applicable === 0 ? 1 : known / applicable;
}

function projectedGainForQuestion(definition: MethodologyDefinition, input: RoutingInput, categoryId: string, cellId: string): number {
  if (cellId === "C01") return 0;
  const targets = new Set<string>([cellId]);
  for (const edge of definition.secondaryEdges) if (edge.sourceCellId === cellId) targets.add(edge.targetCellId);
  let gain = 0;
  for (const targetCellId of targets) {
    if (!cellHasScoreEligibleQuestion(definition, categoryId, targetCellId)) continue;
    const state = input.snapshot.cells.get(mapKey(categoryId, targetCellId));
    if (!state || state.status === "NOT_APPLICABLE") continue;
    if (state.effectiveScore === null) gain++;
  }
  return gain;
}

function hasCriticalDirectConfidenceRepair(definition: MethodologyDefinition, input: RoutingInput): boolean {
  const runtime = definition.runtimePolicy;
  if (!runtime) return false;
  for (const category of definition.categories) {
    if (capabilityApplicability(definition, input, category.id) !== "TRUE") continue;
    for (const cellId of resolveCriticalDirectConfidenceConfig(definition).cells) {
      const state = input.snapshot.cells.get(mapKey(category.id, cellId));
      const policy = runtime.cellByCategoryCell.get(mapKey(category.id, cellId));
      if (!state || !policy || state.status === "NOT_APPLICABLE") continue;
      const answeredPathCount = state.directEvidence.filter(item => {
        const q = runtime.questionById.get(item.questionId);
        return Boolean(q?.directAskAllowed && q.askStage !== "NEVER_DIRECT");
      }).length;
      if (answeredPathCount >= policy.maxDirectQuestions) continue;
      if (criticalDirectConfidenceNeedsRepair(definition, cellId, state)) return true;
    }
  }
  return false;
}

function relevantEffectiveValueCoverage(definition: MethodologyDefinition, input: RoutingInput): number {
  let applicable = 0;
  let known = 0;
  for (const category of definition.categories) {
    if (capabilityApplicability(definition, input, category.id) !== "TRUE") continue;
    for (const cell of definition.cells) {
      if (cell.id === "C01" || !cellHasScoreEligibleQuestion(definition, category.id, cell.id)) continue;
      const state = input.snapshot.cells.get(mapKey(category.id, cell.id));
      if (!state || state.status === "NOT_APPLICABLE") continue;
      applicable++;
      if (state.effectiveScore !== null) known++;
    }
  }
  return applicable === 0 ? 1 : known / applicable;
}

function resolveRelevantCapabilityCount(definition: MethodologyDefinition, input: RoutingInput): number {
  if (Number.isInteger(input.relevantCapabilityCount) && (input.relevantCapabilityCount as number) > 0) {
    return Math.min(definition.categories.length, input.relevantCapabilityCount as number);
  }

  const explicitTrue = definition.categories.filter(category =>
    input.applicabilityByGate?.get(`${category.id}:CAPABILITY_RELEVANT`) === "TRUE"
  ).length;
  if (explicitTrue > 0) return explicitTrue;

  const resolvedRelevant = definition.categories.filter(category =>
    capabilityApplicability(definition, input, category.id) === "TRUE"
  ).length;
  if (resolvedRelevant > 0) return resolvedRelevant;

  // Prior to D01 resolution, use the lowest validated reference scope rather than
  // assuming all 64 capabilities are relevant and inflating the question budget.
  return Math.min(12, definition.categories.length);
}

function resolveCriticalDirectConfidenceConfig(definition: MethodologyDefinition): {
  cells: Set<string>;
  confidenceFloor: number;
  minimumDirectAnswers: number;
} {
  const raw = definition.contracts.routing?.quick?.criticalDirectConfidence ?? {};
  const cells = new Set<string>(Array.isArray(raw.cells) ? raw.cells.map(String) : ["C02", "C16", "C41"]);
  return {
    cells,
    confidenceFloor: Number(raw.confidenceFloor ?? 0.60),
    minimumDirectAnswers: Number(raw.minimumDirectAnswers ?? 2)
  };
}

function isCriticalDirectConfidenceCell(definition: MethodologyDefinition, cellId: string): boolean {
  return resolveCriticalDirectConfidenceConfig(definition).cells.has(cellId);
}

function criticalDirectConfidenceNeedsRepair(
  definition: MethodologyDefinition,
  cellId: string,
  state: CellSnapshot
): boolean {
  if (!isCriticalDirectConfidenceCell(definition, cellId)) return false;
  if (state.status === "NOT_APPLICABLE" || state.hasHardContradiction) return false;
  const config = resolveCriticalDirectConfidenceConfig(definition);
  return state.directAnswerCount < config.minimumDirectAnswers || state.directConfidence < config.confidenceFloor;
}

function askStageOrder(
  stage: QuestionRuntimePolicyDef["askStage"],
  projectedCoverageGain = 0,
  criticalRepair = false,
  urgentRepair = false
): number {
  if (urgentRepair && stage === "CONFLICT") return 1;
  if (urgentRepair && stage === "FALLBACK") return 2;
  switch (stage) {
    case "PROFILE_SCREEN": return 0;
    // First direct anchor/primary evidence comes before breadth expansion.
    case "ANCHOR": return criticalRepair ? 3 : projectedCoverageGain > 0 ? 5 : 8;
    case "PRIMARY_GAP_FILL":
      // Critical cells (C02/C16/C41) must receive a genuine first direct
      // measurement even if an indirect edge has already populated an
      // estimated value. Otherwise the critical cell can be starved until
      // the soft cap because projectedCoverageGain becomes zero.
      if (criticalRepair) return 3;
      return projectedCoverageGain > 0 ? 5 : 8;
    // Finish the minimum critical direct-confidence requirement before
    // noncritical breadth/confirmation work. This prevents C02/C16/C41 from
    // being left as derived-only estimates when the reference budget is reached.
    // Urgent contradiction/fallback repair is still promoted to 1/2 above.
    case "CONFIRM": return criticalRepair ? 4 : 7;
    case "CONFLICT": return criticalRepair ? 4 : 7;
    case "FALLBACK": return criticalRepair ? 4 : 7;
    default: return 99;
  }
}
