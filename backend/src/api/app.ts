import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { URL } from "node:url";
import { prisma } from "../db.js";
import { PrismaAssessmentEngine } from "../services/prisma-assessment-engine.js";
import type { AssessmentMode, ProfileAnswer } from "../engine/types.js";
import { loadApiConfig, type ApiConfig } from "./config.js";
import { ApiError, badRequest, conflict, notFound } from "./errors.js";
import { AuthService } from "./auth/auth-service.js";
import { authenticate, assessmentAccess, billingInvoiceAccess, pilotEnrollmentAccess, requireCompanyRole, requireOperator, type CompanyRole } from "./auth/access.js";
import { assertOwnerTransitionAllowed } from "./auth/role-policy.js";
import { parseCookies, refreshCookie, clearRefreshCookie } from "./auth/cookies.js";
import { hashAuditValue } from "./auth/crypto.js";
import { readJson } from "./http/body.js";
import { Router } from "./http/router.js";
import { json, ok, created, noContent } from "./http/respond.js";
import { MemoryRateLimiter } from "./http/rate-limit.js";
import { publicRouting } from "./presenters.js";
import { AssessmentQueryService } from "./services/query-service.js";
import { PrismaStrategyReportService, ReportGenerationInProgressError } from "../services/prisma-strategy-report-service.js";
import { isResultTerminalAssessmentStatus } from "../services/assessment-lifecycle.js";
import { createNarrativeProviderFromEnv } from "./ai-report-provider.js";
import { BillingService } from "../billing/billing-service.js";
import { TARGET_METHODOLOGY_VERSION } from "../methodology-target.js";
import { OperationalMetrics, databaseReady, reportStorageReady, structuredRequestLog, validMetricsCredential } from "./observability.js";
import {
  createPilotStudy, listPilotStudies, requireStudyCreator, updatePilotStudyStatus, enrollCompany, setEnrollmentConsent,
  linkPilotAssessment, recordPilotFeedback, recordOutcomeBaseline, analyzePilotStudy,
  recordPilotDecision, deidentifiedPilotExport, pilotExportCsv
} from "../pilot/pilot-service.js";
import {
  createCalibrationProposal, listCalibrationProposals, getCalibrationProposal, submitCalibrationProposal,
  reviewCalibrationProposal, activateCalibrationProposal, calibrationManifest
} from "../calibration/calibration-service.js";

const ALL_ROLES: CompanyRole[]=["OWNER","ADMIN","ASSESSOR","CONSULTANT","VIEWER"];
const ASSESSMENT_INPUT: CompanyRole[]=["OWNER","ADMIN","ASSESSOR"];
const REVIEW_WRITE: CompanyRole[]=["OWNER","ADMIN","CONSULTANT"];
const COMPANY_CONTENT_WRITE: CompanyRole[]=["OWNER","ADMIN","ASSESSOR","CONSULTANT"];
const REPORT_READ: CompanyRole[]=["OWNER","ADMIN","CONSULTANT","VIEWER"];
const COMPANY_ADMIN: CompanyRole[]=["OWNER","ADMIN"];

