import type { MethodologyDefinition, ProfileAnswer, RuntimeSnapshot } from "../engine/types.js";
import type { PriorityBand, Recommendation, RecommendationResult, RecommendationType, RootCauseResult } from "./types.js";

const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
const clamp100 = (v: number): number => Math.min(100, Math.max(0, v));
const unique = <T>(items: T[]): T[] => [...new Set(items)];

function profileOption(profileAnswers: ProfileAnswer[] | undefined, id: string): number | null {
  const value = profileAnswers?.find(x => x.questionId === id)?.optionIndexes?.[0];
  return typeof value === "number" ? value : null;
}

function capacityLevel(profileAnswers: ProfileAnswer[] | undefined): number {
  return Math.min(5, Math.max(1, profileOption(profileAnswers, "P05") ?? 3));
}

function selectedPurpose(profileAnswers: ProfileAnswer[] | undefined): string | null {
  const p = profileOption(profileAnswers, "P20");
  return p !== null && p >= 1 && p <= 5 ? `P${p}` : null;
}

function priorityBand(value: number): PriorityBand {
  if (value >= 80) return "P1";
  if (value >= 65) return "P2";
  if (value >= 50) return "P3";
  return "P4";
}

function evidenceOperation(type: Exclude<RecommendationType, "EXECUTION" | "LOCAL_IMPROVEMENT">): { title: string; action: string; deliverable: string; kpi: string } {
  if (type === "VALIDATE_CAUSE") return {
    title: "Болзошгүй шалтгааныг шалгаж баталгаажуулах",
    action: "Тухайн шалтгааныг өөр эх сурвалж, бодит бүртгэл эсвэл давтан тохиолдлоор шалгаж, батлагдсан эсэхийг тогтоох.",
    deliverable: "Шалгалтын тэмдэглэл ба нотолгооны холбоос",
    kpi: "Баталгаажсан эсвэл няцаагдсан шалтгааны статус"
  };
  if (type === "COLLECT_EVIDENCE") return {
    title: "Шаардлагатай нотолгоог бүрдүүлэх",
    action: "Дутуу байгаа шууд нотолгоог асуулт, бүртгэл эсвэл бодит эх сурвалжаас нөхөж, тухайн асуудлыг найдвартай үнэлэх боломжтой болгох.",
    deliverable: "Нотолгооны багц",
    kpi: "Бүрдсэн хүчинтэй шууд нотолгооны замын тоо"
  };
  return {
    title: "Зөрчилтэй нотолгоог шийдвэрлэх",
    action: "Зөрчилдөж байгаа хариулт, бүртгэл болон эх сурвалжийг дахин шалгаж, аль нотолгоо найдвартайг тогтоон нээлттэй зөрчлийг хаах.",
    deliverable: "Шийдвэрлэсэн нотолгооны бүртгэл",
    kpi: "Шийдвэрлэгдээгүй нотолгооны зөрчлийн тоо"
  };
}

function scopesOf(r: Recommendation): Array<{ findingId: string; categoryId: string; cellId: string }> {
  return r.affectedScopes?.length ? r.affectedScopes : [{ findingId: r.findingId, categoryId: r.categoryId, cellId: r.cellId }];
}

function directDependency(a: Recommendation, b: Recommendation, contract: any): boolean {
  const as = scopesOf(a);
  const bs = scopesOf(b);
  for (const sa of as) for (const sb of bs) {
    if ((contract.categoryGraph?.edges ?? []).some((e: any) => e.prerequisite === sa.categoryId && e.dependent === sb.categoryId)) return true;
    if (sa.categoryId === sb.categoryId && (contract.cellGraph?.edges ?? []).some((e: any) => e.prerequisite === sa.cellId && e.dependent === sb.cellId)) return true;
  }
  return false;
}

function dependencyAwareSort(items: Recommendation[], rootContract: any, threshold: number): Recommendation[] {
  return [...items].sort((a, b) => {
    const diff = Math.abs(a.priority - b.priority);
    if (diff < threshold) {
      if (directDependency(a, b, rootContract)) return -1;
      if (directDependency(b, a, rootContract)) return 1;
    }
    return b.priority - a.priority || a.id.localeCompare(b.id);
  });
}

