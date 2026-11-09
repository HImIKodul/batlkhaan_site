import { prisma } from "../../db.js";
import { PrismaAssessmentEngine } from "../../services/prisma-assessment-engine.js";
import { numberOrNull } from "../presenters.js";
import type { PrismaStrategyReportService } from "../../services/prisma-strategy-report-service.js";
import { DOMAIN_CODES } from "../../domain-methodology.js";
import { derivedContentWithheld } from "../../services/report-review-policy.js";
import { ACTIVE_ASSESSMENT_STATUSES, RESULT_TERMINAL_ASSESSMENT_STATUSES, isResultTerminalAssessmentStatus, isTerminalAssessmentStatus, lifecyclePhase } from "../../services/assessment-lifecycle.js";

/** Scores are derived content: while a mandatory review has not published, no customer summary may carry them (same decision as the report/results read gate). */
function redactOverall(overall:{partialScore:number|null;officialScore:number|null;isOfficial:boolean;coverage:number|null;aggregationVersion?:any},withheld:boolean){
  return withheld?{...overall,partialScore:null,officialScore:null,isOfficial:false,coverage:null}:overall;
}

export class AssessmentQueryService {
  constructor(private readonly engine: PrismaAssessmentEngine, private readonly strategyReports: PrismaStrategyReportService) {}

  async listCompanyAssessments(companyId:string) {
    const rows=await prisma.assessment.findMany({
      where:{companyId},
      include:{methodologyVersion:true},
      orderBy:{createdAt:"desc"}
    });
    const withheldIds=new Set<string>();
    for(const a of rows){ if(a.completedAt||isTerminalAssessmentStatus(a.status)){ if((await derivedContentWithheld(prisma,a)).withheld)withheldIds.add(a.id); } }
    return rows.map(a=>({
      reportAvailable:!withheldIds.has(a.id),
      id:a.id, companyId:a.companyId, domainCode:a.domainCode, methodologyVersion:a.methodologyVersion.version, mode:a.mode, status:a.status, routingState:a.routingState,
      previousAssessmentId:a.previousAssessmentId, parentAssessmentId:a.parentAssessmentId, entitlementId:a.entitlementId,
      assessmentRevision:a.assessmentRevision, routingRevision:a.routingRevision, eventSequence:a.eventSequence, currentQuestionIssueId:a.currentQuestionIssueId,
      overall:redactOverall({partialScore:numberOrNull(a.overallPartialScore),officialScore:numberOrNull(a.overallOfficialScore),isOfficial:a.status==="COMPLETED"&&a.overallOfficialScore!==null,coverage:numberOrNull(a.coverage),aggregationVersion:a.aggregationVersion},withheldIds.has(a.id)),
      startedAt:a.startedAt, completedAt:a.completedAt, createdAt:a.createdAt, updatedAt:a.updatedAt
    }));
  }

  async getAssessment(assessmentId:string) {
    const a=await prisma.assessment.findUnique({ where:{id:assessmentId}, include:{company:true,methodologyVersion:true} });
    if (!a) return null;
    const answered=await prisma.answer.count({where:{assessmentId,active:true}});
    const asked=await prisma.assessmentAskedQuestion.count({where:{assessmentId}});
    const withheld=(a.completedAt||isTerminalAssessmentStatus(a.status))?(await derivedContentWithheld(prisma,a)).withheld:false;
    return {
      reportAvailable:!withheld,
      id:a.id, companyId:a.companyId, companyName:a.company.name, domainCode:a.domainCode, methodologyVersion:a.methodologyVersion.version,
      previousAssessmentId:a.previousAssessmentId, parentAssessmentId:a.parentAssessmentId, entitlementId:a.entitlementId,
      mode:a.mode, status:a.status, routingState:a.routingState, answeredQuestions:answered, askedQuestions:asked,
      assessmentRevision:a.assessmentRevision, routingRevision:a.routingRevision, eventSequence:a.eventSequence, currentQuestionIssueId:a.currentQuestionIssueId,
      overall:redactOverall({ partialScore:numberOrNull(a.overallPartialScore), officialScore:numberOrNull(a.overallOfficialScore), isOfficial:a.status==="COMPLETED"&&a.overallOfficialScore!==null, coverage:numberOrNull(a.coverage), aggregationVersion:a.aggregationVersion },withheld),
      startedAt:a.startedAt, completedAt:a.completedAt, createdAt:a.createdAt, updatedAt:a.updatedAt
    };
  }

