import type { MethodologyDefinition, RuntimeSnapshot } from "../engine/types.js";
import type { StrategyResult } from "../strategy/types.js";
import { selectRecommendationActions } from "../strategy/recommendations.js";
import type { FrozenReportPayload, MetricType, ReportRisk, RoadmapRow, StrengthFinding, WeaknessFinding } from "./types.js";

export const MMRI_REPORT_FINDINGS_POLICY_VERSION="MMRI-REPORT-FINDINGS-1.0-FIVE-CATEGORY" as const;
const REPORT_CATEGORY_FINDING_LIMIT=5;

function bandFor(methodology: MethodologyDefinition, score: number | null): string | null {
  if (score === null) return null;
  const row = (methodology.contracts.scoring.bands ?? []).find((b: any) => score >= Number(b.min) && score <= Number(b.max));
  return row?.label ?? null;
}

function metricType(mode: "QUICK"|"FULL", status: string, officialScore: number | null): MetricType {
  if (mode === "QUICK") return "QUICK_ESTIMATE";
  if (officialScore !== null && status === "COMPLETED") return "OFFICIAL_OVERALL_SCORE";
  if ((officialScore !== null) && status === "COMPLETED_WITH_REVIEW") return "REVIEW_REQUIRED_SCORE";
  return "NONE";
}

function warningSet(mode: "QUICK"|"FULL", status: string, routingState: string | null, snapshot: RuntimeSnapshot): string[] {
  const warnings: string[] = [];
  if (mode === "QUICK") warnings.push("Энэ нь түргэвчилсэн үнэлгээний тооцоолсон үр дүн бөгөөд албан ёсны бүрэн оноо биш.");
  if (routingState === "QUICK_LIMIT_REACHED") warnings.push("Түргэвчилсэн үнэлгээ тухайн үнэлгээний асуултын хязгаарт хүрсэн бөгөөд зарим нотолгоо шийдэгдээгүй байж болно.");
  if (status === "COMPLETED_WITH_REVIEW") warnings.push("Энэ дүн нягтлах шаардлагатай төлөвтэй. Тоон үнэлгээг урьдчилсан байдлаар ашиглаж болох боловч нягтлал дуусахаас өмнө баталгаажсан эцсийн үр дүн гэж ангилахгүй.");
  if (status === "EXHAUSTED" && snapshot.overall.officialScore === null) warnings.push("Шаардлагатай нотолгооны замууд дууссан боловч бүх хамаарах хэсэг албан ёсны оноонд хүрээгүй.");
  return warnings;
}

export interface BuildReportPayloadInput {
  reportId: string;
  payloadHash: string;
  traceVersion?: "MMRI-TRACE-1.0";
  versionBundleId?: string;
  versionBundleHash?: string;
  sourceSnapshotId?: string;
  sourceSnapshotHash?: string;
  diagnosisResultHash: string;
  strategyHash: string;
  planHash: string;
  bindingHash: string;
  generatedAt: string;
  assessmentId: string;
  assessmentMode: "QUICK"|"FULL";
  assessmentStatus: string;
  routingState: string | null;
  companyName: string;
  methodology: MethodologyDefinition;
  snapshot: RuntimeSnapshot;
  strategy: StrategyResult;
  purposeLabels: Record<string,string>;
}

