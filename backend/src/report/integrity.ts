import { sha256Json } from "../lib/hash.js";
import { reportBindingMaterial } from "./binding.js";
import type { FrozenReportPayload } from "./types.js";

export const MMRI_AI_BOUNDARY_VERSION="MMRI-AI-BOUNDARY-1.0-VERIFIED-FROZEN" as const;

function clonePlain<T>(value:T):T{
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value:T):T{
  if(value && typeof value === "object" && !Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>)) deepFreeze(child);
  }
  return value;
}

function assertNonEmptyUnique(values:string[],label:string):void{
  if(values.some(v=>!String(v||"").trim())) throw new Error(`${label} contains an empty identifier`);
  if(new Set(values).size!==values.length) throw new Error(`${label} contains duplicate identifiers`);
}

function assertKnownTraces(payload:FrozenReportPayload, traceIds:string[], context:string):void{
  if(!traceIds.length) throw new Error(`${context} is missing source trace IDs`);
  for(const id of traceIds) if(!payload.traceIndex[id]) throw new Error(`${context} references unknown trace ID ${id}`);
}

export function recomputeFrozenReportPayloadHash(payload:FrozenReportPayload):string{
  return sha256Json({...payload,payloadHash:""});
}

export function recomputeFrozenReportBindingHash(payload:FrozenReportPayload):string{
  return sha256Json(reportBindingMaterial({
    diagnosisResultHash:payload.diagnosisResultHash,
    strategyHash:payload.strategyHash,
    planHash:payload.planHash,
    reportContractVersion:payload.reportContractVersion,
    aiContractVersion:payload.versions.aiGeneration,
    findingsPolicyVersion:payload.findingsPolicyVersion
  }));
}

/**
 * Re-verify every immutable binding immediately before a frozen report payload is
 * allowed to cross the AI boundary. This is deliberately independent from the
 * persistence-layer checks so callers cannot construct a plausible-looking
 * FrozenReportPayload in memory and send it to a provider.
 */
