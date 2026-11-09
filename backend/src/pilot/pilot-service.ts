import { createHash } from "node:crypto";
import { prisma } from "../db.js";
import { badRequest, conflict, forbidden, notFound } from "../api/errors.js";
import { confidenceAgreementBins, mean, median, pairMetricSummary, percentile, wilsonInterval, type NumericPair } from "./statistics.js";

const TERMINAL=new Set(["COMPLETED","COMPLETED_WITH_REVIEW","EXHAUSTED"]);
const STUDY_STATUSES=["DRAFT","RECRUITING","ACTIVE","ANALYSIS","READY_FOR_REVIEW","CLOSED"] as const;
const CONSENT_STATUSES=["PENDING","CONSENTED","DECLINED","WITHDRAWN"] as const;
const LINK_ROLES=["COGNITIVE","BASELINE","SECOND_RATER","RETEST"] as const;
const FEEDBACK_DIMENSIONS=["CLARITY","BURDEN","DIAGNOSIS_USEFULNESS","RECOMMENDATION_USEFULNESS"] as const;
const DECISIONS=["APPROVE","REVISE","HOLD"] as const;

function stable(value:unknown):string{
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;
  const o=value as Record<string,unknown>;
  return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}
function sha(value:unknown){return createHash("sha256").update(stable(value)).digest("hex");}
function text(v:unknown){const s=String(v??"").trim();return s||undefined;}
function integer(v:unknown,name:string,min:number,max:number){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw badRequest(`${name} must be an integer between ${min} and ${max}`);return n;}
function enumValue<T extends readonly string[]>(v:unknown,allowed:T,name:string):T[number]{const s=String(v??"") as T[number];if(!allowed.includes(s))throw badRequest(`Invalid ${name}`);return s;}

export async function createPilotStudy(userId:string,input:any){
  const code=text(input.code); const title=text(input.title);
  if(!code||!/^[A-Za-z0-9_-]{3,48}$/.test(code))throw badRequest("code must be 3-48 letters, numbers, _ or -");
  if(!title||title.length>160)throw badRequest("title is required and must be <=160 characters");
  const methodology= input.methodologyVersion
    ? await prisma.methodologyVersion.findUnique({where:{version:String(input.methodologyVersion)}})
    : await prisma.methodologyVersion.findFirst({where:{status:"ACTIVE",domainCode:"marketing"},orderBy:{activatedAt:"desc"}});
  if(!methodology)throw notFound("Methodology version not found");
  return prisma.pilotStudy.create({data:{
    code,title,methodologyVersionId:methodology.id,createdByUserId:userId,
    targetCompanies: input.targetCompanies===undefined?30:integer(input.targetCompanies,"targetCompanies",8,500),
    cognitiveTarget: input.cognitiveTarget===undefined?8:integer(input.cognitiveTarget,"cognitiveTarget",1,100),
    fieldTarget: input.fieldTarget===undefined?20:integer(input.fieldTarget,"fieldTarget",1,500),
    retestTarget: input.retestTarget===undefined?8:integer(input.retestTarget,"retestTarget",1,200),
    retestMinDays: input.retestMinDays===undefined?7:integer(input.retestMinDays,"retestMinDays",1,90),
    retestMaxDays: input.retestMaxDays===undefined?14:integer(input.retestMaxDays,"retestMaxDays",1,180)
  }});
}

export async function listPilotStudies(userId:string){
  return prisma.pilotStudy.findMany({where:{createdByUserId:userId},include:{methodologyVersion:{select:{version:true}},_count:{select:{enrollments:true,analysisRuns:true,gateDecisions:true}}},orderBy:{createdAt:"desc"}});
}

export async function requireStudyCreator(userId:string,studyId:string){
  const study=await prisma.pilotStudy.findFirst({where:{id:studyId,createdByUserId:userId},include:{methodologyVersion:{select:{version:true,status:true}}}});
  if(!study)throw notFound("Pilot study not found");
  return study;
}

