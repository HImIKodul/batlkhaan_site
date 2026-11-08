import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { normalizeJsonNumbers, sha256Json } from "../lib/hash.js";
import { runStrategyPipeline, calculatePlanProgress, currentHorizonFromDates, buildFrozenStrategyPlan, planHashMaterial, strategyHashMaterial, rehydrateActionPlan } from "../strategy/index.js";
import type { ProfileAnswer, RuntimeSnapshot } from "../engine/types.js";
import { assertFrozenReportBinding, buildFrozenReportPayload, generateValidatedNarrative, reportBindingMaterial, validateNarrativeDraft, withDeterministicClaimIds, MMRI_AI_REPORT_PROMPT_VERSION, MMRI_NARRATIVE_VALIDATOR_VERSION, MMRI_REPORT_FINDINGS_POLICY_VERSION } from "../report/index.js";
import { buildDiagnosisResultV13 } from "../diagnosis/index.js";
import type { DiagnosisResultV13 } from "../diagnosis/index.js";
import type { FrozenStrategyPlanSnapshot, StrategyResult } from "../strategy/index.js";
import type { FrozenReportPayload, NarrativeDraft, NarrativeProvider } from "../report/index.js";
import { MethodologyDefinitionCache } from "./methodology-cache.js";
import { PrismaAssessmentEngine } from "./prisma-assessment-engine.js";
import { TraceabilityService, TRACE_VERSION } from "./traceability-service.js";
import { ReportPdfArtifactService } from "./report-pdf-artifact-service.js";

const TERMINAL = new Set(["COMPLETED","COMPLETED_WITH_REVIEW","EXHAUSTED"]);

function boundedEnvInt(name:string,fallback:number,min:number,max:number){
  const raw=process.env[name]; const value=raw===undefined?fallback:Number(raw);
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
const AI_GENERATION_LEASE_MS=()=>boundedEnvInt("MMRI_AI_REPORT_GENERATION_LEASE_MS",300_000,60_000,900_000);
const AI_RETRY_COOLDOWN_MS=()=>boundedEnvInt("MMRI_AI_REPORT_RETRY_COOLDOWN_MS",300_000,0,86_400_000);

export class ReportGenerationInProgressError extends Error {
  readonly code="REPORT_GENERATION_IN_PROGRESS";
  constructor(){super("Report generation is already in progress");this.name="ReportGenerationInProgressError";}
}

const PLAN_HORIZON_DAYS:Record<string,[number,number]>={H0:[0,14],H1:[15,30],H2:[31,90],H3:[91,180],H4:[181,365]};
const addUtcDays=(value:Date,days:number)=>new Date(value.getTime()+days*86_400_000);
type MilestoneTrackingPatch={
  status?:"NOT_STARTED"|"IN_PROGRESS"|"DONE"|"BLOCKED"|"SKIPPED";
  progressPercent?:number; plannedStartDate?:string|null; plannedEndDate?:string|null; actualStartDate?:string|null; actualCompletedDate?:string|null;
  noteMn?:string|null; delayReasonMn?:string|null; metricCurrentValue?:number|null; metricTargetValue?:number|null; metricUnitMn?:string|null;
};
function iso(value:Date|null|undefined){return value?value.toISOString():null}
function trackingView(row:any){
  return {progressPercent:Number(row?.progressPercent??(row?.status==="DONE"?100:0)),plannedStartDate:iso(row?.plannedStartDate),plannedEndDate:iso(row?.plannedEndDate),actualStartDate:iso(row?.actualStartDate),actualCompletedDate:iso(row?.actualCompletedDate),noteMn:row?.noteMn??null,delayReasonMn:row?.delayReasonMn??null,metricCurrentValue:row?.metricCurrentValue==null?null:Number(row.metricCurrentValue),metricTargetValue:row?.metricTargetValue==null?null:Number(row.metricTargetValue),metricUnitMn:row?.metricUnitMn??null,updatedAt:iso(row?.updatedAt)};
}
function parseOptionalDate(value:string|null|undefined,label:string):Date|null|undefined{
  if(value===undefined)return undefined;if(value===null||value==='')return null;const d=new Date(value);if(Number.isNaN(d.getTime()))throw new Error(`${label} огноо буруу байна`);return d;
}


function profileAnswers(profile:any):ProfileAnswer[]{ return Array.isArray(profile?.answers) ? profile.answers : []; }
function snapshotHashable(snapshot:RuntimeSnapshot):unknown {
  return {
    overall:snapshot.overall,
    categories:[...snapshot.categories.entries()].sort(([a],[b])=>a.localeCompare(b)),
    cells:[...snapshot.cells.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,{status:v.status,effectiveScore:v.effectiveScore,effectiveConfidence:v.effectiveConfidence,directAnswerCount:v.directAnswerCount,independentSourceKinds:v.independentSourceKinds,maxAcceptedAuthority:v.maxAcceptedAuthority,hasHardContradiction:v.hasHardContradiction,hardContradictionRuleIds:v.hardContradictionRuleIds}]),
    contradictions:snapshot.contradictions,
    purposes:[...snapshot.purposes.entries()].sort(([a],[b])=>a.localeCompare(b)),
    outcomePriorities:[...snapshot.outcomePriorities.entries()].sort(([a],[b])=>a.localeCompare(b)),
    categoryOutcomePriorities:[...snapshot.categoryOutcomePriorities.entries()].sort(([a],[b])=>a.localeCompare(b))
  };
}

export class PrismaStrategyReportService {
  private readonly cache = new MethodologyDefinitionCache(prisma);
  private readonly traceability = new TraceabilityService();
  private readonly terminalContextCache = new Map<string, Promise<any>>();
  /**
   * The first read of a completed assessment (e.g. /recommendations and /action-plan fired in parallel by the
   * Priorities page) freezes its diagnosis/strategy snapshots. Concurrent first calls must share one freeze;
   * otherwise the loser hits the one-snapshot-per-assessment unique constraint and returns a spurious 400.
   */
  private readonly freezeInFlight = new Map<string, Promise<any>>();
  private singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
    const current = this.freezeInFlight.get(key);
    if (current) return current as Promise<T>;
    const t0 = Date.now();
    const started: Promise<T> = run().then(result => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", event: "freeze_timing", key: key.split(":")[0], assessmentId: key.split(":")[1], ms: Date.now() - t0 })); return result; }).finally(() => { if (this.freezeInFlight.get(key) === started) this.freezeInFlight.delete(key); });
    this.freezeInFlight.set(key, started);
    return started;
  }
  private readonly reportGenerationInFlight = new Map<string, Promise<any>>();
  private readonly fallbackUpgradesInFlight = new Map<string, Promise<unknown>>();
  private readonly pdfArtifacts = new ReportPdfArtifactService();
  constructor(private readonly assessmentEngine: PrismaAssessmentEngine, private readonly narrativeProvider?: NarrativeProvider) {}

