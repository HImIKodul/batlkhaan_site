import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
let ts;
try{ts=require("typescript");}catch{ts=require("/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js");}
const root=process.cwd();
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith(".ts"))files.push(p);}}
walk(path.join(root,"src/api")); walk(path.join(root,"src/billing")); walk(path.join(root,"src/pilot")); walk(path.join(root,"src/calibration")); files.push(path.join(root,"../frontend/src/api/client.ts")); files.push(path.join(root,"src/services/prisma-assessment-engine.ts")); files.push(path.join(root,"src/services/prisma-strategy-report-service.ts")); files.push(path.join(root,"src/services/traceability-service.ts")); files.push(path.join(root,"src/verify-step12-traceability.ts")); files.push(path.join(root,"src/services/contracts.ts"));
let syntaxErrors=[];
for(const file of files){const source=fs.readFileSync(file,"utf8");const out=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext},reportDiagnostics:true,fileName:file});for(const d of out.diagnostics??[]){if(d.category===ts.DiagnosticCategory.Error)syntaxErrors.push(`${file}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText," ")}`);}}
if(syntaxErrors.length){console.error(syntaxErrors.join("\n"));process.exit(1);}

const app=fs.readFileSync(path.join(root,"src/api/app.ts"),"utf8");
const routes=[...app.matchAll(/router\.add\("(GET|POST|PUT|PATCH|DELETE)","([^"]+)"/g)].map(m=>`${m[1]} ${m[2]}`);
const expected=[
"GET /health","GET /live","GET /ready","GET /metrics","POST /api/v1/auth/register","POST /api/v1/auth/login","POST /api/v1/auth/refresh","POST /api/v1/auth/logout","GET /api/v1/auth/me",
"GET /api/v1/billing/plans","GET /api/v1/companies/:companyId/billing/status","POST /api/v1/companies/:companyId/billing/invoices","GET /api/v1/billing/invoices/:invoiceId","POST /api/v1/billing/invoices/:invoiceId/mock-pay","POST /api/v1/billing/invoices/:invoiceId/reconcile","POST /api/v1/operator/billing/invoices/:invoiceId/manual-confirm","POST /api/v1/operator/billing/invoices/:invoiceId/refund-confirm","DELETE /api/v1/billing/invoices/:invoiceId","GET /api/v1/billing/qpay/callback/:invoiceId","POST /api/v1/billing/qpay/callback/:invoiceId",
"POST /api/v1/companies","GET /api/v1/companies","GET /api/v1/companies/:companyId","PUT /api/v1/companies/:companyId","PUT /api/v1/companies/:companyId/profile-answers","GET /api/v1/companies/:companyId/assessments","GET /api/v1/companies/:companyId/diagnosis-lifecycle","POST /api/v1/companies/:companyId/members","POST /api/v1/companies/:companyId/assessments",
"GET /api/v1/assessments/:assessmentId","POST /api/v1/assessments/:assessmentId/respondents","POST /api/v1/assessments/:assessmentId/start","POST /api/v1/assessments/:assessmentId/pause","POST /api/v1/assessments/:assessmentId/resume","GET /api/v1/assessments/:assessmentId/next-question","POST /api/v1/assessments/:assessmentId/answers","POST /api/v1/assessments/:assessmentId/back","PUT /api/v1/assessments/:assessmentId/draft","POST /api/v1/assessments/:assessmentId/writer-lease/heartbeat","POST /api/v1/assessments/:assessmentId/complete","GET /api/v1/assessments/:assessmentId/status","GET /api/v1/assessments/:assessmentId/progress","GET /api/v1/assessments/:assessmentId/results",
"POST /api/v1/assessments/:assessmentId/strategy/generate","GET /api/v1/assessments/:assessmentId/diagnosis","GET /api/v1/assessments/:assessmentId/recommendations","GET /api/v1/assessments/:assessmentId/action-plan","PATCH /api/v1/assessments/:assessmentId/action-plan/milestones/:milestoneId","GET /api/v1/assessments/:assessmentId/report-payload","GET /api/v1/assessments/:assessmentId/report","GET /api/v1/assessments/:assessmentId/report/pdf/metadata","GET /api/v1/assessments/:assessmentId/report/pdf","POST /api/v1/assessments/:assessmentId/report/pdf/regenerate","GET /api/v1/assessments/:assessmentId/trace",
"GET /api/v1/methodology/current/profile-questions","GET /api/v1/methodology/current/respondent-roles",
// 2026-11-05: password recovery, data export, data erasure
"POST /api/v1/auth/password-reset/request","POST /api/v1/auth/password-reset/confirm","GET /api/v1/account/export","GET /api/v1/companies/:companyId/export","POST /api/v1/companies/:companyId/erase","POST /api/v1/account/erase",
// 2026-11-06: admin system customer-side endpoints
"GET /api/v1/assessments/:assessmentId/review-status","POST /api/v1/billing/invoices/:invoiceId/dispute","GET /api/v1/companies/:companyId/disputes","POST /api/v1/support/cases",
  // Added by the functional-repair phase (MMRI-23, MMRI-24); security-reviewed: all three require a company-admin role, limit/offset are clamped, removal is advisory-locked with a last-owner guard.
  "GET /api/v1/companies/:companyId/billing/invoices","GET /api/v1/companies/:companyId/members","DELETE /api/v1/companies/:companyId/members/:userId"
];
// Admin routes are registered through a wrapper that authenticates and checks the permission server-side. Every route must name a permission
// (only the /auth/ session routes may use null, and they still require a valid admin session).
{const src=fs.readFileSync(new URL('../src/api/admin/admin-routes.ts',import.meta.url),'utf8');const calls=[...src.matchAll(/route\("(GET|POST|PUT|PATCH|DELETE)",\s*"([^"]+)",\s*([^,]+),/g)];
 const bad=calls.filter(c=>!/^"[a-z]+\.[a-z]+"$/.test(c[3].trim())&&!(c[3].trim()==='null'&&c[2].startsWith('/auth/')));
 if(calls.length<35||bad.length){console.error('Admin route permission check failed: '+calls.length+' routes, bad: '+bad.map(b=>b[2]).join(','));process.exit(1);}}
for(const route of expected)if(!routes.includes(route)){console.error(`Missing route: ${route}`);process.exit(1);}
const pilotRoutes=routes.filter(x=>x.includes(" /api/v1/pilot/"));
const calibrationRoutes=routes.filter(x=>x.includes(" /api/v1/calibration/"));
if(routes.length!==expected.length+12+7||pilotRoutes.length!==12||calibrationRoutes.length!==7){console.error(`Expected ${expected.length} core + 12 pilot + 7 calibration routes, found ${routes.length}`);process.exit(1);}

const presenter=fs.readFileSync(path.join(root,"src/api/presenters.ts"),"utf8");
for(const forbidden of ["secondaryTargets","cellId:q.cellId","cellId:q.cellId","weightPct:o.weightPct","routingState:o.routingState"]){if(presenter.includes(forbidden)){console.error(`Presenter leaks hidden diagnostic field: ${forbidden}`);process.exit(1);}}
if(!app.includes('requireTerminal(access.assessment.status)')){console.error("Terminal result gate missing");process.exit(1);}
if(app.includes('routing:publicRouting(result.routing),overall:result.overall')){console.error("Answer response leaks diagnostic result during assessment");process.exit(1);}

const schema=fs.readFileSync(path.join(root,"prisma/schema.prisma"),"utf8");
for(const required of ["model User {","model CompanyMembership {","model RefreshSession {","overallPartialScore","overallOfficialScore","partialScore    Decimal?","officialScore   Decimal?","model StrategyRun {","model RootFindingRecord {","model RecommendationRecord {","model ActionPlanRecord {","model ActionPlanMilestoneRecord {","model ReportSnapshot {","model ReportArtifact {","model BillingInvoice {","model CompanyEntitlement {","model AnswerEvent {","model ResponseDraft {","model AssessmentStateSnapshot {","model TraceSnapshot {","assessmentRevision","currentQuestionIssueId","callbackTokenHash","entitlementId"]){if(!schema.replace(/\s+/g," ").includes(required.replace(/\s+/g," "))){console.error(`Schema requirement missing: ${required}`);process.exit(1);}}
const engineService=fs.readFileSync(path.join(root,"src/services/prisma-assessment-engine.ts"),"utf8");if(!engineService.includes("async completeAssessment")){console.error("Persistent completion method missing");process.exit(1);}
if(!app.includes("queries.status(params.assessmentId)")){console.error("Assessment lifecycle status endpoint missing");process.exit(1);}
if(!app.includes("engine.completeAssessment(params.assessmentId")){console.error("Complete endpoint does not persist completion");process.exit(1);}
if(!app.includes("engine.resumeAssessment")||!app.includes("queries.resumePayload")){console.error("Authoritative resume endpoint missing");process.exit(1);}
if(!engineService.includes("async issueNextQuestion")){console.error("Persisted next-question issuance method missing");process.exit(1);}
if(!engineService.includes("currentQuestionIssueId")||!engineService.includes("RESUME_OPEN_QUESTION")){console.error("Idempotent current-question resume guard missing");process.exit(1);}
if(!engineService.includes("clientRequestId")||!engineService.includes("expectedAssessmentRevision")||!engineService.includes("answerEvent.create")){console.error("Step11 idempotency/revision/AnswerEvent contract missing");process.exit(1);}
if(!app.includes('/draft')||!app.includes('writer-lease/heartbeat')){console.error("Step11 draft/lease routes missing");process.exit(1);}
if(!app.includes("engine.issueNextQuestion")){console.error("API does not use persisted next-question issuance");process.exit(1);}
if(!app.includes("strategyReports.getDiagnosis")||!app.includes("strategyReports.getRecommendations")||!app.includes("strategyReports.getActionPlan")||!app.includes("strategyReports.generateReport")){console.error("Strategy/report API integration missing");process.exit(1);}
if(!app.includes("billing.claimAssessmentEntitlement")||!app.includes("billing.handleProviderCallback")||!app.includes('res.end("SUCCESS")')){console.error("Billing payment gate/callback integration missing");process.exit(1);}
const billing=fs.readFileSync(path.join(root,"src/billing/billing-service.ts"),"utf8");
if(!billing.includes('checkInvoicePayment')||!billing.includes('PAYMENT_REQUIRED')||!billing.includes('timingSafeEqual')){console.error("Billing server verification invariants missing");process.exit(1);}

// Runtime-check the pure crypto and router helpers after transpiling their dependency set.
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"mmri-api-check-"));
function compile(rel){const src=path.join(root,rel);const source=fs.readFileSync(src,"utf8");const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext}}).outputText;const out=path.join(tmp,rel.replace(/\.ts$/,".js"));fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,js);}
for(const rel of ["src/api/config.ts","src/api/errors.ts","src/api/auth/crypto.ts","src/api/http/router.ts"]){compile(rel);}
const cryptoMod=await import(pathToFileURL(path.join(tmp,"src/api/auth/crypto.js")));
const config={issuer:"mmri-api",audience:"mmri-web",accessTokenSecret:"x".repeat(40),accessTokenTtlSeconds:900,passwordPepper:"p".repeat(40)};
const hash=await cryptoMod.hashPassword("LongEnoughPassword123",config.passwordPepper);
if(!(await cryptoMod.verifyPassword("LongEnoughPassword123",hash,config.passwordPepper)))throw new Error("Password verification failed");
if(await cryptoMod.verifyPassword("wrong-password-123",hash,config.passwordPepper))throw new Error("Wrong password accepted");
const token=cryptoMod.signAccessToken({userId:"u1",email:"u@example.com",tokenVersion:3},config);
const claims=cryptoMod.verifyAccessToken(token,config);if(claims.sub!=="u1"||claims.tv!==3)throw new Error("Access token roundtrip failed");
let tamper=false;try{cryptoMod.verifyAccessToken(token.slice(0,-2)+"aa",config);}catch{tamper=true;}if(!tamper)throw new Error("Tampered access token accepted");
const routerMod=await import(pathToFileURL(path.join(tmp,"src/api/http/router.js")));const router=new routerMod.Router();router.add("GET","/x/:id",async()=>{});const m=router.match("GET","/x/abc%20123");if(m?.params.id!=="abc 123")throw new Error("Router parameter decoding failed");

console.log(JSON.stringify({status:"PASS",typescriptFiles:files.length,routes:routes.length,pilotRoutes:pilotRoutes.length,calibrationRoutes:calibrationRoutes.length,passwordHashing:"PASS",accessToken:"PASS",router:"PASS",resultLeakageGuard:"PASS",nextQuestionIdempotencyGuard:"PASS"},null,2));
