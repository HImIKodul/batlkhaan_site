import type { MethodologyDefinition, RuntimeSnapshot } from "../engine/types.js";
import type { StrategyResult } from "../strategy/types.js";
import type {
  DiagnosisCapabilityResult, DiagnosisEvidenceSummary, DiagnosisMetricType, DiagnosisModuleResult,
  DiagnosisOutcomePriorityResult, DiagnosisPurposeResult, DiagnosisResultStatus, DiagnosisResultV13,
  DiagnosisStrength, DiagnosisWeakness, DiagnosisWeakCell
} from "./types.js";

const TERMINAL_OFFICIAL = new Set(["COMPLETED"]);
const WEAK_CELL_DISPLAY_LIMIT = 20;
const FINDING_TARGET = 5;
const STRENGTH_DISPLAY_LIMIT = 20;
const WEAKNESS_DISPLAY_LIMIT = 20;

function bandFor(methodology: MethodologyDefinition, score: number | null): string | null {
  if (score === null) return null;
  const row = (methodology.contracts.scoring.bands ?? []).find((b: any) => score >= Number(b.min) && score <= Number(b.max));
  return row?.label ?? null;
}

function metric(methodology: MethodologyDefinition, mode: "QUICK"|"FULL", status: string, partial: number|null, official: number|null) {
  const metricType: DiagnosisMetricType = mode === "QUICK"
    ? "QUICK_ESTIMATE"
    : official !== null && TERMINAL_OFFICIAL.has(status)
      ? "OFFICIAL_OVERALL_SCORE"
      : status === "COMPLETED_WITH_REVIEW" && (official !== null || partial !== null)
        ? "REVIEW_REQUIRED_SCORE"
        : "PARTIAL_TERMINAL";
  const resultStatus: DiagnosisResultStatus = metricType === "QUICK_ESTIMATE"
    ? "QUICK_ESTIMATE"
    : metricType === "OFFICIAL_OVERALL_SCORE"
      ? "OFFICIAL"
      : metricType === "REVIEW_REQUIRED_SCORE"
        ? "REVIEW_REQUIRED"
        : "PARTIAL_TERMINAL";
  const usesOfficialValue = (metricType === "OFFICIAL_OVERALL_SCORE" || metricType === "REVIEW_REQUIRED_SCORE") && official !== null;
  const score = usesOfficialValue ? official : partial;
  return {metricType,resultStatus,score,band:bandFor(methodology,score),usesOfficialValue};
}