  async status(assessmentId:string) {
    const assessment=await this.getAssessment(assessmentId);
    if(!assessment)return null;
    const [openQuestion,progress,terminalSnapshot,publishedReport]=await Promise.all([
      this.getOpenQuestion(assessmentId),
      this.progress(assessmentId),
      prisma.assessmentStateSnapshot.findFirst({where:{assessmentId},orderBy:[{eventSequence:"desc"},{createdAt:"desc"}],select:{id:true,payloadHash:true}}),
      prisma.reportSnapshot.findFirst({where:{assessmentId,publishedAt:{not:null}},orderBy:{publishedAt:"desc"},select:{id:true,publishedAt:true,generationState:true}})
    ]);
    const terminal=isTerminalAssessmentStatus(assessment.status);
    const resultTerminal=isResultTerminalAssessmentStatus(assessment.status);
    const reportReady=resultTerminal&&Boolean(terminalSnapshot)&&assessment.reportAvailable!==false;
    return {
      assessmentId:assessment.id,
      domainCode:assessment.domainCode,
      methodologyVersion:assessment.methodologyVersion,
      mode:assessment.mode,
      status:assessment.status,
      routingState:assessment.routingState??null,
      answeredQuestions:assessment.answeredQuestions??0,
      askedQuestions:assessment.askedQuestions??0,
      assessmentRevision:assessment.assessmentRevision,
      routingRevision:assessment.routingRevision,
      eventSequence:assessment.eventSequence,
      currentQuestion:openQuestion,
      progress,
      lifecycle:{
        phase:lifecyclePhase({status:assessment.status,hasTerminalSnapshot:Boolean(terminalSnapshot),hasPublishedReport:Boolean(publishedReport)}),
        canStart:assessment.status==="PROFILE_PENDING",
        canPause:assessment.status==="IN_PROGRESS",
        canResume:assessment.status==="PAUSED"||assessment.status==="IN_PROGRESS",
        canRequestQuestion:assessment.status==="IN_PROGRESS",
        canAnswer:assessment.status==="IN_PROGRESS"&&openQuestion!==null,
        canRequestCompletion:assessment.status==="IN_PROGRESS"&&openQuestion===null,
        canViewResults:reportReady,
        reportReady,
        reportGenerated:Boolean(publishedReport)&&assessment.reportAvailable!==false,
        reviewPending:assessment.reportAvailable===false,
        terminalSnapshotId:terminalSnapshot?.id??null,
        publishedReportId:assessment.reportAvailable===false?null:(publishedReport?.id??null),
        isTerminal:terminal,
        isResultTerminal:resultTerminal
      },
      updatedAt:assessment.updatedAt
    };
  }

  async getOpenQuestion(assessmentId:string) {
    const assessment=await prisma.assessment.findUnique({where:{id:assessmentId},select:{currentQuestionIssueId:true}});
    if(!assessment)return null;
    let row=assessment.currentQuestionIssueId
      ? await prisma.assessmentAskedQuestion.findUnique({where:{id:assessment.currentQuestionIssueId},include:{question:{include:{category:true,options:{orderBy:{optionIndex:"asc"}}}}}})
      : null;
    if(!row||row.assessmentId!==assessmentId||row.status!=="ISSUED") row=await prisma.assessmentAskedQuestion.findFirst({where:{assessmentId,status:"ISSUED"},orderBy:{askedOrder:"asc"},include:{question:{include:{category:true,options:{orderBy:{optionIndex:"asc"}}}}}});
    if(!row)return null;
    return { questionIssueId:row.id,id:row.question.externalId,contextMn:row.question.category.nameMn,textMn:row.question.textMn,options:row.question.options.map(o=>({optionIndex:o.optionIndex,labelMn:o.labelMn,score:o.score==null?null:Number(o.score),state:o.state??null})) };
  }

