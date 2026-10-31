import type { MethodologyBundle } from "../lib/bundle-types.js";
import { scoringForQuestion } from "../lib/question-scoring.js";
import type { AdaptiveRuntimePolicyDefinition, CategoryDef, CellDef, EngineContracts, MethodologyDefinition, ModuleDef, QuestionDef, SecondaryEdge } from "./types.js";
import { validateHierarchicalWeights } from "./weighting.js";
import { questionKey } from "./utils.js";

export function buildDefinition(bundle: MethodologyBundle): MethodologyDefinition {
  const version = bundle.methodologyVersion?.trim() || bundle.sourceMethodology.match(/v(\d+\.\d+\.\d+)/)?.[1] || "3.0.0";
  const domainCode = bundle.domainCode ?? "marketing";
  const engineKind = bundle.engineKind ?? (domainCode === "marketing" ? "MARKETING_V3" : "BUSINESSMRI_V2");
  const cellWeightByCategoryCell = new Map(bundle.cellInstances.filter(c => c.weightPctOverride != null).map(c => [`${c.categoryId}:${c.cellId}`, Number(c.weightPctOverride)]));
  const companyProfile = requiredContract(bundle, "MMRI_FINAL_Company_Profile_Config.json");
  const baseByCategory = new Map((companyProfile.categoryApplicability ?? []).map((x: any) => [x.category, Number(x.baseRelevance)]));

  const moduleNames = [...new Set(bundle.categories.map(c => c.Module))];
  const modules: ModuleDef[] = moduleNames.map((name, i) => {
    const row = bundle.categories.find(c => c.Module === name)!;
    return { id: name, code: `M${String(i + 1).padStart(2, "0")}`, nameMn: name, weightPct: Number(row["Module weight %"]), orderIndex: i + 1 };
  });

  const categories: CategoryDef[] = bundle.categories.map((c, i) => ({
    id: c.ID,
    nameMn: c.Category,
    module: c.Module,
    weightPct: Number(c["Category weight %"]),
    orderIndex: i + 1,
    baseProfileRelevance: Number(baseByCategory.get(c.ID) ?? 1)
  }));

  const naPoliciesByCell = new Map<string, Set<CellDef["naPolicy"]>>();
  for (const instance of bundle.cellInstances) {
    const policies = naPoliciesByCell.get(instance.cellId) ?? new Set<CellDef["naPolicy"]>();
    policies.add(instance.naPolicy);
    naPoliciesByCell.set(instance.cellId, policies);
  }
  const cells: CellDef[] = bundle.cellTemplates.map((c, i) => {
    const policies = [...(naPoliciesByCell.get(c.ID) ?? new Set<CellDef["naPolicy"]>())];
    if (policies.length !== 1) throw new Error(`Cell ${c.ID} has inconsistent or missing N/A policy across category instances`);
    return {
      id: c.ID,
      nameMn: c["Diagnostic cell"],
      weightPct: Number(c["Weight %"]),
      naPolicy: policies[0],
      orderIndex: i + 1
    };
  });

  const questions: QuestionDef[] = bundle.questions.map(q => {
    const explicit = q.explicitOptions;
    const scored = explicit?.length === q.optionsMn.length ? null : scoringForQuestion(q.cellId, q.optionsMn);
    const profileCodes = q.scoringProfileCode
      ? [q.scoringProfileCode]
      : [...new Set((scored ?? []).map(x => x.scoringProfileCode))];
    if (profileCodes.length !== 1) throw new Error(`Question ${q.questionId} resolves to multiple scoring profiles`);
    return {
      id: q.questionId,
      categoryId: q.categoryId,
      cellId: q.cellId,
      path: q.path,
      sourceKind: q.sourceKind,
      sourceRow: q.sourceRow,
      textMn: q.textMn,
      scoringProfileCode: profileCodes[0],
      options: q.optionsMn.map((labelMn, index) => ({
        optionIndex: index + 1,
        labelMn,
        score: explicit?.[index]?.score ?? scored?.[index]?.score ?? null,
        state: explicit?.[index]?.state ?? scored?.[index]?.state ?? "UNAVAILABLE"
      })),
      secondaryTargets: q.secondaryTargets.map(t => ({ targetCellId: t.targetCell, coefficient: Number(t.coefficient), relation: t.relation }))
    };
  });

  const questionById = new Map(questions.map(q => [q.id, q]));
  const questionByCategoryCellPath = new Map(questions.map(q => [questionKey(q.categoryId, q.cellId, q.path), q]));
  const secondaryEdges: SecondaryEdge[] = requiredContract(bundle, "MMRI_FINAL_Many_to_Many_Mapping.json").edges.map((e: any) => ({
    sourceCellId: e.sourceCell,
    targetCellId: e.targetCell,
    coefficient: Number(e.coefficient),
    relation: e.relation
  }));
  const incomingEdgesByTarget = new Map<string, SecondaryEdge[]>();
  for (const edge of secondaryEdges) {
    const list = incomingEdgesByTarget.get(edge.targetCellId) ?? [];
    list.push(edge);
    incomingEdgesByTarget.set(edge.targetCellId, list);
  }

  validateHierarchicalWeights(modules, categories, cells);

  const contracts: EngineContracts = {
    confidence: requiredContract(bundle, "MMRI_FINAL_Confidence_Contract.json"),
    scoring: requiredContract(bundle, "MMRI_FINAL_Scoring_Contract.json"),
    authority: requiredContract(bundle, "MMRI_FINAL_Respondent_Authority_Contract.json"),
    naDnk: requiredContract(bundle, "MMRI_FINAL_NA_DNK_Contract.json"),
    manyToMany: requiredContract(bundle, "MMRI_FINAL_Many_to_Many_Mapping.json"),
    contradiction: requiredContract(bundle, "MMRI_FINAL_Contradiction_Contract.json"),
    routing: requiredContract(bundle, "MMRI_FINAL_Adaptive_Routing_Contract.json"),
    profileRelevance: requiredContract(bundle, "MMRI_FINAL_Profile_Category_Relevance.json"),
    companyProfile,
    purposes: requiredContract(bundle, "MMRI_FINAL_Five_Purpose_Mapping.json"),
    rootCause: requiredContract(bundle, "MMRI_FINAL_Root_Cause_Dependency_Contract.json"),
    recommendation: engineKind === "BUSINESSMRI_V2"
      ? businessMriRecommendationContract(requiredContract(bundle, "MMRI_FINAL_Recommendation_Engine_Contract.json"), categories, cells)
      : requiredContract(bundle, "MMRI_FINAL_Recommendation_Engine_Contract.json"),
    actionPlan: requiredContract(bundle, "MMRI_FINAL_365_Day_Action_Plan_Contract.json"),
    report: requiredContract(bundle, "MMRI_FINAL_Report_Contract.json"),
    aiGeneration: requiredContract(bundle, "MMRI_FINAL_AI_Generation_Contract.json")
  };

  const runtimePolicy = runtimePolicyFromBundle(bundle);

  return {
    version,
    domainCode,
    engineKind,
    cellWeightByCategoryCell,
    modules,
    categories,
    cells,
    questions,
    questionById,
    questionByCategoryCellPath,
    secondaryEdges,
    incomingEdgesByTarget,
    contracts,
    runtimePolicy,
    maxCategoryWeight: Math.max(...categories.map(c => c.weightPct)),
    maxScoredCellWeight: cellWeightByCategoryCell.size ? Math.max(...cellWeightByCategoryCell.values()) : Math.max(...cells.filter(c => c.id !== "C01").map(c => c.weightPct))
  };
}