export async function updatePilotStudyStatus(userId:string,studyId:string,statusInput:unknown){
  const study=await requireStudyCreator(userId,studyId); const status=enumValue(statusInput,STUDY_STATUSES,"status");
  const allowed:Record<string,string[]>={DRAFT:["RECRUITING"],RECRUITING:["ACTIVE","DRAFT"],ACTIVE:["ANALYSIS"],ANALYSIS:["ACTIVE","READY_FOR_REVIEW"],READY_FOR_REVIEW:["ANALYSIS","CLOSED"],CLOSED:[]};
  if(study.status!==status&&!allowed[study.status]?.includes(status))throw conflict(`Invalid pilot status transition ${study.status} -> ${status}`);
  return prisma.pilotStudy.update({where:{id:studyId},data:{status,closedAt:status==="CLOSED"?new Date():null}});
}

export async function enrollCompany(studyId:string,companyId:string,deidentifiedCodeInput:unknown){
  const study=await prisma.pilotStudy.findUnique({where:{id:studyId}}); if(!study)throw notFound("Pilot study not found");
  if(!["RECRUITING","ACTIVE"].includes(study.status))throw conflict("Pilot study is not enrolling companies");
  const deidentifiedCode=text(deidentifiedCodeInput); if(!deidentifiedCode||!/^[A-Za-z0-9_-]{2,64}$/.test(deidentifiedCode))throw badRequest("deidentifiedCode must be 2-64 safe characters");
  return prisma.pilotEnrollment.create({data:{studyId,companyId,deidentifiedCode}});
}

export async function setEnrollmentConsent(enrollmentId:string,companyId:string,statusInput:unknown){
  const row=await prisma.pilotEnrollment.findUnique({where:{id:enrollmentId}}); if(!row||row.companyId!==companyId)throw notFound("Pilot enrollment not found");
  const status=enumValue(statusInput,CONSENT_STATUSES,"consentStatus");
  if(row.consentStatus==="WITHDRAWN"&&status!=="WITHDRAWN")throw conflict("Withdrawn pilot consent cannot be reactivated in-place");
  return prisma.pilotEnrollment.update({where:{id:enrollmentId},data:{consentStatus:status,consentedAt:status==="CONSENTED"?(row.consentedAt??new Date()):row.consentedAt,withdrawnAt:status==="WITHDRAWN"?new Date():null}});
}

export async function linkPilotAssessment(enrollmentId:string,companyId:string,input:any){
  const enrollment=await prisma.pilotEnrollment.findUnique({where:{id:enrollmentId},include:{study:true,links:{include:{assessment:true}}}});
  if(!enrollment||enrollment.companyId!==companyId)throw notFound("Pilot enrollment not found");
  if(enrollment.consentStatus!=="CONSENTED")throw conflict("Explicit pilot consent is required before linking assessments");
  const assessmentId=text(input.assessmentId); if(!assessmentId)throw badRequest("assessmentId is required");
  const role=enumValue(input.role,LINK_ROLES,"pilot assessment role");
  const assessment=await prisma.assessment.findUnique({where:{id:assessmentId}}); if(!assessment||assessment.companyId!==companyId)throw notFound("Assessment not found for enrolled company");
  if(assessment.methodologyVersionId!==enrollment.study.methodologyVersionId)throw conflict("Pilot assessments must use the frozen study methodology version");
  if(role==="RETEST"){
    const base=enrollment.links.find((l:any)=>l.role==="BASELINE")?.assessment;
    if(!base)throw conflict("A baseline assessment must be linked before a retest");
    const baseDate=base.completedAt??base.createdAt; const retestDate=assessment.startedAt??assessment.createdAt;
    const days=(retestDate.getTime()-baseDate.getTime())/86400000;
    if(days<enrollment.study.retestMinDays||days>enrollment.study.retestMaxDays)throw conflict(`Retest must start ${enrollment.study.retestMinDays}-${enrollment.study.retestMaxDays} days after baseline`);
  }
  const pairKey=text(input.pairKey); if(pairKey&&!/^[A-Za-z0-9_-]{2,64}$/.test(pairKey))throw badRequest("pairKey must be a deidentified 2-64 character code");
  return prisma.pilotAssessmentLink.create({data:{enrollmentId,assessmentId,role,pairKey}});
}