  private context(assessmentId:string){
    let current=this.terminalContextCache.get(assessmentId);
    if(!current){
      current=this.buildContext(assessmentId).catch(error=>{ this.terminalContextCache.delete(assessmentId); throw error; });
      this.terminalContextCache.set(assessmentId,current);
    }
    return current;
  }

  private async buildContext(assessmentId:string){
    const assessment=await prisma.assessment.findUnique({where:{id:assessmentId},include:{company:true,methodologyVersion:true}});
    if(!assessment)throw new Error(`Assessment ${assessmentId} not found`);
    if(!TERMINAL.has(assessment.status))throw new Error(`Strategy/report requires terminal assessment; current status ${assessment.status}`);
    const methodology=await this.cache.get(assessment.methodologyVersionId);
    const snapshot=await this.assessmentEngine.getRuntimeSnapshot(assessmentId) as RuntimeSnapshot;
    const strategy=runStrategyPipeline({methodology,snapshot,profileAnswers:profileAnswers(assessment.profile)});
    const snapshotHash=sha256Json(snapshotHashable(snapshot));
    return {assessment,methodology,snapshot,strategy,snapshotHash,profileAnswers:profileAnswers(assessment.profile)};
  }

  async generateStrategy(assessmentId:string){
    const ctx=await this.context(assessmentId);
    const existing=await prisma.strategyRun.findUnique({where:{assessmentId}});
    if(existing){
      if(existing.snapshotHash!==ctx.snapshotHash)throw new Error("Frozen strategy snapshot differs from current terminal assessment snapshot");
      return {...ctx,strategyRunId:existing.id};
    }

    const [categories,cells]=await Promise.all([
      prisma.category.findMany({where:{methodologyVersionId:ctx.assessment.methodologyVersionId}}),
      prisma.diagnosticCell.findMany({where:{methodologyVersionId:ctx.assessment.methodologyVersionId},include:{category:true,cellTemplate:true}})
    ]);
    const categoryDb=new Map(categories.map((c:any)=>[c.externalId,c.id]));
    const cellDb=new Map(cells.map((c:any)=>[`${c.category.externalId}:${c.cellTemplate.externalId}`,c.id]));

    const strategyRunId=await prisma.$transaction(async(tx:any)=>{
      const run=await tx.strategyRun.create({data:{assessmentId,rootContractVersion:ctx.strategy.rootCause.version,recommendationVersion:ctx.strategy.recommendations.version,actionPlanVersion:ctx.strategy.actionPlan.version,snapshotHash:ctx.snapshotHash}});
      const selectedRootIds=new Set(ctx.strategy.rootCause.selectedFindings.map((x:any)=>x.id));
      const rootRows=ctx.strategy.rootCause.findings.map((f:any)=>{
        const categoryId=categoryDb.get(f.categoryId),cellId=cellDb.get(`${f.categoryId}:${f.cellId}`);
        if(!categoryId||!cellId)throw new Error(`Cannot resolve DB cell for ${f.categoryId}:${f.cellId}`);
        return {strategyRunId:run.id,categoryId,cellId,externalId:f.id,classification:f.classification,findingRole:f.role,classificationBasis:f.classificationBasis,categoryValue:f.categoryValue,cellValue:f.cellValue,categorySeverity:f.categorySeverity,cellSeverity:f.cellSeverity,categoryEvidence:f.categoryEvidenceFactor,cellEvidence:f.cellEvidenceFactor,categoryRootScore:f.categoryRootScore,cellRootScore:f.cellRootScore,rootStrength:f.rootStrength,incomingCauseSupport:f.incomingCauseSupport,selected:selectedRootIds.has(f.id),downstream:{categories:f.downstreamCategoryIds,cells:f.downstreamCellIds},sourceTrace:f.sourceTraceIds};
      });
      if(rootRows.length)await tx.rootFindingRecord.createMany({data:rootRows});
      const persistedRoots=await tx.rootFindingRecord.findMany({where:{strategyRunId:run.id},select:{id:true,externalId:true}});
      const rootDb=new Map<string,string>(persistedRoots.map((x:any)=>[x.externalId,x.id]));

      const execIds=new Set(ctx.strategy.recommendations.executionActions.map((x:any)=>x.id));
      const evidenceIds=new Set(ctx.strategy.recommendations.evidenceActions.map((x:any)=>x.id));
      const suppressedIds=new Set(ctx.strategy.recommendations.suppressed.map((x:any)=>x.id));
      const recommendationRows=ctx.strategy.recommendations.candidates.map((r:any)=>{
        const categoryId=categoryDb.get(r.categoryId),cellId=cellDb.get(`${r.categoryId}:${r.cellId}`),rootFindingId=rootDb.get(r.findingId);
        if(!categoryId||!cellId||!rootFindingId)throw new Error(`Cannot persist recommendation ${r.id}`);
        const selectedGroup=execIds.has(r.id)?"EXECUTION":evidenceIds.has(r.id)?"EVIDENCE":suppressedIds.has(r.id)?"SUPPRESSED":null;
        return {strategyRunId:run.id,rootFindingId,categoryId,cellId,externalId:r.id,type:r.type,interventionCode:r.interventionCode,titleMn:r.titleMn,objectiveMn:r.objectiveMn,actionMn:r.actionMn,deliverableMn:r.deliverableMn,kpiMn:r.kpiMn,ownerRoleId:r.ownerRoleId,sponsorRoleId:r.sponsorRoleId,currentCellScore:r.currentCellScore,targetCellScore:r.targetCellScore,effortLevel:r.effortLevel,priority:r.priority,priorityBand:r.priorityBand,components:r.components,sourceTrace:r.sourceTraceIds,selectedGroup,suppressedReason:r.suppressedReason??null};
      });
      if(recommendationRows.length)await tx.recommendationRecord.createMany({data:recommendationRows});
      const persistedRecommendations=await tx.recommendationRecord.findMany({where:{strategyRunId:run.id},select:{id:true,externalId:true}});
      const recDb=new Map<string,string>(persistedRecommendations.map((x:any)=>[x.externalId,x.id]));

      const plan=await tx.actionPlanRecord.create({data:{strategyRunId:run.id,contractVersion:ctx.strategy.actionPlan.version,capacityLevel:ctx.strategy.actionPlan.capacityLevel,windowDays:ctx.strategy.actionPlan.windowDays,remeasurement:ctx.strategy.actionPlan.remeasurementHorizons}});
      const milestoneRows=ctx.strategy.actionPlan.milestones.flatMap((m:any)=>{
        const recommendationId=recDb.get(m.recommendationId);
        if(!recommendationId)return [];
        const days=PLAN_HORIZON_DAYS[m.horizon];
        return [{actionPlanId:plan.id,recommendationId,externalId:m.id,findingExternalId:m.findingId,horizon:m.horizon,phaseIndex:m.phaseIndex,requirement:m.requirement,titleMn:m.titleMn,milestoneMn:m.milestoneMn,deliverableMn:m.deliverableMn,kpiMn:m.kpiMn,ownerRoleId:m.ownerRoleId,priorityBand:m.priorityBand,recommendationPriority:m.recommendationPriority,scheduleScore:m.scheduleScore,status:m.status,progressPercent:m.status==="DONE"?100:0,plannedStartDate:days?addUtcDays(plan.generatedAt,days[0]):null,plannedEndDate:days?addUtcDays(plan.generatedAt,days[1]):null,sourceTrace:m.sourceTraceIds}];
      });
      if(milestoneRows.length)await tx.actionPlanMilestoneRecord.createMany({data:milestoneRows});
      await tx.auditEvent.createMany({data:[
        {assessmentId,eventType:"STRATEGY_GENERATED",entityType:"StrategyRun",entityId:run.id,payload:{snapshotHash:ctx.snapshotHash,rootFindings:ctx.strategy.rootCause.findings.length,recommendations:ctx.strategy.recommendations.candidates.length,milestones:ctx.strategy.actionPlan.milestones.length}},
        {assessmentId,eventType:"ACTION_PLAN_GENERATED",entityType:"ActionPlan",entityId:plan.id,payload:{capacityLevel:ctx.strategy.actionPlan.capacityLevel}}
      ]});
      return run.id;
    },{maxWait:10000,timeout:30000});
    return {...ctx,strategyRunId};
  }