function recommendationOwner(methodology: MethodologyDefinition, categoryId: string, cellId: string, defaultOwner: string): string {
  const auth = methodology.contracts.authority;
  const domain = auth?.domainAuthority?.[categoryId] ?? {};
  const construct = auth?.constructAuthority?.[cellId] ?? {};
  const fit = (roleId: string): number => Math.min(Number(domain[roleId] ?? 0), Number(construct[roleId] ?? 0));
  const defaultFit = fit(defaultOwner);
  let bestRole = defaultOwner;
  let bestFit = defaultFit;
  for (const role of auth?.roles ?? []) {
    if (!role?.id || role.id === "R11") continue; // External partners should not become internal owners automatically.
    const score = fit(role.id);
    if (score > bestFit) { bestFit = score; bestRole = role.id; }
  }
  // Preserve accountable category ownership unless another role is materially better suited to the construct.
  return bestRole !== defaultOwner && bestFit - defaultFit >= 0.20 ? bestRole : defaultOwner;
}

function mergeRecommendation(primary: Recommendation, other: Recommendation): Recommendation {
  const affectedScopes = [...new Map([...scopesOf(primary), ...scopesOf(other)].map(x => [`${x.findingId}:${x.categoryId}:${x.cellId}`, x])).values()];
  const affectedCategories = unique(affectedScopes.map(x => x.categoryId));
  const scored = [primary.currentCellScore, other.currentCellScore].filter((v): v is number => typeof v === "number");
  const currentCellScore = scored.length ? Math.min(...scored) : primary.currentCellScore;
  const targetCellScore = primary.targetCellScore === null
    ? null
    : Math.min(75, Math.max(60, (currentCellScore ?? 35) + 25));
  return {
    ...primary,
    currentCellScore,
    targetCellScore,
    objectiveMn: affectedCategories.length > 1
      ? `Ижил төрлийн сул талыг ${affectedCategories.length} холбогдох чиглэлд нэг стандартаар сайжруулах.`
      : primary.objectiveMn,
    sourceTraceIds: unique([...primary.sourceTraceIds, ...other.sourceTraceIds]),
    affectedScopes
  };
}


export interface RecommendationActionSelection {
  criticalActions: Recommendation[];
  evidenceActions: Recommendation[];
  planActions: Recommendation[];
}