export async function recordPilotFeedback(enrollmentId:string,companyId:string,input:any){
  const enrollment=await prisma.pilotEnrollment.findUnique({where:{id:enrollmentId}}); if(!enrollment||enrollment.companyId!==companyId)throw notFound("Pilot enrollment not found");
  if(enrollment.consentStatus!=="CONSENTED")throw conflict("Pilot feedback requires active consent");
  const dimension=enumValue(input.dimension,FEEDBACK_DIMENSIONS,"feedback dimension"); const rating=integer(input.rating,"rating",1,5);
  const assessmentId=text(input.assessmentId);
  if(assessmentId){const link=await prisma.pilotAssessmentLink.findUnique({where:{assessmentId}});if(!link||link.enrollmentId!==enrollmentId)throw badRequest("Feedback assessment is not linked to this enrollment");}
  const questionExternalId=text(input.questionExternalId); if(questionExternalId&&!/^[A-Za-z0-9_.:-]{2,96}$/.test(questionExternalId))throw badRequest("questionExternalId is invalid");
  const comment=text(input.commentText); if(comment&&comment.length>2000)throw badRequest("commentText must be <=2000 characters");
  return prisma.pilotFeedback.create({data:{enrollmentId,assessmentId,questionExternalId,dimension,rating,commentText:comment}});
}

export async function recordOutcomeBaseline(enrollmentId:string,companyId:string,input:any){
  const enrollment=await prisma.pilotEnrollment.findUnique({where:{id:enrollmentId}}); if(!enrollment||enrollment.companyId!==companyId)throw notFound("Pilot enrollment not found");
  if(enrollment.consentStatus!=="CONSENTED")throw conflict("Outcome baseline requires active consent");
  const data={revenueBand:text(input.revenueBand),profitBand:text(input.profitBand),customerBand:text(input.customerBand),marketShareBand:text(input.marketShareBand),brandIndexBand:text(input.brandIndexBand)};
  for(const v of Object.values(data))if(v&&v.length>80)throw badRequest("Outcome bands must be <=80 characters");
  return prisma.pilotOutcomeBaseline.upsert({where:{enrollmentId},create:{enrollmentId,...data},update:data});
}

function scoreOf(r:any){const x=r.officialScore??r.partialScore;return x===null||x===undefined?null:Number(x);}
function confidenceOf(r:any){return r.confidence===null||r.confidence===undefined?null:Number(r.confidence);}
function gate(id:string,label:string,status:string,value:unknown,target:string,evidenceCount:number){return {id,label,status,value,target,evidenceCount,automaticPass:false,reviewerDecisionRequired:true};}

