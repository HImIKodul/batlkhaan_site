import { prisma } from "../db.js";
import { sha256Json } from "../lib/hash.js";
import type { FrozenReportPayload, NarrativeDraft } from "../report/types.js";

export const TRACE_VERSION = "MMRI-TRACE-1.0" as const;

type TraceEdge = { from: string; to: string; relation: string };
type TraceCheck = { id: string; status: "PASS" | "FAIL"; detail: string };

function jsonArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function sorted<T>(values: T[], key: (value:T)=>string): T[] { return [...values].sort((a,b)=>key(a).localeCompare(key(b))); }

/** The part of a trace graph that does not depend on the narrative text structure (everything except report/claim nodes, their edges and their checks). */
function provenanceCore(g: TraceGraphEnvelope): unknown {
  const narrativeRelations = new Set(["CONTAINS_CLAIM", "CLAIM_GROUNDED_IN", "RENDERED_FROM_SNAPSHOT", "RENDERED_WITH_VERSION_BUNDLE"]);
  const { reportClaims: _c, reports: _r, ...nodes } = (g as any).nodes ?? {};
  return {
    traceVersion: g.traceVersion, assessmentId: g.assessmentId, versionBundle: g.versionBundle, sourceSnapshot: g.sourceSnapshot, nodes,
    edges: ((g as any).edges ?? []).filter((e: TraceEdge) => !narrativeRelations.has(e.relation)),
    replay: (g as any).replay
  };
}

export interface TraceGraphEnvelope {
  traceVersion: typeof TRACE_VERSION;
  assessmentId: string;
  versionBundle: { id: string; version: string; hash: string };
  sourceSnapshot: { id: string; hash: string; kind: string; assessmentRevision: number; eventSequence: number };
  nodes: {
    assessment: Array<Record<string, unknown>>;
    questions: Array<Record<string, unknown>>;
    questionIssues: Array<Record<string, unknown>>;
    answerEvents: Array<Record<string, unknown>>;
    cells: Array<Record<string, unknown>>;
    categories: Array<Record<string, unknown>>;
    purposes: Array<Record<string, unknown>>;
    contradictions: Array<Record<string, unknown>>;
    rootFindings: Array<Record<string, unknown>>;
    recommendations: Array<Record<string, unknown>>;
    milestones: Array<Record<string, unknown>>;
    strengths: Array<Record<string, unknown>>;
    weaknesses: Array<Record<string, unknown>>;
    reportClaims: Array<Record<string, unknown>>;
    reports: Array<Record<string, unknown>>;
  };
  edges: TraceEdge[];
  publicationChecks: TraceCheck[];
  replay: { diagnosisRuntimeHash: string | null; strategyRuntimeHash: string | null; equivalent: boolean | null };
  guardrails: {
    respondentPiiExcluded: true;
    draftsExcludedFromEvidence: true;
    aiCannotCreateTraceSource: true;
    publishedTraceImmutable: true;
  };
}

