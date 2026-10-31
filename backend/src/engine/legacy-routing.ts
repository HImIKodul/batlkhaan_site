import type { CellSnapshot, MethodologyDefinition, RankedQuestion, RoutingDecision, RoutingInput } from "./types.js";
import { calculateProfileRelevance } from "./profile-relevance.js";
import { mapKey, questionKey } from "./utils.js";

export function classifyQuickStop(args: { count: number; coreComplete: boolean; mandatoryUnresolved: boolean; highestPriority: number }): "CONTINUE" | "QUICK_COMPLETE" | "QUICK_LIMIT_REACHED" | "INVALID" {
  if (args.count > 280) return "INVALID";
  if (args.count === 280) return "QUICK_LIMIT_REACHED";
  if (args.count < 192) return "CONTINUE";
  if (!args.coreComplete || args.mandatoryUnresolved || args.highestPriority >= 65) return "CONTINUE";
  return "QUICK_COMPLETE";
}

export function classifyFullTerminal(args: { valuesComplete: boolean; reviewRequired: boolean; evidenceExhausted: boolean; noScope: boolean }): "CONTINUE" | "FULL_COMPLETE" | "FULL_COMPLETE_WITH_REVIEW" | "FULL_EVIDENCE_INCOMPLETE" | "NO_APPLICABLE_SCOPE" {
  if (args.noScope) return "NO_APPLICABLE_SCOPE";
  if (args.evidenceExhausted) return "FULL_EVIDENCE_INCOMPLETE";
  if (!args.valuesComplete) return "CONTINUE";
  return args.reviewRequired ? "FULL_COMPLETE_WITH_REVIEW" : "FULL_COMPLETE";
}

export function routeNextQuestion(definition: MethodologyDefinition, input: RoutingInput): RoutingDecision {
  const answeredIds = new Set(input.evidence.map(e => e.questionId));
  const openIssued = [...input.askedQuestionIds].find(id => !answeredIds.has(id));
  if (openIssued) {
    return { state: "AWAITING_CURRENT_QUESTION", nextQuestion: null, stopReason: `Question ${openIssued} is already issued and unanswered.` };
  }

  if (input.mode === "QUICK") return routeQuick(definition, input);
  return routeFull(definition, input);
}

function routeQuick(definition: MethodologyDefinition, input: RoutingInput): RoutingDecision {
  const hardMax = Number(definition.contracts.routing.quick.hardMaximum ?? 280);
  if (input.diagnosticQuestionCount > hardMax) {
    return { state: "INVALID", nextQuestion: null, stopReason: "QUICK_COUNT_EXCEEDS_HARD_MAXIMUM" };
  }
  if (input.diagnosticQuestionCount === hardMax) {
    return { state: "QUICK_LIMIT_REACHED", nextQuestion: null, stopReason: "QUICK_HARD_MAXIMUM" };
  }

  const core = nextCoreQuestion(definition, input);
  if (core) return { state: "CORE_ROUTING", nextQuestion: core };

  const ranked = rankCandidateQuestions(definition, input);
  const top = ranked[0] ?? null;
  const softMinimum = Number(definition.contracts.routing.quick.softMinimum ?? 192);
  const threshold = Number(definition.contracts.routing.quick.priorityStopThreshold ?? 65);
  const blockers = adaptiveBlockers(input, ranked);

  if (input.diagnosticQuestionCount >= softMinimum && (!top || top.priority < threshold) && blockers.length === 0) {
    return { state: "QUICK_COMPLETE", nextQuestion: null, stopReason: "QUICK_SOFT_STOP" };
  }
  if (!top) {
    return { state: "QUICK_COMPLETE", nextQuestion: null, stopReason: "NO_ELIGIBLE_QUESTION" };
  }
  return { state: "ADAPTIVE_TOPUP", nextQuestion: top };
}