  freezeDiagnosisResult(assessmentId:string):Promise<DiagnosisResultV13>{ return this.singleFlight(`diagnosis:${assessmentId}`,()=>this.freezeDiagnosisResultOnce(assessmentId)); }

  private async freezeDiagnosisResultOnce(assessmentId:string):Promise<DiagnosisResultV13>{
    const existing=await prisma.diagnosisSnapshot.findUnique({where:{assessmentId}});
    if(existing){
      const assessment=await prisma.assessment.findUnique({where:{id:assessmentId},include:{methodologyVersion:true}});
      if(!assessment)throw new Error(`Assessment ${assessmentId} not found`);
      if(existing.methodologyBundleSha256!==assessment.methodologyVersion.bundleSha256)throw new Error("Frozen diagnosis methodology bundle hash differs from terminal assessment methodology");
      const result=existing.result as unknown as DiagnosisResultV13;
      if(result.resultHash!==existing.resultHash)throw new Error("Frozen diagnosis result hash field does not match persisted diagnosis hash");
      return result;
    }
    const x=await this.generateStrategy(assessmentId);
    const purposes=await prisma.purposeDefinition.findMany({where:{methodologyVersionId:x.assessment.methodologyVersionId},orderBy:{orderIndex:"asc"}});
    const purposeLabels=Object.fromEntries(purposes.map((p:any)=>[p.externalId,p.labelMn]));
    const generatedAt=(x.assessment.completedAt??new Date()).toISOString();
    let result=buildDiagnosisResultV13({
      assessmentId,companyId:x.assessment.companyId,companyName:x.assessment.company.name,methodologyBundleSha256:x.assessment.methodologyVersion.bundleSha256,
      runtimeSnapshotHash:x.snapshotHash,generatedAt,assessmentMode:x.assessment.mode,assessmentStatus:x.assessment.status,routingState:x.assessment.routingState,
      methodology:x.methodology,snapshot:x.snapshot,strategy:x.strategy,purposeLabels
    });
    result=normalizeJsonNumbers(JSON.parse(JSON.stringify(result)));
    const resultHash=sha256Json({...result,resultHash:""});
    result={...result,resultHash};
    await prisma.$transaction(async(tx:any)=>{
      await tx.diagnosisSnapshot.create({data:{assessmentId,schemaVersion:result.schemaVersion,methodologyVersion:result.methodologyVersion,methodologyBundleSha256:result.methodologyBundleSha256,runtimeSnapshotHash:x.snapshotHash,resultHash,result}});
      await tx.auditEvent.create({data:{assessmentId,eventType:"DIAGNOSIS_FROZEN",entityType:"DiagnosisSnapshot",entityId:resultHash,payload:{schemaVersion:result.schemaVersion,resultHash,runtimeSnapshotHash:x.snapshotHash,methodologyBundleSha256:result.methodologyBundleSha256}}});
    });
    return result;
  }

  freezeStrategyPlan(assessmentId:string):Promise<FrozenStrategyPlanSnapshot>{ return this.singleFlight(`strategy:${assessmentId}`,()=>this.freezeStrategyPlanOnce(assessmentId)); }

