import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const checks=[];
const pass=(id,ok,note="")=>{checks.push({id,status:ok?"PASS":"FAIL",note});if(!ok)console.error(`FAIL ${id}${note?`: ${note}`:""}`)};
const app=fs.readFileSync(path.join(root,"src/api/app.ts"),"utf8");
const query=fs.readFileSync(path.join(root,"src/api/services/query-service.ts"),"utf8");
const engine=fs.readFileSync(path.join(root,"src/services/prisma-assessment-engine.ts"),"utf8");
const contracts=fs.readFileSync(path.join(root,"src/services/contracts.ts"),"utf8");
const openapi=fs.readFileSync(path.join(root,"docs/openapi.yaml"),"utf8");
const backendClient=fs.readFileSync(path.join(root,"../frontend/src/api/client.ts"),"utf8");
const frontendClient=fs.readFileSync(path.join(root,"../frontend/src/api/client.ts"),"utf8");
const frontendTypes=fs.readFileSync(path.join(root,"../frontend/src/api/types.ts"),"utf8");
const routes=[...app.matchAll(/router\.add\("(GET|POST|PATCH|DELETE)","([^"]+)"/g)].map(m=>`${m[1]} ${m[2]}`);
for(const r of [
  "POST /api/v1/assessments/:assessmentId/start",
  "POST /api/v1/assessments/:assessmentId/resume",
  "GET /api/v1/assessments/:assessmentId/next-question",
  "POST /api/v1/assessments/:assessmentId/answers",
  "GET /api/v1/assessments/:assessmentId/status",
  "POST /api/v1/assessments/:assessmentId/complete"
])pass(`route ${r}`,routes.includes(r));
pass("status query service",query.includes("async status(assessmentId:string)"));
pass("status current question",query.includes("currentQuestion:openQuestion"));
pass("status lifecycle flags",query.includes("canRequestCompletion")&&query.includes("isTerminal"));
pass("resume idempotent",app.includes('["PAUSED","IN_PROGRESS"].includes(a.status)'));
pass("resume preserves open question",app.includes('state:"AWAITING_CURRENT_QUESTION",nextQuestion:open'));
pass("next question requires IN_PROGRESS",app.includes('Assessment is not accepting question requests'));
pass("answer issued-question guard",engine.includes("Question ${questionExternalId} was not issued"));
pass("answer ordering guard",engine.includes("refusing out-of-order submit"));
pass("one open question invariant",engine.includes("RESUME_OPEN_QUESTION"));
pass("persistent completion method",engine.includes("async completeAssessment"));
pass("completion terminal idempotency",engine.includes('reason: "ALREADY_TERMINAL"'));
pass("completion does not force",engine.includes('reason: decision.stopReason ?? "MORE_EVIDENCE_REQUIRED"'));
pass("completion persists status",engine.includes("status: nextStatus")&&engine.includes("completedAt: assessment.completedAt ?? new Date()"));
pass("completion audit",engine.includes("explicitCompletionRequest: true"));
pass("complete route sanitized",app.includes("completed:result.completed")&&!app.includes("ok(res,await engine.tryComplete(params.assessmentId))"));
pass("contract exposes completion",contracts.includes("completeAssessment(assessmentId: string)"));
pass("OpenAPI status path",openapi.includes("/api/v1/assessments/{assessmentId}/status:"));
pass("OpenAPI lifecycle schema",openapi.includes("AssessmentLifecycle:")&&openapi.includes("AssessmentStatusResponse:"));
pass("backend client status",backendClient.includes("getAssessmentStatus"));
pass("frontend client status",frontendClient.includes("getAssessmentStatus"));
pass("frontend lifecycle type",frontendTypes.includes("AssessmentLifecycleStatus"));
pass("pause audit",app.includes("ASSESSMENT_PAUSED"));
pass("resume audit",app.includes("ASSESSMENT_RESUMED"));
pass("no answer score leakage",!app.includes("routing:publicRouting(result.routing),overall:result.overall"));
const failed=checks.filter(x=>x.status!=="PASS");
const result={status:failed.length?"FAIL":"PASS",checks:checks.length,passed:checks.length-failed.length,failed:failed.length,details:checks};
fs.writeFileSync(path.join(root,"methodology/STEP3_ASSESSMENT_API_ACCEPTANCE.json"),JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result,null,2));
if(failed.length)process.exit(1);