function routeFull(definition: MethodologyDefinition, input: RoutingInput): RoutingDecision {
  const applicableCategories = [...input.snapshot.categories.values()].filter(c => !c.confirmedNotApplicable);
  if (applicableCategories.length === 0) {
    return { state: "NO_APPLICABLE_SCOPE", nextQuestion: null, stopReason: "ALL_CATEGORIES_NOT_APPLICABLE" };
  }

  const ranked = rankCandidateQuestions(definition, input);
  const hasApplicabilityConflict = input.snapshot.contradictions.some(c => c.type === "HARD" && c.flag === "SCOPE_CONTRADICTION");
  const applicableStates = [...input.snapshot.cells.values()].filter(c => {
    if (c.cellId === "C01") return false;
    const cat = input.snapshot.categories.get(c.categoryId)!;
    return !cat.confirmedNotApplicable && c.status !== "NOT_APPLICABLE";
  });
  const allHaveValue = applicableStates.every(c => c.effectiveScore !== null);
  const allDirectFinal = applicableStates.every(c => c.status === "DIRECT_FINAL");

  const reviewRequired = applicableStates.some(c => c.status === "REVIEW_REQUIRED" || c.status === "DERIVED_PROVISIONAL" || c.hasHardContradiction);
  if (allHaveValue && allDirectFinal && !hasApplicabilityConflict) {
    return { state: "FULL_COMPLETE", nextQuestion: null, stopReason: "ALL_APPLICABLE_CELLS_FINAL" };
  }
  if (ranked.length > 0) return { state: "FULL_RUNNING", nextQuestion: ranked[0] };
  const terminal = classifyFullTerminal({
    valuesComplete: allHaveValue && !hasApplicabilityConflict,
    reviewRequired,
    evidenceExhausted: !allHaveValue,
    noScope: false
  });
  return {
    state: terminal,
    nextQuestion: null,
    stopReason: terminal === "FULL_EVIDENCE_INCOMPLETE" ? "EVIDENCE_EXHAUSTED_WITH_NULL_VALUES" : "EVIDENCE_EXHAUSTED_WITH_VALUES"
  };
}

export function rankCandidateQuestions(definition: MethodologyDefinition, input: RoutingInput): RankedQuestion[] {
  const profile = calculateProfileRelevance(definition, input.profileAnswers ?? []);
  const evidenceByCell = new Map<string, typeof input.evidence>();
  for (const e of input.evidence) {
    const key = mapKey(e.categoryId, e.cellId);
    const list = evidenceByCell.get(key) ?? [];
    list.push(e);
    evidenceByCell.set(key, list);
  }
  const order: number[] = definition.contracts.routing.pathSelection.normalOrder.map(Number);
  const ranked: Array<RankedQuestion & { eventSeverity: number; catWeight: number; cellWeight: number; confidence: number }> = [];

  for (const category of definition.categories) {
    const catState = input.snapshot.categories.get(category.id)!;
    if (catState.confirmedNotApplicable) continue;
    for (const cellDef of definition.cells) {
      const state = input.snapshot.cells.get(mapKey(category.id, cellDef.id))!;
      if (state.status === "NOT_APPLICABLE" || state.status === "DIRECT_FINAL") continue;
      const currentEvidence = evidenceByCell.get(mapKey(category.id, cellDef.id)) ?? [];
      const nextPath = order.find(path => {
        const q = definition.questionByCategoryCellPath.get(questionKey(category.id, cellDef.id, path));
        return q && !input.askedQuestionIds.has(q.id) && !currentEvidence.some(e => e.questionId === q.id);
      });
      if (nextPath === undefined) continue;
      const question = definition.questionByCategoryCellPath.get(questionKey(category.id, cellDef.id, nextPath))!;
      const categoryImportance = category.weightPct / definition.maxCategoryWeight;
      const cellImportance = cellDef.id === "C01" ? 0 : cellDef.weightPct / definition.maxScoredCellWeight;
      const profileRelevance = profile.get(category.id) ?? 1;
      const uncertainty = 1 - state.effectiveConfidence;
      const finalizationProximity = proximity(state);
      const hasValue = cellDef.id === "C01" ? state.applicabilityRelevance !== null : state.effectiveScore !== null;
      const coverageGap = hasValue ? 0 : 1;
      const flags = eventFlags(input, state, currentEvidence);
      const eventBoost = flags.reduce((sum, f) => sum + eventBoostFor(definition, f), 0);
      const priority = 100 * (
        0.25 * categoryImportance +
        0.20 * cellImportance +
        0.20 * profileRelevance +
        0.20 * uncertainty +
        0.10 * finalizationProximity +
        0.05 * coverageGap
      ) + eventBoost;
      ranked.push({
        question,
        priority,
        reason: { categoryImportance, cellImportance, profileRelevance, uncertainty, finalizationProximity, coverageGap, eventBoost, eventFlags: flags },
        eventSeverity: Math.max(0, ...flags.map(f => eventBoostFor(definition, f))),
        catWeight: category.weightPct,
        cellWeight: cellDef.weightPct,
        confidence: state.effectiveConfidence
      });
    }
  }

  ranked.sort((a,b) =>
    b.eventSeverity - a.eventSeverity ||
    b.priority - a.priority ||
    b.catWeight - a.catWeight ||
    b.cellWeight - a.cellWeight ||
    a.confidence - b.confidence ||
    a.question.sourceRow - b.question.sourceRow ||
    a.question.id.localeCompare(b.question.id)
  );
  return ranked.map(({ eventSeverity,catWeight,cellWeight,confidence,...q }) => q);
}