  private async freezeStrategyPlanOnce(assessmentId:string):Promise<FrozenStrategyPlanSnapshot>{
    const diagnosis=await this.freezeDiagnosisResult(assessmentId);
    const existing=await prisma.strategyPlanSnapshot.findUnique({where:{assessmentId}});
    if(existing){
      if(existing.diagnosisResultHash!==diagnosis.resultHash)throw new Error("Frozen strategic priorities are bound to a different diagnosis result hash");
      if(existing.runtimeSnapshotHash!==diagnosis.trace.runtimeSnapshotHash)throw new Error("Frozen strategic priorities runtime snapshot mismatch");
      if(existing.methodologyBundleSha256!==diagnosis.methodologyBundleSha256)throw new Error("Frozen strategic priorities methodology bundle mismatch");
      const frozen=existing.snapshot as unknown as FrozenStrategyPlanSnapshot;
      if(frozen.schemaVersion!=="MMRI-STRATEGY-PLAN-1.0")throw new Error("Unsupported frozen strategy-plan schema version");
      if(frozen.diagnosisResultHash!==existing.diagnosisResultHash||frozen.strategyHash!==existing.strategyHash||frozen.planHash!==existing.planHash)throw new Error("Frozen strategic priorities hash metadata mismatch");
      // Verify the exact immutable JSON shape that was persisted. Do not rebuild
      // the hash material through the mutable runtime ActionPlan representation:
      // JSON/Prisma round-trips can normalize optional fields, while the frozen
      // snapshot itself is the canonical payload being protected by these hashes.
      const expectedStrategyHash=sha256Json({
        diagnosisResultHash:frozen.diagnosisResultHash,
        rootCause:frozen.rootCause,
        recommendations:frozen.recommendations,
        actionPlan:frozen.actionPlan
      });
      const expectedPlanHash=sha256Json({diagnosisResultHash:frozen.diagnosisResultHash,actionPlan:frozen.actionPlan});
      if(expectedStrategyHash!==existing.strategyHash||expectedPlanHash!==existing.planHash)throw new Error(`Frozen strategic priorities payload hash verification failed: strategy=${expectedStrategyHash===existing.strategyHash?"OK":"MISMATCH"}, plan=${expectedPlanHash===existing.planHash?"OK":"MISMATCH"}`);
      return frozen;
    }
    const x=await this.generateStrategy(assessmentId);
    if(diagnosis.trace.runtimeSnapshotHash!==x.snapshotHash)throw new Error("Diagnosis-bound strategy runtime snapshot mismatch");
    if(diagnosis.methodologyBundleSha256!==x.assessment.methodologyVersion.bundleSha256)throw new Error("Diagnosis-bound strategy methodology bundle mismatch");

    // PostgreSQL JSONB is the canonical storage representation. Some nested
    // strategy values can be normalized during the Prisma -> JSONB -> Prisma
    // round-trip, so pre-insert hashing is not sufficient. Persist a temporary
    // snapshot first, read back the exact JSONB payload, hash that persisted
    // representation, then atomically replace the temporary hashes.
    x.strategy=JSON.parse(JSON.stringify(x.strategy));
    const generatedAt=(x.assessment.completedAt??new Date()).toISOString();
    const temporaryStrategyHash=sha256Json({assessmentId,kind:"STRATEGY_PENDING"});
    const temporaryPlanHash=sha256Json({assessmentId,kind:"PLAN_PENDING"});
    const frozenDraft=JSON.parse(JSON.stringify(buildFrozenStrategyPlan({
      assessmentId,
      methodologyVersion:x.methodology.version,
      methodologyBundleSha256:diagnosis.methodologyBundleSha256,
      runtimeSnapshotHash:x.snapshotHash,
      diagnosisResultHash:diagnosis.resultHash,
      generatedAt,
      strategyHash:temporaryStrategyHash,
      planHash:temporaryPlanHash,
      strategy:x.strategy
    }))) as FrozenStrategyPlanSnapshot;

    const frozen=await prisma.$transaction(async(tx:any)=>{
      await tx.strategyPlanSnapshot.create({data:{assessmentId,schemaVersion:frozenDraft.schemaVersion,methodologyVersion:frozenDraft.methodologyVersion,methodologyBundleSha256:frozenDraft.methodologyBundleSha256,runtimeSnapshotHash:frozenDraft.runtimeSnapshotHash,diagnosisResultHash:frozenDraft.diagnosisResultHash,strategyHash:temporaryStrategyHash,planHash:temporaryPlanHash,snapshot:frozenDraft}});

      const persistedRow=await tx.strategyPlanSnapshot.findUnique({where:{assessmentId}});
      if(!persistedRow)throw new Error("Frozen strategic priorities snapshot disappeared after insert");
      const persisted=persistedRow.snapshot as unknown as FrozenStrategyPlanSnapshot;
      const strategyHash=sha256Json({
        diagnosisResultHash:persisted.diagnosisResultHash,
        rootCause:persisted.rootCause,
        recommendations:persisted.recommendations,
        actionPlan:persisted.actionPlan
      });
      const planHash=sha256Json({diagnosisResultHash:persisted.diagnosisResultHash,actionPlan:persisted.actionPlan});
      const canonical:FrozenStrategyPlanSnapshot={...persisted,strategyHash,planHash};

      const updated=await tx.strategyPlanSnapshot.update({where:{assessmentId},data:{strategyHash,planHash,snapshot:canonical}});
      const updatedFrozen=updated.snapshot as unknown as FrozenStrategyPlanSnapshot;
      const verifyStrategyHash=sha256Json({diagnosisResultHash:updatedFrozen.diagnosisResultHash,rootCause:updatedFrozen.rootCause,recommendations:updatedFrozen.recommendations,actionPlan:updatedFrozen.actionPlan});
      const verifyPlanHash=sha256Json({diagnosisResultHash:updatedFrozen.diagnosisResultHash,actionPlan:updatedFrozen.actionPlan});
      if(verifyStrategyHash!==strategyHash||verifyPlanHash!==planHash)throw new Error(`Frozen strategic priorities persisted hash round-trip failed: strategy=${verifyStrategyHash===strategyHash?"OK":"MISMATCH"}, plan=${verifyPlanHash===planHash?"OK":"MISMATCH"}`);

      await tx.strategyRun.update({where:{id:x.strategyRunId},data:{diagnosisResultHash:canonical.diagnosisResultHash,strategyHash}});
      const plan=await tx.actionPlanRecord.findUnique({where:{strategyRunId:x.strategyRunId}});
      if(!plan)throw new Error("Action plan missing while freezing diagnosis-bound strategy");
      await tx.actionPlanRecord.update({where:{id:plan.id},data:{diagnosisResultHash:canonical.diagnosisResultHash,planHash}});
      await tx.auditEvent.create({data:{assessmentId,eventType:"STRATEGY_FROZEN",entityType:"StrategyPlanSnapshot",entityId:strategyHash,payload:{diagnosisResultHash:canonical.diagnosisResultHash,strategyHash,planHash}}});
      await tx.auditEvent.create({data:{assessmentId,eventType:"ACTION_PLAN_FROZEN",entityType:"StrategyPlanSnapshot",entityId:planHash,payload:{diagnosisResultHash:canonical.diagnosisResultHash,strategyHash,planHash,windowDays:canonical.actionPlan.windowDays}}});
      return canonical;
    }, { maxWait: 10000, timeout: 30000 });
    return frozen;
  }

  async getDiagnosisResult(assessmentId:string){ return this.freezeDiagnosisResult(assessmentId); }

  async getDiagnosis(assessmentId:string){ const frozen=await this.freezeStrategyPlan(assessmentId); return {...frozen.rootCause,diagnosisResultHash:frozen.diagnosisResultHash,strategyHash:frozen.strategyHash}; }
  async getRecommendations(assessmentId:string){
    const frozen=await this.freezeStrategyPlan(assessmentId);
    return {...frozen.recommendations,schemaVersion:frozen.schemaVersion,diagnosisResultHash:frozen.diagnosisResultHash,strategyHash:frozen.strategyHash,planHash:frozen.planHash};
  }

