import { coverageText, plainRole } from "./guidance/index.js";
import { planForPayload } from "./annual-plan.js";
import { createHash } from "node:crypto";
import type { FrozenReportPayload, NarrativeDraft, NarrativeClaim } from "./types.js";
import { sha256Json } from "../lib/hash.js";
import { deterministicFallbackNarrative } from "./fallback-renderer.js";
import { readPolicyFlags, type PolicyFlags } from "../engine/policy-flags.js";

export const MMRI_PDF_GENERATOR_VERSION="MMRI-PDF-1.8-BUSINESSMRI-PLAN" as const;
export const MMRI_PDF_SOURCE_VERSION="MMRI-PDF-SOURCE-1.0" as const;

export interface ReportPdfFinding {
  id:string;
  nameMn:string;
  /** null only for B4 placeholder slots (never a fabricated number). */
  score:number|null;
  /** B4 (flag ON only): an unfilled position that is NOT a finding. */
  placeholder?:boolean;
  placeholderKind?:"NO_VERIFIED_FINDING";
  narrativeMn:string;
  /** Approved narrative text shown on the PDF; empty when it equals the deterministic default (which the name and score already express). MMRI-13. */
  explanationMn?:string;
  basis?:"VALIDATED"|"RELATIVE_RANK";
  /** Newer reports: an area to clarify, never shown as a weakness. */
  needsEvidence?:true;
}
export interface ReportPdfAction {
  id:string;
  titleMn:string;
  actionMn:string;
  deliverableMn:string;
  kpiMn:string;
  /** Present only for a reported absence (newer reports), so earlier sources and their hashes are unchanged. */
  statedMn?:string;
  /** Newer reports: capability-specific wording and the plan stages that carry the work. */
  guide?:{headingMn:string;whyMn:string;goalMn:string;doMn:string;deliverableMn:string;checkMn:string;planMn:string};
  ownerRoleLabelMn:string;
  narrativeMn:string;
  /** Approved S06 explanation (reviewer or AI wording) when it differs from the deterministic default. MMRI-13. */
  explanationMn?:string;
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
  targetNoteMn?:string;
  selectionNoteMn?:string;
  coverageNoteMn?:string;
  coverageShare?:string;
  conclusionMn:string;
  strengths:ReportPdfFinding[];
  weaknesses:ReportPdfFinding[];
  criticalActions:ReportPdfAction[];
  roadmap:ReportPdfRoadmapRow[];
  warnings:string[];
  risks:string[];
  /** Administrator overlay; the key is absent when there are no annotations so historical source hashes are unchanged. */
  annotations?:import("./annotations.js").VisualAnnotationSet;
}