export function assertFrozenReportIntegrity(payload:FrozenReportPayload):void{
  if(!payload || typeof payload!=="object") throw new Error("Frozen report payload is missing");
  if(!["MMRI-REPORT-PAYLOAD-1.1","MMRI-REPORT-PAYLOAD-1.2","MMRI-REPORT-PAYLOAD-1.3"].includes(payload.payloadVersion)) throw new Error(`Unsupported frozen report payload version ${String(payload.payloadVersion)}`);
  for(const [name,value] of Object.entries({
    payloadHash:payload.payloadHash,
    diagnosisResultHash:payload.diagnosisResultHash,
    strategyHash:payload.strategyHash,
    planHash:payload.planHash,
    bindingHash:payload.bindingHash,
    reportId:payload.reportId,
    assessmentId:payload.assessmentId,
    methodologyVersion:payload.methodologyVersion,
    reportContractVersion:payload.reportContractVersion,
    sourceSnapshotId:payload.sourceSnapshotId,
    sourceSnapshotHash:payload.sourceSnapshotHash,
    versionBundleId:payload.versionBundleId,
    versionBundleHash:payload.versionBundleHash
  })) if(!String(value??"").trim()) throw new Error(`Frozen report payload is missing ${name}`);

  const expectedPayloadHash=recomputeFrozenReportPayloadHash(payload);
  if(expectedPayloadHash!==payload.payloadHash) throw new Error("Frozen report payload hash verification failed at AI boundary");
  const expectedBindingHash=recomputeFrozenReportBindingHash(payload);
  if(expectedBindingHash!==payload.bindingHash) throw new Error("Frozen report binding hash verification failed at AI boundary");
  if(payload.traceVersion!=="MMRI-TRACE-1.0") throw new Error("Frozen report trace version is unsupported at AI boundary");
  if(payload.findingsPolicyVersion!=="MMRI-REPORT-FINDINGS-1.0-FIVE-CATEGORY") throw new Error("Frozen report findings policy is unsupported at AI boundary");

  const traceIds=Object.keys(payload.traceIndex);
  assertNonEmptyUnique(traceIds,"Trace index");
  if(!payload.traceIndex[`assessment:${payload.assessmentId}`]) throw new Error("Frozen report trace index is missing assessment lineage");

  const strengthIds=payload.strengths.map(x=>x.id), weaknessIds=payload.weaknesses.map(x=>x.id);
  const rootIds=payload.rootFindings.map(x=>x.id), recIds=[...payload.priorityActions,...payload.evidenceActions].map(x=>x.id);
  const milestoneIds=payload.roadmap.flatMap(r=>r.milestones.map(m=>m.milestoneId));
  assertNonEmptyUnique(strengthIds,"Strength findings");
  assertNonEmptyUnique(weaknessIds,"Weakness findings");
  assertNonEmptyUnique(rootIds,"Root findings");
  assertNonEmptyUnique(recIds,"Report recommendations");
  assertNonEmptyUnique(milestoneIds,"Roadmap milestones");

  for(const x of payload.strengths){
    assertKnownTraces(payload,x.sourceTraceIds,`Strength ${x.id}`);
    if(!x.sourceTraceIds.includes(`strength:${x.id}`)) throw new Error(`Strength ${x.id} is missing its canonical trace`);
  }
  for(const x of payload.weaknesses){
    assertKnownTraces(payload,x.sourceTraceIds,`Weakness ${x.id}`);
    if(!x.sourceTraceIds.includes(`weakness:${x.id}`)) throw new Error(`Weakness ${x.id} is missing its canonical trace`);
  }
  for(const x of payload.rootFindings){
    assertKnownTraces(payload,x.sourceTraceIds,`Root finding ${x.id}`);
    if(!x.sourceTraceIds.includes(`root:${x.id}`)) throw new Error(`Root finding ${x.id} is missing its canonical trace`);
  }
  const recommendationSet=new Set(recIds);
  for(const x of [...payload.priorityActions,...payload.evidenceActions]){
    assertKnownTraces(payload,x.sourceTraceIds,`Recommendation ${x.id}`);
    if(!x.sourceTraceIds.includes(`recommendation:${x.id}`)) throw new Error(`Recommendation ${x.id} is missing its canonical trace`);
  }
  for(const row of payload.roadmap){
    if(!Number.isFinite(row.dayStart)||!Number.isFinite(row.dayEnd)||row.dayStart<0||row.dayEnd<row.dayStart||row.dayEnd>365) throw new Error(`Roadmap horizon ${row.horizon} has invalid day bounds`);
    for(const m of row.milestones){
      if(!recommendationSet.has(m.recommendationId)) throw new Error(`Roadmap milestone ${m.milestoneId} references a recommendation outside the frozen report action set`);
      assertKnownTraces(payload,m.sourceTraceIds,`Roadmap milestone ${m.milestoneId}`);
      if(!m.sourceTraceIds.includes(`milestone:${m.milestoneId}`)) throw new Error(`Roadmap milestone ${m.milestoneId} is missing its canonical trace`);
    }
  }
  for(const r of payload.risks) assertKnownTraces(payload,r.sourceTraceIds,`Risk ${r.id}`);

  const priorityIds=new Set(payload.priorityActions.map(x=>x.id));
  for(const x of payload.evidenceActions) if(priorityIds.has(x.id)) throw new Error(`Recommendation ${x.id} cannot be both a priority action and an evidence action`);
  if(payload.strengths.length>5||payload.weaknesses.length>5||payload.priorityActions.length>5||payload.evidenceActions.length>2||payload.risks.length>4) throw new Error("Frozen report exceeds report-contract finding/action limits");
}

/** Return a detached, recursively frozen payload so providers cannot mutate authority. */
export function verifiedFrozenReportPayloadForAi(payload:FrozenReportPayload):FrozenReportPayload{
  assertFrozenReportIntegrity(payload);
  const detached=clonePlain(payload);
  assertFrozenReportIntegrity(detached);
  return deepFreeze(detached);
}