  async getActionPlan(assessmentId:string){
    const frozen=await this.freezeStrategyPlan(assessmentId);
    const run=await prisma.strategyRun.findUnique({where:{assessmentId}}); if(!run)throw new Error("Frozen strategy run not found");
    const persisted=await prisma.actionPlanRecord.findUnique({where:{strategyRunId:run.id},include:{milestones:true}}); if(!persisted)throw new Error("Frozen action plan not found");
    if(persisted.diagnosisResultHash!==frozen.diagnosisResultHash||persisted.planHash!==frozen.planHash)throw new Error("Persisted action plan is not bound to canonical diagnosis result");
    const rowById=new Map((persisted.milestones??[]).map((m:any)=>[m.externalId,m]));
    const statusById=new Map((persisted.milestones??[]).map((m:any)=>[m.externalId,m.status]));
    const canonicalPlan=rehydrateActionPlan(frozen,statusById as Map<string,any>);
    const plan={...canonicalPlan,milestones:canonicalPlan.milestones.map((m:any)=>({...m,tracking:trackingView(rowById.get(m.id))}))};
    const currentHorizon=currentHorizonFromDates(persisted.generatedAt);
    const progress:any=calculatePlanProgress(canonicalPlan,currentHorizon);
    const required=canonicalPlan.milestones.filter((m:any)=>m.requirement==="Required"&&m.horizon!=="DEFERRED_BEYOND_V1");
    const weightedDenominator=required.reduce((sum:number,m:any)=>sum+m.recommendationPriority/100,0);
    const weightedNumerator=required.reduce((sum:number,m:any)=>{const row:any=rowById.get(m.id);const pct=Math.max(0,Math.min(100,Number(row?.progressPercent??(m.status==="DONE"?100:0))));return sum+(m.recommendationPriority/100)*(pct/100)},0);
    progress.trackingProgress=weightedDenominator?weightedNumerator/weightedDenominator:0;
    const now=Date.now();
    progress.overdueMilestones=required.filter((m:any)=>{const row:any=rowById.get(m.id);return row?.plannedEndDate&&new Date(row.plannedEndDate).getTime()<now&&!['DONE','SKIPPED'].includes(row.status)}).map((m:any)=>m.id);
    return {schemaVersion:frozen.schemaVersion,diagnosisResultHash:frozen.diagnosisResultHash,strategyHash:frozen.strategyHash,planHash:frozen.planHash,planStartDate:persisted.generatedAt.toISOString(),currentHorizon,plan,progress};
  }

  async updateMilestone(assessmentId:string,milestoneExternalId:string,patch:MilestoneTrackingPatch){
    const frozen=await this.freezeStrategyPlan(assessmentId);
    const run=await prisma.strategyRun.findUnique({where:{assessmentId}}); if(!run)throw new Error("Frozen strategy run not found");
    const plan=await prisma.actionPlanRecord.findUnique({where:{strategyRunId:run.id}}); if(!plan)throw new Error("Action plan not found");
    if(plan.diagnosisResultHash!==frozen.diagnosisResultHash||plan.planHash!==frozen.planHash)throw new Error("Cannot update progress on action plan with invalid diagnosis binding");
    const row:any=await prisma.actionPlanMilestoneRecord.findFirst({where:{actionPlanId:plan.id,externalId:milestoneExternalId}}); if(!row)throw new Error(`Milestone ${milestoneExternalId} not found`);
    const data:any={};
    if(patch.status!==undefined)data.status=patch.status;
    if(patch.progressPercent!==undefined)data.progressPercent=Math.round(patch.progressPercent);
    for(const key of ['noteMn','delayReasonMn','metricUnitMn'] as const)if(patch[key]!==undefined)data[key]=patch[key]?.trim()||null;
    for(const key of ['metricCurrentValue','metricTargetValue'] as const)if(patch[key]!==undefined)data[key]=patch[key];
    const dateFields=[['plannedStartDate','Төлөвлөсөн эхлэх'],['plannedEndDate','Төлөвлөсөн дуусгах'],['actualStartDate','Бодитоор эхэлсэн'],['actualCompletedDate','Бодитоор дууссан']] as const;
    for(const [key,label] of dateFields){const parsed=parseOptionalDate(patch[key],label);if(parsed!==undefined)data[key]=parsed}
    const nextStatus=(data.status??row.status) as string;
    if(nextStatus==='DONE'){data.progressPercent=100;if(data.actualCompletedDate===undefined)data.actualCompletedDate=row.actualCompletedDate??new Date()}
    if(nextStatus==='NOT_STARTED'&&patch.progressPercent===undefined)data.progressPercent=0;
    if(data.progressPercent===100&&patch.status===undefined){data.status='DONE';if(data.actualCompletedDate===undefined)data.actualCompletedDate=row.actualCompletedDate??new Date()}
    if(data.progressPercent>0&&data.progressPercent<100&&patch.status===undefined&&row.status==='NOT_STARTED'){data.status='IN_PROGRESS';if(data.actualStartDate===undefined)data.actualStartDate=row.actualStartDate??new Date()}
    if(data.status==='IN_PROGRESS'&&data.actualStartDate===undefined)data.actualStartDate=row.actualStartDate??new Date();
    if(data.status!==undefined&&data.status!=='DONE'&&row.status==='DONE'&&patch.actualCompletedDate===undefined)data.actualCompletedDate=null;
    const mergedStart=data.plannedStartDate===undefined?row.plannedStartDate:data.plannedStartDate;const mergedEnd=data.plannedEndDate===undefined?row.plannedEndDate:data.plannedEndDate;
    if(mergedStart&&mergedEnd&&new Date(mergedEnd).getTime()<new Date(mergedStart).getTime())throw new Error('Дуусгах огноо эхлэх огнооноос өмнө байж болохгүй');
    const actualStart=data.actualStartDate===undefined?row.actualStartDate:data.actualStartDate;const actualEnd=data.actualCompletedDate===undefined?row.actualCompletedDate:data.actualCompletedDate;
    if(actualStart&&actualEnd&&new Date(actualEnd).getTime()<new Date(actualStart).getTime())throw new Error('Бодит дууссан огноо эхэлсэн огнооноос өмнө байж болохгүй');
    const changedFields=Object.keys(data).filter(k=>{const before=(row as any)[k];const after=data[k];const b=before instanceof Date?before.toISOString():before;const a=after instanceof Date?after.toISOString():after;return b!==a});
    if(!changedFields.length)return {diagnosisResultHash:frozen.diagnosisResultHash,planHash:frozen.planHash,milestone:{...row,tracking:trackingView(row)}};
    const updated:any=await prisma.$transaction(async(tx:any)=>{
      const next=await tx.actionPlanMilestoneRecord.update({where:{id:row.id},data});
      const statusChanged=next.status!==row.status;
      if(statusChanged)await tx.auditEvent.create({data:{assessmentId,eventType:"ACTION_PLAN_MILESTONE_STATUS_CHANGED",entityType:"ActionPlanMilestoneRecord",entityId:row.id,payload:{externalId:milestoneExternalId,previousStatus:row.status,status:next.status,planHash:frozen.planHash,diagnosisResultHash:frozen.diagnosisResultHash}}});
      await tx.auditEvent.create({data:{assessmentId,eventType:"ACTION_PLAN_MILESTONE_TRACKING_UPDATED",entityType:"ActionPlanMilestoneRecord",entityId:row.id,payload:{externalId:milestoneExternalId,changedFields,progressPercent:{from:row.progressPercent,to:next.progressPercent},planHash:frozen.planHash,diagnosisResultHash:frozen.diagnosisResultHash}}});
      return next;
    });
    return {diagnosisResultHash:frozen.diagnosisResultHash,planHash:frozen.planHash,milestone:{...updated,tracking:trackingView(updated)}};
  }