export function createApi(config:ApiConfig=loadApiConfig()) {
  const router=new Router();
  const auth=new AuthService(config);
  const engine=new PrismaAssessmentEngine();
  const narrativeProvider=createNarrativeProviderFromEnv(config.environment);
  const strategyReports=new PrismaStrategyReportService(engine,narrativeProvider);
  /**
   * First-time report generation includes a provider call that can take about a minute, which is longer than a
   * reverse proxy will hold a request. A request therefore waits at most REPORT_REQUEST_WAIT_MS and otherwise answers
   * the existing 409 REPORT_GENERATION_IN_PROGRESS while the generation continues (single-flight, lease protected)
   * so the client can poll. Published reports are returned immediately.
   */
  const REPORT_REQUEST_WAIT_MS=Math.max(1000,Number(process.env.MMRI_REPORT_REQUEST_WAIT_MS??25_000)||25_000);
  const withinRequestBudget=async<T>(work:Promise<T>):Promise<T>=>{
    let timer:NodeJS.Timeout|undefined;
    const budget=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new ApiError(409,"REPORT_GENERATION_IN_PROGRESS","Report generation is in progress",{retryAfterSeconds:3})),REPORT_REQUEST_WAIT_MS)});
    work.catch(()=>undefined);
    try{return await Promise.race([work,budget])}finally{if(timer)clearTimeout(timer)}
  };
  /** Build the report in the background as soon as a diagnosis completes, so the first view is normally instant. */
  const reportPrewarmEnabled=(process.env.MMRI_REPORT_PREWARM??"true").trim().toLowerCase()!=="false";
  const scheduleReportPrewarm=(assessmentId:string)=>{
    if(!reportPrewarmEnabled)return;
    setImmediate(()=>{void(async()=>{
      try{
        const a=await prisma.assessment.findUnique({where:{id:assessmentId},select:{status:true}});
        if(a&&isResultTerminalAssessmentStatus(a.status))await strategyReports.generateReport(assessmentId);
      }catch(error:any){console.log(JSON.stringify({ts:new Date().toISOString(),level:"warn",event:"report_prewarm_skipped",assessmentId,reason:String(error?.message??error).slice(0,160)}))}
    })()});
  };
  const queries=new AssessmentQueryService(engine,strategyReports);
  const billing=new BillingService(config);
  const apiLimiter=new MemoryRateLimiter(config.apiRateLimit,config.rateLimitWindowMs);
  const authIpLimiter=new MemoryRateLimiter(config.authIpRateLimit,config.rateLimitWindowMs);
  const authAccountLimiter=new MemoryRateLimiter(config.authAccountRateLimit,config.rateLimitWindowMs);
  const refreshLimiter=new MemoryRateLimiter(config.refreshRateLimit,config.rateLimitWindowMs);
  const operationalMetrics=new OperationalMetrics();
  let acceptingTraffic=true;

  router.add("GET","/live",async({res})=>ok(res,{status:"live",service:"mmri-api",version:"1.10.0",releaseSha:config.releaseSha,instanceId:config.instanceId}),false);
  router.add("GET","/health",async({res})=>ok(res,{status:"ok",service:"mmri-api",version:"1.10.0",lifecycle:acceptingTraffic?"serving":"draining",releaseSha:config.releaseSha,instanceId:config.instanceId}),false);
  router.add("GET","/ready",async({res})=>{
    if(!acceptingTraffic)return json(res,503,{status:"not_ready",reason:"draining",releaseSha:config.releaseSha,instanceId:config.instanceId});
    try{
      await Promise.all([databaseReady(config,()=>prisma.$queryRawUnsafe("SELECT 1")),reportStorageReady(config)]);
      ok(res,{status:"ready",database:"ok",reportStorage:"ok",releaseSha:config.releaseSha,instanceId:config.instanceId});
    }catch{
      json(res,503,{status:"not_ready",dependency:"unavailable",releaseSha:config.releaseSha,instanceId:config.instanceId});
    }
  },false);
  router.add("GET","/metrics",async({req,res})=>{
    if(!validMetricsCredential(req,config))throw new ApiError(401,"METRICS_UNAUTHORIZED","Metrics credential required");
    res.writeHead(200,{"content-type":"text/plain; version=0.0.4; charset=utf-8","cache-control":"no-store"});
    res.end(operationalMetrics.render(config,acceptingTraffic));
  },false);

  router.add("POST","/api/v1/auth/register",async({req,res})=>{
    const ip=clientIp(req,config); authIpLimiter.check(`register:ip:${ip}`); const body=await readJson(req,config.requestBodyLimitBytes);
    const emailKey=hashAuditValue(String(body.email??"").trim().toLowerCase(),config.auditSalt)??"missing";
    authAccountLimiter.check(`register:acct:${emailKey}`);
    const result=await auth.register({email:body.email,password:body.password,displayName:body.displayName},fingerprint(req,config));
    res.setHeader("set-cookie",refreshCookie(result.refreshToken,config));
    created(res,{user:result.user,accessToken:result.accessToken,accessTokenExpiresIn:result.accessTokenExpiresIn});
  },false);

  router.add("POST","/api/v1/auth/login",async({req,res})=>{
    const ip=clientIp(req,config); authIpLimiter.check(`login:ip:${ip}`); const body=await readJson(req,config.requestBodyLimitBytes);
    const emailKey=hashAuditValue(String(body.email??"").trim().toLowerCase(),config.auditSalt)??"missing";
    authAccountLimiter.check(`login:acct:${emailKey}`);
    const result=await auth.login({email:body.email,password:body.password},fingerprint(req,config));
    res.setHeader("set-cookie",refreshCookie(result.refreshToken,config));
    ok(res,{user:result.user,accessToken:result.accessToken,accessTokenExpiresIn:result.accessTokenExpiresIn});
  },false);

  router.add("POST","/api/v1/auth/refresh",async({req,res})=>{
    refreshLimiter.check(`refresh:ip:${clientIp(req,config)}`);
    requireTrustedBrowserOrigin(req,config);
    const token=parseCookies(req.headers.cookie)[config.refreshCookieName];
    const result=await auth.refresh(token,fingerprint(req,config));
    res.setHeader("set-cookie",refreshCookie(result.refreshToken,config));
    ok(res,{user:result.user,accessToken:result.accessToken,accessTokenExpiresIn:result.accessTokenExpiresIn});
  },false);

  router.add("POST","/api/v1/auth/logout",async({req,res})=>{
    refreshLimiter.check(`logout:ip:${clientIp(req,config)}`);
    requireTrustedBrowserOrigin(req,config);
    const token=parseCookies(req.headers.cookie)[config.refreshCookieName];
    await auth.logout(token,fingerprint(req,config));
    noContent(res,{"set-cookie":clearRefreshCookie(config)});
  },false);

  router.add("GET","/api/v1/auth/me",async({res,principal})=>{
    const user=await prisma.user.findUnique({where:{id:principal!.userId},select:{id:true,email:true,displayName:true,status:true}});
    if(!user)throw notFound("User not found"); ok(res,user);
  });


  router.add("GET","/api/v1/billing/plans",async({res})=>{
    ok(res,billing.catalog());
  },false);

  router.add("GET","/api/v1/companies/:companyId/billing/status",async({res,principal,params})=>{
    await requireCompanyRole(principal!.userId,params.companyId,COMPANY_ADMIN);
    ok(res,await billing.getCompanyStatus(params.companyId));
  });

  router.add("POST","/api/v1/companies/:companyId/billing/invoices",async({req,res,principal,params})=>{
    await requireCompanyRole(principal!.userId,params.companyId,COMPANY_ADMIN);
    const body=await readJson(req,config.requestBodyLimitBytes);
    created(res,await billing.createInvoice(params.companyId,principal!.userId,String(body.planCode??""),body.domainCode??"marketing"));
  });

  router.add("GET","/api/v1/billing/invoices/:invoiceId",async({res,principal,params})=>{
    await billingInvoiceAccess(principal!.userId,params.invoiceId,COMPANY_ADMIN);
    ok(res,await billing.getInvoice(params.invoiceId));
  });

  router.add("POST","/api/v1/billing/invoices/:invoiceId/mock-pay",async({res,principal,params})=>{
    await billingInvoiceAccess(principal!.userId,params.invoiceId,COMPANY_ADMIN);
    ok(res,await billing.mockPay(params.invoiceId));
  });

  router.add("POST","/api/v1/billing/invoices/:invoiceId/reconcile",async({res,principal,params})=>{
    await billingInvoiceAccess(principal!.userId,params.invoiceId,COMPANY_ADMIN);
    ok(res,await billing.reconcileInvoice(params.invoiceId));
  });

  router.add("POST","/api/v1/operator/billing/invoices/:invoiceId/manual-confirm",async({req,res,principal,params})=>{
    requireOperator(principal!,config);
    const body=await readJson(req,config.requestBodyLimitBytes);
    const invoice=await billing.confirmManualPayment(params.invoiceId,body.paymentReference,body.amountMnt);
    await prisma.authAuditEvent.create({data:{userId:principal!.userId,eventType:"BILLING_MANUAL_PAYMENT_CONFIRMED",metadata:{invoiceId:params.invoiceId,paymentReference:String(body.paymentReference??"").slice(0,200),amountMnt:Number(body.amountMnt??0)}}});
    ok(res,invoice);
  });

  router.add("POST","/api/v1/operator/billing/invoices/:invoiceId/refund-confirm",async({req,res,principal,params})=>{
    requireOperator(principal!,config);
    const body=await readJson(req,config.requestBodyLimitBytes);
    const invoice=await billing.recordConfirmedRefund(params.invoiceId,body.refundReference,body.reason);
    await prisma.authAuditEvent.create({data:{userId:principal!.userId,eventType:"BILLING_REFUND_CONFIRMED",metadata:{invoiceId:params.invoiceId,refundReference:String(body.refundReference??"").slice(0,200),reason:String(body.reason??"").slice(0,500)}}});
    ok(res,invoice);
  });

  router.add("DELETE","/api/v1/billing/invoices/:invoiceId",async({res,principal,params})=>{
    await billingInvoiceAccess(principal!.userId,params.invoiceId,COMPANY_ADMIN);
    ok(res,await billing.cancelInvoice(params.invoiceId));
  });

  const paymentCallback=async({res,params,query}:any)=>{
    await billing.handleProviderCallback(params.invoiceId,String(query.get("token")??""));
    res.writeHead(200,{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"});
    res.end("SUCCESS");
  };
  router.add("GET","/api/v1/billing/qpay/callback/:invoiceId",paymentCallback,false);
  router.add("POST","/api/v1/billing/qpay/callback/:invoiceId",paymentCallback,false);

  router.add("POST","/api/v1/companies",async({req,res,principal})=>{
    const b=await readJson(req,config.requestBodyLimitBytes); const name=String(b.name??"").trim(); if(!name)throw badRequest("Company name is required");
    const company=await prisma.$transaction(async(tx:any)=>{
      const c=await tx.company.create({data:{name,industry:text(b.industry),businessModel:text(b.businessModel),employeeCount:intOrNull(b.employeeCount),companyAgeYears:numOrNull(b.companyAgeYears),marketType:text(b.marketType),country:text(b.country)}});
      await tx.companyMembership.create({data:{companyId:c.id,userId:principal!.userId,role:"OWNER"}}); return c;
    }); created(res,company);
  });

  router.add("GET","/api/v1/companies",async({res,principal})=>{
    const rows=await prisma.companyMembership.findMany({where:{userId:principal!.userId},include:{company:true},orderBy:{createdAt:"asc"}});
    ok(res,rows.map(r=>({...r.company,role:r.role})));
  });

  router.add("GET","/api/v1/companies/:companyId",async({res,principal,params})=>{
    const membership=await requireCompanyRole(principal!.userId,params.companyId,ALL_ROLES);
    const company=await prisma.company.findUnique({where:{id:params.companyId}}); if(!company)throw notFound("Company not found"); ok(res,{...company,role:membership.role});
  });

  router.add("PUT","/api/v1/companies/:companyId",async({req,res,principal,params})=>{
    const membership=await requireCompanyRole(principal!.userId,params.companyId,COMPANY_ADMIN);
    const body=await readJson(req,config.requestBodyLimitBytes);
    const name=String(body.name??"").trim();
    if(!name)throw badRequest("Company name is required");
    const company=await prisma.company.update({where:{id:params.companyId},data:{name}});
    ok(res,{...company,role:membership.role});
  });

  router.add("PUT","/api/v1/companies/:companyId/profile-answers",async({req,res,principal,params})=>{
    await requireCompanyRole(principal!.userId,params.companyId,ASSESSMENT_INPUT);
    const body=await readJson(req,config.requestBodyLimitBytes);
    const rows=Array.isArray(body.profileAnswers)?body.profileAnswers:[];
    if(rows.length!==20)throw new ApiError(400,"BAD_REQUEST","Суурь мэдээллийн 20 асуултын хариулт бүрэн байх шаардлагатай.");
    const seen=new Set<string>();
    const profileAnswers=rows.map((row:any)=>{
      const questionId=String(row?.questionId??"").trim();
      const optionIndexes=Array.isArray(row?.optionIndexes)?row.optionIndexes.map((x:any)=>Number(x)).filter((x:number)=>Number.isInteger(x)&&x>0):[];
      if(!questionId||optionIndexes.length===0||seen.has(questionId))throw new ApiError(400,"BAD_REQUEST","Суурь мэдээллийн хариулт буруу байна.");
      seen.add(questionId);
      return {questionId,optionIndexes};
    });
    const basicRows=Array.isArray(body.basicInfoAnswers)?body.basicInfoAnswers:[];
    let basicInfoAnswers:Record<string,unknown>[]=[];
    if(basicRows.length){
      if(basicRows.length!==20)throw new ApiError(400,"BAD_REQUEST","Суурь мэдээллийн 20 асуултын хариулт бүрэн байх шаардлагатай.");
      const expectedBasicIds=new Set(Array.from({length:20},(_,i)=>`B${String(i+1).padStart(2,"0")}`));
      const basicSeen=new Set<string>();
      basicInfoAnswers=basicRows.map((row:any)=>{const questionId=String(row?.questionId??"").trim();const optionIndexes=Array.isArray(row?.optionIndexes)?row.optionIndexes.map((x:any)=>Number(x)).filter((x:number)=>Number.isInteger(x)&&x>0):[];if(!expectedBasicIds.has(questionId)||optionIndexes.length===0||basicSeen.has(questionId))throw new ApiError(400,"BAD_REQUEST","Суурь мэдээллийн хариулт буруу байна.");basicSeen.add(questionId);return {questionId,optionIndexes};});
      if(basicSeen.size!==expectedBasicIds.size)throw new ApiError(400,"BAD_REQUEST","Суурь мэдээллийн 20 асуултын хариулт бүрэн байх шаардлагатай.");
    }
    const company=await prisma.company.findUnique({where:{id:params.companyId}}); if(!company)throw notFound("Company not found");
    const current=(company.profile&&typeof company.profile==="object"&&!Array.isArray(company.profile)?company.profile:{}) as Record<string,unknown>;
    const now=new Date().toISOString();
    const nextProfile:Record<string,unknown>={...current,assessmentProfileAnswers:profileAnswers,profileAnswersUpdatedAt:now};
    if(basicInfoAnswers.length){nextProfile.basicInfoAnswersV2=basicInfoAnswers;nextProfile.basicInfoAnswersUpdatedAt=now;nextProfile.basicInfoCompleted=true;nextProfile.basicInfoCompletedAt=now;}
    const updated=await prisma.company.update({where:{id:params.companyId},data:{profile:nextProfile as any}});
    ok(res,updated);
  });

  router.add("GET","/api/v1/companies/:companyId/assessments",async({res,principal,params})=>{
    await requireCompanyRole(principal!.userId,params.companyId,ALL_ROLES);
    ok(res,await queries.listCompanyAssessments(params.companyId));
  });

  router.add("GET","/api/v1/companies/:companyId/diagnosis-lifecycle",async({res,principal,params})=>{
    await requireCompanyRole(principal!.userId,params.companyId,ALL_ROLES);
    ok(res,await queries.companyDiagnosisLifecycle(params.companyId));
  });

  router.add("POST","/api/v1/companies/:companyId/members",async({req,res,principal,params})=>{
    const b=await readJson(req,config.requestBodyLimitBytes);
    const role=String(b.role??"") as CompanyRole; if(!ALL_ROLES.includes(role))throw badRequest("Invalid company role");
    const email=String(b.email??"").trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw badRequest("Valid member email is required");
    let membership:any;
    try{
      membership=await prisma.$transaction(async(tx:any)=>{
      const actor=await tx.companyMembership.findUnique({where:{companyId_userId:{companyId:params.companyId,userId:principal!.userId}}});
      if(!actor||!COMPANY_ADMIN.includes(actor.role as CompanyRole))throw new ApiError(403,"FORBIDDEN","Insufficient permission");
      if(role==="OWNER"&&actor.role!=="OWNER")throw new ApiError(403,"FORBIDDEN","Only an owner may grant OWNER role");
      const user=await tx.user.findUnique({where:{email},select:{id:true,status:true}});
      if(!user||user.status!=="ACTIVE")throw notFound("User account not found");
      const existing=await tx.companyMembership.findUnique({where:{companyId_userId:{companyId:params.companyId,userId:user.id}}});
      if(existing?.role==="OWNER"&&actor.role!=="OWNER")throw new ApiError(403,"FORBIDDEN","Only an owner may change another owner's role");
      if(existing?.role==="OWNER"&&role!=="OWNER"){
        const ownerCount=await tx.companyMembership.count({where:{companyId:params.companyId,role:"OWNER"}});
        assertOwnerTransitionAllowed(existing.role as CompanyRole,role,ownerCount);
      }
      const changed=await tx.companyMembership.upsert({where:{companyId_userId:{companyId:params.companyId,userId:user.id}},create:{companyId:params.companyId,userId:user.id,role},update:{role}});
      await tx.authAuditEvent.create({data:{userId:principal!.userId,eventType:"MEMBERSHIP_CHANGED",ipHash:hashAuditValue(clientIp(req,config),config.auditSalt),userAgentHash:hashAuditValue(req.headers["user-agent"],config.auditSalt),metadata:{companyId:params.companyId,targetUserId:user.id,previousRole:existing?.role??null,nextRole:role}}});
      return changed;
      },{maxWait:10000,timeout:30000});
    }catch(error:any){
      if(String(error?.message??"").includes("A company must retain at least one OWNER"))throw conflict("A company must retain at least one OWNER");
      throw error;
    }
    created(res,membership);
  });

  router.add("POST","/api/v1/companies/:companyId/assessments",async({req,res,principal,params})=>{
    await requireCompanyRole(principal!.userId,params.companyId,ASSESSMENT_INPUT); const b=await readJson(req,config.requestBodyLimitBytes);
    const requestedMethodology=text(b.methodologyVersion);
    const domainCode=String(b.domainCode??"marketing").trim().toLowerCase();
    const claim=await billing.claimAssessmentEntitlement(params.companyId,domainCode);
    try{
      const assessment=await engine.createAssessment(params.companyId,requestedMethodology,principal!.userId,claim.entitlementId,domainCode);
      created(res,assessment);
    }catch(error){
      await billing.releaseClaim(claim);
      throw error;
    }
  });

  router.add("GET","/api/v1/assessments/:assessmentId",async({res,principal,params})=>{
    await assessmentAccess(principal!.userId,params.assessmentId,ALL_ROLES); const result=await queries.getAssessment(params.assessmentId); if(!result)throw notFound("Assessment not found"); ok(res,result);
  });

  router.add("POST","/api/v1/assessments/:assessmentId/respondents",async({req,res,principal,params})=>{
    await assessmentAccess(principal!.userId,params.assessmentId,ASSESSMENT_INPUT); const b=await readJson(req,config.requestBodyLimitBytes); if(!b.roleExternalId)throw badRequest("roleExternalId is required");
    created(res,await engine.addRespondent(params.assessmentId,String(b.roleExternalId),text(b.displayName),b.authorityMetadata&&typeof b.authorityMetadata==="object"?b.authorityMetadata:undefined));
  });

  router.add("POST","/api/v1/assessments/:assessmentId/start",async({req,res,principal,params})=>{
    await assessmentAccess(principal!.userId,params.assessmentId,ASSESSMENT_INPUT); const b=await readJson(req,config.requestBodyLimitBytes);
    const mode=String(b.mode??"QUICK") as AssessmentMode; if(!["QUICK","FULL"].includes(mode))throw badRequest("mode must be QUICK or FULL");
    const profileAnswers=validateProfileShape(b.profileAnswers); await engine.startAssessment(params.assessmentId,mode,profileAnswers,writerId(req)); const payload=await queries.resumePayload(params.assessmentId); ok(res,payload);
  });

  router.add("POST","/api/v1/assessments/:assessmentId/pause",async({req,res,principal,params})=>{
    await assessmentAccess(principal!.userId,params.assessmentId,ASSESSMENT_INPUT);
    const b=await readJson(req,config.requestBodyLimitBytes);
    if(!Number.isInteger(b.expectedAssessmentRevision))throw badRequest("expectedAssessmentRevision is required");
    ok(res,await engine.pauseAssessment(params.assessmentId,{writerLeaseId:writerId(req),expectedAssessmentRevision:Number(b.expectedAssessmentRevision)}));
  });

  router.add("POST","/api/v1/assessments/:assessmentId/resume",async({req,res,principal,params})=>{
    await assessmentAccess(principal!.userId,params.assessmentId,ASSESSMENT_INPUT);
    const b=await readJson(req,config.requestBodyLimitBytes);
    if(!Number.isInteger(b.expectedAssessmentRevision))throw badRequest("expectedAssessmentRevision is required");
    await engine.resumeAssessment(params.assessmentId,{writerLeaseId:writerId(req),expectedAssessmentRevision:Number(b.expectedAssessmentRevision)});
    const payload=await queries.resumePayload(params.assessmentId); if(!payload)throw notFound("Assessment not found"); ok(res,payload);
  });

  router.add("GET","/api/v1/assessments/:assessmentId/next-question",async({req,res,principal,params})=>{
    const access=await assessmentAccess(principal!.userId,params.assessmentId,ASSESSMENT_INPUT);
    if(access.assessment.status!=="IN_PROGRESS")throw conflict(`Assessment is not accepting question requests: ${access.assessment.status}`);
    await engine.issueNextQuestion(params.assessmentId,writerId(req));
    const payload=await queries.resumePayload(params.assessmentId); if(!payload)throw notFound("Assessment not found"); ok(res,payload);
  });

  router.add("POST","/api/v1/assessments/:assessmentId/answers",async({req,res,principal,params})=>{
    await assessmentAccess(principal!.userId,params.assessmentId,ASSESSMENT_INPUT); const b=await readJson(req,config.requestBodyLimitBytes);
    if(!b.questionId||!Number.isInteger(b.optionIndex))throw badRequest("questionId and integer optionIndex are required");
    if(!b.clientRequestId||!b.questionIssueId||!Number.isInteger(b.expectedAssessmentRevision))throw badRequest("clientRequestId, questionIssueId and expectedAssessmentRevision are required");
    const result=await engine.submitAnswer(params.assessmentId,String(b.questionId),Number(b.optionIndex),text(b.respondentId),{writerLeaseId:writerId(req),clientRequestId:String(b.clientRequestId),questionIssueId:String(b.questionIssueId),expectedAssessmentRevision:Number(b.expectedAssessmentRevision)});
    const routing=await queries.resumePayload(params.assessmentId);
    ok(res,{accepted:true,answerId:result.answerId,assessmentRevision:result.assessmentRevision,routing});
    scheduleReportPrewarm(params.assessmentId);
  });

  router.add("POST","/api/v1/assessments/:assessmentId/back",async({req,res,principal,params})=>{
    await assessmentAccess(principal!.userId,params.assessmentId,ASSESSMENT_INPUT);
    const b=await readJson(req,config.requestBodyLimitBytes);
    if(!Number.isInteger(b.expectedAssessmentRevision))throw badRequest("expectedAssessmentRevision is required");
    await engine.rewindPreviousAnswer(params.assessmentId,{writerLeaseId:writerId(req),expectedAssessmentRevision:Number(b.expectedAssessmentRevision)});
    const payload=await queries.resumePayload(params.assessmentId); if(!payload)throw notFound("Assessment not found"); ok(res,payload);
  });

  router.add("PUT","/api/v1/assessments/:assessmentId/draft",async({req,res,principal,params})=>{
    await assessmentAccess(principal!.userId,params.assessmentId,ASSESSMENT_INPUT); const b=await readJson(req,config.requestBodyLimitBytes);
    if(!b.questionIssueId||!b.questionId||!Number.isInteger(b.expectedAssessmentRevision))throw badRequest("questionIssueId, questionId and expectedAssessmentRevision are required");
    ok(res,await engine.saveDraft(params.assessmentId,{questionIssueId:String(b.questionIssueId),questionId:String(b.questionId),draft:b.draft??{},expectedAssessmentRevision:Number(b.expectedAssessmentRevision),writerLeaseId:writerId(req)}));
  });

  router.add("POST","/api/v1/assessments/:assessmentId/writer-lease/heartbeat",async({req,res,principal,params})=>{
    await assessmentAccess(principal!.userId,params.assessmentId,ASSESSMENT_INPUT);
    ok(res,await engine.heartbeatWriterLease(params.assessmentId,writerId(req)));
  });

  router.add("POST","/api/v1/assessments/:assessmentId/complete",async({req,res,principal,params})=>{
    await assessmentAccess(principal!.userId,params.assessmentId,ASSESSMENT_INPUT);
    const b=await readJson(req,config.requestBodyLimitBytes); if(!Number.isInteger(b.expectedAssessmentRevision))throw badRequest("expectedAssessmentRevision is required");
    const result=await engine.completeAssessment(params.assessmentId,{writerLeaseId:writerId(req),expectedAssessmentRevision:Number(b.expectedAssessmentRevision)});
    ok(res,{completed:result.completed,reason:result.reason,routingState:result.routingState,status:result.status,assessmentRevision:result.assessmentRevision});
    if(result.completed)scheduleReportPrewarm(params.assessmentId);
  });

  router.add("GET","/api/v1/assessments/:assessmentId/status",async({res,principal,params})=>{
    await assessmentAccess(principal!.userId,params.assessmentId,ALL_ROLES);
    const status=await queries.status(params.assessmentId); if(!status)throw notFound("Assessment not found"); ok(res,status);
  });

  router.add("GET","/api/v1/assessments/:assessmentId/progress",async({res,principal,params})=>{
    await assessmentAccess(principal!.userId,params.assessmentId,ALL_ROLES); const p=await queries.progress(params.assessmentId); if(!p)throw notFound("Assessment not found"); ok(res,p);
  });

  router.add("GET","/api/v1/assessments/:assessmentId/results",async({res,principal,params})=>{
    const access=await assessmentAccess(principal!.userId,params.assessmentId,ALL_ROLES); requireTerminal(access.assessment.status); const r=await queries.results(params.assessmentId); if(!r)throw notFound("Assessment not found"); ok(res,r);
  });

  router.add("POST","/api/v1/assessments/:assessmentId/strategy/generate",async({res,principal,params})=>{
    const access=await assessmentAccess(principal!.userId,params.assessmentId,REVIEW_WRITE); requireTerminal(access.assessment.status);
    const x=await strategyReports.freezeStrategyPlan(params.assessmentId); ok(res,{generated:true,schemaVersion:x.schemaVersion,diagnosisResultHash:x.diagnosisResultHash,strategyHash:x.strategyHash,planHash:x.planHash,versions:{rootCause:x.rootCause.version,recommendation:x.recommendations.version,actionPlan:x.actionPlan.version}});
  });

  router.add("GET","/api/v1/assessments/:assessmentId/diagnosis",async({res,principal,params})=>{
    const access=await assessmentAccess(principal!.userId,params.assessmentId,ALL_ROLES); requireTerminal(access.assessment.status); ok(res,await strategyReports.getDiagnosis(params.assessmentId));
  });

  router.add("GET","/api/v1/assessments/:assessmentId/recommendations",async({res,principal,params})=>{
    const access=await assessmentAccess(principal!.userId,params.assessmentId,ALL_ROLES); requireTerminal(access.assessment.status); ok(res,await strategyReports.getRecommendations(params.assessmentId));
  });

  router.add("GET","/api/v1/assessments/:assessmentId/action-plan",async({res,principal,params})=>{
    const access=await assessmentAccess(principal!.userId,params.assessmentId,ALL_ROLES); requireTerminal(access.assessment.status);
    ok(res,await strategyReports.getActionPlan(params.assessmentId));
  });

  router.add("PATCH","/api/v1/assessments/:assessmentId/action-plan/milestones/:milestoneId",async({req,res,principal,params})=>{
    const access=await assessmentAccess(principal!.userId,params.assessmentId,REVIEW_WRITE); requireTerminal(access.assessment.status); const b:any=await readJson(req,config.requestBodyLimitBytes);
    const patch:any={};
    if(b.status!==undefined){const status=String(b.status);if(!["NOT_STARTED","IN_PROGRESS","DONE","BLOCKED","SKIPPED"].includes(status))throw badRequest("Ажлын төлөв буруу байна");patch.status=status}
    if(b.progressPercent!==undefined){const n=Number(b.progressPercent);if(!Number.isInteger(n)||n<0||n>100)throw badRequest("Ахиц 0-100 бүхэл тоо байна");patch.progressPercent=n}
    for(const key of ["plannedStartDate","plannedEndDate","actualStartDate","actualCompletedDate"]){if(b[key]!==undefined){if(b[key]!==null&&b[key]!==''&&Number.isNaN(Date.parse(String(b[key]))))throw badRequest("Огнооны утга буруу байна");patch[key]=b[key]=== ''?null:b[key]}}
    const textFields=[["noteMn",2000,"Тэмдэглэл"],["delayReasonMn",1000,"Саатлын шалтгаан"],["metricUnitMn",40,"Хэмжих нэгж"]] as const;
    for(const [key,max,label] of textFields){if(b[key]!==undefined){const value=b[key]===null?null:String(b[key]);if(value!==null&&value.length>max)throw badRequest(`${label} хэт урт байна`);patch[key]=value}}
    for(const key of ["metricCurrentValue","metricTargetValue"]){if(b[key]!==undefined){if(b[key]===null||b[key]===''){patch[key]=null}else{const n=Number(b[key]);if(!Number.isFinite(n)||Math.abs(n)>1_000_000_000_000)throw badRequest("Хэмжих үзүүлэлтийн утга буруу байна");patch[key]=n}}}
    if(!Object.keys(patch).length)throw badRequest("Шинэчлэх мэдээлэл алга");
    ok(res,await strategyReports.updateMilestone(params.assessmentId,params.milestoneId,patch));
  });

  router.add("GET","/api/v1/assessments/:assessmentId/report-payload",async({res,principal,params})=>{
    const access=await assessmentAccess(principal!.userId,params.assessmentId,REVIEW_WRITE); requireTerminal(access.assessment.status); await requireReportReady(params.assessmentId); ok(res,await strategyReports.freezeReportPayload(params.assessmentId));
  });

  router.add("GET","/api/v1/assessments/:assessmentId/report",async({res,principal,params})=>{
    const access=await assessmentAccess(principal!.userId,params.assessmentId,REPORT_READ); requireTerminal(access.assessment.status); await requireReportReady(params.assessmentId);
    try{ok(res,access.membership.role==="VIEWER"?await strategyReports.readPublishedReport(params.assessmentId):await withinRequestBudget(strategyReports.generateReport(params.assessmentId)));}
    catch(error){if(error instanceof ReportGenerationInProgressError)throw new ApiError(409,"REPORT_GENERATION_IN_PROGRESS","Report generation is already in progress");throw error;}
  });

  router.add("GET","/api/v1/assessments/:assessmentId/report/pdf/metadata",async({res,principal,params})=>{
    const access=await assessmentAccess(principal!.userId,params.assessmentId,REPORT_READ); requireTerminal(access.assessment.status); await requireReportReady(params.assessmentId);
    try{
      await strategyReports.ensurePublishedReport(params.assessmentId);
      const artifact=await strategyReports.getOrCreateReportPdf(params.assessmentId);
      ok(res,{filename:artifact.filename,mimeType:artifact.mimeType,sourceHash:artifact.sourceHash,contentHash:artifact.contentHash,sizeBytes:artifact.sizeBytes,generatorVersion:artifact.generatorVersion,generatedAt:artifact.generatedAt,verifiedAt:artifact.verifiedAt});
    }catch(error){if(error instanceof ReportGenerationInProgressError)throw new ApiError(409,"REPORT_GENERATION_IN_PROGRESS","Report generation is already in progress");throw error;}
  });

  router.add("GET","/api/v1/assessments/:assessmentId/report/pdf",async({res,principal,params})=>{
    const access=await assessmentAccess(principal!.userId,params.assessmentId,REPORT_READ); requireTerminal(access.assessment.status); await requireReportReady(params.assessmentId);
    try{
      await strategyReports.ensurePublishedReport(params.assessmentId);
      const artifact=await strategyReports.getOrCreateReportPdf(params.assessmentId);
      res.writeHead(200,{"content-type":artifact.mimeType,"content-length":String(artifact.sizeBytes),"content-disposition":`attachment; filename="${artifact.filename}"`,"cache-control":"private, no-store","x-mmri-pdf-source-hash":artifact.sourceHash,"x-mmri-pdf-content-hash":artifact.contentHash});
      const stream=createReadStream(artifact.absolutePath);stream.on("error",()=>{if(!res.headersSent)res.writeHead(500);res.destroy();});stream.pipe(res);
    }catch(error){if(error instanceof ReportGenerationInProgressError)throw new ApiError(409,"REPORT_GENERATION_IN_PROGRESS","Report generation is already in progress");throw error;}
  });

  router.add("POST","/api/v1/assessments/:assessmentId/report/pdf/regenerate",async({res,principal,params})=>{
    const access=await assessmentAccess(principal!.userId,params.assessmentId,REVIEW_WRITE); requireTerminal(access.assessment.status); await requireReportReady(params.assessmentId);
    await strategyReports.readPublishedReport(params.assessmentId);
    const artifact=await strategyReports.getOrCreateReportPdf(params.assessmentId,true);
    ok(res,{regenerated:true,filename:artifact.filename,mimeType:artifact.mimeType,sourceHash:artifact.sourceHash,contentHash:artifact.contentHash,sizeBytes:artifact.sizeBytes,generatorVersion:artifact.generatorVersion,generatedAt:artifact.generatedAt,verifiedAt:artifact.verifiedAt});
  });

  router.add("GET","/api/v1/assessments/:assessmentId/trace",async({res,principal,params})=>{
    const access=await assessmentAccess(principal!.userId,params.assessmentId,["OWNER","ADMIN","CONSULTANT"]); requireTerminal(access.assessment.status); ok(res,await strategyReports.getTraceability(params.assessmentId));
  });


  // Step 23 — controlled real-company pilot / empirical evidence collection.
  router.add("POST","/api/v1/pilot/studies",async({req,res,principal})=>{
    requireOperator(principal!,config);
    const b=await readJson(req,config.requestBodyLimitBytes);
    created(res,await createPilotStudy(principal!.userId,b));
  });

  router.add("GET","/api/v1/pilot/studies",async({res,principal})=>{
    requireOperator(principal!,config);
    ok(res,await listPilotStudies(principal!.userId));
  });

  router.add("PATCH","/api/v1/pilot/studies/:studyId/status",async({req,res,principal,params})=>{
    requireOperator(principal!,config);
    const b=await readJson(req,config.requestBodyLimitBytes);
    ok(res,await updatePilotStudyStatus(principal!.userId,params.studyId,b.status));
  });

  router.add("POST","/api/v1/pilot/studies/:studyId/enrollments",async({req,res,principal,params})=>{
    requireOperator(principal!,config);
    const b=await readJson(req,config.requestBodyLimitBytes); const companyId=String(b.companyId??"");
    if(!companyId)throw badRequest("companyId is required");
    await requireStudyCreator(principal!.userId,params.studyId);
    await requireCompanyRole(principal!.userId,companyId,COMPANY_ADMIN);
    created(res,await enrollCompany(params.studyId,companyId,b.deidentifiedCode));
  });

  router.add("PATCH","/api/v1/pilot/enrollments/:enrollmentId/consent",async({req,res,principal,params})=>{
    const b=await readJson(req,config.requestBodyLimitBytes);
    const enrollment=await pilotEnrollmentAccess(principal!.userId,params.enrollmentId,COMPANY_ADMIN);
    const status=String(b.status??"");
    if(status==="CONSENTED"&&b.confirmConsent!==true)throw badRequest("confirmConsent=true is required to record pilot consent");
    if(status==="WITHDRAWN"&&b.confirmWithdrawal!==true)throw badRequest("confirmWithdrawal=true is required to withdraw pilot consent");
    ok(res,await setEnrollmentConsent(params.enrollmentId,enrollment.companyId,status));
  });

  router.add("POST","/api/v1/pilot/enrollments/:enrollmentId/assessments",async({req,res,principal,params})=>{
    const b=await readJson(req,config.requestBodyLimitBytes);
    const enrollment=await pilotEnrollmentAccess(principal!.userId,params.enrollmentId,COMPANY_ADMIN);
    created(res,await linkPilotAssessment(params.enrollmentId,enrollment.companyId,b));
  });

  router.add("POST","/api/v1/pilot/enrollments/:enrollmentId/feedback",async({req,res,principal,params})=>{
    const b=await readJson(req,config.requestBodyLimitBytes);
    const enrollment=await pilotEnrollmentAccess(principal!.userId,params.enrollmentId,COMPANY_CONTENT_WRITE);
    created(res,await recordPilotFeedback(params.enrollmentId,enrollment.companyId,b));
  });

  router.add("POST","/api/v1/pilot/enrollments/:enrollmentId/outcome-baseline",async({req,res,principal,params})=>{
    const b=await readJson(req,config.requestBodyLimitBytes);
    const enrollment=await pilotEnrollmentAccess(principal!.userId,params.enrollmentId,COMPANY_ADMIN);
    ok(res,await recordOutcomeBaseline(params.enrollmentId,enrollment.companyId,b));
  });

  router.add("POST","/api/v1/pilot/studies/:studyId/analyze",async({res,principal,params})=>{
    requireOperator(principal!,config);
    created(res,await analyzePilotStudy(principal!.userId,params.studyId));
  });

  router.add("POST","/api/v1/pilot/studies/:studyId/decisions",async({req,res,principal,params})=>{
    requireOperator(principal!,config);
    const b=await readJson(req,config.requestBodyLimitBytes);
    created(res,await recordPilotDecision(principal!.userId,params.studyId,b));
  });

  router.add("GET","/api/v1/pilot/studies/:studyId/export",async({res,principal,params})=>{
    requireOperator(principal!,config);
    ok(res,await deidentifiedPilotExport(principal!.userId,params.studyId));
  });

  router.add("GET","/api/v1/pilot/studies/:studyId/export.csv",async({res,principal,params})=>{
    requireOperator(principal!,config);
    const data=await deidentifiedPilotExport(principal!.userId,params.studyId);
    res.writeHead(200,{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="${data.study.code}-pilot.csv"`,"cache-control":"no-store"});
    res.end(pilotExportCsv(data));
  });

  // Step 24 — evidence-gated calibration and immutable methodology versioning.
  router.add("POST","/api/v1/calibration/proposals",async({req,res,principal})=>{
    requireOperator(principal!,config);
    const b=await readJson(req,config.requestBodyLimitBytes);created(res,await createCalibrationProposal(principal!.userId,b));
  });
  router.add("GET","/api/v1/calibration/proposals",async({res,principal})=>{requireOperator(principal!,config);ok(res,await listCalibrationProposals(principal!.userId));});
  router.add("GET","/api/v1/calibration/proposals/:proposalId",async({res,principal,params})=>{requireOperator(principal!,config);ok(res,await getCalibrationProposal(principal!.userId,params.proposalId));});
  router.add("POST","/api/v1/calibration/proposals/:proposalId/submit",async({req,res,principal,params})=>{
    requireOperator(principal!,config);
    const b=await readJson(req,config.requestBodyLimitBytes);ok(res,await submitCalibrationProposal(principal!.userId,params.proposalId,b));
  });
  router.add("POST","/api/v1/calibration/proposals/:proposalId/review",async({req,res,principal,params})=>{
    requireOperator(principal!,config);
    const b=await readJson(req,config.requestBodyLimitBytes);created(res,await reviewCalibrationProposal(principal!.userId,params.proposalId,b));
  });
  router.add("POST","/api/v1/calibration/proposals/:proposalId/activate",async({res,principal,params})=>{
    requireOperator(principal!,config);
    ok(res,await activateCalibrationProposal(principal!.userId,params.proposalId));
  });
  router.add("GET","/api/v1/calibration/proposals/:proposalId/manifest",async({res,principal,params})=>{requireOperator(principal!,config);ok(res,await calibrationManifest(principal!.userId,params.proposalId));});

  router.add("GET","/api/v1/methodology/current/profile-questions",async({res})=>{
    const v=await prisma.methodologyVersion.findFirst({where:{version:TARGET_METHODOLOGY_VERSION,status:"ACTIVE"}}); if(!v)throw notFound(`Target methodology ${TARGET_METHODOLOGY_VERSION} is not active`);
    const rows=await prisma.profileQuestion.findMany({where:{methodologyVersionId:v.id},orderBy:{orderIndex:"asc"},include:{options:{orderBy:{optionIndex:"asc"}}}});
    ok(res,rows.map(q=>({id:q.externalId,textMn:q.textMn,type:q.questionType,options:q.options.map(o=>({optionIndex:o.optionIndex,labelMn:o.labelMn}))})));
  });

  router.add("GET","/api/v1/methodology/current/respondent-roles",async({res})=>{
    const v=await prisma.methodologyVersion.findFirst({where:{version:TARGET_METHODOLOGY_VERSION,status:"ACTIVE"}}); if(!v)throw notFound(`Target methodology ${TARGET_METHODOLOGY_VERSION} is not active`);
    const rows=await prisma.respondentRole.findMany({where:{methodologyVersionId:v.id},orderBy:{code:"asc"}}); ok(res,rows.map(r=>({id:r.externalId,code:r.code,labelMn:r.labelMn,scopeMn:r.scopeMn})));
  });

  const server=createServer(async(req,res)=>{
    const requestId=safeRequestId(req.headers["x-request-id"]);
    const started=process.hrtime.bigint();
    const endMetrics=operationalMetrics.begin(req);
    const logPath=(req.url??"/").split("?",1)[0].slice(0,512);
    res.once("finish",()=>{
      endMetrics(res.statusCode);
      const durationMs=Number(process.hrtime.bigint()-started)/1_000_000;
      console.log(structuredRequestLog({requestId,method:req.method??"UNKNOWN",path:logPath,status:res.statusCode,durationMs,releaseSha:config.releaseSha,instanceId:config.instanceId}));
    });
    securityHeaders(res,requestId,config);
    try{
      if(req.method==="OPTIONS")return handleCorsPreflight(req,res,config);
      applyCors(req,res,config);
      const url=new URL(req.url??"/","http://localhost");
      if(!acceptingTraffic&&!["/live","/health","/ready","/metrics"].includes(url.pathname))throw new ApiError(503,"SERVICE_DRAINING","Service is restarting; retry shortly");
      if(!["/live","/health","/ready","/metrics"].includes(url.pathname))apiLimiter.check(`api:${clientIp(req,config)}`);
      const match=router.match(req.method??"GET",url.pathname); if(!match)throw notFound("Route not found");
      const principal=match.route.auth?await authenticate(req.headers.authorization,config):undefined;
      await match.route.handler({req,res,params:match.params,query:url.searchParams,requestId,principal});
    }catch(error:any){
      if(res.headersSent){res.end();return;} const e=normalizeError(error,config.environment,{requestId,path:logPath,releaseSha:config.releaseSha,instanceId:config.instanceId});
      const retryAfter=Number((e.details as any)?.retryAfterSeconds); if(e.status===429&&Number.isFinite(retryAfter))res.setHeader("retry-after",String(Math.max(1,Math.ceil(retryAfter))));
      json(res,e.status,{error:{code:e.code,message:e.message,details:e.details,requestId}});
    }
  });
  return {server,router,config,beginDrain:()=>{acceptingTraffic=false;},operationalSnapshot:()=>operationalMetrics.snapshot()};
}

function normalizeError(error:any,environment="development",context?:{requestId:string;path:string;releaseSha:string;instanceId:string}):ApiError {
  if(error instanceof ApiError)return error;
  const message=String(error?.message??"Unexpected server error");
  if(environment==="production"){
    // Unknown exceptions may contain SQL, filesystem paths, provider details or other operational data.
    // Preserve only the broad status class; never echo the raw exception to a production customer.
    console.error(JSON.stringify({ts:new Date().toISOString(),level:"error",event:"internal_exception",requestId:context?.requestId,path:context?.path,errorName:String(error?.name??"Error").slice(0,80),releaseSha:context?.releaseSha,instanceId:context?.instanceId}));
    if(message.includes("not found")||message.includes("not ACTIVE"))return new ApiError(404,"NOT_FOUND","Resource not found");
    if(message.includes("cannot")||message.includes("Invalid")||message.includes("requires")||message.includes("required")||message.includes("must")||message.includes("missing")||message.includes("refusing"))return new ApiError(400,"BAD_REQUEST","Invalid request");
    return new ApiError(500,"INTERNAL_ERROR","Internal server error");
  }
  if(message.includes("not found")||message.includes("not ACTIVE"))return new ApiError(404,"NOT_FOUND",message);
  if(message.includes("cannot")||message.includes("Invalid")||message.includes("requires")||message.includes("required")||message.includes("must")||message.includes("missing")||message.includes("refusing"))return new ApiError(400,"BAD_REQUEST",message);
  console.error(error); return new ApiError(500,"INTERNAL_ERROR","Internal server error");
}
function securityHeaders(res:ServerResponse,requestId:string,config:ApiConfig){
  res.setHeader("x-request-id",requestId);
  res.setHeader("x-content-type-options","nosniff");
  res.setHeader("x-frame-options","DENY");
  res.setHeader("referrer-policy","no-referrer");
  res.setHeader("permissions-policy","camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("cross-origin-resource-policy","same-site");
  res.setHeader("cross-origin-opener-policy","same-origin");
  res.setHeader("x-dns-prefetch-control","off");
  res.setHeader("cache-control","no-store");
  res.setHeader("content-security-policy","default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if(config.environment==="production")res.setHeader("strict-transport-security","max-age=31536000; includeSubDomains");
}
function applyCors(req:IncomingMessage,res:ServerResponse,config:ApiConfig){const origin=req.headers.origin;if(!origin)return;if(!config.allowedOrigins.has(origin))throw new ApiError(403,"CORS_ORIGIN_DENIED","Origin is not allowed");res.setHeader("access-control-allow-origin",origin);res.setHeader("access-control-allow-credentials","true");res.setHeader("vary","Origin");}
function requireTrustedBrowserOrigin(req:IncomingMessage,config:ApiConfig){const origin=req.headers.origin;if(config.environment==="production"&&!origin)throw new ApiError(403,"BROWSER_ORIGIN_REQUIRED","Origin header is required for cookie-authenticated requests");if(origin&&!config.allowedOrigins.has(origin))throw new ApiError(403,"CORS_ORIGIN_DENIED","Origin is not allowed");}
function safeRequestId(value:string|string[]|undefined){const raw=Array.isArray(value)?value[0]:value;if(raw&&/^[A-Za-z0-9._:-]{1,128}$/.test(raw))return raw;return randomUUID();}
function handleCorsPreflight(req:IncomingMessage,res:ServerResponse,config:ApiConfig){applyCors(req,res,config);res.writeHead(204,{"access-control-allow-methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS","access-control-allow-headers":"authorization,content-type,x-request-id,x-mmri-writer-id","access-control-max-age":"600"});res.end();}
function clientIp(req:IncomingMessage,config:ApiConfig){if(config.trustProxy){const f=req.headers["x-forwarded-for"];const raw=Array.isArray(f)?f[0]:f;const parts=(raw??"").split(",").map(x=>x.trim()).filter(Boolean);if(parts.length){const index=Math.max(0,parts.length-config.trustProxyHops);const forwarded=parts[index];if(forwarded&&forwarded.length<=128)return forwarded;}}return req.socket.remoteAddress||"unknown";}
function fingerprint(req:IncomingMessage,config:ApiConfig){return{ip:clientIp(req,config),userAgent:req.headers["user-agent"]};}
function requireTerminal(status:string){if(!["COMPLETED","COMPLETED_WITH_REVIEW","EXHAUSTED"].includes(status))throw conflict("Results are available only after the assessment reaches a terminal state");}
async function requireReportReady(assessmentId:string){const snapshot=await prisma.assessmentStateSnapshot.findFirst({where:{assessmentId},select:{id:true}});if(!snapshot)throw conflict("Assessment is terminal but its immutable result snapshot is not ready");}
function text(v:any):string|undefined{if(v===null||v===undefined)return undefined;const s=String(v).trim();return s||undefined;}
function intOrNull(v:any):number|null{if(v===null||v===undefined||v==="")return null;const n=Number(v);if(!Number.isInteger(n)||n<0)throw badRequest("Expected a non-negative integer");return n;}
function numOrNull(v:any):number|null{if(v===null||v===undefined||v==="")return null;const n=Number(v);if(!Number.isFinite(n)||n<0)throw badRequest("Expected a non-negative number");return n;}
function validateProfileShape(value:any):ProfileAnswer[]{if(!Array.isArray(value))throw badRequest("profileAnswers must be an array");return value.map((x:any)=>{if(!x||typeof x.questionId!=="string"||!Array.isArray(x.optionIndexes)||!x.optionIndexes.every(Number.isInteger))throw badRequest("Invalid profile answer");return{questionId:x.questionId,optionIndexes:x.optionIndexes};});}

function writerId(req:IncomingMessage): string { const raw=req.headers["x-mmri-writer-id"]; const value=Array.isArray(raw)?raw[0]:raw; if(!value||value.length>160)throw badRequest("X-MMRI-Writer-ID header is required"); return value; }