function counter<T extends string>(values: T[]): Record<string,number> {
  const out: Record<string,number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

export interface BuildDiagnosisResultInput {
  assessmentId: string;
  companyId: string;
  companyName: string;
  methodologyBundleSha256: string;
  runtimeSnapshotHash: string;
  generatedAt: string;
  assessmentMode: "QUICK"|"FULL";
  assessmentStatus: string;
  routingState: string | null;
  methodology: MethodologyDefinition;
  snapshot: RuntimeSnapshot;
  strategy: StrategyResult;
  purposeLabels: Record<string,string>;
}

export function buildDiagnosisResultV13(input: BuildDiagnosisResultInput): DiagnosisResultV13 {
  const {methodology,snapshot,strategy} = input;
  const overallMetric = metric(methodology,input.assessmentMode,input.assessmentStatus,snapshot.overall.partialScore,snapshot.overall.officialScore);
  const moduleById = new Map(methodology.modules.map(m=>[m.id,m]));
  const categoryById = new Map(methodology.categories.map(c=>[c.id,c]));
  const cellById = new Map(methodology.cells.map(c=>[c.id,c]));

  const modules: DiagnosisModuleResult[] = methodology.modules
    .slice().sort((a,b)=>a.orderIndex-b.orderIndex)
    .map(m=>{
      const r=snapshot.modules.get(m.id);
      if(!r)throw new Error(`Diagnosis result missing module ${m.code}`);
      const mm=metric(methodology,input.assessmentMode,input.assessmentStatus,r.partialScore,r.officialScore);
      return {
        id:m.code,nameMn:m.nameMn,weightPct:m.weightPct,
        score:mm.score,partialScore:r.partialScore,officialScore:r.officialScore,confidence:r.confidence,coverage:r.coverage,band:mm.band,isOfficial:mm.metricType==="OFFICIAL_OVERALL_SCORE",
        effectiveOverallWeightPct:r.effectiveOverallWeightPct,contribution:mm.usesOfficialValue?r.officialContribution:r.partialContribution,
        applicableCategoryCount:r.applicableCategoryCount,finalizedCategoryCount:r.finalizedCategoryCount,unresolvedCategoryCount:r.unresolvedCategoryCount,reviewRequiredCategoryCount:r.reviewRequiredCategoryCount,
        categoryIds:methodology.categories.filter(c=>c.module===m.id).sort((a,b)=>a.orderIndex-b.orderIndex).map(c=>c.id)
      };
    });

  const capabilities: DiagnosisCapabilityResult[] = methodology.categories
    .slice().sort((a,b)=>a.orderIndex-b.orderIndex)
    .map(c=>{
      const r=snapshot.categories.get(c.id);
      if(!r)throw new Error(`Diagnosis result missing capability ${c.id}`);
      const module=moduleById.get(c.module);
      if(!module)throw new Error(`Diagnosis result cannot resolve module for ${c.id}`);
      const cm=metric(methodology,input.assessmentMode,input.assessmentStatus,r.partialScore,r.officialScore);
      return {
        id:c.id,nameMn:c.nameMn,moduleId:module.id,moduleCode:module.code,moduleNameMn:module.nameMn,weightPct:c.weightPct,
        score:cm.score,partialScore:r.partialScore,officialScore:r.officialScore,confidence:r.confidence,coverage:r.coverage,band:cm.band,isOfficial:cm.metricType==="OFFICIAL_OVERALL_SCORE",
        effectiveModuleWeightPct:r.effectiveModuleWeightPct,contributionToModule:cm.usesOfficialValue?r.officialContributionToModule:r.partialContributionToModule,
        confirmedNotApplicable:r.confirmedNotApplicable,applicableCellCount:r.applicableCellCount,finalizedCellCount:r.finalizedCellCount,unresolvedCellCount:r.unresolvedCellCount,reviewRequiredCellCount:r.reviewRequiredCellCount
      };
    });

  const rootByCell=new Map(strategy.rootCause.findings.map(f=>[`${f.categoryId}:${f.cellId}`,f]));
  const allCells=[...snapshot.cells.values()];
  const weakThreshold=Number(strategy.rootCause.weaknessThreshold ?? 60);
  const weakAll: DiagnosisWeakCell[] = allCells
    .filter(c=>c.status!=="NOT_APPLICABLE"&&c.effectiveScore!==null&&c.effectiveScore<weakThreshold)
    .map(c=>{
      const category=categoryById.get(c.categoryId)!;
      const module=moduleById.get(category.module)!;
      const cell=cellById.get(c.cellId)!;
      const root=rootByCell.get(`${c.categoryId}:${c.cellId}`);
      return {
        capabilityId:category.id,capabilityNameMn:category.nameMn,moduleId:module.id,moduleCode:module.code,moduleNameMn:module.nameMn,
        cellId:cell.id,cellNameMn:cell.nameMn,score:c.effectiveScore!,confidence:c.effectiveConfidence,confidenceState:c.confidenceState??null,status:c.status,
        severity:Math.max(0,(weakThreshold-c.effectiveScore!)/weakThreshold),rootClassification:root?.classification??null,rootStrength:root?.rootStrength??null,
        sourceTraceIds:root?.sourceTraceIds??[`cell:${category.id}:${cell.id}`]
      };
    })
    .sort((a,b)=>a.score-b.score||b.confidence-a.confidence||a.capabilityId.localeCompare(b.capabilityId)||a.cellId.localeCompare(b.cellId));

  const weakByKey=new Map(weakAll.map(x=>[`${x.capabilityId}:${x.cellId}`,x]));
  const validatedWeakAll=allCells
    .filter(c=>c.status==="DIRECT_FINAL"&&c.confidenceState==="LOCKED"&&!c.hasHardContradiction&&c.effectiveScore!==null&&c.effectiveScore<weakThreshold&&c.effectiveConfidence>=0.8)
    .map(c=>weakByKey.get(`${c.categoryId}:${c.cellId}`))
    .filter((x): x is DiagnosisWeakCell=>Boolean(x));
  const validatedWeakKeys=new Set(validatedWeakAll.map(x=>`${x.capabilityId}:${x.cellId}`));
  const provisionalWeakAll=weakAll.filter(x=>!validatedWeakKeys.has(`${x.capabilityId}:${x.cellId}`));

  const minStrengthScore=Number(methodology.contracts.report.strengthEligibility.minimumScore??80);
  const minStrengthConfidence=Number(methodology.contracts.report.strengthEligibility.minimumConfidence??0.8);
  const minStrengthCoverage=Number(methodology.contracts.report.strengthEligibility.minimumCoverage??0.7);
  const strengthsAll: DiagnosisStrength[] = capabilities
    .filter(c=>c.score!==null&&(c.confidence??0)>=minStrengthConfidence&&(c.coverage??0)>=minStrengthCoverage&&c.score>=minStrengthScore&&!c.confirmedNotApplicable&&c.reviewRequiredCellCount===0&&c.unresolvedCellCount===0)
    .map(c=>({capabilityId:c.id,capabilityNameMn:c.nameMn,moduleId:c.moduleId,moduleCode:c.moduleCode,moduleNameMn:c.moduleNameMn,score:c.score!,confidence:c.confidence!,coverage:c.coverage!,sourceTraceIds:[`category:${c.id}`],basis:"VALIDATED" as const}))
    .sort((a,b)=>b.score-a.score||b.confidence-a.confidence||a.capabilityId.localeCompare(b.capabilityId));

  const weaknessEligibility=(methodology.contracts.report.weaknessEligibility??methodology.contracts.report.strengthEligibility??{});
  const minWeakConfidence=Number(weaknessEligibility.minimumConfidence??0.8);
  const minWeakCoverage=Number(weaknessEligibility.minimumCoverage??0.7);
  const weaknessesAll: DiagnosisWeakness[] = capabilities
    .filter(c=>c.score!==null&&(c.confidence??0)>=minWeakConfidence&&(c.coverage??0)>=minWeakCoverage&&c.score<weakThreshold&&!c.confirmedNotApplicable&&c.reviewRequiredCellCount===0&&c.unresolvedCellCount===0)
    .map(c=>({capabilityId:c.id,capabilityNameMn:c.nameMn,moduleId:c.moduleId,moduleCode:c.moduleCode,moduleNameMn:c.moduleNameMn,score:c.score!,confidence:c.confidence!,coverage:c.coverage!,severity:Math.max(0,(weakThreshold-c.score!)/Math.max(1,weakThreshold)),sourceTraceIds:[`category:${c.id}`],basis:"VALIDATED" as const}))
    .sort((a,b)=>a.score-b.score||b.confidence-a.confidence||a.capabilityId.localeCompare(b.capabilityId));

  // Quick estimates rarely reach the evidence thresholds. Rather than reporting no strengths/weaknesses, complete the list
  // to FINDING_TARGET from the actual capability scores, flagged RELATIVE_RANK so it is never presented as validated.
  const scoredCapabilities=capabilities.filter(c=>c.score!==null&&!c.confirmedNotApplicable);
  const rankedStrengthIds=new Set(strengthsAll.map(x=>x.capabilityId));
  const validatedWeakIds=new Set(weaknessesAll.map(x=>x.capabilityId));
  // MMRI-03: relative-rank strengths must be disjoint from validated weaknesses and not below the weakness threshold (fewer strengths is acceptable).
  const strengthExtras=scoredCapabilities.filter(c=>!rankedStrengthIds.has(c.id)&&!validatedWeakIds.has(c.id)&&c.score!>=weakThreshold).sort((a,b)=>b.score!-a.score!||(b.confidence??0)-(a.confidence??0)||a.id.localeCompare(b.id)).slice(0,Math.max(0,FINDING_TARGET-strengthsAll.length));
  strengthExtras.forEach(c=>{rankedStrengthIds.add(c.id);strengthsAll.push({capabilityId:c.id,capabilityNameMn:c.nameMn,moduleId:c.moduleId,moduleCode:c.moduleCode,moduleNameMn:c.moduleNameMn,score:c.score!,confidence:c.confidence??0,coverage:c.coverage??0,sourceTraceIds:[`category:${c.id}`],basis:"RELATIVE_RANK"})});
  const rankedWeaknessIds=new Set(weaknessesAll.map(x=>x.capabilityId));
  const weaknessExtras=scoredCapabilities.filter(c=>!rankedWeaknessIds.has(c.id)&&!rankedStrengthIds.has(c.id)).sort((a,b)=>a.score!-b.score!||(b.confidence??0)-(a.confidence??0)||a.id.localeCompare(b.id)).slice(0,Math.max(0,FINDING_TARGET-weaknessesAll.length));
  weaknessExtras.forEach(c=>{weaknessesAll.push({capabilityId:c.id,capabilityNameMn:c.nameMn,moduleId:c.moduleId,moduleCode:c.moduleCode,moduleNameMn:c.moduleNameMn,score:c.score!,confidence:c.confidence??0,coverage:c.coverage??0,severity:Math.max(0,(weakThreshold-c.score!)/Math.max(1,weakThreshold)),sourceTraceIds:[`category:${c.id}`],basis:"RELATIVE_RANK"})});

  const confidenceStates=allCells.map(c=>c.confidenceState??(c.status==="NOT_APPLICABLE"?"NOT_APPLICABLE":"UNASSESSED"));
  const evidence: DiagnosisEvidenceSummary = {
    totalCells:allCells.length,
    applicableCells:allCells.filter(c=>c.status!=="NOT_APPLICABLE").length,
    knownCells:allCells.filter(c=>c.status!=="NOT_APPLICABLE"&&c.effectiveScore!==null).length,
    unknownCells:allCells.filter(c=>c.status!=="NOT_APPLICABLE"&&c.effectiveScore===null).length,
    notApplicableCells:allCells.filter(c=>c.status==="NOT_APPLICABLE").length,
    lockedCells:confidenceStates.filter(s=>s==="LOCKED").length,
    validatedCells:confidenceStates.filter(s=>s==="VALIDATED").length,
    estimatedCells:confidenceStates.filter(s=>s==="ESTIMATED").length,
    reviewRequiredCells:allCells.filter(c=>c.status==="REVIEW_REQUIRED").length,
    contradictionCells:allCells.filter(c=>c.hasHardContradiction).length,
    confidenceStateCounts:counter(confidenceStates),statusCounts:counter(allCells.map(c=>c.status)),
    weakCellCount:weakAll.length,validatedWeakCellCount:validatedWeakAll.length,provisionalWeakCellCount:provisionalWeakAll.length,weakCells:validatedWeakAll.slice(0,WEAK_CELL_DISPLAY_LIMIT),provisionalWeakCells:provisionalWeakAll.slice(0,WEAK_CELL_DISPLAY_LIMIT)
  };

  const businessOutcomes: DiagnosisPurposeResult[]=["P1","P2","P3","P4","P5"].map(id=>{
    const p=snapshot.purposes.get(id); if(!p)throw new Error(`Diagnosis result missing business outcome ${id}`);
    const pm=metric(methodology,input.assessmentMode,input.assessmentStatus,p.partialScore,p.officialScore);
    return {id,nameMn:input.purposeLabels[id]??id,score:pm.score,partialScore:p.partialScore,officialScore:p.officialScore,confidence:p.confidence,coverage:p.coverage,band:pm.band,isOfficial:pm.metricType==="OFFICIAL_OVERALL_SCORE"};
  });

  const businessOutcomePriorities: DiagnosisOutcomePriorityResult[]=["P1","P2","P3","P4","P5"].map(id=>{
    const p=snapshot.outcomePriorities.get(id); if(!p)throw new Error(`Diagnosis result missing outcome priority ${id}`);
    return {
      id,nameMn:input.purposeLabels[id]??id,...p,
      topCategories:p.topPriorityCategoryIds.map(categoryId=>{
        const detail=snapshot.categoryOutcomePriorities.get(`${id}:${categoryId}`); if(!detail)throw new Error(`Missing outcome priority ${id}:${categoryId}`);
        return {...detail,nameMn:categoryById.get(categoryId)?.nameMn??categoryId};
      }),
      interpretation:"DIAGNOSTIC_PRIORITY_NOT_CAUSAL_LIFT"
    };
  });

  const hardContradictions=snapshot.contradictions.filter(c=>c.type==="HARD").length;
  const warnings:string[]=[];
  if(input.assessmentMode==="QUICK")warnings.push("Энэ нь түргэвчилсэн үнэлгээний тооцоолсон үр дүн бөгөөд албан ёсны бүрэн оноо биш.");
  if(input.routingState==="QUICK_LIMIT_REACHED")warnings.push("Түргэвчилсэн үнэлгээ тухайн үнэлгээний асуултын хязгаарт хүрсэн бөгөөд зарим нотолгоо шийдэгдээгүй байж болно.");
  if(input.assessmentStatus==="COMPLETED_WITH_REVIEW")warnings.push("Энэ дүн нягтлах шаардлагатай төлөвтэй. Тоон үнэлгээг урьдчилсан байдлаар ашиглаж болох боловч нягтлал дуусахаас өмнө баталгаажсан эцсийн үр дүн гэж ангилахгүй.");
  if(input.assessmentMode==="QUICK"&&(snapshot.overall.confidence??0)<0.8)warnings.push("Түргэвчилсэн үнэлгээний хамралт 100%-д хүрсэн байсан ч итгэлцлийн түвшин нь баталгаажсан бүрэн үнэлгээнээс доогуур байж болно.");
  if(evidence.reviewRequiredCells>0)warnings.push(`${evidence.reviewRequiredCells} нүд нягтлах шаардлагатай төлөвтэй байна.`);
  if(hardContradictions>0)warnings.push(`${hardContradictions} ноцтой зөрчил нээлттэй буюу шийдвэрлэх шаардлагатай байна.`);
  if((snapshot.overall.coverage??0)<1)warnings.push("Үнэлгээний хамрах хүрээ 100%-д хүрээгүй тул хамралтыг онооноос тусад нь тайлбарлана.");
  if(input.assessmentStatus==="EXHAUSTED"&&snapshot.overall.officialScore===null)warnings.push("Нотолгооны замууд дууссан боловч бүх хамаарах хэсэг албан ёсны оноонд хүрээгүй.");

  return {
    schemaVersion:"MMRI-DIAGNOSIS-RESULT-1.0",resultHash:"",assessmentId:input.assessmentId,companyId:input.companyId,companyName:input.companyName,
    methodologyVersion:methodology.version,methodologyBundleSha256:input.methodologyBundleSha256,mode:input.assessmentMode,status:input.assessmentStatus,routingState:input.routingState,
    resultStatus:overallMetric.resultStatus,metricType:overallMetric.metricType,generatedAt:input.generatedAt,
    overall:{score:overallMetric.score,partialScore:snapshot.overall.partialScore,officialScore:snapshot.overall.officialScore,confidence:snapshot.overall.confidence,coverage:snapshot.overall.coverage,band:overallMetric.band,isOfficial:overallMetric.metricType==="OFFICIAL_OVERALL_SCORE",applicableCategoryCount:snapshot.overall.applicableCategoryCount,completeCategoryCount:snapshot.overall.completeCategoryCount,applicableModuleCount:snapshot.overall.applicableModuleCount,completeModuleCount:snapshot.overall.completeModuleCount,aggregationVersion:snapshot.overall.aggregationVersion},
    modules,capabilities,evidence,strengths:{totalCount:strengthsAll.length,items:strengthsAll.slice(0,STRENGTH_DISPLAY_LIMIT)},weaknesses:{totalCount:weaknessesAll.length,items:weaknessesAll.slice(0,WEAKNESS_DISPLAY_LIMIT)},
    rootCauses:{weaknessThreshold:weakThreshold,totalCount:strategy.rootCause.findings.length,selected:strategy.rootCause.selectedFindings,isProvisional:overallMetric.resultStatus!=="OFFICIAL",interpretation:"DIAGNOSTIC_HYPOTHESIS_NOT_CAUSAL"},
    businessOutcomes,businessOutcomePriorities,
    outcomeGuardrail:{causalFinancialLiftClaimAllowed:false,roiPredictionAllowed:false,meaning:"Ranks diagnostic gaps using locked methodology weights and five-business-outcome relevance. It does not predict causal financial lift or ROI."},
    quality:{openContradictions:snapshot.contradictions.length,hardContradictions,reviewRequiredCells:evidence.reviewRequiredCells,incompleteCoverage:(snapshot.overall.coverage??0)<1,quickLimitReached:input.routingState==="QUICK_LIMIT_REACHED",requiresReview:overallMetric.resultStatus==="REVIEW_REQUIRED"||evidence.reviewRequiredCells>0||hardContradictions>0,officialResultAvailable:overallMetric.resultStatus==="OFFICIAL",quickEstimate:overallMetric.resultStatus==="QUICK_ESTIMATE",warnings},
    trace:{methodologyVersion:methodology.version,methodologyBundleSha256:input.methodologyBundleSha256,runtimeSnapshotHash:input.runtimeSnapshotHash,generatedAt:input.generatedAt,versions:{scoring:methodology.contracts.scoring.version,confidence:methodology.contracts.confidence.version,aggregation:snapshot.overall.aggregationVersion,outcomePriority:"OUTCOME_PRIORITY_V13",rootCause:strategy.rootCause.version,recommendation:strategy.recommendations.version,actionPlan:strategy.actionPlan.version,report:methodology.contracts.report.version,aiGeneration:methodology.contracts.aiGeneration.version}},
    categories:capabilities,purposes:businessOutcomes,outcomePriorities:businessOutcomePriorities,openContradictions:snapshot.contradictions.length
  };
}