  async freezeReportPayload(assessmentId:string):Promise<FrozenReportPayload>{
    const reportId=`RPT-${assessmentId}-V4`;
    const existing=await prisma.reportSnapshot.findFirst({where:{assessmentId,externalId:reportId}});
    if(existing){
      const diagnosis=await this.freezeDiagnosisResult(assessmentId);
      const frozenStrategy=await this.freezeStrategyPlan(assessmentId);
      if(existing.diagnosisResultHash!==diagnosis.resultHash||existing.strategyHash!==frozenStrategy.strategyHash||existing.planHash!==frozenStrategy.planHash)throw new Error("Frozen report payload hash lineage differs from canonical diagnosis/strategy/plan");
      const payload=existing.payload as unknown as FrozenReportPayload;
      assertFrozenReportBinding(payload);
      if(payload.traceVersion!==TRACE_VERSION||!payload.versionBundleId||!payload.versionBundleHash||!payload.sourceSnapshotId||!payload.sourceSnapshotHash)throw new Error("Legacy report payload is missing Step-12 trace binding; publication is compatibility-blocked");
      if(payload.payloadHash!==existing.payloadHash||sha256Json({...payload,payloadHash:""})!==payload.payloadHash)throw new Error("Frozen report payload hash verification failed");
      return payload;
    }
    const diagnosis=await this.freezeDiagnosisResult(assessmentId);
    const frozenStrategy=await this.freezeStrategyPlan(assessmentId);
    const x=await this.generateStrategy(assessmentId);
    const reportStrategy:StrategyResult={rootCause:frozenStrategy.rootCause,recommendations:frozenStrategy.recommendations,actionPlan:rehydrateActionPlan(frozenStrategy,new Map())};
    const purposes=await prisma.purposeDefinition.findMany({where:{methodologyVersionId:x.assessment.methodologyVersionId},orderBy:{orderIndex:"asc"}});
    const purposeLabels=Object.fromEntries(purposes.map((p:any)=>[p.externalId,p.labelMn]));
    const sourceSnapshot=await prisma.assessmentStateSnapshot.findFirst({where:{assessmentId},orderBy:[{eventSequence:"desc"},{createdAt:"desc"}]});
    if(!sourceSnapshot)throw new Error("Report publication requires an immutable Step-11 assessment state snapshot");
    const generatedAt=(x.assessment.completedAt??new Date()).toISOString();
    const bindingHash=sha256Json(reportBindingMaterial({diagnosisResultHash:diagnosis.resultHash,strategyHash:frozenStrategy.strategyHash,planHash:frozenStrategy.planHash,reportContractVersion:x.methodology.contracts.report.version,aiContractVersion:x.methodology.contracts.aiGeneration.version,findingsPolicyVersion:MMRI_REPORT_FINDINGS_POLICY_VERSION}));
    let payload=buildFrozenReportPayload({reportId,payloadHash:"",traceVersion:TRACE_VERSION,versionBundleId:x.assessment.methodologyVersionId,versionBundleHash:x.assessment.methodologyVersion.bundleSha256,sourceSnapshotId:sourceSnapshot.id,sourceSnapshotHash:sourceSnapshot.payloadHash,diagnosisResultHash:diagnosis.resultHash,strategyHash:frozenStrategy.strategyHash,planHash:frozenStrategy.planHash,bindingHash,generatedAt,assessmentId,assessmentMode:x.assessment.mode,assessmentStatus:x.assessment.status,routingState:x.assessment.routingState,companyName:x.assessment.company.name,methodology:x.methodology,snapshot:x.snapshot,strategy:reportStrategy,purposeLabels});
    payload=JSON.parse(JSON.stringify(payload));

    // PostgreSQL JSONB is the canonical report-payload representation. Persist
    // first with a unique temporary hash, read the exact JSONB payload back,
    // hash that persisted representation, then atomically store the final hash
    // both in metadata and inside the payload itself. This mirrors the strategy
    // snapshot round-trip and prevents JSON/Prisma normalization mismatches.
    const temporaryPayloadHash=sha256Json({assessmentId,reportId,kind:"REPORT_PAYLOAD_PENDING",nonce:randomUUID()});
    payload={...payload,payloadHash:temporaryPayloadHash};
    assertFrozenReportBinding(payload);

    const canonical=await prisma.$transaction(async(tx:any)=>{
      const created=await tx.reportSnapshot.upsert({where:{assessmentId_externalId:{assessmentId,externalId:reportId}},update:{},create:{assessmentId,externalId:reportId,reportContractVersion:payload.reportContractVersion,aiContractVersion:payload.versions.aiGeneration,payloadHash:temporaryPayloadHash,diagnosisResultHash:diagnosis.resultHash,strategyHash:frozenStrategy.strategyHash,planHash:frozenStrategy.planHash,bindingHash,payload,sourceSnapshotId:sourceSnapshot.id,sourceSnapshotHash:sourceSnapshot.payloadHash,versionBundleId:x.assessment.methodologyVersionId,versionBundleHash:x.assessment.methodologyVersion.bundleSha256,traceVersion:TRACE_VERSION,generationState:"PAYLOAD_FROZEN"}});
      const persisted=created.payload as unknown as FrozenReportPayload;
      const payloadHash=sha256Json({...persisted,payloadHash:""});
      const finalPayload:FrozenReportPayload={...persisted,payloadHash};
      const updated=await tx.reportSnapshot.update({where:{id:created.id},data:{payloadHash,payload:finalPayload}});
      const verified=updated.payload as unknown as FrozenReportPayload;
      const verifyHash=sha256Json({...verified,payloadHash:""});
      if(verified.payloadHash!==updated.payloadHash||verifyHash!==updated.payloadHash)throw new Error(`Frozen report payload persisted hash round-trip failed: payload=${verifyHash===updated.payloadHash?"OK":"MISMATCH"}`);
      return verified;
    });
    return canonical;
  }

  async generateReport(assessmentId:string){
    const inFlight=this.reportGenerationInFlight.get(assessmentId); if(inFlight)return inFlight;
    const run=this.generateReportInternal(assessmentId,false).finally(()=>{if(this.reportGenerationInFlight.get(assessmentId)===run)this.reportGenerationInFlight.delete(assessmentId);});
    this.reportGenerationInFlight.set(assessmentId,run); return run;
  }

  private scheduleFallbackUpgrade(assessmentId:string){
    if(this.fallbackUpgradesInFlight.has(assessmentId))return;
    const run=this.generateReportInternal(assessmentId,true).catch(()=>undefined).finally(()=>{if(this.fallbackUpgradesInFlight.get(assessmentId)===run)this.fallbackUpgradesInFlight.delete(assessmentId);});
    this.fallbackUpgradesInFlight.set(assessmentId,run);
  }