export async function analyzePilotStudy(userId:string,studyId:string){
  const study=await requireStudyCreator(userId,studyId);
  const enrollments=await prisma.pilotEnrollment.findMany({where:{studyId},include:{baseline:true}});
  const active=enrollments.filter((e:any)=>e.consentStatus==="CONSENTED"&&!e.withdrawnAt); const activeIds=new Set(active.map((e:any)=>e.id));
  const links=await prisma.pilotAssessmentLink.findMany({where:{enrollment:{studyId}},include:{enrollment:true,assessment:{include:{askedQuestions:true,answers:{where:{active:true},include:{question:{select:{externalId:true}}}},contradictions:true,categoryResults:true}}}});
  const activeLinks=links.filter((l:any)=>activeIds.has(l.enrollmentId));
  const feedback=await prisma.pilotFeedback.findMany({where:{enrollment:{studyId}},select:{enrollmentId:true,assessmentId:true,questionExternalId:true,dimension:true,rating:true}});
  const activeFeedback=feedback.filter((f:any)=>activeIds.has(f.enrollmentId));

  const byEnrollment=new Map<string,any[]>(); for(const l of activeLinks){const a=byEnrollment.get(l.enrollmentId)??[];a.push(l);byEnrollment.set(l.enrollmentId,a);}
  const baseline=activeLinks.filter((l:any)=>l.role==="BASELINE"); const cognitive=activeLinks.filter((l:any)=>l.role==="COGNITIVE");
  const completedCognitive=cognitive.filter((l:any)=>TERMINAL.has(l.assessment.status));
  const completedBaseline=baseline.filter((l:any)=>TERMINAL.has(l.assessment.status));
  const completionRate=baseline.length?completedBaseline.length/baseline.length:null;
  const durationMinutes=completedBaseline.flatMap((l:any)=>l.assessment.startedAt&&l.assessment.completedAt?[(l.assessment.completedAt.getTime()-l.assessment.startedAt.getTime())/60000]:[]);
  const burdens=baseline.map((l:any)=>l.assessment.askedQuestions.length);
  const dnkFractions=baseline.map((l:any)=>{const a=l.assessment.answers;return a.length?a.filter((x:any)=>x.status==="DNK").length/a.length:0;});
  const naFractions=baseline.map((l:any)=>{const a=l.assessment.answers;return a.length?a.filter((x:any)=>x.status==="N_A_CLAIM").length/a.length:0;});
  const coverageValues=completedBaseline.flatMap((l:any)=>l.assessment.coverage===null?[]:[Number(l.assessment.coverage)]);
  const unresolvedMajor=completedBaseline.reduce((n:number,l:any)=>n+l.assessment.contradictions.filter((c:any)=>c.status==="OPEN"&&String(c.severity).toUpperCase()==="MAJOR").length,0);

  const clarity=activeFeedback.filter((f:any)=>f.dimension==="CLARITY").map((f:any)=>f.rating);
  const diagnosisUseful=activeFeedback.filter((f:any)=>f.dimension==="DIAGNOSIS_USEFULNESS").map((f:any)=>f.rating);
  const recommendationUseful=activeFeedback.filter((f:any)=>f.dimension==="RECOMMENDATION_USEFULNESS").map((f:any)=>f.rating);
  const burdenRatings=activeFeedback.filter((f:any)=>f.dimension==="BURDEN").map((f:any)=>f.rating);

  const questionDist=new Map<string,{total:number;dnk:number;options:Map<string,number>}>();
  for(const l of baseline)for(const a of l.assessment.answers){const q=a.question.externalId;const x=questionDist.get(q)??{total:0,dnk:0,options:new Map()};if(a.status!=="N_A_CLAIM"){x.total++;if(a.status==="DNK")x.dnk++;if(a.optionIndex!==null){const k=String(a.optionIndex);x.options.set(k,(x.options.get(k)??0)+1);}}questionDist.set(q,x);}
  const perQuestion=[...questionDist.entries()].map(([questionId,x])=>{const max=x.total?Math.max(0,...x.options.values())/x.total:0;return {questionId,n:x.total,dnkRate:x.total?x.dnk/x.total:null,maxOptionConcentration:max};});
  const dnkViolations=perQuestion.filter(x=>x.n>=5&&(x.dnkRate??0)>=.30).length;
  const concentrationReview=perQuestion.filter(x=>x.n>=5&&x.maxOptionConcentration>=.85).length;

  const interPairs:NumericPair[]=[]; const retestPairs:NumericPair[]=[]; const confidenceRows:Array<{confidence:number;difference:number}>=[];
  let secondRaterCompanies=0,retestCompanies=0;
  for(const [enrollmentId,rows] of byEnrollment){
    const b=rows.find((x:any)=>x.role==="BASELINE"), s=rows.find((x:any)=>x.role==="SECOND_RATER"), r=rows.find((x:any)=>x.role==="RETEST");
    if(b&&s&&TERMINAL.has(b.assessment.status)&&TERMINAL.has(s.assessment.status)){secondRaterCompanies++; const sm=new Map(s.assessment.categoryResults.map((x:any)=>[x.categoryId,x]));for(const x of b.assessment.categoryResults){const y=sm.get(x.categoryId) as any;const a=scoreOf(x),c=y?scoreOf(y):null;if(a!==null&&c!==null)interPairs.push({x:a,y:c});}}
    if(b&&r&&TERMINAL.has(b.assessment.status)&&TERMINAL.has(r.assessment.status)){retestCompanies++; const rm=new Map(r.assessment.categoryResults.map((x:any)=>[x.categoryId,x]));for(const x of b.assessment.categoryResults){const y=rm.get(x.categoryId) as any;const a=scoreOf(x),c=y?scoreOf(y):null;if(a!==null&&c!==null){retestPairs.push({x:a,y:c});const conf=confidenceOf(x);if(conf!==null)confidenceRows.push({confidence:conf,difference:Math.abs(a-c)});}}}
  }
  const inter=pairMetricSummary(interPairs), retest=pairMetricSummary(retestPairs);
  const metrics={
    study:{id:study.id,code:study.code,methodologyVersion:study.methodologyVersion.version,status:study.status},
    enrollment:{total:enrollments.length,consented:active.length,withdrawn:enrollments.filter((e:any)=>e.consentStatus==="WITHDRAWN").length},
    stages:{cognitiveCompanies:new Set(completedCognitive.map((x:any)=>x.enrollmentId)).size,baselineCompanies:baseline.length,completedBaselineCompanies:completedBaseline.length,secondRaterCompanies,retestCompanies},
    completion:{rate:completionRate,wilson95:completionRate===null?null:wilsonInterval(completedBaseline.length,baseline.length),dropoutRate:completionRate===null?null:1-completionRate},
    burden:{meanQuestions:mean(burdens),medianQuestions:median(burdens),p95Questions:percentile(burdens,.95),meanDurationMinutes:mean(durationMinutes),medianBurdenRating:median(burdenRatings)},
    responseQuality:{medianDnkRate:median(dnkFractions),medianNaRate:median(naFractions),perQuestionDnkViolations:dnkViolations,singleOptionConcentrationReviewCount:concentrationReview},
    contradictions:{unresolvedMajor},
    coverage:{median:median(coverageValues),mean:mean(coverageValues)},
    clarity:{n:clarity.length,median:median(clarity),lowRatingShare:clarity.length?clarity.filter(x=>x<=2).length/clarity.length:null},
    usefulness:{diagnosis:{n:diagnosisUseful.length,median:median(diagnosisUseful)},recommendations:{n:recommendationUseful.length,median:median(recommendationUseful)}},
    interRespondent:inter,
    testRetest:retest,
    confidenceStability:confidenceAgreementBins(confidenceRows),
    outcomeBaselineCoverage:active.length?active.filter((e:any)=>Boolean(e.baseline)).length/active.length:null
  };

  const gates=[
    gate("PILOT-SAMPLE-COGNITIVE","Cognitive usability sample",metrics.stages.cognitiveCompanies>=study.cognitiveTarget?"READY":"COLLECTING",metrics.stages.cognitiveCompanies,`>= ${study.cognitiveTarget} companies`,metrics.stages.cognitiveCompanies),
    gate("PILOT-SAMPLE-FIELD","Field reliability sample",secondRaterCompanies>=study.fieldTarget?"READY":"COLLECTING",secondRaterCompanies,`~${study.fieldTarget} companies with two respondents`,secondRaterCompanies),
    gate("PILOT-SAMPLE-RETEST","Test-retest sample",retestCompanies>=study.retestTarget?"READY":"COLLECTING",retestCompanies,`>= ${study.retestTarget} companies`,retestCompanies),
    gate("PILOT-COMPLETION","Completion rate",baseline.length===0?"COLLECTING":completionRate!>=.85?"READY":"REVISE",completionRate,">= 85%",baseline.length),
    gate("PILOT-DNK","Median overall DNK",baseline.length===0?"COLLECTING":metrics.responseQuality.medianDnkRate!<=.10?"READY":"REVISE",metrics.responseQuality.medianDnkRate,"<= 10%",baseline.length),
    gate("PILOT-DNK-ITEM","Per-question applicable DNK",baseline.length===0?"COLLECTING":dnkViolations===0?"READY":"REVISE",dnkViolations,"0 questions at >=30% applicable DNK once n>=5",baseline.length),
    gate("PILOT-CLARITY","Question clarity",clarity.length===0?"COLLECTING":metrics.clarity.median!>=4&&metrics.clarity.lowRatingShare!<.20?"READY":"REVISE",metrics.clarity,"median >=4/5 and <20% ratings <=2",clarity.length),
    gate("PILOT-INTER-RATER","Inter-respondent category stability",secondRaterCompanies<study.fieldTarget?"COLLECTING":inter.medianAbsoluteDifference!==null&&inter.medianAbsoluteDifference<=10?"READY":"REVISE",inter.medianAbsoluteDifference,"median absolute difference <=10 points",secondRaterCompanies),
    gate("PILOT-RETEST","Test-retest category stability",retestCompanies<study.retestTarget?"COLLECTING":retest.meanAbsoluteDifference!==null&&retest.meanAbsoluteDifference<=7?"READY":"REVISE",retest.meanAbsoluteDifference,"mean absolute difference <=7 points",retestCompanies),
    gate("PILOT-COVERAGE","Required maturity coverage",completedBaseline.length===0?"COLLECTING":metrics.coverage.median!==null&&metrics.coverage.median>=.90?"READY":"REVISE",metrics.coverage.median,">=90%",completedBaseline.length),
    gate("PILOT-CONTRADICTION","Unresolved major contradictions",completedBaseline.length===0?"COLLECTING":unresolvedMajor===0?"READY":"REVISE",unresolvedMajor,"0 at normal finalization",completedBaseline.length)
  ];
  const readyForReview=gates.every(g=>g.status==="READY");
  const snapshot={metrics,gates,readyForReview,automaticApproval:false,reviewerDecisionRequired:true,scientificValidationClaim:false,predictiveValidityClaim:false,benchmarkClaim:false};
  const inputSha256=sha(snapshot);
  const run=await prisma.pilotAnalysisRun.create({data:{studyId,inputSha256,metrics:metrics as any,gates:{gates,readyForReview,automaticApproval:false} as any}});
  if(readyForReview&&study.status==="ANALYSIS")await prisma.pilotStudy.update({where:{id:studyId},data:{status:"READY_FOR_REVIEW"}});
  return {analysisRunId:run.id,inputSha256,...snapshot};
}