function nextCoreQuestion(definition: MethodologyDefinition, input: RoutingInput): RankedQuestion | null {
  const answered = new Map(input.evidence.map(e => [e.questionId, e]));
  for (const category of definition.categories) {
    const c01p1 = getQuestion(definition, category.id, "C01", 1);
    if (!input.askedQuestionIds.has(c01p1.id)) return coreRanked(c01p1, "CORE_C01");
    const first = answered.get(c01p1.id);
    if (!first) return null;

    if (first.state === "N_A_CLAIM" || first.state === "DNK") {
      for (const path of [3,2]) {
        const q = getQuestion(definition, category.id, "C01", path);
        if (!input.askedQuestionIds.has(q.id)) return coreRanked(q, first.state === "N_A_CLAIM" ? "CORE_NA_CONFIRMATION" : "CORE_DNK_RECOVERY");
      }
      const c01State = input.snapshot.cells.get(mapKey(category.id,"C01"))!;
      if (c01State.status === "NOT_APPLICABLE" && !c01State.hasHardContradiction) continue;
    }

    for (const cellId of ["C02","C41"]) {
      const q = getQuestion(definition, category.id, cellId, 1);
      if (!input.askedQuestionIds.has(q.id)) return coreRanked(q, `CORE_${cellId}`);
    }
  }
  return null;
}

function getQuestion(definition: MethodologyDefinition, categoryId: string, cellId: string, path: number) {
  const q = definition.questionByCategoryCellPath.get(questionKey(categoryId,cellId,path));
  if (!q) throw new Error(`Missing question ${categoryId}/${cellId}/path${path}`);
  return q;
}

function coreRanked(question: ReturnType<typeof getQuestion>, flag: string): RankedQuestion {
  return {
    question,
    priority: Number.POSITIVE_INFINITY,
    reason: { categoryImportance:1,cellImportance:1,profileRelevance:1,uncertainty:1,finalizationProximity:1,coverageGap:1,eventBoost:0,eventFlags:[flag] }
  };
}

function proximity(state: CellSnapshot): number {
  if (state.status === "DIRECT_FINAL") return 0;
  if (state.directAnswerCount <= 0) return 0.6;
  if (state.directAnswerCount === 1) return 0.8;
  if (state.directAnswerCount === 2) return 1.0;
  return 0.9;
}

function eventFlags(input: RoutingInput, state: CellSnapshot, evidence: typeof input.evidence): string[] {
  const flags: string[] = [];
  const hard = input.snapshot.contradictions.filter(c => c.type === "HARD" && c.categoryId === state.categoryId && c.affectedCellIds.includes(state.cellId));
  if (hard.some(h => h.flag === "SCOPE_CONTRADICTION")) flags.push("APPLICABILITY_CONFLICT");
  if (hard.length) flags.push("HARD_CONTRADICTION");
  if (state.naClaimCount > 0 && state.status !== "NOT_APPLICABLE" && !state.exhausted) flags.push("PENDING_NA_CONFIRMATION");
  if (evidence.some(e => e.state === "DNK")) flags.push("RECENT_DNK");
  if (state.status === "REVIEW_REQUIRED") flags.push("REVIEW_REQUIRED");
  if (state.hasSameCellVariance) flags.push("SAME_CELL_VARIANCE");
  if (state.hasSecondaryTension || state.tensionRuleIds.length > 0) flags.push("SECONDARY_TENSION");
  return [...new Set(flags)];
}

function eventBoostFor(definition: MethodologyDefinition, flag: string): number {
  return Number(definition.contracts.routing.priority.boosts?.[flag] ?? 0);
}

function adaptiveBlockers(input: RoutingInput, ranked: RankedQuestion[]): string[] {
  const blockers: string[] = [];
  if (input.snapshot.contradictions.some(c => c.type === "HARD" && c.flag === "SCOPE_CONTRADICTION")) blockers.push("APPLICABILITY_CONFLICT");
  if (input.snapshot.contradictions.some(c => c.type === "HARD")) blockers.push("HARD_CONTRADICTION");
  if (ranked.some(q => q.reason.eventFlags.includes("PENDING_NA_CONFIRMATION"))) blockers.push("PENDING_NA_CONFIRMATION");
  return blockers;
}