  private async generateReportInternal(assessmentId:string,upgradeInline:boolean){
    const timing:Record<string,number>={};const t0=Date.now();let tp=t0;
    const mark=(phase:string)=>{const now=Date.now();timing[phase]=(timing[phase]??0)+(now-tp);tp=now};
    const emit=(outcome:string)=>console.log(JSON.stringify({ts:new Date().toISOString(),level:"info",event:"report_generation_timing",assessmentId,outcome,totalMs:Date.now()-t0,phasesMs:timing}));
    const payload=await this.freezeReportPayload(assessmentId);mark("freeze_report_payload");
    const row=await prisma.reportSnapshot.findFirst({where:{assessmentId,externalId:payload.reportId}}); if(!row)throw new Error("Frozen report snapshot missing");
    assertFrozenReportBinding(payload);
    const auditView=(r:any)=>({modelIdentifier:r.modelIdentifier,modelConfig:r.modelConfig,promptVersion:r.promptVersion,validatorVersion:r.validatorVersion,generationAttemptCount:r.generationAttemptCount,providerHttpAttemptCount:r.providerHttpAttemptCount??0,providerRetryCount:r.providerRetryCount??0,providerRequestIds:r.providerRequestIds??[],narrativeHash:r.narrativeHash,providerError:r.providerError??null,nextAiRetryAt:r.nextAiRetryAt??null,generationFailureCount:r.generationFailureCount??0});
    // An administrator-published revision is final: it is served as stored and never regenerated by the automatic contract/version refresh below.
    const adminPublished=Boolean(row.narrative&&row.validation&&(row.validation as any).state==="PASS")&&(await prisma.reportReview.count({where:{assessmentId,status:"PUBLISHED"}}))>0;
    if(adminPublished){
      const narrative=row.narrative as unknown as NarrativeDraft;
      if(row.narrativeHash!==sha256Json(narrative))throw new Error("Published report narrative hash mismatch");
      if(row.bindingHash!==payload.bindingHash)throw new Error("Published report binding hash mismatch");
      return {payload,narrative,validation:row.validation,generationState:row.generationState,aiAudit:auditView(row)};
    }
    if(row.narrative&&row.validation&&["PASS","AI_FALLBACK_USED"].includes(row.generationState)){
      const narrative=row.narrative as unknown as NarrativeDraft;
      const narrativeHash=sha256Json(narrative);
      if(row.narrativeHash!==narrativeHash)throw new Error("Published report narrative hash mismatch");
      if(row.bindingHash!==payload.bindingHash)throw new Error("Published report binding hash mismatch");
      const contractCurrent=row.promptVersion===MMRI_AI_REPORT_PROMPT_VERSION&&row.validatorVersion===MMRI_NARRATIVE_VALIDATOR_VERSION;
      const cooldownComplete=!row.nextAiRetryAt||row.nextAiRetryAt.getTime()<=Date.now();
      // A report under administrator review (or already reviewed) is never silently rewritten by an automatic AI upgrade.
      const underReview=(await prisma.reportReview.count({where:{assessmentId}}))>0;
      const shouldUpgradeFallback=!underReview&&row.generationState==="AI_FALLBACK_USED"&&Boolean(this.narrativeProvider)&&cooldownComplete;
      if(contractCurrent&&!shouldUpgradeFallback)return {payload,narrative,validation:row.validation,generationState:row.generationState,aiAudit:auditView(row)};
      if(contractCurrent&&shouldUpgradeFallback&&!upgradeInline){
        // The published report is already complete and valid. A slow AI retry (tens of seconds) must not hold this
        // request: serve what is published and retry the AI upgrade in the background (lease-protected, deduplicated).
        this.scheduleFallbackUpgrade(assessmentId);
        return {payload,narrative,validation:row.validation,generationState:row.generationState,aiAudit:auditView(row)};
      }
    }

    const leaseId=randomUUID(), startedAt=new Date(), leaseMs=AI_GENERATION_LEASE_MS(), leaseExpiresAt=new Date(startedAt.getTime()+leaseMs);
    const leased=await prisma.reportSnapshot.updateMany({where:{id:row.id,OR:[{generationLeaseId:null},{generationLeaseExpiresAt:null},{generationLeaseExpiresAt:{lt:startedAt}}]},data:{generationLeaseId:leaseId,generationLeaseExpiresAt:leaseExpiresAt,generationStartedAt:startedAt}});
    if(leased.count!==1)throw new ReportGenerationInProgressError();
    await prisma.auditEvent.create({data:{assessmentId,eventType:"REPORT_GENERATION_STARTED",entityType:"ReportSnapshot",entityId:row.id,payload:{leaseId,previousState:row.generationState,promptVersion:MMRI_AI_REPORT_PROMPT_VERSION,validatorVersion:MMRI_NARRATIVE_VALIDATOR_VERSION,provider:this.narrativeProvider?.metadata.provider??"NONE",modelIdentifier:this.narrativeProvider?.metadata.modelIdentifier??"deterministic-fallback"}}});

    try{
      mark("lease_and_audit");
      const result=await generateValidatedNarrative(payload,this.narrativeProvider);
      mark("narrative_ai_and_validation");
      const narrativeHash=sha256Json(result.narrative);
      // Renew ownership before provenance freezing so a slow trace build cannot let another
      // process publish a competing narrative for the same frozen report.
      const renewed=await prisma.reportSnapshot.updateMany({where:{id:row.id,generationLeaseId:leaseId},data:{generationLeaseExpiresAt:new Date(Date.now()+leaseMs)}});
      if(renewed.count!==1)throw new ReportGenerationInProgressError();
      const trace=await this.traceability.freezePublicationTrace(assessmentId,payload,result.narrative,prisma,row.id);
      mark("publication_trace");
      const completedAt=new Date(); const cooldownMs=AI_RETRY_COOLDOWN_MS();
      const nextAiRetryAt=result.state==="AI_FALLBACK_USED"&&Boolean(this.narrativeProvider)&&Boolean(result.providerError)&&cooldownMs>0?new Date(completedAt.getTime()+cooldownMs):null;
      const updated=await prisma.$transaction(async(tx:any)=>{
        const changed=await tx.reportSnapshot.updateMany({where:{id:row.id,generationLeaseId:leaseId},data:{narrative:result.narrative,narrativeHash,validation:result.validation,generationState:result.state,modelIdentifier:result.providerMetadata.modelIdentifier,modelConfig:result.providerMetadata.modelConfig,promptVersion:result.providerMetadata.promptVersion,validatorVersion:MMRI_NARRATIVE_VALIDATOR_VERSION,generationAttemptCount:result.providerAttempts,providerHttpAttemptCount:result.providerHttpAttempts,providerRetryCount:result.providerRetryCount,providerRequestIds:result.providerRequestIds,providerError:result.providerError,nextAiRetryAt,publishedAt:completedAt,generationCompletedAt:completedAt,generationLeaseId:null,generationLeaseExpiresAt:null,traceGraphHash:trace.graphHash,sourceSnapshotId:payload.sourceSnapshotId,sourceSnapshotHash:payload.sourceSnapshotHash,versionBundleId:payload.versionBundleId,versionBundleHash:payload.versionBundleHash,traceVersion:payload.traceVersion}});
        if(changed.count!==1)throw new ReportGenerationInProgressError();
        await tx.auditEvent.create({data:{assessmentId,eventType:"REPORT_VALIDATED",entityType:"ReportSnapshot",entityId:row.id,payload:{state:result.state,bindingHash:payload.bindingHash,narrativeHash,validation:result.validation,leaseId}}});
        if(result.state==="AI_FALLBACK_USED")await tx.auditEvent.create({data:{assessmentId,eventType:"REPORT_GENERATION_FALLBACK",entityType:"ReportSnapshot",entityId:row.id,payload:{leaseId,providerError:result.providerError,providerAttempts:result.providerAttempts,providerHttpAttempts:result.providerHttpAttempts,providerRetryCount:result.providerRetryCount,providerRequestIds:result.providerRequestIds,nextAiRetryAt:nextAiRetryAt?.toISOString()??null}}});
        await tx.auditEvent.create({data:{assessmentId,eventType:"REPORT_GENERATED",entityType:"ReportSnapshot",entityId:row.id,payload:{state:result.state,diagnosisResultHash:payload.diagnosisResultHash,strategyHash:payload.strategyHash,planHash:payload.planHash,bindingHash:payload.bindingHash,narrativeHash,modelIdentifier:result.providerMetadata.modelIdentifier,promptVersion:result.providerMetadata.promptVersion,generationAttemptCount:result.providerAttempts,providerHttpAttemptCount:result.providerHttpAttempts,providerRetryCount:result.providerRetryCount,providerRequestIds:result.providerRequestIds,providerError:result.providerError,leaseId}}});
        return tx.reportSnapshot.findUnique({where:{id:row.id}});
      },{maxWait:10000,timeout:30000});
      mark("publish_transaction");emit(result.state);
      return {payload,narrative:result.narrative,validation:result.validation,generationState:result.state,aiAudit:updated?auditView(updated):{...result.providerMetadata,generationAttemptCount:result.providerAttempts,providerHttpAttemptCount:result.providerHttpAttempts,providerRetryCount:result.providerRetryCount,providerRequestIds:result.providerRequestIds,narrativeHash,providerError:result.providerError,nextAiRetryAt}};
    }catch(error:any){
      const message=error instanceof Error?error.message.slice(0,500):"Report generation failed";
      const priorPublished=Boolean(row.narrative&&row.validation&&["PASS","AI_FALLBACK_USED"].includes(row.generationState));
      const restoreState=priorPublished?row.generationState:"GENERATION_BLOCKED";
      await prisma.$transaction(async(tx:any)=>{
        const changed=await tx.reportSnapshot.updateMany({where:{id:row.id,generationLeaseId:leaseId},data:{generationState:restoreState,providerError:message,generationCompletedAt:new Date(),generationLeaseId:null,generationLeaseExpiresAt:null,generationFailureCount:{increment:1}}});
        if(changed.count===1)await tx.auditEvent.create({data:{assessmentId,eventType:"REPORT_GENERATION_FAILED",entityType:"ReportSnapshot",entityId:row.id,payload:{leaseId,error:message,restoredState:restoreState}}});
      },{maxWait:10000,timeout:30000}).catch(()=>undefined);
      throw error;
    }
  }

