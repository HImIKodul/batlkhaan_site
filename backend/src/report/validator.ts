import type { FrozenReportPayload, NarrativeClaim, NarrativeDraft, NarrativeValidationIssue, NarrativeValidationResult } from "./types.js";

export const MMRI_NARRATIVE_VALIDATOR_VERSION="MMRI-NARRATIVE-VALIDATOR-1.6-VERIFIED-ACTIONS" as const;

const allowedSections = new Set(["S01","S02","S03","S04","S05","S06","S07","S08","S09","S10"]);
const requiredAlways = new Set(["S01","S02","S03","S10"]);

function wordCount(text: string): number { return text.trim() ? text.trim().split(/\s+/).length : 0; }
function allClaims(d: NarrativeDraft): NarrativeClaim[] { return d.sections.flatMap(s=>s.claims); }

function collectTrustedNumericTokens(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "number" && Number.isFinite(value)) {
    out.add(String(value)); out.add(value.toFixed(1)); out.add(String(Math.round(value)));
    if (value >= 0 && value <= 1) { out.add(String(Math.round(value*100))); out.add((value*100).toFixed(1)); }
  } else if (typeof value === "string") {
    for (const m of value.matchAll(/\b\d+(?:\.\d+)?\b/g)) out.add(m[0]);
  } else if (Array.isArray(value)) {
    for (const v of value) collectTrustedNumericTokens(v,out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string,unknown>)) collectTrustedNumericTokens(v,out);
  }
  return out;
}
function push(issues:NarrativeValidationIssue[], checkId:string, severity:"BLOCK"|"REPAIR", message:string):void { issues.push({checkId,severity,message}); }
function tracesWithin(actual:string[], allowed:string[]):boolean { const ok=new Set(allowed); return actual.every(x=>ok.has(x)); }

