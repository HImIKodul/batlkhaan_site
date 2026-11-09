import type {
  MethodologyDefinition,
  CategoryDef,
  CellDef,
  QuestionDef,
  SecondaryEdge,
  EngineContracts,
  AdaptiveRuntimePolicyDefinition,
  QuestionRuntimePolicyDef,
  CellRuntimePolicyDef,
  RuntimeRuleDef,
  RuntimeScorePatternDef,
  ModuleDef
} from "../engine/types.js";
import { questionKey } from "../engine/utils.js";
import { resolveQuestionBankVersion } from "../methodology-provenance.js";
import { validateHierarchicalWeights } from "../engine/weighting.js";

/**
 * Immutable methodology projection cache. MethodologyVersion rows are immutable once ACTIVE,
 * therefore a process-local cache is safe and avoids reading 12,288 questions per answer.
 */
const sharedCachesByDb = new WeakMap<object, Map<string, Promise<MethodologyDefinition>>>();

function sharedCacheFor(db: any): Map<string, Promise<MethodologyDefinition>> {
  if ((typeof db !== "object" && typeof db !== "function") || db === null) return new Map();
  const key = db as object;
  let cache = sharedCachesByDb.get(key);
  if (!cache) {
    cache = new Map<string, Promise<MethodologyDefinition>>();
    sharedCachesByDb.set(key, cache);
  }
  return cache;
}

export class MethodologyDefinitionCache {
  private readonly cache: Map<string, Promise<MethodologyDefinition>>;

  constructor(private readonly db: any) {
    this.cache = sharedCacheFor(db);
  }

  get(methodologyVersionId: string): Promise<MethodologyDefinition> {
    let current = this.cache.get(methodologyVersionId);
    if (!current) {
      const loading = this.load(methodologyVersionId);
      current = loading;
      this.cache.set(methodologyVersionId, loading);
      // MMRI-21: never keep a rejected load; evict only if the entry is still this promise (not a newer one).
      loading.catch(() => { if (this.cache.get(methodologyVersionId) === loading) this.cache.delete(methodologyVersionId); });
    }
    return current;
  }

  clear(methodologyVersionId?: string): void {
    if (methodologyVersionId) this.cache.delete(methodologyVersionId); else this.cache.clear();
  }

