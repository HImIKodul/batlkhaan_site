import { createHash } from "node:crypto";
import type { FrozenReportPayload, NarrativeDraft, NarrativeClaim } from "./types.js";
import { sha256Json } from "../lib/hash.js";

export const MMRI_PDF_GENERATOR_VERSION="MMRI-PDF-1.5-BUSINESS-REPORT" as const;
export const MMRI_PDF_SOURCE_VERSION="MMRI-PDF-SOURCE-1.0" as const;

export interface ReportPdfFinding {
  id:string;
  nameMn:string;
  score:number;
  narrativeMn:string;
  basis?:"VALIDATED"|"RELATIVE_RANK";
}
export interface ReportPdfAction {
  id:string;
  titleMn:string;
  actionMn:string;
  deliverableMn:string;
  kpiMn:string;
  ownerRoleLabelMn:string;
  narrativeMn:string;
  currentScore:number|null;
  targetScore:number|null;
}
export interface ReportPdfRoadmapMilestone {
  milestoneId:string;
  recommendationId:string;
  titleMn:string;
  milestoneMn:string;
  deliverableMn:string;
  ownerRoleLabelMn:string;
  kpiMn:string;
}
export interface ReportPdfRoadmapRow {
  horizon:string;
  nameMn:string;
  dayStart:number;
  dayEnd:number;
  milestones:ReportPdfRoadmapMilestone[];
}
export interface ReportPdfSource {
  sourceVersion:typeof MMRI_PDF_SOURCE_VERSION;
  reportId:string;
  assessmentId:string;
  payloadHash:string;
  narrativeHash:string;
  bindingHash:string;
  generatedAt:string;
  companyName:string;
  methodologyVersion:string;
  metricType:string;
  overallScore:number|null;
  overallBand:string|null;
  overallConfidence:number|null;
  overallCoverage:number|null;
  conclusionMn:string;
  strengths:ReportPdfFinding[];
  weaknesses:ReportPdfFinding[];
  criticalActions:ReportPdfAction[];
  roadmap:ReportPdfRoadmapRow[];
  warnings:string[];
  risks:string[];
}

function claimTextByRef(draft:NarrativeDraft,sectionId:string,field:"recommendationId"|"rootFindingId"|"milestoneId",id:string):string{
  const section=draft.sections.find(s=>s.id===sectionId);
  return section?.claims.find((c:any)=>c[field]===id)?.textMn?.trim()||"";
}
function claimTextByTrace(draft:NarrativeDraft,sectionId:string,traceId:string):string{
  const section=draft.sections.find(s=>s.id===sectionId);
  return section?.claims.find((c:NarrativeClaim)=>c.sourceTraceIds.includes(traceId))?.textMn?.trim()||"";
}
function conclusionText(draft:NarrativeDraft):string{
  const section=draft.sections.find(s=>s.id==="S10");
  return section?.claims.map(c=>c.textMn.trim()).filter(Boolean).join(" ")||"";
}
function validatePdfSourceInput(payload:FrozenReportPayload,narrative:NarrativeDraft){
  if(narrative.payloadHash!==payload.payloadHash)throw new Error("PDF source narrative is not bound to frozen report payload");
  if(!payload.reportId||!payload.assessmentId||!payload.bindingHash)throw new Error("PDF source is missing frozen report identifiers");
  if(!conclusionText(narrative))throw new Error("PDF source is missing validated executive conclusion");
  const sectionIds=new Set(narrative.sections.map(s=>s.id));
  if(!sectionIds.has("S10"))throw new Error("PDF source narrative is missing S10 conclusion section");
  const priorityIds=new Set(payload.priorityActions.slice(0,5).map(a=>a.id));
  for(const row of payload.roadmap)for(const m of row.milestones){
    if(priorityIds.has(m.recommendationId)||payload.evidenceActions.some(a=>a.id===m.recommendationId))continue;
    // The roadmap may contain additional approved recommendations, but never an unknown recommendation.
    const known=payload.priorityActions.some(a=>a.id===m.recommendationId)||payload.evidenceActions.some(a=>a.id===m.recommendationId);
    if(!known&&m.recommendationId.trim()==="")throw new Error(`PDF roadmap milestone ${m.milestoneId} has no recommendation lineage`);
  }
}