  async readPublishedReport(assessmentId:string){
    const row=await prisma.reportSnapshot.findFirst({where:{assessmentId,publishedAt:{not:null}},orderBy:{publishedAt:"desc"}});
    if(!row||!row.narrative||!row.validation)throw new Error("Published report not found");
    const payload=row.payload as unknown as FrozenReportPayload;
    assertFrozenReportBinding(payload);
    const narrative=row.narrative as unknown as NarrativeDraft;
    const narrativeHash=sha256Json(narrative);
    if(row.payloadHash!==payload.payloadHash||sha256Json({...payload,payloadHash:""})!==payload.payloadHash)throw new Error("Published report payload hash mismatch");
    if(row.narrativeHash!==narrativeHash)throw new Error("Published report narrative hash mismatch");
    if(row.bindingHash!==payload.bindingHash)throw new Error("Published report binding hash mismatch");
    return {payload,narrative,validation:row.validation,generationState:row.generationState,aiAudit:{modelIdentifier:row.modelIdentifier,modelConfig:row.modelConfig,promptVersion:row.promptVersion,validatorVersion:row.validatorVersion,generationAttemptCount:row.generationAttemptCount,providerHttpAttemptCount:row.providerHttpAttemptCount??0,providerRetryCount:row.providerRetryCount??0,providerRequestIds:row.providerRequestIds??[],narrativeHash:row.narrativeHash,providerError:row.providerError??null,nextAiRetryAt:row.nextAiRetryAt??null,generationFailureCount:row.generationFailureCount??0}};
  }


  /**
   * PDF paths must never wait on (or mutate the narrative through) an AI upgrade attempt, which can take
   * the full provider timeout. Serve the already-published report; only generate when none exists yet.
   */
  async ensurePublishedReport(assessmentId:string){
    try{return await this.readPublishedReport(assessmentId);}
    catch(error){if(!(error instanceof Error)||error.message!=="Published report not found")throw error;}
    return this.generateReport(assessmentId);
  }

  async getOrCreateReportPdf(assessmentId:string,force=false){
    const published=await this.readPublishedReport(assessmentId);
    const row=await prisma.reportSnapshot.findFirst({where:{assessmentId,publishedAt:{not:null}},orderBy:{publishedAt:"desc"}});
    if(!row)throw new Error("Published report not found");
    const artifact=await this.pdfArtifacts.ensure(row.id,published.payload,published.narrative,force);
    return artifact;
  }

  async getTraceability(assessmentId:string){
    const frozen=await this.traceability.getFrozenTrace(assessmentId);
    if(frozen)return frozen;
    const graph=await this.traceability.buildGraph(assessmentId);
    return {traceVersion:TRACE_VERSION,graphHash:sha256Json(graph),publicationStatus:"NOT_YET_PUBLISHED",createdAt:null,graph};
  }

  async validateAiDraft(assessmentId:string,draft:NarrativeDraft){
    const payload=await this.freezeReportPayload(assessmentId);
    const validation=validateNarrativeDraft(payload,withDeterministicClaimIds(draft));
    const row=await prisma.reportSnapshot.findFirst({where:{assessmentId,externalId:payload.reportId}}); if(!row)throw new Error("Frozen report snapshot missing");
    if(row.publishedAt)throw new Error("Published report narrative is immutable");
    return validation;
  }
}