function claimTextByRef(draft:NarrativeDraft,sectionId:string,field:"recommendationId"|"rootFindingId"|"milestoneId",id:string):string{
  const section=draft.sections.find(s=>s.id===sectionId);
  return section?.claims.find((c:any)=>c[field]===id)?.textMn?.trim()||"";
}
function claimTextByTrace(draft:NarrativeDraft,sectionId:string,traceId:string):string{
  const section=draft.sections.find(s=>s.id===sectionId);
  return section?.claims.find((c:NarrativeClaim)=>c.sourceTraceIds.includes(traceId))?.textMn?.trim()||"";
}
const plainText=(v:string)=>v.replace(/\s*[\u2014\u2015]\s*/g," - ").replace(/\s+/g," ").trim();
/** The approved text when it differs from the deterministic fallback claim bound to the same reference; otherwise "". */
function editedExplanation(approved:string,fallback:string):string{
  if(!approved)return "";
  const a=plainText(approved),f=plainText(fallback);
  if(a===f)return "";
  // A reviewer who appended a qualification keeps the default sentence (name, score and action facts are already printed next to it);
  // the PDF then shows the added wording itself. Any other edit is shown in full.
  if(f&&a.startsWith(f)){const rest=a.slice(f.length).trim();return rest||"";}
  return approved;
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

/** Generator identity: the proposed B4 renderer is a different generator and must never share an artifact identity with the approved one. */
export function generatorVersionFor(flags:PolicyFlags=readPolicyFlags()):string{return flags.b4?`${MMRI_PDF_GENERATOR_VERSION}-B4-PROPOSAL`:MMRI_PDF_GENERATOR_VERSION;}
export const B4_PLACEHOLDER_TEXT={strength:"Баталгаажсан давуу тал илрээгүй",weakness:"Баталгаажсан сул тал илрээгүй"} as const;
const FINDING_SLOTS=5;
/**
 * B4 "verified finding" rule. DEFAULT = the EXISTING report contract eligibility (payload basis VALIDATED: strengthEligibility minimumScore/minimumConfidence/minimumCoverage).
 * Observation (Phase 2.7): that eligibility needs per-capability coverage >= 0.7, which a 280-question V2 run never reaches (~0.06), so under the default NO finding is ever verified.
 * Optional owner-review alternative SCORE_BAND: explicit numbers are REQUIRED (no defaults are invented): MMRI_B4_STRENGTH_MIN_SCORE, MMRI_B4_WEAKNESS_MAX_SCORE, MMRI_B4_MIN_CAPABILITY_COVERAGE.
 * Anything configured here is a PROPOSAL, never frozen methodology.
 */
export type B4Rule={mode:"CONTRACT"}|{mode:"SCORE_BAND";strengthMinScore:number;weaknessMaxScore:number;minCapabilityCoverage:number};
export function readB4Rule(env:Record<string,string|undefined>=process.env):B4Rule{
  if((env.MMRI_B4_FINDING_RULE??"CONTRACT")==="CONTRACT")return {mode:"CONTRACT"};
  if(env.MMRI_B4_FINDING_RULE!=="SCORE_BAND")throw new Error("MMRI_B4_FINDING_RULE must be CONTRACT or SCORE_BAND");
  const n=(k:string)=>{const v=Number(env[k]);if(env[k]===undefined||env[k]===""||!Number.isFinite(v))throw new Error(`SCORE_BAND requires an explicit numeric ${k} (no default is invented)`);return v;};
  return {mode:"SCORE_BAND",strengthMinScore:n("MMRI_B4_STRENGTH_MIN_SCORE"),weaknessMaxScore:n("MMRI_B4_WEAKNESS_MAX_SCORE"),minCapabilityCoverage:n("MMRI_B4_MIN_CAPABILITY_COVERAGE")};
}
function isVerified(item:{score:number;coverage?:number;basis?:string},kind:"strength"|"weakness",rule:B4Rule):boolean{
  if(rule.mode==="CONTRACT")return item.basis!=="RELATIVE_RANK";
  if((item.coverage??0)<rule.minCapabilityCoverage)return false;
  return kind==="strength"?item.score>=rule.strengthMinScore:item.score<=rule.weaknessMaxScore;
}
function withPlaceholders(mapped:ReportPdfFinding[],source:Array<{score:number;coverage?:number;basis?:string}>,text:string,kind:"strength"|"weakness",rule:B4Rule):ReportPdfFinding[]{
  const verified=mapped.filter((_,i)=>isVerified(source[i],kind,rule)).slice(0,FINDING_SLOTS);
  const out:ReportPdfFinding[]=[...verified];
  while(out.length<FINDING_SLOTS)out.push({id:`PLACEHOLDER-${out.length+1}`,nameMn:text,score:null,placeholder:true,placeholderKind:"NO_VERIFIED_FINDING",narrativeMn:"",explanationMn:""});
  return out;
}
export function buildReportPdfSource(payload:FrozenReportPayload,narrative:NarrativeDraft,flagsOverride?:PolicyFlags):ReportPdfSource{
  const flags=flagsOverride??readPolicyFlags();
  // B4 applies to the revised V2 domains only (methodology 4.x); Marketing (3.x) keeps its frozen report structure.
  const b4Active=flags.b4&&/^4\./.test(String(payload.methodologyVersion));
  const b4Rule=b4Active?readB4Rule():{mode:"CONTRACT"} as B4Rule;
  if(flags.b4&&!flags.b7)throw new Error("B4 report placeholders require B7 immutable artifacts: enabling the proposed layout on an existing report would otherwise overwrite its historical PDF");
  validatePdfSourceInput(payload,narrative);
  const narrativeHash=sha256Json(narrative);
  const plan=planForPayload(narrative.annualPlan,payload.payloadHash);
  const baseline=deterministicFallbackNarrative(payload);
  const guidance=payload.guidance;
  const stagesOf=(i:number)=>plan?plan.stages.filter(st=>st.actions.some(x=>x.recommendationIds.includes(`F${i+1}`)&&x.recommendationIds.length<payload.priorityActions.length)).sort((a,b)=>a.startDay-b.startDay).reduce((t,st,k,all)=>k?t:`${st.startDate.replaceAll("-",".")} - ${all.reduce((m,x)=>x.endDate>m?x.endDate:m,st.endDate).replaceAll("-",".")}`,""):"";
  /* The approved S06 wording (reviewer or model) is the action text; its default is the frozen guidance. The catalogue title in front of it is not repeated. */
  const approvedDo=(id:string)=>{const t=claimTextByRef(narrative,"S06","recommendationId",id),title=payload.priorityActions.find(a=>a.id===id)?.titleMn??"";return t.startsWith(title)?t.slice(title.length).replace(/^[\s.:]+/,""):t;};
  const guideOf=(id:string,i:number)=>{const g=guidance?.priorities.find(x=>x.recommendationId===id);return g?{guide:{headingMn:g.dimensionMn&&g.dimensionMn!=="Бодит хэрэгжилт"?`${g.capabilityMn}: ${g.dimensionMn.charAt(0).toLocaleLowerCase("mn-MN")+g.dimensionMn.slice(1)}`:g.capabilityMn,whyMn:g.whyMn,goalMn:`${g.goalMn}.`,doMn:approvedDo(id)||g.doMn,deliverableMn:g.deliverableMn,checkMn:g.checkMn,planMn:stagesOf(i)}}:{}};
  const strengths=payload.strengths.slice(0,5).map(s=>({
    id:s.id,nameMn:s.nameMn,score:s.score,...(s.basis?{basis:s.basis}:{}),
    narrativeMn:claimTextByTrace(narrative,"S04",`strength:${s.id}`)||claimTextByTrace(narrative,"S04",`category:${s.categoryId}`)||`${s.nameMn} нь харьцангуй тогтвортой чадавх байна.`,
    explanationMn:editedExplanation(
      claimTextByTrace(narrative,"S04",`strength:${s.id}`)||claimTextByTrace(narrative,"S04",`category:${s.categoryId}`),
      claimTextByTrace(baseline,"S04",`strength:${s.id}`)||claimTextByTrace(baseline,"S04",`category:${s.categoryId}`))||guidance?.findings[s.id]||""
  }));
  const weaknesses=payload.weaknesses.slice(0,5).map(w=>({
    id:w.id,nameMn:w.nameMn,score:w.score,...(w.needsEvidence?{needsEvidence:true as const}:{}),...(w.basis?{basis:w.basis}:{}),
    narrativeMn:claimTextByTrace(narrative,"S05",`weakness:${w.id}`)||claimTextByTrace(narrative,"S05",`category:${w.categoryId}`)||`${w.nameMn} нь эхэлж бэхжүүлэх шаардлагатай чадавх байна.`,
    explanationMn:editedExplanation(
      claimTextByTrace(narrative,"S05",`weakness:${w.id}`)||claimTextByTrace(narrative,"S05",`category:${w.categoryId}`),
      claimTextByTrace(baseline,"S05",`weakness:${w.id}`)||claimTextByTrace(baseline,"S05",`category:${w.categoryId}`))||guidance?.findings[w.id]||""
  }));
  const criticalActions=payload.priorityActions.slice(0,5).map((a,i)=>({
    id:a.id,...guideOf(a.id,i),titleMn:a.titleMn,actionMn:a.actionMn,...(a.statedMn?{statedMn:a.statedMn}:{}),deliverableMn:a.deliverableMn,kpiMn:a.kpiMn,
    ownerRoleLabelMn:guidance?plainRole(payload.displayDictionary[a.ownerRoleId]||a.ownerRoleId):payload.displayDictionary[a.ownerRoleId]||a.ownerRoleId,currentScore:a.currentCellScore,targetScore:a.targetCellScore,
    narrativeMn:claimTextByRef(narrative,"S06","recommendationId",a.id)||`${a.titleMn}. ${a.actionMn}`,
    explanationMn:guidance?.priorities.some(x=>x.recommendationId===a.id)?"":editedExplanation(claimTextByRef(narrative,"S06","recommendationId",a.id),claimTextByRef(baseline,"S06","recommendationId",a.id))
  }));
  return {
    sourceVersion:MMRI_PDF_SOURCE_VERSION,
    reportId:payload.reportId,assessmentId:payload.assessmentId,payloadHash:payload.payloadHash,narrativeHash,bindingHash:payload.bindingHash,
    generatedAt:payload.generatedAt,companyName:payload.companyName,methodologyVersion:payload.methodologyVersion,metricType:payload.metricType,
    overallScore:payload.overall.score,overallBand:payload.overall.band,overallConfidence:payload.overall.confidence,overallCoverage:payload.overall.coverage,
    ...(guidance?.targetNoteMn?{targetNoteMn:guidance.targetNoteMn}:{}),...(guidance?.selectionNoteMn?{selectionNoteMn:guidance.selectionNoteMn}:{}),...(guidance?.coverageNoteMn?{coverageNoteMn:guidance.coverageNoteMn,coverageShare:`${coverageText(payload.overall.coverage)}%`}:{}),conclusionMn:conclusionText(narrative),strengths:b4Active?withPlaceholders(strengths,payload.strengths.slice(0,5),B4_PLACEHOLDER_TEXT.strength,"strength",b4Rule):strengths,weaknesses:b4Active?withPlaceholders(weaknesses,payload.weaknesses.slice(0,5),B4_PLACEHOLDER_TEXT.weakness,"weakness",b4Rule):weaknesses,criticalActions,
    roadmap:payload.roadmap.map(r=>({horizon:r.horizon,nameMn:r.nameMn,dayStart:r.dayStart,dayEnd:r.dayEnd,milestones:r.milestones.map(m=>({milestoneId:m.milestoneId,recommendationId:m.recommendationId,titleMn:m.titleMn,milestoneMn:m.milestoneMn,deliverableMn:m.deliverableMn,ownerRoleLabelMn:m.ownerRoleLabelMn,kpiMn:m.kpiMn}))})),
    warnings:[...payload.requiredWarnings,...(flags.b3&&payload.evidenceDisclosure?payload.evidenceDisclosure.warningsMn:[])],risks:payload.risks.map(r=>r.messageMn),
    ...(narrative.visualAnnotations?.items?.length?{annotations:narrative.visualAnnotations}:{}),
    /* Identity of the frozen logo snapshot only (bytes are attached outside the hashed source at render time and verified against this hash). Absent without a snapshot, so existing sources and PDFs are unchanged. */
    ...(narrative.companyLogo?{companyLogo:{sha256:narrative.companyLogo.sha256}}:{}),
    /* Customer-safe projection of the validated 12-month plan: titles, calendar labels and Mongolian text only (no stage ids, finding references or provider details). Absent for reports without a READY plan, which keep the existing page 3. */
    ...(plan?{annualPlan:{periodLabel:plan.periodLabel,stages:plan.stages.map(st=>({headingMn:st.headingMn,dateLabel:st.dateLabel,dependencyNoteMn:st.dependencyNoteMn,actions:st.actions.map(x=>({textMn:x.textMn}))}))}}:{})
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