function uniqueRecommendations(items: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  const out: Recommendation[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function assertRecommendationSelectionIntegrity(selection: RecommendationActionSelection): void {
  const all = [...selection.criticalActions, ...selection.evidenceActions];
  const ids = all.map(x => x.id);
  if (new Set(ids).size !== ids.length) throw new Error("Recommendation action selection contains duplicate IDs");
  for (const item of all) {
    if (!Number.isFinite(item.priority) || item.priority < 0 || item.priority > 100) throw new Error(`Recommendation ${item.id} has invalid priority`);
    if (!item.affectedScopes?.length) throw new Error(`Recommendation ${item.id} is missing affected scope`);
    if (!item.sourceTraceIds?.includes(`recommendation:${item.id}`)) throw new Error(`Recommendation ${item.id} is missing recommendation trace`);
    if (!item.sourceTraceIds?.includes(`root:${item.findingId}`)) throw new Error(`Recommendation ${item.id} is missing root-finding trace`);
  }
  const planIds = selection.planActions.map(x => x.id);
  if (new Set(planIds).size !== planIds.length) throw new Error("Recommendation plan selection contains duplicate IDs");
  for (const id of ids) if (!planIds.includes(id)) throw new Error(`Report recommendation ${id} is not included in the 365-day plan selection`);
}

/**
 * Authoritative selection for customer-facing recommendations.
 *
 * The five critical actions prefer execution/local-improvement actions and use
 * evidence actions only to fill remaining slots. Evidence actions used as
 * critical fillers are not duplicated in the separate evidence section. The
 * 365-day plan receives the exact union of both report sections so every action
 * shown to the customer is schedulable and traceable.
 */
export function selectRecommendationActions(
  recommendations: RecommendationResult,
  criticalLimit = 5,
  evidenceLimit = 2
): RecommendationActionSelection {
  const safeCriticalLimit = Math.max(0, Math.floor(criticalLimit));
  const safeEvidenceLimit = Math.max(0, Math.floor(evidenceLimit));
  const execution = recommendations.executionActions.slice(0, safeCriticalLimit);
  const evidenceFillCount = Math.max(0, safeCriticalLimit - execution.length);
  const evidenceFillers = recommendations.evidenceActions.slice(0, evidenceFillCount);
  const criticalActions = uniqueRecommendations([...execution, ...evidenceFillers]);
  const evidenceActions = recommendations.evidenceActions
    .slice(evidenceFillCount, evidenceFillCount + safeEvidenceLimit)
    .filter(item => !criticalActions.some(critical => critical.id === item.id));
  const planActions = uniqueRecommendations([...criticalActions, ...evidenceActions]);
  const selection = { criticalActions, evidenceActions, planActions };
  assertRecommendationSelectionIntegrity(selection);
  return selection;
}

function consolidate(items: Recommendation[], keyFor: (r: Recommendation) => string): Recommendation[] {
  const grouped = new Map<string, Recommendation>();
  for (const item of items) {
    const key = keyFor(item);
    const prev = grouped.get(key);
    if (!prev) { grouped.set(key, item); continue; }
    const executionRank = (r: Recommendation) => r.type === "EXECUTION" ? 2 : r.type === "LOCAL_IMPROVEMENT" ? 1 : 0;
    const itemWins = executionRank(item) > executionRank(prev) || (executionRank(item) === executionRank(prev) && item.priority > prev.priority);
    grouped.set(key, itemWins ? mergeRecommendation(item, prev) : mergeRecommendation(prev, item));
  }
  return [...grouped.values()];
}

export function buildRecommendations(
  methodology: MethodologyDefinition,
  snapshot: RuntimeSnapshot,
  rootResult: RootCauseResult,
  profileAnswers?: ProfileAnswer[]
): RecommendationResult {
  const contract = methodology.contracts.recommendation;
  const rootContract = methodology.contracts.rootCause;
  if (!contract || !rootContract) throw new Error("Missing recommendation/root-cause contracts");

  const capLevel = capacityLevel(profileAnswers);
  const selectedPurposeId = selectedPurpose(profileAnswers);
  const categoryObjective = new Map((contract.composition.categoryObjectives ?? []).map((x: any) => [x.category, x]));
  const intervention = new Map((contract.composition.cellInterventions ?? []).map((x: any) => [x.cell, x]));
  const purposeByCategory = new Map((methodology.contracts.purposes.mapping ?? []).map((x: any) => [x.category, x]));
  const capacityFactor = Number(contract.priority.capacityFactor[String(capLevel)] ?? 0.8);
  const effortEase = contract.priority.effortEase as Record<string, number>;
  const maxCategoryWeight = methodology.maxCategoryWeight || 3.4;

  const candidates: Recommendation[] = [];
  for (const finding of rootResult.findings) {
    const category = methodology.categories.find(c => c.id === finding.categoryId);
    const cell = snapshot.cells.get(`${finding.categoryId}:${finding.cellId}`);
    const objective: any = categoryObjective.get(finding.categoryId);
    const iv: any = intervention.get(finding.cellId);
    if (!category || !cell || !objective || !iv || cell.status === "NOT_APPLICABLE") continue;

    const types: RecommendationType[] = [];
    const evidence = Math.min(finding.categoryEvidenceFactor, finding.cellEvidenceFactor);
    const unresolved = cell.status === "UNRESOLVED" || finding.classification === "EVIDENCE_GAP";
    const conflicted = cell.status === "REVIEW_REQUIRED" || cell.hasHardContradiction;

    // Evidence problems must be resolved before this finding can generate an execution recommendation.
    if (conflicted) types.push("RESOLVE_EVIDENCE");
    else if (unresolved) types.push("COLLECT_EVIDENCE");
    else {
      if (["PRIMARY_ROOT_CAUSE", "CONTRIBUTING_CAUSE"].includes(finding.classification) && evidence >= Number(contract.eligibility.execution.minimumEvidenceFactor)) types.push("EXECUTION");
      if (finding.classification === "POSSIBLE_CAUSE") types.push("VALIDATE_CAUSE");
      if (finding.classification === "ISOLATED_WEAKNESS" && (finding.cellValue ?? 100) < Number(contract.eligibility.localImprovement.cellValueBelow) && cell.effectiveConfidence >= Number(contract.eligibility.localImprovement.minimumCellConfidence)) types.push("LOCAL_IMPROVEMENT");
    }

    for (const type of [...new Set(types)]) {
      if (finding.classification === "LIKELY_SYMPTOM" && type !== "COLLECT_EVIDENCE" && type !== "RESOLVE_EVIDENCE") continue;
      const purposeMap: any = purposeByCategory.get(finding.categoryId);
      const relevances = purposeMap?.relevance ?? {};
      const mappedRelevanceFallback = selectedPurposeId
        ? Number(relevances[selectedPurposeId] ?? 0)
        : Object.values(relevances).length
          ? (Object.values(relevances).reduce((s: number, v: any) => s + Number(v), 0) / Object.values(relevances).length)
          : 0;
      const selectedOutcomePriority = selectedPurposeId
        ? snapshot.categoryOutcomePriorities?.get(`${selectedPurposeId}:${finding.categoryId}`)?.relativePriority
        : null;
      const allOutcomePriorities = selectedPurposeId
        ? []
        : ["P1","P2","P3","P4","P5"]
            .map(pid => snapshot.categoryOutcomePriorities?.get(`${pid}:${finding.categoryId}`)?.relativePriority)
            .filter((value): value is number => typeof value === "number");
      const purposeEmphasis = selectedOutcomePriority ?? (allOutcomePriorities.length
        ? allOutcomePriorities.reduce((sum, value) => sum + value, 0) / allOutcomePriorities.length
        : mappedRelevanceFallback);
      const effort = Number(iv.effortLevel ?? 3);
      const feasibility = 0.70 * Number(effortEase[String(effort)] ?? 0.7) + 0.30 * capacityFactor;
      const components = {
        rootStrength: finding.rootStrength,
        severity: 0.60 * finding.cellSeverity + 0.40 * finding.categorySeverity,
        categoryImportance: clamp(category.weightPct / maxCategoryWeight),
        purposeEmphasis: clamp(purposeEmphasis),
        evidence: clamp(evidence),
        feasibility: clamp(feasibility)
      };
      let priority = 100 * (
        0.30 * components.rootStrength +
        0.20 * components.severity +
        0.15 * components.categoryImportance +
        0.15 * components.purposeEmphasis +
        0.10 * components.evidence +
        0.10 * components.feasibility
      );
      if (type === "RESOLVE_EVIDENCE") priority += Number(contract.eligibility.resolveEvidence.priorityBoost ?? 15);
      if (type === "VALIDATE_CAUSE") priority = Math.min(priority, Number(contract.eligibility.validateCause.priorityCap ?? 70));
      if (type === "LOCAL_IMPROVEMENT") priority = Math.min(priority, Number(contract.eligibility.localImprovement.priorityCap ?? 55));
      priority = clamp100(priority);

      const opBase = (type === "EXECUTION" || type === "LOCAL_IMPROVEMENT")
        ? { title: iv.title, action: iv.action, deliverable: iv.deliverable, kpi: iv.kpi }
        : evidenceOperation(type);
      const op = (type === "EXECUTION" || type === "LOCAL_IMPROVEMENT")
        ? opBase
        : { ...opBase, title: `${opBase.title} — ${category.nameMn}` };
      const target = type === "EXECUTION" || type === "LOCAL_IMPROVEMENT"
        ? Math.min(75, Math.max(60, (finding.cellValue ?? 35) + 25))
        : null;
      const code = type === "EXECUTION" || type === "LOCAL_IMPROVEMENT" ? String(iv.code) : type;
      const id = `REC-${type}-${finding.categoryId}-${finding.cellId}-${code}`;
      candidates.push({
        id,
        findingId: finding.id,
        type,
        categoryId: finding.categoryId,
        cellId: finding.cellId,
        interventionCode: code,
        titleMn: op.title,
        objectiveMn: String(objective.objective),
        actionMn: op.action,
        deliverableMn: op.deliverable,
        kpiMn: op.kpi,
        ownerRoleId: recommendationOwner(methodology, finding.categoryId, finding.cellId, String(objective.defaultOwner)),
        sponsorRoleId: String(objective.sponsor),
        currentCellScore: finding.cellValue,
        targetCellScore: target,
        targetIsPrediction: false,
        effortLevel: effort,
        priority,
        priorityBand: priorityBand(priority),
        components,
        sourceTraceIds: [...finding.sourceTraceIds, `recommendation:${id}`],
        affectedScopes: [{ findingId: finding.id, categoryId: finding.categoryId, cellId: finding.cellId }],
        causalInterpretation: "DIAGNOSTIC_HYPOTHESIS_NOT_CAUSAL"
      });
    }
  }

  // Keep one visible action for identical intervention templates across categories, while preserving all source traces/scopes.
  let execution = consolidate(candidates.filter(x => x.type === "EXECUTION" || x.type === "LOCAL_IMPROVEMENT"), x => x.interventionCode);
  const evidenceActions = consolidate(candidates.filter(x => x.type === "VALIDATE_CAUSE" || x.type === "COLLECT_EVIDENCE" || x.type === "RESOLVE_EVIDENCE"), x => `${x.type}:${x.categoryId}`);

  const suppressed: Recommendation[] = [];
  if (contract.eligibility.suppressSymptomWhenUpstreamSelected) {
    const selectedRootKeys = new Set(execution.flatMap(x => scopesOf(x).map(s => `${s.categoryId}:${s.cellId}`)));
    execution = execution.filter(item => {
      const finding = rootResult.findings.find(f => f.id === item.findingId);
      if (!finding || finding.classification !== "LIKELY_SYMPTOM") return true;
      const hasUpstream = rootResult.findings.some(f =>
        selectedRootKeys.has(`${f.categoryId}:${f.cellId}`) &&
        (f.downstreamCategoryIds.includes(item.categoryId) || (f.categoryId === item.categoryId && f.downstreamCellIds.includes(item.cellId)))
      );
      if (hasUpstream) {
        item.suppressedReason = "UPSTREAM_ROOT_SELECTED";
        suppressed.push(item);
        return false;
      }
      return true;
    });
  }

  const contractExecutionLimit = Number(contract.ordering.maxExecutionActions ?? 5);
  // The customer report contract always exposes five grounded next actions.
  // Capacity controls scheduling/concurrency in the 365-day plan; it must not
  // hide important next actions from a low-capacity business.
  const visibleExecutionLimit = Math.max(1, contractExecutionLimit);

  execution = dependencyAwareSort(execution, rootContract, Number(contract.ordering.dependencyPrecedenceWhenPriorityDifferenceBelow ?? 10))
    .slice(0, visibleExecutionLimit);

  // If the diagnosis is not yet strong enough to support five execution/local
  // interventions, evidence-resolution work is itself the correct grounded next
  // action. Retain enough evidence actions to fill the five-action report contract.
  const baseEvidenceLimit = Number(contract.ordering.maxValidationEvidenceActions ?? 2);
  const evidenceFillNeeded = Math.max(0, contractExecutionLimit - execution.length);
  const visibleEvidenceLimit = Math.max(baseEvidenceLimit, evidenceFillNeeded);
  const evidence = dependencyAwareSort(evidenceActions, rootContract, Number(contract.ordering.dependencyPrecedenceWhenPriorityDifferenceBelow ?? 10))
    .slice(0, visibleEvidenceLimit);

  return {
    version: contract.version,
    capacityLevel: capLevel,
    selectedPurposeId,
    candidates: candidates.sort((a,b) => b.priority-a.priority || a.id.localeCompare(b.id)),
    executionActions: execution,
    evidenceActions: evidence,
    suppressed
  };
}