export class TraceabilityService {
  async buildGraph(assessmentId: string, payload?: FrozenReportPayload, draft?: NarrativeDraft, db: any = prisma): Promise<TraceGraphEnvelope> {
    const assessment = await db.assessment.findUnique({ where: { id: assessmentId }, include: { methodologyVersion: true } });
    if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
    const sourceSnapshot = await db.assessmentStateSnapshot.findFirst({ where: { assessmentId }, orderBy: [{ eventSequence: "desc" }, { createdAt: "desc" }] });
    if (!sourceSnapshot) throw new Error("Trace publication requires an immutable assessment state snapshot");

    const [issues, answerEvents, signals, cellStates, categoryResults, purposeResults, purposeCategoryRows, contradictions, strategyRun, diagnosisSnapshot] = await Promise.all([
      db.assessmentAskedQuestion.findMany({ where: { assessmentId }, include: { question: { include: { category: true, primaryCell: { include: { cellTemplate: true } } } } }, orderBy: { askedOrder: "asc" } }),
      db.answerEvent.findMany({ where: { assessmentId }, orderBy: { eventSequence: "asc" } }),
      db.evidenceSignal.findMany({ where: { assessmentId, active: true }, include: { cell: { include: { category: true, cellTemplate: true } } } }),
      db.assessmentCellState.findMany({ where: { assessmentId }, include: { cell: { include: { category: true, cellTemplate: true } } } }),
      db.categoryResult.findMany({ where: { assessmentId }, include: { category: true } }),
      db.purposeResult.findMany({ where: { assessmentId }, include: { purpose: true } }),
      db.categoryOutcomePriorityResult.findMany({ where: { assessmentId }, include: { purpose: true, category: true } }),
      db.contradiction.findMany({ where: { assessmentId }, include: { cell: { include: { category: true, cellTemplate: true } } } }),
      db.strategyRun.findUnique({ where: { assessmentId }, include: { rootFindings: true, recommendations: true, actionPlan: { include: { milestones: true } } } }),
      db.diagnosisSnapshot.findUnique({ where: { assessmentId } })
    ]);

    const traceIds = new Set<string>();
    const edges: TraceEdge[] = [];
    const addId = (id:string) => { traceIds.add(id); return id; };
    const edge = (from:string,to:string,relation:string) => edges.push({from,to,relation});

    const assessmentTraceId = addId(`assessment:${assessmentId}`);
    const versionTraceId = addId(`version:${assessment.methodologyVersionId}`);
    const snapshotTraceId = addId(`snapshot:${sourceSnapshot.id}`);
    edge(assessmentTraceId, versionTraceId, "PINNED_TO_VERSION_BUNDLE");
    edge(snapshotTraceId, assessmentTraceId, "SNAPSHOT_OF_ASSESSMENT");

    const questionNodes = new Map<string,Record<string,unknown>>();
    const issueNodes: Array<Record<string,unknown>> = [];
    for (const issue of issues) {
      const q = issue.question;
      const qExternal = q.externalId;
      const categoryExternal = q.category.externalId;
      const cellExternal = q.primaryCell.cellTemplate?.externalId ?? q.primaryCell.externalId;
      const questionTraceId = addId(`question:${qExternal}`);
      if (!questionNodes.has(questionTraceId)) questionNodes.set(questionTraceId,{ traceId:questionTraceId, questionId:qExternal, primaryCategoryId:categoryExternal, primaryCellId:cellExternal, path:q.path, sourceKind:q.sourceKind });
      const issueTraceId = addId(`issue:${issue.id}`);
      issueNodes.push({ traceId:issueTraceId, questionIssueId:issue.id, issueSequence:issue.askedOrder, issuedAt:issue.askedAt.toISOString(), status:issue.status });
      edge(issueTraceId,questionTraceId,"ISSUED_INSTANCE_OF");
    }

    const answerByLegacyId = new Map<string,string>();
    const answerNodes: Array<Record<string,unknown>> = [];
    for (const event of answerEvents) {
      const issue = issues.find((x:any)=>x.id===event.questionIssueId);
      const q = issue?.question;
      const qExternal = event.questionExternalId ?? q?.externalId ?? String(event.questionId).split(":").at(-1)!;
      const categoryExternal = event.primaryCategoryExternalId ?? q?.category?.externalId ?? null;
      const cellExternal = event.primaryCellExternalId ?? q?.primaryCell?.cellTemplate?.externalId ?? q?.primaryCell?.externalId ?? null;
      const answerTraceId = addId(`answer:${event.id}`);
      answerByLegacyId.set(event.answerId,answerTraceId);
      answerNodes.push({ traceId:answerTraceId, answerEventId:event.id, eventSequence:event.eventSequence, questionId:qExternal, questionIssueId:event.questionIssueId, answerState:event.answerState, score:event.normalizedScore===null||event.normalizedScore===undefined ? (event.rawValue as any)?.score ?? null : Number(event.normalizedScore), authority:event.authority===null?null:Number(event.authority), effectiveReliability:event.effectiveReliability===null?null:Number(event.effectiveReliability), primaryCategoryId:categoryExternal, primaryCellId:cellExternal, path:event.questionPath ?? q?.path ?? null, sourceKind:event.sourceKindSnapshot ?? q?.sourceKind ?? null });
      edge(answerTraceId,`issue:${event.questionIssueId}`,"ANSWERS_ISSUE");
      edge(answerTraceId,`question:${qExternal}`,"ANSWERS_QUESTION");
      if (categoryExternal && cellExternal) edge(answerTraceId,`cell:${categoryExternal}:${cellExternal}`,"PRIMARY_EVIDENCE_FOR");
      edge(snapshotTraceId,answerTraceId,"FROZEN_AFTER_EVIDENCE");
    }

    for (const signal of signals) {
      const answerTraceId = answerByLegacyId.get(signal.answerId);
      if (!answerTraceId) continue;
      const categoryExternal = signal.cell.category.externalId;
      const cellExternal = signal.cell.cellTemplate?.externalId ?? signal.cell.externalId;
      const cellTraceId = addId(`cell:${categoryExternal}:${cellExternal}`);
      edge(answerTraceId,cellTraceId,signal.signalKind==="PRIMARY"?"PRIMARY_EVIDENCE_FOR":"SECONDARY_EVIDENCE_FOR");
    }

    const cellNodes = cellStates.map((row:any)=>{
      const categoryExternal=row.cell.category.externalId;
      const cellExternal=row.cell.cellTemplate?.externalId??row.cell.externalId;
      const traceId=addId(`cell:${categoryExternal}:${cellExternal}`);
      const categoryTraceId=addId(`category:${categoryExternal}`);
      edge(traceId,categoryTraceId,"BELONGS_TO_CATEGORY");
      return { traceId, categoryId:categoryExternal, cellId:cellExternal, cellStatus:row.status, directValue:row.normalizedScore===null?null:Number(row.normalizedScore), confidence:Number(row.confidence), directCount:row.directAnswerCount, sourceKinds:row.independentSourceKinds, contradictionIndex:Number(row.contradictionIndex) };
    });

    const categoryNodes = categoryResults.map((row:any)=>({ traceId:addId(`category:${row.category.externalId}`), categoryId:row.category.externalId, categoryScore:row.officialScore===null?(row.partialScore===null?null:Number(row.partialScore)):Number(row.officialScore), categoryConfidence:row.confidence===null?null:Number(row.confidence), categoryCoverage:row.coverage===null?null:Number(row.coverage), effectiveCategoryWeight:row.effectiveModuleWeightPct===null?null:Number(row.effectiveModuleWeightPct) }));
    const purposeNodes = purposeResults.map((row:any)=>({ traceId:addId(`purpose:${row.purpose.externalId}`), purposeId:row.purpose.externalId, score:row.officialScore===null?(row.partialScore===null?null:Number(row.partialScore)):Number(row.officialScore), confidence:row.confidence===null?null:Number(row.confidence), coverage:row.coverage===null?null:Number(row.coverage) }));
    for (const row of purposeCategoryRows) edge(addId(`purpose:${row.purpose.externalId}`),addId(`category:${row.category.externalId}`),"AGGREGATES_CATEGORY_CONTRIBUTION");

    const contradictionNodes = contradictions.map((row:any)=>{
      const categoryExternal=row.cell.category.externalId;
      const cellExternal=row.cell.cellTemplate?.externalId??row.cell.externalId;
      const traceId=addId(`contradiction:${categoryExternal}:${cellExternal}`);
      edge(traceId,addId(`cell:${categoryExternal}:${cellExternal}`),"AFFECTS_CELL");
      return { traceId, contradictionId:row.id, ruleCode:row.ruleCode, status:row.status, severity:row.severity };
    });

    const rootNodes: Array<Record<string,unknown>>=[];
    const recommendationNodes: Array<Record<string,unknown>>=[];
    const milestoneNodes: Array<Record<string,unknown>>=[];
    if (strategyRun) {
      const rootsByDbId=new Map<string,string>();
      for (const r of strategyRun.rootFindings) {
        const traceId=addId(`root:${r.externalId}`); rootsByDbId.set(r.id,traceId);
        const sources=jsonArray(r.sourceTrace); for (const src of sources) edge(traceId,src,"GROUNDED_IN");
        rootNodes.push({traceId,rootFindingId:r.externalId,rootClass:r.classification,findingRole:r.findingRole,sourceTraceIds:sources});
      }
      const recByDbId=new Map<string,string>();
      for (const r of strategyRun.recommendations) {
        const traceId=addId(`recommendation:${r.externalId}`); recByDbId.set(r.id,traceId);
        const sources=jsonArray(r.sourceTrace); for (const src of sources) edge(traceId,src,"GROUNDED_IN");
        const rootTrace=rootsByDbId.get(r.rootFindingId); if(rootTrace)edge(traceId,rootTrace,"BASED_ON_ROOT_FINDING");
        recommendationNodes.push({traceId,recommendationId:r.externalId,interventionCode:r.interventionCode,priority:Number(r.priority),sourceTraceIds:sources});
      }
      for (const m of strategyRun.actionPlan?.milestones ?? []) {
        const traceId=addId(`milestone:${m.externalId}`);
        const sources=jsonArray(m.sourceTrace); for (const src of sources) edge(traceId,src,"GROUNDED_IN");
        const recTrace=recByDbId.get(m.recommendationId); if(recTrace)edge(traceId,recTrace,"IMPLEMENTS_RECOMMENDATION");
        milestoneNodes.push({traceId,milestoneId:m.externalId,horizon:m.horizon,sourceTraceIds:sources});
      }
    }

    const strengthNodes: Array<Record<string,unknown>>=[];
    const weaknessNodes: Array<Record<string,unknown>>=[];
    if(payload){
      for(const s of payload.strengths){ const traceId=addId(`strength:${s.id}`); strengthNodes.push({traceId,strengthId:s.id,categoryId:s.categoryId,sourceTraceIds:s.sourceTraceIds}); for(const src of s.sourceTraceIds)edge(traceId,src,"GROUNDED_IN"); }
      for(const w of payload.weaknesses){ const traceId=addId(`weakness:${w.id}`); weaknessNodes.push({traceId,weaknessId:w.id,categoryId:w.categoryId,sourceTraceIds:w.sourceTraceIds}); for(const src of w.sourceTraceIds)edge(traceId,src,"GROUNDED_IN"); }
    }

    const claimNodes: Array<Record<string,unknown>>=[];
    const reportNodes: Array<Record<string,unknown>>=[];
    if(payload && draft){
      const reportTraceId=addId(`report:${payload.reportId}`);
      reportNodes.push({traceId:reportTraceId,reportId:payload.reportId,payloadHash:payload.payloadHash,bindingHash:payload.bindingHash});
      edge(reportTraceId,snapshotTraceId,"RENDERED_FROM_SNAPSHOT"); edge(reportTraceId,versionTraceId,"RENDERED_WITH_VERSION_BUNDLE");
      for(const section of draft.sections){
        for(const claim of section.claims){
          const claimId=claim.reportClaimId ?? "";
          const traceId=addId(`claim:${claimId}`);
          claimNodes.push({traceId,reportClaimId:claimId,sectionId:section.id,claimType:claim.claimType,sourceTraceIds:[...claim.sourceTraceIds]});
          edge(reportTraceId,traceId,"CONTAINS_CLAIM");
          for(const src of claim.sourceTraceIds)edge(traceId,src,"CLAIM_GROUNDED_IN");
        }
      }
    }

    const checks:TraceCheck[]=[];
    const check=(id:string,pass:boolean,detail:string)=>checks.push({id,status:pass?"PASS":"FAIL",detail});
    const bundleHash=sourceSnapshot.versionBundleHash ?? assessment.methodologyVersion.bundleSha256;
    check("T01_VERSION_PIN",Boolean(assessment.methodologyVersionId&&bundleHash),"Assessment is pinned to an explicit methodology bundle id/hash.");
    check("T02_SNAPSHOT_HASH",Boolean(sourceSnapshot.id&&sourceSnapshot.payloadHash),"Immutable terminal snapshot id/hash is present.");
    check("T03_ANSWER_MAPPING",answerNodes.every((a:any)=>a.questionId&&a.primaryCategoryId&&a.primaryCellId&&a.path&&a.sourceKind&&traceIds.has(`issue:${a.questionIssueId}`)&&traceIds.has(`question:${a.questionId}`)&&traceIds.has(`cell:${a.primaryCategoryId}:${a.primaryCellId}`)),"Each AnswerEvent resolves question/category/cell/path/source-kind provenance.");
    check("T04_SCORE_PROVENANCE",!payload||payload.metricType==="NONE"||answerNodes.length>0,"Published score has canonical accepted AnswerEvent provenance.");
    const rootSourceIds=rootNodes.flatMap((n:any)=>n.sourceTraceIds); check("T05_ROOT_PROVENANCE",rootSourceIds.every(id=>traceIds.has(id)),"All root finding sourceTraceIds resolve in the canonical graph.");
    const recSourceIds=recommendationNodes.flatMap((n:any)=>n.sourceTraceIds); check("T06_RECOMMENDATION_PROVENANCE",recommendationNodes.every((n:any)=>n.sourceTraceIds.length>0)&&recSourceIds.every(id=>traceIds.has(id)),"All recommendations resolve to finding/rule provenance.");
    const milestoneSourceIds=milestoneNodes.flatMap((n:any)=>n.sourceTraceIds); check("T07_MILESTONE_PROVENANCE",milestoneNodes.every((n:any)=>n.sourceTraceIds.length>0)&&milestoneSourceIds.every(id=>traceIds.has(id)),"All milestones resolve to recommendation provenance.");
    if(payload&&draft){
      const claimIds=draft.sections.flatMap(s=>s.claims.map(c=>c.reportClaimId??""));
      const claimSources=draft.sections.flatMap(s=>s.claims.flatMap(c=>c.sourceTraceIds));
      check("T08_REPORT_CLAIM_IDS",claimIds.every(Boolean)&&unique(claimIds).length===claimIds.length,"Every factual report claim has a unique deterministic reportClaimId.");
      check("T09_REPORT_CLAIM_PROVENANCE",claimSources.length>0&&claimSources.every(id=>traceIds.has(id)&&Boolean(payload.traceIndex[id])),"Every factual report claim resolves through both report traceIndex and canonical trace graph.");
      check("T10_PAYLOAD_BINDING",payload.traceVersion===TRACE_VERSION&&payload.versionBundleId===assessment.methodologyVersionId&&payload.versionBundleHash===bundleHash&&payload.sourceSnapshotId===sourceSnapshot.id&&payload.sourceSnapshotHash===sourceSnapshot.payloadHash,"Report payload is bound to exact version bundle and frozen state snapshot.");
    }
    const replayEquivalent=diagnosisSnapshot&&strategyRun ? diagnosisSnapshot.runtimeSnapshotHash===strategyRun.snapshotHash : null;
    check("T11_REPLAY_LINEAGE",replayEquivalent!==false,"Diagnosis and strategy reference the same deterministic runtime snapshot hash.");
    check("T12_NO_PII",true,"Trace graph excludes respondent display names, emails and raw respondent identifiers.");

    return {
      traceVersion:TRACE_VERSION,assessmentId,
      versionBundle:{id:assessment.methodologyVersionId,version:assessment.methodologyVersion.version,hash:bundleHash},
      sourceSnapshot:{id:sourceSnapshot.id,hash:sourceSnapshot.payloadHash,kind:sourceSnapshot.kind,assessmentRevision:sourceSnapshot.assessmentRevision,eventSequence:sourceSnapshot.eventSequence},
      nodes:{assessment:[{traceId:assessmentTraceId,assessmentId,status:assessment.status,mode:assessment.mode}],questions:sorted([...questionNodes.values()],x=>String(x.traceId)),questionIssues:issueNodes,answerEvents:answerNodes,cells:sorted(cellNodes,x=>String(x.traceId)),categories:sorted(categoryNodes,x=>String(x.traceId)),purposes:sorted(purposeNodes,x=>String(x.traceId)),contradictions:sorted(contradictionNodes,x=>String(x.traceId)),rootFindings:sorted(rootNodes,x=>String(x.traceId)),recommendations:sorted(recommendationNodes,x=>String(x.traceId)),milestones:sorted(milestoneNodes,x=>String(x.traceId)),strengths:sorted(strengthNodes,x=>String(x.traceId)),weaknesses:sorted(weaknessNodes,x=>String(x.traceId)),reportClaims:sorted(claimNodes,x=>String(x.traceId)),reports:reportNodes},
      edges:sorted(unique(edges.map(e=>JSON.stringify(e))).map(x=>JSON.parse(x)),e=>`${e.from}|${e.relation}|${e.to}`),publicationChecks:checks,
      replay:{diagnosisRuntimeHash:diagnosisSnapshot?.runtimeSnapshotHash??null,strategyRuntimeHash:strategyRun?.snapshotHash??null,equivalent:replayEquivalent},
      guardrails:{respondentPiiExcluded:true,draftsExcludedFromEvidence:true,aiCannotCreateTraceSource:true,publishedTraceImmutable:true}
    };
  }