  private async load(methodologyVersionId: string): Promise<MethodologyDefinition> {
    const [
      methodology,
      modulesRaw,
      categoriesRaw,
      cellsRaw,
      concreteCellsRaw,
      questionsRaw,
      contractsRaw,
      questionRuntimePoliciesRaw,
      cellRuntimePoliciesRaw,
      runtimeRulesRaw,
      scorePatternsRaw
    ] = await Promise.all([
      this.db.methodologyVersion.findUnique({ where: { id: methodologyVersionId } }),
      this.db.module.findMany({ where: { methodologyVersionId }, orderBy: { orderIndex: "asc" } }),
      this.db.category.findMany({ where: { methodologyVersionId }, orderBy: { orderIndex: "asc" } }),
      this.db.cellTemplate.findMany({ where: { methodologyVersionId }, orderBy: { orderIndex: "asc" } }),
      this.db.diagnosticCell.findMany({ where: { methodologyVersionId } }),
      this.db.question.findMany({
        where: { methodologyVersionId },
        include: {
          options: { orderBy: { optionIndex: "asc" } },
          secondaryTargets: true
        },
        orderBy: { sourceRow: "asc" }
      }),
      this.db.methodologyContract.findMany({ where: { methodologyVersionId } }),
      this.db.questionRuntimePolicy.findMany({ where: { methodologyVersionId } }),
      this.db.cellRuntimePolicy.findMany({ where: { methodologyVersionId } }),
      this.db.runtimeRuleDefinition.findMany({ where: { methodologyVersionId } }),
      this.db.runtimeScorePattern.findMany({ where: { methodologyVersionId } })
    ]);
    if (!methodology) throw new Error(`Methodology ${methodologyVersionId} not found`);
    if (methodology.status !== "ACTIVE") throw new Error(`Methodology ${methodologyVersionId} is not ACTIVE`);

    const contractsBySource: Record<string, any> = Object.fromEntries(contractsRaw.map((c: any) => [c.sourceName, c.definition]));
    const required = (name: string): any => {
      const value = contractsBySource[name];
      if (!value) throw new Error(`Missing imported contract ${name}`);
      return value;
    };
    const companyProfile = required("MMRI_FINAL_Company_Profile_Config.json");
    const baseByCategory = new Map((companyProfile.categoryApplicability ?? []).map((x: any) => [x.category, Number(x.baseRelevance)]));

    const categoryExternalByDb = new Map<string, string>(categoriesRaw.map((c: any) => [c.id, c.externalId]));
    const concreteByDb = new Map<string, any>(concreteCellsRaw.map((c: any) => [c.id, c]));
    const templateExternalByDb = new Map<string, string>(cellsRaw.map((c: any) => [c.id, c.externalId]));
    const questionExternalByDb = new Map<string, string>(questionsRaw.map((q: any) => [q.id, q.externalId]));

    const modules: ModuleDef[] = modulesRaw.map((m: any) => ({
      id: m.id,
      code: m.code,
      nameMn: m.nameMn,
      weightPct: Number(m.weightPct),
      orderIndex: m.orderIndex
    }));

    const categories: CategoryDef[] = categoriesRaw.map((c: any) => ({
      id: c.externalId,
      nameMn: c.nameMn,
      weightPct: Number(c.categoryWeightPct),
      module: c.moduleId,
      orderIndex: c.orderIndex,
      baseProfileRelevance: Number(baseByCategory.get(c.externalId) ?? 1)
    }));
    const cells: CellDef[] = cellsRaw.map((c: any) => ({
      id: c.externalId,
      nameMn: c.nameMn,
      weightPct: Number(c.weightPct),
      naPolicy: c.naPolicy,
      orderIndex: c.orderIndex
    }));
    const cellWeightByCategoryCell = new Map<string, number>();
    for (const concrete of concreteCellsRaw) {
      if (concrete.weightPctOverride == null) continue;
      const categoryExternalId = categoryExternalByDb.get(concrete.categoryId);
      const cellExternalId = templateExternalByDb.get(concrete.cellTemplateId);
      if (categoryExternalId && cellExternalId) cellWeightByCategoryCell.set(`${categoryExternalId}:${cellExternalId}`, Number(concrete.weightPctOverride));
    }

    validateHierarchicalWeights(modules, categories, cells);

    const questions: QuestionDef[] = questionsRaw.map((q: any) => {
      const categoryId = categoryExternalByDb.get(q.categoryId);
      const concrete = concreteByDb.get(q.primaryCellId);
      const cellId = concrete ? templateExternalByDb.get(concrete.cellTemplateId) : undefined;
      if (!categoryId || !cellId) throw new Error(`Broken question projection ${q.id}`);
      return {
        id: q.externalId,
        categoryId,
        cellId,
        path: q.path,
        sourceKind: q.sourceKind,
        sourceRow: q.sourceRow,
        textMn: q.textMn,
        scoringProfileCode: q.scoringProfileCode,
        options: q.options.map((o: any) => ({ optionIndex: o.optionIndex, labelMn: o.labelMn, score: o.score === null ? null : Number(o.score), state: o.state })),
        secondaryTargets: q.secondaryTargets.map((t: any) => {
          const target = concreteByDb.get(t.targetCellId);
          const targetCellId = target ? templateExternalByDb.get(target.cellTemplateId) : undefined;
          if (!targetCellId) throw new Error(`Broken secondary target ${t.id}`);
          return { targetCellId, coefficient: Number(t.coefficient), relation: t.relationCode };
        })
      };
    });

    const manyToMany = required("MMRI_FINAL_Many_to_Many_Mapping.json");
    const secondaryEdges: SecondaryEdge[] = manyToMany.edges.map((e: any) => ({ sourceCellId: e.sourceCell, targetCellId: e.targetCell, coefficient: Number(e.coefficient), relation: e.relation }));
    const incomingEdgesByTarget = new Map<string, SecondaryEdge[]>();
    for (const edge of secondaryEdges) {
      const list = incomingEdgesByTarget.get(edge.targetCellId) ?? [];
      list.push(edge);
      incomingEdgesByTarget.set(edge.targetCellId, list);
    }

    const runtimePolicy = buildRuntimePolicy({
      methodologyVersionId,
      questionsRaw,
      concreteCellsRaw,
      questionRuntimePoliciesRaw,
      cellRuntimePoliciesRaw,
      runtimeRulesRaw,
      scorePatternsRaw,
      questionExternalByDb,
      categoryExternalByDb,
      templateExternalByDb
    });

    const contracts: EngineContracts = {
      confidence: required("MMRI_FINAL_Confidence_Contract.json"),
      scoring: required("MMRI_FINAL_Scoring_Contract.json"),
      authority: required("MMRI_FINAL_Respondent_Authority_Contract.json"),
      naDnk: required("MMRI_FINAL_NA_DNK_Contract.json"),
      manyToMany,
      contradiction: required("MMRI_FINAL_Contradiction_Contract.json"),
      routing: required("MMRI_FINAL_Adaptive_Routing_Contract.json"),
      profileRelevance: required("MMRI_FINAL_Profile_Category_Relevance.json"),
      companyProfile,
      purposes: required("MMRI_FINAL_Five_Purpose_Mapping.json"),
      rootCause: required("MMRI_FINAL_Root_Cause_Dependency_Contract.json"),
      recommendation: required("MMRI_FINAL_Recommendation_Engine_Contract.json"),
      actionPlan: required("MMRI_FINAL_365_Day_Action_Plan_Contract.json"),
      report: required("MMRI_FINAL_Report_Contract.json"),
      aiGeneration: required("MMRI_FINAL_AI_Generation_Contract.json")
    };

    if (!methodology.bundleSha256) throw new Error(`Methodology ${methodology.version} has no bundleSha256; refusing to load an unpinned bundle.`);
    return {
      version: methodology.version,
      bundleSha256: methodology.bundleSha256,
      questionBankVersion: resolveQuestionBankVersion({ domainCode: methodology.domainCode, version: methodology.version, validation: methodology.validation }),
      domainCode: (methodology.domainCode ?? "marketing") as MethodologyDefinition["domainCode"],
      engineKind: methodology.domainCode === "marketing" ? "MARKETING_V3" : "BUSINESSMRI_V2",
      cellWeightByCategoryCell,
      modules,
      categories,
      cells,
      questions,
      questionById: new Map(questions.map(q => [q.id,q])),
      questionByCategoryCellPath: new Map(questions.map(q => [questionKey(q.categoryId,q.cellId,q.path),q])),
      secondaryEdges,
      incomingEdgesByTarget,
      contracts,
      runtimePolicy,
      maxCategoryWeight: Math.max(...categories.map(c => c.weightPct)),
      maxScoredCellWeight: cellWeightByCategoryCell.size ? Math.max(...cellWeightByCategoryCell.values()) : Math.max(...cells.filter(c => c.id !== "C01").map(c => c.weightPct))
    };
  }
}