export async function recordPilotDecision(userId:string,studyId:string,input:any){
  const study=await requireStudyCreator(userId,studyId); const analysisRunId=text(input.analysisRunId); if(!analysisRunId)throw badRequest("analysisRunId is required");
  const latest=await prisma.pilotAnalysisRun.findFirst({where:{studyId},orderBy:{createdAt:"desc"}}); if(!latest||latest.id!==analysisRunId)throw conflict("Decision must bind to the latest pilot analysis run");
  const status=enumValue(input.status,DECISIONS,"gate decision status"); const rationale=text(input.rationale); if(!rationale||rationale.length<10||rationale.length>4000)throw badRequest("rationale must be 10-4000 characters");
  const gatePayload=latest.gates as any; if(status==="APPROVE"&&!gatePayload?.readyForReview)throw conflict("Pilot evidence is not ready for approval; use REVISE or HOLD");
  return prisma.pilotGateDecision.create({data:{studyId,analysisRunId,reviewerUserId:userId,status,rationale}});
}

export async function deidentifiedPilotExport(userId:string,studyId:string){
  const study=await requireStudyCreator(userId,studyId);
  const enrollments=await prisma.pilotEnrollment.findMany({
    where:{studyId},
    include:{
      links:{include:{assessment:{select:{
        id:true,status:true,mode:true,startedAt:true,completedAt:true,coverage:true,
        overallOfficialScore:true,overallPartialScore:true,
        _count:{select:{askedQuestions:true,answers:true,contradictions:true}}
      }}}},
      feedback:{select:{dimension:true,rating:true,questionExternalId:true}},
      baseline:true
    }
  });
  return {
    schemaVersion:"MMRI-PILOT-EXPORT-1.0",
    study:{code:study.code,methodologyVersion:study.methodologyVersion.version,status:study.status},
    enrollments:enrollments.map((e:any)=>({
      deidentifiedCode:e.deidentifiedCode,
      consentStatus:e.consentStatus,
      links:e.links.map((l:any)=>({
        role:l.role,
        pairKey:l.pairKey,
        assessment:{
          status:l.assessment.status,
          mode:l.assessment.mode,
          startedAt:l.assessment.startedAt,
          completedAt:l.assessment.completedAt,
          coverage:l.assessment.coverage===null?null:Number(l.assessment.coverage),
          score:l.assessment.overallOfficialScore===null
            ?(l.assessment.overallPartialScore===null?null:Number(l.assessment.overallPartialScore))
            :Number(l.assessment.overallOfficialScore),
          askedQuestions:l.assessment._count.askedQuestions,
          answers:l.assessment._count.answers,
          contradictions:l.assessment._count.contradictions
        }
      })),
      feedback:e.feedback,
      baseline:e.baseline?{
        revenueBand:e.baseline.revenueBand,
        profitBand:e.baseline.profitBand,
        customerBand:e.baseline.customerBand,
        marketShareBand:e.baseline.marketShareBand,
        brandIndexBand:e.baseline.brandIndexBand
      }:null
    }))
  };
}

export function pilotExportCsv(data:any){
  const rows=[["company_code","consent_status","role","assessment_status","mode","score","coverage","questions","answers","contradictions"]];
  for(const e of data.enrollments)for(const l of e.links)rows.push([e.deidentifiedCode,e.consentStatus,l.role,l.assessment.status,l.assessment.mode,l.assessment.score??"",l.assessment.coverage??"",l.assessment.askedQuestions,l.assessment.answers,l.assessment.contradictions]);
  const esc=(v:any)=>{const s=String(v??"");return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}; return rows.map(r=>r.map(esc).join(",")).join("\n")+"\n";
}