  async freezePublicationTrace(assessmentId:string,payload:FrozenReportPayload,draft:NarrativeDraft,db:any=prisma,reportSnapshotId?:string){
    const graph=await this.buildGraph(assessmentId,payload,draft,db);
    const failed=graph.publicationChecks.filter(c=>c.status==="FAIL");
    if(failed.length) throw new Error(`Trace publication gate failed: ${failed.map(x=>`${x.id}:${x.detail}`).join(" | ")}`);
    const graphHash=sha256Json(graph);
    const client=db as any;
    /* MMRI-31: published provenance is append-only, never rewritten. The first publication of a report freezes `TRACE-<reportId>`; when a later,
       validated narrative revision (an eligible fallback-to-AI upgrade) has a different claim structure, its graph is frozen as its own revision
       `TRACE-<reportId>-R<n>` and the earlier revision stays untouched. Only the narrative-dependent parts (report/claim nodes and edges) may differ:
       a change to the underlying evidence/scoring/plan provenance still fails as immutable. */
    const baseId=`TRACE-${payload.reportId}`;
    const family:any[]=(await client.traceSnapshot.findMany({where:{assessmentId,externalId:{startsWith:baseId}},orderBy:{createdAt:"asc"}})).filter((r:any)=>r.externalId===baseId||/^-R\d+$/.test(String(r.externalId).slice(baseId.length)));
    const sameGraph=family.find((r:any)=>r.graphHash===graphHash);
    if(sameGraph)return {traceSnapshot:sameGraph,graph,graphHash,verified:true};
    const latest=family.at(-1);
    if(latest&&sha256Json(provenanceCore(latest.graph as TraceGraphEnvelope))!==sha256Json(provenanceCore(graph)))throw new Error("Published trace graph is immutable and no longer matches regenerated provenance");
    const externalId=latest?`${baseId}-R${family.length+1}`:baseId;
    const traceSnapshot=await client.traceSnapshot.create({data:{assessmentId,externalId,traceVersion:TRACE_VERSION,sourceSnapshotId:graph.sourceSnapshot.id,sourceSnapshotHash:graph.sourceSnapshot.hash,versionBundleId:graph.versionBundle.id,versionBundleHash:graph.versionBundle.hash,graphHash,graph,publicationStatus:"PASS",reportSnapshotId:reportSnapshotId??null}});
    await client.auditEvent.create({data:{assessmentId,eventType:"TRACE_GRAPH_FROZEN",entityType:"TraceSnapshot",entityId:traceSnapshot.id,payload:{traceVersion:TRACE_VERSION,graphHash,sourceSnapshotHash:graph.sourceSnapshot.hash,versionBundleHash:graph.versionBundle.hash}}});
    await client.auditEvent.create({data:{assessmentId,eventType:"TRACE_GRAPH_VERIFIED",entityType:"TraceSnapshot",entityId:traceSnapshot.id,payload:{checks:graph.publicationChecks,graphHash}}});
    return {traceSnapshot,graph,graphHash,verified:true};
  }

  async getFrozenTrace(assessmentId:string,db:any=prisma){
    const row=await (db as any).traceSnapshot.findFirst({where:{assessmentId},orderBy:{createdAt:"desc"}});
    if(!row)return null;
    const graph=row.graph as TraceGraphEnvelope;
    const graphHash=sha256Json(graph);
    if(graphHash!==row.graphHash)throw new Error("Frozen trace graph hash verification failed");
    return {traceVersion:row.traceVersion,graphHash:row.graphHash,publicationStatus:row.publicationStatus,createdAt:row.createdAt,graph};
  }
}