export function buildReportPdfSource(payload:FrozenReportPayload,narrative:NarrativeDraft):ReportPdfSource{
  validatePdfSourceInput(payload,narrative);
  const narrativeHash=sha256Json(narrative);
  const strengths=payload.strengths.slice(0,5).map(s=>({
    id:s.id,nameMn:s.nameMn,score:s.score,...(s.basis?{basis:s.basis}:{}),
    narrativeMn:claimTextByTrace(narrative,"S04",`strength:${s.id}`)||claimTextByTrace(narrative,"S04",`category:${s.categoryId}`)||`${s.nameMn} нь харьцангуй тогтвортой чадавх байна.`
  }));
  const weaknesses=payload.weaknesses.slice(0,5).map(w=>({
    id:w.id,nameMn:w.nameMn,score:w.score,...(w.basis?{basis:w.basis}:{}),
    narrativeMn:claimTextByTrace(narrative,"S05",`weakness:${w.id}`)||claimTextByTrace(narrative,"S05",`category:${w.categoryId}`)||`${w.nameMn} нь эхэлж бэхжүүлэх шаардлагатай чадавх байна.`
  }));
  const criticalActions=payload.priorityActions.slice(0,5).map(a=>({
    id:a.id,titleMn:a.titleMn,actionMn:a.actionMn,deliverableMn:a.deliverableMn,kpiMn:a.kpiMn,
    ownerRoleLabelMn:payload.displayDictionary[a.ownerRoleId]||a.ownerRoleId,currentScore:a.currentCellScore,targetScore:a.targetCellScore,
    narrativeMn:claimTextByRef(narrative,"S06","recommendationId",a.id)||`${a.titleMn}. ${a.actionMn}`
  }));
  return {
    sourceVersion:MMRI_PDF_SOURCE_VERSION,
    reportId:payload.reportId,assessmentId:payload.assessmentId,payloadHash:payload.payloadHash,narrativeHash,bindingHash:payload.bindingHash,
    generatedAt:payload.generatedAt,companyName:payload.companyName,methodologyVersion:payload.methodologyVersion,metricType:payload.metricType,
    overallScore:payload.overall.score,overallBand:payload.overall.band,overallConfidence:payload.overall.confidence,overallCoverage:payload.overall.coverage,
    conclusionMn:conclusionText(narrative),strengths,weaknesses,criticalActions,
    roadmap:payload.roadmap.map(r=>({horizon:r.horizon,nameMn:r.nameMn,dayStart:r.dayStart,dayEnd:r.dayEnd,milestones:r.milestones.map(m=>({milestoneId:m.milestoneId,recommendationId:m.recommendationId,titleMn:m.titleMn,milestoneMn:m.milestoneMn,deliverableMn:m.deliverableMn,ownerRoleLabelMn:m.ownerRoleLabelMn,kpiMn:m.kpiMn}))})),
    warnings:[...payload.requiredWarnings],risks:payload.risks.map(r=>r.messageMn)
  };
}

export function reportPdfSourceHash(source:ReportPdfSource):string{return sha256Json(source);}
export function sha256Buffer(buffer:Buffer):string{return createHash("sha256").update(buffer).digest("hex");}

export function assertPdfBuffer(buffer:Buffer):void{
  if(buffer.length<5_000)throw new Error("Generated PDF is unexpectedly small");
  if(buffer.subarray(0,5).toString("ascii")!=="%PDF-")throw new Error("Generated artifact is not a PDF");
  const tail=buffer.subarray(Math.max(0,buffer.length-2048)).toString("latin1");
  if(!tail.includes("%%EOF"))throw new Error("Generated PDF is incomplete");
}