  async resumePayload(assessmentId:string) {
    const a=await prisma.assessment.findUnique({where:{id:assessmentId}});
    if(!a)return null;
    const [open,draft]=await Promise.all([this.getOpenQuestion(assessmentId),prisma.responseDraft.findUnique({where:{assessmentId}})]);
    return {
      state:a.routingState??a.status,
      nextQuestion:open?{id:open.id,contextMn:open.contextMn,textMn:open.textMn,options:open.options}:null,
      questionIssueId:open?.questionIssueId??null,
      assessmentRevision:a.assessmentRevision,
      routingRevision:a.routingRevision,
      eventSequence:a.eventSequence,
      saveStatus:"SAVED",
      draft:draft&&open&&draft.questionIssueId===open.questionIssueId?{questionIssueId:draft.questionIssueId,questionId:open.id,draft:draft.draft,draftRevision:draft.draftRevision,serverAckAt:draft.serverAckAt}:null
    };
  }

  async progress(assessmentId:string) {
    const a=await prisma.assessment.findUnique({where:{id:assessmentId},select:{mode:true,status:true,routingState:true,coverage:true,overallOfficialScore:true}});
    if(!a)return null;
    const [answered,asked]=await Promise.all([
      prisma.answer.count({where:{assessmentId,active:true}}),
      prisma.assessmentAskedQuestion.count({where:{assessmentId}})
    ]);
    return { mode:a.mode,status:a.status,routingState:a.routingState,answeredQuestions:answered,askedQuestions:asked,
      quick:a.mode==="QUICK"?{softMinimum:192,hardMaximum:280}:null,
      diagnosticCoverage:numberOrNull(a.coverage),officialResultAvailable:a.status==="COMPLETED"&&a.overallOfficialScore!==null };
  }

  async companyDiagnosisLifecycle(companyId:string) {
    const [assessments,entitlements,snapshots,publishedReports]=await Promise.all([
      prisma.assessment.findMany({where:{companyId},orderBy:[{completedAt:"desc"},{createdAt:"desc"}],select:{id:true,domainCode:true,status:true,routingState:true,startedAt:true,completedAt:true,createdAt:true}}),
      prisma.companyEntitlement.findMany({where:{companyId,status:"ACTIVE"},select:{id:true,domainCode:true,planCode:true,assessmentLimit:true,assessmentsUsed:true,startsAt:true}}),
      prisma.assessmentStateSnapshot.findMany({where:{assessment:{companyId}},select:{assessmentId:true}}),
      prisma.reportSnapshot.findMany({where:{assessment:{companyId},publishedAt:{not:null}},select:{assessmentId:true,publishedAt:true}})
    ]);
    const snapshotIds=new Set(snapshots.map(x=>x.assessmentId));
    const reportIds=new Set(publishedReports.map(x=>x.assessmentId));
    const domains=DOMAIN_CODES.map(domainCode=>{
      const rows=assessments.filter(a=>a.domainCode===domainCode);
      const active=rows.find(a=>ACTIVE_ASSESSMENT_STATUSES.includes(a.status as any))??null;
      const completed=rows.find(a=>RESULT_TERMINAL_ASSESSMENT_STATUSES.includes(a.status as any))??null;
      const expectedPlan=completed?"RETAKE":"DIAGNOSTIC";
      const entitlement=entitlements.find(e=>e.domainCode===domainCode&&e.planCode===expectedPlan&&(e.assessmentLimit===null||e.assessmentsUsed<e.assessmentLimit))??null;
      const reportReady=Boolean(completed&&snapshotIds.has(completed.id));
      let state:string;
      if(active) state=active.status==="PAUSED"?"PAUSED":active.status==="PROFILE_PENDING"?"AVAILABLE":"IN_PROGRESS";
      else if(completed&&!reportReady) state="COMPLETED_PENDING_SNAPSHOT";
      else if(completed&&entitlement) state="AVAILABLE_RETAKE";
      else if(completed) state="REPORT_READY";
      else if(entitlement) state="AVAILABLE";
      else state="LOCKED";
      return {
        domainCode,state,
        activeAssessmentId:active?.id??null,
        activeAssessmentStatus:active?.status??null,
        latestCompletedAssessmentId:completed?.id??null,
        reportReady,
        reportGenerated:Boolean(completed&&reportIds.has(completed.id)),
        entitlementId:entitlement?.id??null,
        expectedPlan
      };
    });
    return {companyId,domains};
  }

  async results(assessmentId:string) {
    return this.strategyReports.getDiagnosisResult(assessmentId);
  }

  async reportPayload(assessmentId:string) {
    return this.strategyReports.freezeReportPayload(assessmentId);
  }

}