export function buildFrozenReportPayload(input: BuildReportPayloadInput): FrozenReportPayload {
  const { methodology, snapshot, strategy } = input;
  const reportContract = methodology.contracts.report;
  const traceVersion = input.traceVersion ?? "MMRI-TRACE-1.0";
  const versionBundleId = input.versionBundleId ?? `methodology:${methodology.version}`;
  const versionBundleHash = input.versionBundleHash ?? `UNBOUND-TEST-${methodology.version}`;
  const sourceSnapshotId = input.sourceSnapshotId ?? `runtime:${input.assessmentId}`;
  const sourceSnapshotHash = input.sourceSnapshotHash ?? input.diagnosisResultHash;
  const metric = metricType(input.assessmentMode, input.assessmentStatus, snapshot.overall.officialScore);
  const overallScore = metric === "OFFICIAL_OVERALL_SCORE" || metric === "REVIEW_REQUIRED_SCORE" ? snapshot.overall.officialScore : metric === "QUICK_ESTIMATE" ? snapshot.overall.partialScore : null;

  const purposeIds = Object.keys(input.purposeLabels).length ? Object.keys(input.purposeLabels) : [...snapshot.purposes.keys()];
  const purposes = purposeIds.map(id => {
    const p = snapshot.purposes.get(id);
    const score = metric === "OFFICIAL_OVERALL_SCORE" || metric === "REVIEW_REQUIRED_SCORE" ? (p?.officialScore ?? null) : metric === "QUICK_ESTIMATE" ? (p?.partialScore ?? null) : null;
    return { id, nameMn: input.purposeLabels[id] ?? id, score, confidence: p?.confidence ?? null, coverage: p?.coverage ?? null, band: bandFor(methodology, score) };
  });

  const minStrengthScore = Number(reportContract.strengthEligibility.minimumScore ?? 80);
  const minStrengthConfidence = Number(reportContract.strengthEligibility.minimumConfidence ?? 0.8);
  const minStrengthCoverage = Number(reportContract.strengthEligibility.minimumCoverage ?? 0.7);
  const strengths: StrengthFinding[] = methodology.categories.map(c => {
    const r = snapshot.categories.get(c.id);
    const score = metric === "OFFICIAL_OVERALL_SCORE" || metric === "REVIEW_REQUIRED_SCORE" ? r?.officialScore : r?.partialScore;
    return score !== null && score !== undefined && !r?.confirmedNotApplicable && (r?.confidence ?? 0) >= minStrengthConfidence && (r?.coverage ?? 0) >= minStrengthCoverage && score >= minStrengthScore && (r?.reviewRequiredCellCount ?? 0) === 0 && (r?.unresolvedCellCount ?? 0) === 0
      ? { id:`STR-${c.id}`,categoryId:c.id,nameMn:c.nameMn,score,confidence:r!.confidence!,coverage:r!.coverage!,sourceTraceIds:[`category:${c.id}`,`strength:STR-${c.id}`],basis:"VALIDATED" as "VALIDATED" | "RELATIVE_RANK" }
      : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a,b) => b.score-a.score || b.confidence-a.confidence || a.categoryId.localeCompare(b.categoryId))
    .slice(0, REPORT_CATEGORY_FINDING_LIMIT);

  const weaknessThreshold = Number(methodology.contracts.rootCause?.weaknessThreshold ?? strategy.rootCause.weaknessThreshold ?? 60);
  const weaknessEligibility = reportContract.weaknessEligibility ?? reportContract.strengthEligibility ?? {};
  const minWeakConfidence = Number(weaknessEligibility.minimumConfidence ?? 0.8);
  const minWeakCoverage = Number(weaknessEligibility.minimumCoverage ?? 0.7);
  const weaknesses: WeaknessFinding[] = methodology.categories.map(c => {
    const r = snapshot.categories.get(c.id);
    const score = metric === "OFFICIAL_OVERALL_SCORE" || metric === "REVIEW_REQUIRED_SCORE" ? r?.officialScore : r?.partialScore;
    return score !== null && score !== undefined && !r?.confirmedNotApplicable && (r?.confidence ?? 0) >= minWeakConfidence && (r?.coverage ?? 0) >= minWeakCoverage && score < weaknessThreshold && (r?.reviewRequiredCellCount ?? 0) === 0 && (r?.unresolvedCellCount ?? 0) === 0
      ? { id:`WEAK-${c.id}`,categoryId:c.id,nameMn:c.nameMn,score,confidence:r!.confidence!,coverage:r!.coverage!,severity:Math.max(0,(weaknessThreshold-score)/Math.max(1,weaknessThreshold)),sourceTraceIds:[`category:${c.id}`,`weakness:WEAK-${c.id}`],basis:"VALIDATED" as "VALIDATED" | "RELATIVE_RANK" }
      : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a,b) => a.score-b.score || b.confidence-a.confidence || a.categoryId.localeCompare(b.categoryId))
    .slice(0, REPORT_CATEGORY_FINDING_LIMIT);

  // Complete to REPORT_CATEGORY_FINDING_LIMIT from actual capability scores (flagged RELATIVE_RANK) when too few meet the evidence thresholds.
  const scoredCats = methodology.categories.map(c => { const r = snapshot.categories.get(c.id); const score = metric === "OFFICIAL_OVERALL_SCORE" || metric === "REVIEW_REQUIRED_SCORE" ? r?.officialScore : r?.partialScore; return { c, r, score }; }).filter(x => x.score !== null && x.score !== undefined && !x.r?.confirmedNotApplicable) as Array<{ c: (typeof methodology.categories)[number]; r: any; score: number }>;
  const strengthIds = new Set(strengths.map(x => x.categoryId));
  // MMRI-03: select jointly and stay disjoint. A relative-rank strength may not be a validated weakness nor score below the weakness threshold (fewer strengths is acceptable).
  const validatedWeakIds = new Set(weaknesses.map(x => x.categoryId));
  scoredCats.filter(x => !strengthIds.has(x.c.id) && !validatedWeakIds.has(x.c.id) && x.score >= weaknessThreshold).sort((a,b) => b.score-a.score || (b.r?.confidence??0)-(a.r?.confidence??0) || a.c.id.localeCompare(b.c.id)).slice(0, Math.max(0, REPORT_CATEGORY_FINDING_LIMIT-strengths.length)).forEach(x => { strengthIds.add(x.c.id); strengths.push({ id:`STR-${x.c.id}`,categoryId:x.c.id,nameMn:x.c.nameMn,score:x.score,confidence:x.r?.confidence??0,coverage:x.r?.coverage??0,sourceTraceIds:[`category:${x.c.id}`,`strength:STR-${x.c.id}`],basis:"RELATIVE_RANK" }); });
  const weakIds = new Set(weaknesses.map(x => x.categoryId));
  scoredCats.filter(x => !weakIds.has(x.c.id) && !strengthIds.has(x.c.id)).sort((a,b) => a.score-b.score || (b.r?.confidence??0)-(a.r?.confidence??0) || a.c.id.localeCompare(b.c.id)).slice(0, Math.max(0, REPORT_CATEGORY_FINDING_LIMIT-weaknesses.length)).forEach(x => { weaknesses.push({ id:`WEAK-${x.c.id}`,categoryId:x.c.id,nameMn:x.c.nameMn,score:x.score,confidence:x.r?.confidence??0,coverage:x.r?.coverage??0,severity:Math.max(0,(weaknessThreshold-x.score)/Math.max(1,weaknessThreshold)),sourceTraceIds:[`category:${x.c.id}`,`weakness:WEAK-${x.c.id}`],basis:"RELATIVE_RANK" }); });

  const selectedRoots = strategy.rootCause.selectedFindings
    .filter(f => ["PRIMARY_ROOT_CAUSE","CONTRIBUTING_CAUSE","POSSIBLE_CAUSE","EVIDENCE_GAP","ISOLATED_WEAKNESS"].includes(f.classification))
    .slice(0, Number(reportContract.limits.rootFindings ?? 3));
  const recommendationSelection = selectRecommendationActions(
    strategy.recommendations,
    Number(reportContract.limits.executionLocalActions ?? 5),
    Number(reportContract.limits.evidenceValidationActions ?? 2)
  );
  const priorityActions = recommendationSelection.criticalActions;
  const evidenceActions = recommendationSelection.evidenceActions;
  const plannedRecommendationIds = new Set(strategy.actionPlan.includedRecommendationIds);
  for (const action of [...priorityActions, ...evidenceActions]) {
    if (!plannedRecommendationIds.has(action.id)) throw new Error(`Report recommendation ${action.id} is missing from the 365-day plan`);
  }

  const authorityRoles:any[] = Array.isArray(methodology.contracts.authority?.roles) ? methodology.contracts.authority.roles : [];
  const roleLabelEntries:Array<[string,string]> = authorityRoles
    .map((r:any):[string,string] => [String(r.id ?? ""), String(r.label ?? r.labelMn ?? r.id ?? "")])
    .filter((entry:[string,string]) => Boolean(entry[0] && entry[1]));
  const roleLabelById = new Map<string,string>(roleLabelEntries);
  const roadmap: RoadmapRow[] = strategy.actionPlan.horizons.map(h => ({
    horizon: h.id,
    nameMn: h.name,
    dayStart: h.dayStart,
    dayEnd: h.dayEnd,
    milestones: strategy.actionPlan.milestones
      .filter(m => m.horizon === h.id)
      .sort((a,b) => b.scheduleScore-a.scheduleScore || a.id.localeCompare(b.id))
      .map(m => ({
        milestoneId:m.id,
        recommendationId:m.recommendationId,
        titleMn:m.titleMn,
        milestoneMn:m.milestoneMn,
        deliverableMn:m.deliverableMn,
        ownerRoleId:m.ownerRoleId,
        ownerRoleLabelMn:roleLabelById.get(m.ownerRoleId) ?? m.ownerRoleId,
        kpiMn:m.kpiMn,
        sourceTraceIds:m.sourceTraceIds
      }))
  }));

  const risks: ReportRisk[] = [];
  const hard = snapshot.contradictions.filter(c => c.type === "HARD");
  if (hard.length) risks.push({ id:"RISK-CONTRADICTION",type:"CONTRADICTION",messageMn:`${hard.length} ноцтой зөрчил илэрсэн буюу шийдвэрлэх шаардлагатай.`,sourceTraceIds:[...new Set(hard.slice(0,4).flatMap(c=>c.affectedCellIds.map(cellId=>`cell:${c.categoryId}:${cellId}`)))] });
  const reviewCells = [...snapshot.cells.entries()].filter(([,c]) => c.status === "REVIEW_REQUIRED");
  const reviewCount = reviewCells.length;
  if (reviewCount) risks.push({id:"RISK-REVIEW",type:"REVIEW_REQUIRED",messageMn:`${reviewCount} нүд нягтлах шаардлагатай төлөвтэй байна.`,sourceTraceIds:reviewCells.slice(0,4).map(([key])=>`cell:${key}`)});
  const gapFindings = strategy.rootCause.findings.filter(f=>f.classification==="EVIDENCE_GAP");
  const gapCount = gapFindings.length;
  if (gapCount) risks.push({id:"RISK-EVIDENCE",type:"EVIDENCE_GAP",messageMn:`${gapCount} сул/тодорхойгүй хэсэгт нотолгоо хангалтгүй байна.`,sourceTraceIds:[...new Set(gapFindings.slice(0,4).flatMap(f=>f.sourceTraceIds))]});
  if (input.routingState === "QUICK_LIMIT_REACHED") risks.push({id:"RISK-QUICK-LIMIT",type:"QUICK_LIMIT",messageMn:"Түргэвчилсэн үнэлгээ тухайн үнэлгээний асуултын хязгаарт хүрсэн.",sourceTraceIds:[`assessment:${input.assessmentId}`]});
  if (input.assessmentStatus === "EXHAUSTED" && snapshot.overall.officialScore === null) risks.push({id:"RISK-INCOMPLETE",type:"INCOMPLETE_SCOPE",messageMn:"Хамаарах хэсгүүдийн зарим нь албан ёсны үнэлгээнд хүрээгүй.",sourceTraceIds:[`assessment:${input.assessmentId}`]});
  const selectedRisks = risks.slice(0, Number(reportContract.limits.risks ?? 4));

  const traceIndex: Record<string,{kind:string;ref:string}> = {};
  const addTrace = (id:string,kind:string,ref:string) => { if (!traceIndex[id]) traceIndex[id] = {kind,ref}; };
  addTrace(`assessment:${input.assessmentId}`,"ASSESSMENT",input.assessmentId);
  addTrace(`version:${versionBundleId}`,"VERSION_BUNDLE",versionBundleId);
  addTrace(`snapshot:${sourceSnapshotId}`,"SNAPSHOT",sourceSnapshotId);
  for (const c of methodology.categories) addTrace(`category:${c.id}`,"CATEGORY",c.id);
  for (const p of purposes) addTrace(`purpose:${p.id}`,"PURPOSE",p.id);
  for (const f of selectedRoots) addTrace(`cell:${f.categoryId}:${f.cellId}`,"CELL",`${f.categoryId}:${f.cellId}`);
  for (const s of strengths) for (const t of s.sourceTraceIds) addTrace(t,t.startsWith("strength:")?"STRENGTH":"CATEGORY",s.id);
  for (const w of weaknesses) for (const t of w.sourceTraceIds) addTrace(t,t.startsWith("weakness:")?"WEAKNESS":"CATEGORY",w.id);
  for (const f of selectedRoots) for (const t of f.sourceTraceIds) addTrace(t,t.startsWith("root:")?"ROOT_FINDING":"DIAGNOSTIC",f.id);
  for (const a of [...priorityActions,...evidenceActions]) for (const t of a.sourceTraceIds) addTrace(t,t.startsWith("recommendation:")?"RECOMMENDATION":"DIAGNOSTIC",a.id);
  for (const row of roadmap) for (const m of row.milestones) for (const t of m.sourceTraceIds) addTrace(t,t.startsWith("milestone:")?"MILESTONE":"PLAN",m.milestoneId);
  for (const r of selectedRisks) for (const t of r.sourceTraceIds) addTrace(t,"RISK",r.id);

  return {
    payloadVersion:"MMRI-REPORT-PAYLOAD-1.3",
    payloadHash: input.payloadHash,
    diagnosisResultHash: input.diagnosisResultHash,
    strategyHash: input.strategyHash,
    planHash: input.planHash,
    bindingHash: input.bindingHash,
    reportId: input.reportId,
    reportContractVersion: reportContract.version,
    findingsPolicyVersion:MMRI_REPORT_FINDINGS_POLICY_VERSION,
    traceVersion,
    versionBundleId,
    versionBundleHash,
    sourceSnapshotId,
    sourceSnapshotHash,
    assessmentId: input.assessmentId,
    assessmentMode: input.assessmentMode,
    assessmentStatus: input.assessmentStatus,
    routingState: input.routingState,
    generatedAt: input.generatedAt,
    companyName: input.companyName,
    methodologyVersion: methodology.version,
    metricType: metric,
    overall:{score:overallScore,confidence:snapshot.overall.confidence,coverage:snapshot.overall.coverage,band:bandFor(methodology,overallScore)},
    purposes,
    strengths,
    weaknesses,
    rootFindings:selectedRoots,
    priorityActions,
    evidenceActions,
    roadmap,
    risks:selectedRisks,
    remeasurement:{horizon:strategy.actionPlan.remeasurementHorizons[0] ?? "H2",labelMn:"Дахин хэмжилтийн эхний цэг"},
    requiredWarnings:warningSet(input.assessmentMode,input.assessmentStatus,input.routingState,snapshot),
    displayDictionary:{
      QUICK_ESTIMATE:"Түргэвчилсэн үнэлгээний тооцоолол",
      OFFICIAL_OVERALL_SCORE:"Албан ёсны нийт оноо",
      REVIEW_REQUIRED_SCORE:"Нягтлах шаардлагатай урьдчилсан оноо",
      PRIMARY_ROOT_CAUSE:"Гол суурь шалтгаан",
      CONTRIBUTING_CAUSE:"Нөлөөлж буй чухал шалтгаан",
      POSSIBLE_CAUSE:"Болзошгүй шалтгаан",
      EVIDENCE_GAP:"Нотолгоо хангалтгүй",
      ...Object.fromEntries(methodology.categories.map(c=>[c.id,c.nameMn])),
      ...Object.fromEntries(purposes.map(p=>[p.id,p.nameMn])),
      ...Object.fromEntries(roleLabelById)
    },
    traceIndex,
    versions:{
      methodology:methodology.version,
      scoring:methodology.contracts.scoring.version,
      confidence:methodology.contracts.confidence.version,
      rootCause:strategy.rootCause.version,
      recommendation:strategy.recommendations.version,
      actionPlan:strategy.actionPlan.version,
      report:reportContract.version,
      aiGeneration:methodology.contracts.aiGeneration.version
    }
  };
}