function businessMriRecommendationContract(contract: any, categories: CategoryDef[], cells: CellDef[]): any {
  const cloned = structuredClone(contract);
  const oldInterventions = new Map((cloned.composition?.cellInterventions ?? []).map((x: any) => [String(x.cell), x]));
  cloned.composition = cloned.composition ?? {};
  cloned.composition.categoryObjectives = categories.map(category => ({
    category: category.id,
    name: category.nameMn,
    weight: category.weightPct,
    defaultOwner: "R01",
    sponsor: "R01",
    objective: `${category.nameMn} чадавхын сул талыг бодит нотолгоонд тулгуурлан сайжруулж, хэрэгжилт ба хяналтыг тогтвортой болгох.`
  }));
  cloned.composition.cellInterventions = cells
    .filter(cell => cell.id !== "C01")
    .map(cell => {
      const previous: any = oldInterventions.get(cell.id);
      return {
        cell: cell.id,
        code: `IMPROVE_${cell.id}`,
        title: `${cell.nameMn} чадавхыг сайжруулах`,
        action: `${cell.nameMn}-ийн одоогийн сул талыг шалгаж, мөрдөх стандарт, хариуцагч, хэрэгжүүлэх алхам, хяналтын давтамжийг тодорхой болгон бодитоор хэрэгжүүлэх.`,
        deliverable: `${cell.nameMn}-ийн хэрэгжилтийн стандарт ба хяналтын бүртгэл`,
        kpi: `${cell.nameMn}-ийн батлагдсан хэрэгжилтийн түвшин`,
        effortLevel: Number(previous?.effortLevel ?? 3)
      };
    });
  return cloned;
}