export function validateNarrativeDraft(payload: FrozenReportPayload, draft: NarrativeDraft): NarrativeValidationResult {
  const issues: NarrativeValidationIssue[] = [];
  if (draft.schemaVersion !== "MMRI-NARRATIVE-DRAFT-1.0" || draft.payloadHash !== payload.payloadHash) push(issues,"V01","BLOCK","Narrative schema or payload hash mismatch.");
  if(!payload.diagnosisResultHash||!payload.strategyHash||!payload.planHash||!payload.bindingHash) push(issues,"V21","BLOCK","Diagnosis/strategy/plan report binding is incomplete.");
  if(payload.traceVersion!==undefined && (payload.traceVersion!=="MMRI-TRACE-1.0"||!payload.versionBundleId||!payload.versionBundleHash||!payload.sourceSnapshotId||!payload.sourceSnapshotHash)) push(issues,"V24","BLOCK","Trace/version/snapshot binding is incomplete.");
  if (draft.sections.some(s=>!allowedSections.has(s.id)) || new Set(draft.sections.map(s=>s.id)).size !== draft.sections.length) push(issues,"V01","BLOCK","Unknown or duplicate report section.");

  const trustedNumbers = collectTrustedNumericTokens(payload);
  for (const c of allClaims(draft)) {
    for (const m of c.textMn.matchAll(/\b\d+(?:\.\d+)?\b/g)) {
      if (!trustedNumbers.has(m[0])) push(issues,"V02","BLOCK",`Numeric token ${m[0]} is not grounded in the frozen payload.`);
    }
  }

  const ids = new Set(Object.keys(payload.traceIndex));
  const rootIds = new Set(payload.rootFindings.map(x=>x.id));
  const recIds = new Set([...payload.priorityActions,...payload.evidenceActions].map(x=>x.id));
  const milestoneIds = new Set(payload.roadmap.flatMap(r=>r.milestones.map(m=>m.milestoneId)));
  const claims = allClaims(draft);
  const claimIds = new Set<string>();
  for (const c of claims) {
    if (!c.reportClaimId || !/^RCLM-S\d{2}-\d{3}$/.test(c.reportClaimId)) push(issues,"V25","BLOCK",`Factual claim lacks deterministic reportClaimId: ${c.textMn}`);
    else if (claimIds.has(c.reportClaimId)) push(issues,"V25","BLOCK",`Duplicate reportClaimId ${c.reportClaimId}`);
    else claimIds.add(c.reportClaimId);
    if (!c.sourceTraceIds.length) push(issues,"V17","BLOCK",`Factual claim has no sourceTraceId: ${c.textMn}`);
    if (c.sourceTraceIds.some(id=>!ids.has(id))) push(issues,"V03","BLOCK",`Unknown trace ID in claim: ${c.textMn}`);
    if (c.rootFindingId && !rootIds.has(c.rootFindingId)) push(issues,"V03","BLOCK",`Unknown rootFindingId ${c.rootFindingId}`);
    if (c.recommendationId && !recIds.has(c.recommendationId)) push(issues,"V08","BLOCK",`Unknown recommendationId ${c.recommendationId}`);
    if (c.milestoneId && !milestoneIds.has(c.milestoneId)) push(issues,"V09","BLOCK",`Unknown milestoneId ${c.milestoneId}`);
    if (c.claimType === "RECOMMENDATION" && !c.recommendationId) push(issues,"V08","BLOCK","Recommendation claim lacks recommendationId.");
    if (c.claimType === "ROADMAP" && (!c.recommendationId || !c.milestoneId)) push(issues,"V09","BLOCK","Roadmap claim lacks plan references.");
    if (["PRIMARY_CAUSE","CONTRIBUTING_CAUSE","POSSIBLE_CAUSE"].includes(c.claimType) && !c.rootFindingId) push(issues,"V07","BLOCK","Causal claim lacks rootFindingId.");
  }

  for (const c of claims.filter(x=>x.rootFindingId)) {
    const root = payload.rootFindings.find(r=>r.id===c.rootFindingId);
    if (!root) continue;
    const expected = root.classification === "PRIMARY_ROOT_CAUSE" ? "PRIMARY_CAUSE" : root.classification === "CONTRIBUTING_CAUSE" ? "CONTRIBUTING_CAUSE" : root.classification === "POSSIBLE_CAUSE" ? "POSSIBLE_CAUSE" : null;
    if (expected && c.claimType !== expected && ["PRIMARY_CAUSE","CONTRIBUTING_CAUSE","POSSIBLE_CAUSE"].includes(c.claimType)) push(issues,"V04","BLOCK",`Root claim upgrades/downgrades ${root.id}.`);
    if (!expected && ["PRIMARY_CAUSE","CONTRIBUTING_CAUSE"].includes(c.claimType)) push(issues,"V07","BLOCK",`Unauthorized definitive causal wording for ${root.id}.`);
  }

  const allText = draft.sections.map(s=>s.claims.map(c=>c.textMn).join(" ")).join(" ");
  if (payload.metricType === "QUICK_ESTIMATE" && /албан ёсны(?:\s+нийт)?\s+оноо(?!\s+биш)|final score|official score/i.test(allText)) push(issues,"V05","BLOCK","QUICK estimate is described as official/final.");
  if (payload.metricType === "REVIEW_REQUIRED_SCORE" && /албан ёсны(?:\s+нийт)?\s+оноо(?!\s+биш)|final score|official score/i.test(allText)) push(issues,"V22","BLOCK","Review-required score is described as official/final.");
  if (/DNK\s*=\s*0|N\/A\s*=\s*0|мэдэхгүй[^.]{0,20}0/i.test(allText)) push(issues,"V06","BLOCK","N/A or DNK appears to be rendered as zero.");
  if (/\b\d+(?:\.\d+)?\s*%?\s*(өснө|буурна|нэмэгдэнэ|ашиг|орлого)/i.test(allText)) push(issues,"V10","BLOCK","Quantified future business forecast detected without forecast object.");

  if (/(https?:\/\/|www\.|судалгаагаар|гадаад эх сурвалжийн мэдээллээр)/i.test(allText)) push(issues,"V11","BLOCK","External fact/source wording detected in closed-book narrative.");
  if (payload.metricType === "QUICK_ESTIMATE" && !/түргэвчилсэн үнэлгээ/i.test(allText)) push(issues,"V15","REPAIR","Түргэвчилсэн үнэлгээний тайлбар дутуу байна.");
  if (payload.metricType === "REVIEW_REQUIRED_SCORE" && !/нягтлах шаардлагатай/i.test(allText)) push(issues,"V23","REPAIR","Нягтлах шаардлагатай төлөвийн тайлбар дутуу байна.");

  const unique = (xs:string[]):string[] => [...new Set(xs)];
  const purposeSection=draft.sections.find(s=>s.id==="S03");
  if(payload.purposes.length){
    if(!purposeSection) push(issues,"V36","BLOCK","Purpose section missing.");
    else {
      if(purposeSection.claims.length!==payload.purposes.length) push(issues,"V36","REPAIR",`Purpose section must contain exactly ${payload.purposes.length} supplied purposes.`);
      purposeSection.claims.forEach((claim,index)=>{
        const expected=payload.purposes[index]; if(!expected)return;
        if(claim.claimType!=="DESCRIPTIVE_SCORE") push(issues,"V36","BLOCK",`Purpose claim ${index+1} has the wrong claim type.`);
        if(!claim.textMn.includes(expected.nameMn)) push(issues,"V36","REPAIR",`Purpose claim ${index+1} must retain canonical purpose name ${expected.nameMn}.`);
        const trace=`purpose:${expected.id}`;
        if(payload.traceIndex[trace] && !claim.sourceTraceIds.includes(trace)) push(issues,"V36","BLOCK",`Purpose claim ${index+1} is not bound to ${expected.id}.`);
        if(payload.traceIndex[trace] && !tracesWithin(claim.sourceTraceIds,[trace])) push(issues,"V36","BLOCK",`Purpose claim ${index+1} contains unrelated trace IDs.`);
      });
    }
  }

  const strengthSection=draft.sections.find(s=>s.id==="S04");
  if(payload.strengths.length){
    if(!strengthSection) push(issues,"V29","BLOCK","Strength section missing.");
    else {
      if(strengthSection.claims.length!==payload.strengths.length) push(issues,"V29","REPAIR",`Strength section must contain exactly ${payload.strengths.length} supplied capabilities.`);
      strengthSection.claims.forEach((claim,index)=>{
        const expected=payload.strengths[index]; if(!expected)return;
        if(claim.claimType!=="STRENGTH") push(issues,"V29","BLOCK",`Strength claim ${index+1} has the wrong claim type.`);
        if(!claim.textMn.includes(expected.nameMn)) push(issues,"V29","REPAIR",`Strength claim ${index+1} must use canonical capability name ${expected.nameMn}.`);
        if(!claim.sourceTraceIds.includes(`strength:${expected.id}`)) push(issues,"V29","BLOCK",`Strength claim ${index+1} is not bound to ${expected.id}.`);
        if(!tracesWithin(claim.sourceTraceIds,expected.sourceTraceIds)) push(issues,"V29","BLOCK",`Strength claim ${index+1} contains unrelated trace IDs.`);
      });
    }
  }
  const weaknessSection=draft.sections.find(s=>s.id==="S05");
  if(payload.weaknesses.length){
    if(!weaknessSection) push(issues,"V30","BLOCK","Weakness section missing.");
    else {
      if(weaknessSection.claims.length!==payload.weaknesses.length) push(issues,"V30","REPAIR",`Weakness section must contain exactly ${payload.weaknesses.length} supplied capabilities.`);
      weaknessSection.claims.forEach((claim,index)=>{
        const expected=payload.weaknesses[index]; if(!expected)return;
        if(claim.claimType!=="WEAKNESS") push(issues,"V30","BLOCK",`Weakness claim ${index+1} has the wrong claim type.`);
        if(!claim.textMn.includes(expected.nameMn)) push(issues,"V30","REPAIR",`Weakness claim ${index+1} must use canonical capability name ${expected.nameMn}.`);
        if(!claim.sourceTraceIds.includes(`weakness:${expected.id}`)) push(issues,"V30","BLOCK",`Weakness claim ${index+1} is not bound to ${expected.id}.`);
        if(!tracesWithin(claim.sourceTraceIds,expected.sourceTraceIds)) push(issues,"V30","BLOCK",`Weakness claim ${index+1} contains unrelated trace IDs.`);
      });
    }
  }
  const validateActionSection=(sectionId:"S06"|"S07", expectedActions:FrozenReportPayload["priorityActions"], checkId:string)=>{
    if(!expectedActions.length)return;
    const section=draft.sections.find(s=>s.id===sectionId);
    if(!section){push(issues,checkId,"BLOCK",`${sectionId} action section missing.`);return;}
    if(section.claims.length!==expectedActions.length)push(issues,checkId,"REPAIR",`${sectionId} must contain exactly ${expectedActions.length} supplied actions.`);
    section.claims.forEach((claim,index)=>{
      const expected=expectedActions[index]; if(!expected)return;
      if(claim.claimType!=="RECOMMENDATION")push(issues,checkId,"BLOCK",`${sectionId} claim ${index+1} has the wrong claim type.`);
      if(claim.recommendationId!==expected.id)push(issues,checkId,"BLOCK",`${sectionId} claim ${index+1} is not bound to authoritative recommendation ${expected.id}.`);
      if(!claim.textMn.includes(expected.titleMn))push(issues,checkId,"REPAIR",`${sectionId} claim ${index+1} must retain the supplied action title ${expected.titleMn}.`);
      if(!claim.sourceTraceIds.includes(`recommendation:${expected.id}`))push(issues,checkId,"BLOCK",`${sectionId} claim ${index+1} is missing canonical recommendation trace.`);
      if(!tracesWithin(claim.sourceTraceIds,expected.sourceTraceIds))push(issues,checkId,"BLOCK",`${sectionId} claim ${index+1} contains unrelated trace IDs.`);
    });
  };
  validateActionSection("S06",payload.priorityActions,"V31");
  validateActionSection("S07",payload.evidenceActions,"V32");

  for(const c of claims.filter(x=>x.rootFindingId)){
    const root=payload.rootFindings.find(r=>r.id===c.rootFindingId);
    if(root && !tracesWithin(c.sourceTraceIds,root.sourceTraceIds))push(issues,"V33","BLOCK",`Root-finding claim ${root.id} contains unrelated trace IDs.`);
  }
  for(const c of claims.filter(x=>x.milestoneId)){
    const milestone=payload.roadmap.flatMap(r=>r.milestones).find(m=>m.milestoneId===c.milestoneId);
    if(!milestone)continue;
    if(c.recommendationId!==milestone.recommendationId)push(issues,"V34","BLOCK",`Roadmap claim ${milestone.milestoneId} is linked to the wrong recommendation.`);
    if(!c.sourceTraceIds.includes(`milestone:${milestone.milestoneId}`))push(issues,"V34","BLOCK",`Roadmap claim ${milestone.milestoneId} is missing canonical milestone trace.`);
    if(!tracesWithin(c.sourceTraceIds,milestone.sourceTraceIds))push(issues,"V34","BLOCK",`Roadmap claim ${milestone.milestoneId} contains unrelated trace IDs.`);
  }

  const riskSection=draft.sections.find(s=>s.id==="S09");
  if(payload.risks.length){
    if(!riskSection) push(issues,"V37","BLOCK","Risk section missing.");
    else {
      if(riskSection.claims.length!==payload.risks.length) push(issues,"V37","REPAIR",`Risk section must contain exactly ${payload.risks.length} supplied risks.`);
      riskSection.claims.forEach((claim,index)=>{
        const expected=payload.risks[index]; if(!expected)return;
        if(claim.claimType!=="RISK") push(issues,"V37","BLOCK",`Risk claim ${index+1} has the wrong claim type.`);
        if(!claim.textMn.includes(expected.messageMn)) push(issues,"V37","REPAIR",`Risk claim ${index+1} must retain the supplied risk statement.`);
        if(!tracesWithin(claim.sourceTraceIds,expected.sourceTraceIds)) push(issues,"V37","BLOCK",`Risk claim ${index+1} contains unrelated trace IDs.`);
      });
    }
  }

  const orderedRoots = unique(claims.filter(c=>c.rootFindingId && ["PRIMARY_CAUSE","CONTRIBUTING_CAUSE","POSSIBLE_CAUSE"].includes(c.claimType)).map(c=>c.rootFindingId!));
  const expectedRoots = payload.rootFindings.map(r=>r.id).filter(id=>orderedRoots.includes(id));
  if (orderedRoots.length && orderedRoots.some((id,i)=>expectedRoots[i]!==id)) push(issues,"V16","REPAIR","Root findings were reordered from authoritative payload order.");
  const orderedActions = unique(claims.filter(c=>c.recommendationId && c.claimType==="RECOMMENDATION").map(c=>c.recommendationId!));
  const expectedActions = [...payload.priorityActions,...payload.evidenceActions].map(a=>a.id).filter(id=>orderedActions.includes(id));
  if (orderedActions.length && orderedActions.some((id,i)=>expectedActions[i]!==id)) push(issues,"V16","REPAIR","Recommendations were reordered from authoritative payload order.");

  if (/(ignore previous|system prompt|developer message|follow these instructions|<script|\bBEGIN SYSTEM\b)/i.test(allText)) push(issues,"V18","BLOCK","Prompt-injection residue detected in narrative.");
  if (/(respondentId|categoryRootScore|cellRootScore|rootStrength formula|internal formula|debug payload)/i.test(allText)) push(issues,"V19","BLOCK","Internal/debug field leakage detected.");

  for (const warning of payload.requiredWarnings) if (!allText.includes(warning)) push(issues,"V12","BLOCK",`Required warning missing: ${warning}`);
  const counts = new Map(draft.sections.map(s=>[s.id,s.claims.length]));
  if ((counts.get("S04")??0) > 5 || (counts.get("S05")??0)>5 || (counts.get("S06")??0)>5 || (counts.get("S07")??0)>2 || (counts.get("S09")??0)>4) push(issues,"V13","BLOCK","Report section exceeds contract count limit.");
  const conclusion=draft.sections.find(s=>s.id==="S10");
  if(!conclusion||conclusion.claims.length!==1) push(issues,"V26","REPAIR","S10 must contain exactly one executive conclusion claim.");
  else {
    const conclusionClaim=conclusion.claims[0];
    const firstPriority=payload.priorityActions[0];
    if(firstPriority && conclusionClaim.recommendationId!==firstPriority.id) push(issues,"V35","BLOCK",`Executive conclusion must remain bound to first priority action ${firstPriority.id}.`);
    if(firstPriority && !conclusionClaim.sourceTraceIds.includes(`recommendation:${firstPriority.id}`)) push(issues,"V35","BLOCK","Executive conclusion is missing the first priority action trace.");
    const conclusionWords=wordCount(conclusionClaim.textMn);
    if(conclusionWords<80||conclusionWords>160) push(issues,"V27","REPAIR",`Executive conclusion should stay within 80–160 words (${conclusionWords}).`);
    if(/\b(?:KPI|dashboard|workflow|review|performance|benchmark|ROI|CRM|ERP|OKR|SLA)\b/i.test(conclusionClaim.textMn)) push(issues,"V28","REPAIR","Executive conclusion contains avoidable foreign management terminology.");
  }

  const wc = wordCount(allText);
  if (wc > 1100) push(issues,"V14","REPAIR",`Narrative exceeds 1,100-word target (${wc}).`);
  const present = new Set(draft.sections.map(s=>s.id));
  for (const id of requiredAlways) if (!present.has(id as any)) push(issues,"V20","BLOCK",`Mandatory section ${id} missing.`);
  if (payload.weaknesses.length && !present.has("S05")) push(issues,"V20","BLOCK","Weakness section missing.");
  if (payload.priorityActions.length && !present.has("S06")) push(issues,"V20","BLOCK","Priority-action section missing.");
  if (payload.evidenceActions.length && !present.has("S07")) push(issues,"V20","BLOCK","Evidence-action section missing.");
  if (payload.roadmap.some(r=>r.milestones.length) && !present.has("S08")) push(issues,"V20","BLOCK","Roadmap section missing.");
  if (payload.risks.length && !present.has("S09")) push(issues,"V20","BLOCK","Risk section missing.");

  const state = issues.some(i=>i.severity==="BLOCK") ? "GENERATION_BLOCKED" : issues.length ? "REPAIR_REQUIRED" : "PASS";
  return {state,issues,wordCount:wc};
}