function buildRuntimePolicy(args: {
  methodologyVersionId: string;
  questionsRaw: any[];
  concreteCellsRaw: any[];
  questionRuntimePoliciesRaw: any[];
  cellRuntimePoliciesRaw: any[];
  runtimeRulesRaw: any[];
  scorePatternsRaw: any[];
  questionExternalByDb: Map<string, string>;
  categoryExternalByDb: Map<string, string>;
  templateExternalByDb: Map<string, string>;
}): AdaptiveRuntimePolicyDefinition | undefined {
  const {
    methodologyVersionId,
    questionsRaw,
    concreteCellsRaw,
    questionRuntimePoliciesRaw,
    cellRuntimePoliciesRaw,
    runtimeRulesRaw,
    scorePatternsRaw,
    questionExternalByDb,
    categoryExternalByDb,
    templateExternalByDb
  } = args;

  const anyRuntimeRows = questionRuntimePoliciesRaw.length > 0 || cellRuntimePoliciesRaw.length > 0 || runtimeRulesRaw.length > 0 || scorePatternsRaw.length > 0;
  if (!anyRuntimeRows) return undefined;

  // Fail closed on partial imports. A methodology cannot run half old/half v13 adaptive metadata.
  if (questionRuntimePoliciesRaw.length !== questionsRaw.length) {
    throw new Error(`Methodology ${methodologyVersionId} has partial question runtime policy: ${questionRuntimePoliciesRaw.length}/${questionsRaw.length}`);
  }
  if (cellRuntimePoliciesRaw.length !== concreteCellsRaw.length) {
    throw new Error(`Methodology ${methodologyVersionId} has partial cell runtime policy: ${cellRuntimePoliciesRaw.length}/${concreteCellsRaw.length}`);
  }
  if (runtimeRulesRaw.length === 0) throw new Error(`Methodology ${methodologyVersionId} runtime rules are missing`);
  if (scorePatternsRaw.length === 0) throw new Error(`Methodology ${methodologyVersionId} runtime score patterns are missing`);

  const questionById = new Map<string, QuestionRuntimePolicyDef>();
  for (const row of questionRuntimePoliciesRaw) {
    const externalId = questionExternalByDb.get(row.questionId);
    if (!externalId) throw new Error(`Runtime policy references unknown question ${row.questionId}`);
    questionById.set(externalId, {
      questionId: externalId,
      questionRole: row.questionRole,
      scoreEligible: Boolean(row.scoreEligible),
      scoringMethod: row.scoringMethod,
      scoredOptionCount: Number(row.scoredOptionCount),
      scorePatternCode: row.scorePatternCode,
      directAskAllowed: Boolean(row.directAskAllowed),
      routingState: row.routingState,
      askStage: row.askStage,
      selectionPriority: Number(row.selectionPriority),
      isAnchor: Boolean(row.isAnchor),
      applicabilityGateKey: row.applicabilityGateKey,
      triggerRuleId: row.triggerRuleId,
      confidenceRuleId: row.confidenceRuleId,
      defaultAsk: Boolean(row.defaultAsk),
      stopRuleId: row.stopRuleId
    });
  }

  const cellByCategoryCell = new Map<string, CellRuntimePolicyDef>();
  for (const row of cellRuntimePoliciesRaw) {
    const concrete = concreteCellsRaw.find((c: any) => c.id === row.diagnosticCellId);
    if (!concrete) throw new Error(`Runtime policy references unknown diagnostic cell ${row.diagnosticCellId}`);
    const categoryId = categoryExternalByDb.get(concrete.categoryId);
    const cellId = templateExternalByDb.get(concrete.cellTemplateId);
    if (!categoryId || !cellId) throw new Error(`Broken runtime cell projection ${row.diagnosticCellId}`);
    cellByCategoryCell.set(`${categoryId}:${cellId}`, {
      categoryId,
      cellId,
      applicabilityMode: row.applicabilityMode,
      applicabilityGateKey: row.applicabilityGateKey,
      isAnchorCell: Boolean(row.isAnchorCell),
      directAskableQuestions: Number(row.directAskableQuestions),
      maxDirectQuestions: Number(row.maxDirectQuestions),
      indirectConfidenceCap: Number(row.indirectConfidenceCap),
      primaryConfidenceFloor: Number(row.primaryConfidenceFloor),
      lockThreshold: Number(row.lockThreshold),
      conflictGapThreshold: Number(row.conflictGapThreshold),
      stateModelId: row.stateModelId,
      valueRuleId: row.valueRuleId
    });
  }

  const ruleById = new Map<string, RuntimeRuleDef>(runtimeRulesRaw.map((row: any) => [row.ruleId, {
    ruleId: row.ruleId,
    ruleType: row.ruleType,
    definition: row.definition
  }]));
  const scorePatternByCode = new Map<string, RuntimeScorePatternDef>(scorePatternsRaw.map((row: any) => [row.code, {
    code: row.code,
    scoreEligible: Boolean(row.scoreEligible),
    scoredOptionCount: Number(row.scoredOptionCount),
    optionScores: Array.isArray(row.optionScores) ? row.optionScores.map((x: any) => x === null ? null : Number(x)) : []
  }]));

  return { enabled: true, questionById, cellByCategoryCell, ruleById, scorePatternByCode };
}