function runtimePolicyFromBundle(bundle: MethodologyBundle): AdaptiveRuntimePolicyDefinition | undefined {
  const runtime = bundle.runtimePolicy;
  if (!runtime) return undefined;

  if (runtime.questionPolicies.length !== bundle.questions.length) {
    throw new Error(`Partial v13 question runtime policy: ${runtime.questionPolicies.length}/${bundle.questions.length}`);
  }
  if (runtime.cellPolicies.length !== bundle.cellInstances.length) {
    throw new Error(`Partial v13 cell runtime policy: ${runtime.cellPolicies.length}/${bundle.cellInstances.length}`);
  }

  return {
    enabled: true,
    questionById: new Map(runtime.questionPolicies.map(p => [p.questionId, {
      questionId: p.questionId,
      questionRole: p.questionRole,
      scoreEligible: Boolean(p.scoreEligible),
      scoringMethod: p.scoringMethod,
      scoredOptionCount: Number(p.scoredOptionCount),
      scorePatternCode: p.scorePatternCode,
      directAskAllowed: Boolean(p.directAskAllowed),
      routingState: p.routingState,
      askStage: p.askStage as any,
      selectionPriority: Number(p.selectionPriority),
      isAnchor: Boolean(p.isAnchor),
      applicabilityGateKey: p.applicabilityGateKey,
      triggerRuleId: p.triggerRuleId,
      confidenceRuleId: p.confidenceRuleId,
      defaultAsk: Boolean(p.defaultAsk),
      stopRuleId: p.stopRuleId
    }])),
    cellByCategoryCell: new Map(runtime.cellPolicies.map(p => [p.cellExternalId, {
      categoryId: p.cellExternalId.split(":")[0],
      cellId: p.cellExternalId.split(":")[1],
      applicabilityMode: p.applicabilityMode,
      applicabilityGateKey: p.applicabilityGateKey,
      isAnchorCell: Boolean(p.isAnchorCell),
      directAskableQuestions: Number(p.directAskableQuestions),
      maxDirectQuestions: Number(p.maxDirectQuestions),
      indirectConfidenceCap: Number(p.indirectConfidenceCap),
      primaryConfidenceFloor: Number(p.primaryConfidenceFloor),
      lockThreshold: Number(p.lockThreshold),
      conflictGapThreshold: Number(p.conflictGapThreshold),
      stateModelId: p.stateModelId,
      valueRuleId: p.valueRuleId
    }])),
    ruleById: new Map(runtime.rules.map(r => [r.ruleId, { ruleId: r.ruleId, ruleType: r.ruleType, definition: r.definition }])),
    scorePatternByCode: new Map(runtime.scorePatterns.map(p => [p.code, {
      code: p.code,
      scoreEligible: Boolean(p.scoreEligible),
      scoredOptionCount: Number(p.scoredOptionCount),
      optionScores: p.optionScores.map(x => x === null ? null : Number(x))
    }]))
  };
}

function requiredContract(bundle: MethodologyBundle, name: string): any {
  const contract = bundle.contracts[name];
  if (!contract) throw new Error(`Missing methodology contract ${name}`);
  return contract;
}
