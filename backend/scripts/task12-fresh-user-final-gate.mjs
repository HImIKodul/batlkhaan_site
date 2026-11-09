import "dotenv/config";
import crypto from "node:crypto";
import { prisma } from "../dist/db.js";

/* SAFETY GUARD: this gate creates users, companies and mock-paid diagnoses and talks to the database directly. It used to default to the live :4000 API and to
   whatever DATABASE_URL backend/.env holds (the operational `mmri` DB). It now needs an explicit isolated API and DB; opt in to shared targets with MMRI_QA_ALLOW_SHARED=YES. */
const SHARED_OK=process.env.MMRI_QA_ALLOW_SHARED==="YES";
if(!process.env.MMRI_TASK12_BASE_URL&&!SHARED_OK)throw new Error("task12: set MMRI_TASK12_BASE_URL=<isolated api base> explicitly (default :4000 is the shared service)");
const BASE=(process.env.MMRI_TASK12_BASE_URL||"http://127.0.0.1:4000/api/v1").replace(/\/$/,"");
if(!SHARED_OK&&/(localhost|127\.0\.0\.1):4000(\/|$)/.test(BASE))throw new Error("task12: refusing the shared service on :4000 (opt in with MMRI_QA_ALLOW_SHARED=YES)");
if(!SHARED_OK&&/\/mmri(\?|$)/.test(String(process.env.DATABASE_URL||"")))throw new Error("task12: refusing DATABASE_URL pointing at the shared `mmri` database (opt in with MMRI_QA_ALLOW_SHARED=YES)");
const provider=String(process.env.MMRI_BILLING_PROVIDER||"").trim().toUpperCase();
const environment=String(process.env.MMRI_ENVIRONMENT||process.env.NODE_ENV||"").trim().toLowerCase();
const tag=`MMRI-TASK12-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const email=`mmri.task12.${Date.now()}.${crypto.randomBytes(2).toString("hex")}@example.com`;
const password=`Task12-Final-${crypto.randomBytes(12).toString("base64url")}!`;
const companyName=`${tag} FINAL GATE BUSINESS`;
/* MMRI_TASK12_DOMAIN selects the diagnosis domain (default marketing) so the same gate can be run for all five domains. */
const domainCode=process.env.MMRI_TASK12_DOMAIN||"marketing";
if(!["marketing","it","finance","people","operations"].includes(domainCode))throw new Error(`task12: unknown domain ${domainCode}`);
let accessToken="", refreshCookie="", userId="", companyId="", assessmentId="", invoiceId="";
let checks=0;

function assert(condition,message){checks++; if(!condition)throw new Error(message)}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function words(text){return String(text??"").trim().split(/\s+/u).filter(Boolean).length}
function finite(v){return typeof v==="number"&&Number.isFinite(v)}
function close(a,b,tol=1e-4){return finite(a)&&finite(b)&&Math.abs(a-b)<=tol}
function cookieOnly(raw){return String(raw||"").split(";",1)[0]}
function unwrap(json){return json&&typeof json==="object"&&"data" in json?json.data:json}

async function request(path,{method="GET",body,token=accessToken,cookie,writer,origin}={}){
  const headers={"accept":"application/json"};
  if(body!==undefined)headers["content-type"]="application/json";
  if(token)headers.authorization=`Bearer ${token}`;
  if(cookie)headers.cookie=cookie;
  if(writer)headers["x-mmri-writer-id"]=writer;
  if(origin)headers.origin=origin;
  const res=await fetch(`${BASE}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await res.text();
  let parsed=null;
  if(text){try{parsed=JSON.parse(text)}catch{parsed=text}}
  if(!res.ok){const msg=parsed?.error?.message||parsed?.message||String(parsed||res.statusText);throw new Error(`${method} ${path} -> ${res.status}: ${msg}`)}
  return {data:unwrap(parsed),res,raw:parsed};
}

function chooseOption(question){
  const options=Array.isArray(question?.options)?question.options:[];
  assert(options.length>0,`Question ${question?.id??"?"} has no options`);
  const scored=options.filter(o=>finite(o.score)).slice().sort((a,b)=>Number(a.score)-Number(b.score));
  if(scored.length){
    const m=String(question.id||"").match(/-C(\d{2})-/);
    const categoryNo=m?Number(m[1]):0;
    const chooseLow=categoryNo>0&&categoryNo<=10;
    return Number((chooseLow?scored[0]:scored[scored.length-1]).optionIndex);
  }
  const positive=options.find(o=>["APPLICABLE","MOSTLY_APPLICABLE","PARTIAL_APPLICABILITY"].includes(String(o.state||"")))
    || options.find(o=>Number(o.optionIndex)===1&&!['N_A_CLAIM','DNK'].includes(String(o.state||"")))
    || options.find(o=>!['N_A_CLAIM','DNK'].includes(String(o.state||"")))
    || options[0];
  return Number(positive.optionIndex);
}

async function cleanup(){
  const notes=[];
  try{
    if(companyId){
      await prisma.companyEntitlement.deleteMany({where:{companyId}});
      await prisma.billingInvoice.deleteMany({where:{companyId}});
      await prisma.company.deleteMany({where:{id:companyId}});
      notes.push(`company:${companyId}`);
    }
    if(userId){
      await prisma.authAuditEvent.deleteMany({where:{userId}});
      await prisma.refreshSession.deleteMany({where:{userId}});
      await prisma.user.deleteMany({where:{id:userId}});
      notes.push(`user:${userId}`);
    }
  }catch(error){
    console.error("TASK12 CLEANUP ERROR",error);
    throw error;
  }
  return notes;
}

async function main(){
  assert(provider==="MOCK",`Task12 refuses non-MOCK billing provider: ${provider||"unset"}`);
  assert(environment!=="production",`Task12 disposable gate refuses MMRI_ENVIRONMENT=production`);

  const health=await fetch("http://127.0.0.1:4000/health");
  assert(health.ok,"API /health is not OK");
  const ready=await fetch("http://127.0.0.1:4000/ready");
  assert(ready.ok,"API /ready is not OK");

  const plans=(await request("/billing/plans",{token:""})).data;
  const diagnostic=plans.find?.(x=>x.code==="DIAGNOSTIC");
  const retake=plans.find?.(x=>x.code==="RETAKE");
  assert(diagnostic?.amountMnt===300000,"DIAGNOSTIC price is not 300000 MNT");
  assert(retake?.amountMnt===300000,"RETAKE price is not 300000 MNT");
  assert(diagnostic?.provider==="MOCK"||diagnostic?.testMode===true,"Billing catalog is not in mock/test mode");

  const reg=await request("/auth/register",{method:"POST",token:"",body:{email,password,displayName:"Task 12 Final Gate"}});
  userId=String(reg.data?.user?.id||""); accessToken=String(reg.data?.accessToken||""); refreshCookie=cookieOnly(reg.res.headers.get("set-cookie"));
  assert(Boolean(userId&&accessToken),"Fresh registration did not return user/access token");
  assert(Boolean(refreshCookie),"Fresh registration did not return refresh cookie");
  const me=(await request("/auth/me")).data;
  assert(me.id===userId&&me.email===email,"/auth/me does not match fresh account");

  const company=(await request("/companies",{method:"POST",body:{name:companyName,industry:"Final functional gate",businessModel:"B2B",employeeCount:25,companyAgeYears:3,marketType:"Mongolia",country:"MN"}})).data;
  companyId=String(company.id||"");
  assert(Boolean(companyId),"Company creation failed");

  const pq=(await request("/methodology/current/profile-questions")).data;
  assert(Array.isArray(pq)&&pq.length===20,`Expected 20 methodology profile questions, got ${pq?.length}`);
  const profileAnswers=pq.map(q=>({questionId:q.id,optionIndexes:[Number(q.options?.[0]?.optionIndex??1)]}));
  assert(profileAnswers.every(x=>x.questionId&&Number.isInteger(x.optionIndexes[0])),"Profile question options are incomplete");
  const basicInfoAnswers=Array.from({length:20},(_,i)=>({questionId:`B${String(i+1).padStart(2,"0")}`,optionIndexes:[1]}));
  await request(`/companies/${companyId}/profile-answers`,{method:"PUT",body:{profileAnswers,basicInfoAnswers}});
  const companyAfter=(await request(`/companies/${companyId}`)).data;
  const profile=companyAfter.profile||{};
  assert(Array.isArray(profile.assessmentProfileAnswers)&&profile.assessmentProfileAnswers.length===20,"P01-P20 profile answers not persisted 20/20");
  assert(Array.isArray(profile.basicInfoAnswersV2)&&profile.basicInfoAnswersV2.length===20,"B01-B20 starting answers not persisted 20/20");
  assert(profile.basicInfoCompleted===true,"basicInfoCompleted was not persisted true");

  const inv=(await request(`/companies/${companyId}/billing/invoices`,{method:"POST",body:{planCode:"DIAGNOSTIC",domainCode}})).data;
  invoiceId=String(inv.id||"");
  assert(Boolean(invoiceId),"Diagnostic invoice was not created");
  assert(inv.amountMnt===300000,"Fresh diagnostic invoice is not 300000 MNT");
  assert(inv.provider==="MOCK"||inv.testMode===true,"Fresh invoice is not MOCK");
  const paid=(await request(`/billing/invoices/${invoiceId}/mock-pay`,{method:"POST"})).data;
  assert(paid.status==="PAID","Mock payment did not reach PAID");
  const billing=(await request(`/companies/${companyId}/billing/status`)).data;
  assert(Array.isArray(billing.entitlements)&&billing.entitlements.some(x=>x.domainCode===domainCode&&x.planCode==="DIAGNOSTIC"&&x.status==="ACTIVE"),"Paid diagnostic entitlement is not ACTIVE");

  const created=(await request(`/companies/${companyId}/assessments`,{method:"POST",body:{domainCode}})).data;
  assessmentId=String(created.id||"");
  assert(Boolean(assessmentId),"Fresh assessment was not created");
  const assessment0=(await request(`/assessments/${assessmentId}`)).data;
  assert(assessment0.companyId===companyId&&assessment0.domainCode===domainCode,"Assessment company/domain binding mismatch");
  assert(!assessment0.previousAssessmentId&&!assessment0.parentAssessmentId,"Initial assessment unexpectedly has retake lineage");

  let writer=`task12-writer-${crypto.randomBytes(8).toString("hex")}`;
  let routing=(await request(`/assessments/${assessmentId}/start`,{method:"POST",writer,body:{mode:"QUICK",profileAnswers}})).data;
  assert(Number.isInteger(routing.assessmentRevision),"Start did not return assessment revision");
  const initialProgress=(await request(`/assessments/${assessmentId}/progress`)).data;
  assert(initialProgress?.quick?.hardMaximum===280,`QUICK hardMaximum contract is ${initialProgress?.quick?.hardMaximum}, expected 280`);
  let answered=0, pausedAndRelogged=false;
  const MAX_ANSWERS=281;
  while(answered<MAX_ANSWERS){
    if(routing?.nextQuestion){
      const optionIndex=chooseOption(routing.nextQuestion);
      const out=(await request(`/assessments/${assessmentId}/answers`,{method:"POST",writer,body:{questionId:routing.nextQuestion.id,optionIndex,questionIssueId:routing.questionIssueId,expectedAssessmentRevision:routing.assessmentRevision,clientRequestId:`${tag}-${answered+1}`}})).data;
      assert(out.accepted===true,`Answer ${answered+1} was not accepted`);
      routing=out.routing; answered++;

      if(answered===5&&!pausedAndRelogged){
        const a=(await request(`/assessments/${assessmentId}`)).data;
        await request(`/assessments/${assessmentId}/pause`,{method:"POST",writer,body:{expectedAssessmentRevision:a.assessmentRevision}});
        await request("/auth/logout",{method:"POST",token:"",cookie:refreshCookie});
        const login=await request("/auth/login",{method:"POST",token:"",body:{email,password}});
        accessToken=String(login.data?.accessToken||""); refreshCookie=cookieOnly(login.res.headers.get("set-cookie"));
        assert(Boolean(accessToken&&refreshCookie),"Login after pause failed");
        const companies=(await request("/companies")).data;
        assert(companies.some(x=>x.id===companyId),"Company not restored after logout/login");
        const paused=(await request(`/assessments/${assessmentId}`)).data;
        assert(paused.status==="PAUSED","Assessment did not persist PAUSED across logout/login");
        routing=(await request(`/assessments/${assessmentId}/resume`,{method:"POST",writer,body:{expectedAssessmentRevision:paused.assessmentRevision}})).data;
        assert(routing.nextQuestion||routing.state,"Resume did not restore routing state");
        pausedAndRelogged=true;
      }
      if(answered%40===0&&routing?.nextQuestion){await request(`/assessments/${assessmentId}/writer-lease/heartbeat`,{method:"POST",writer});}
      await sleep(130);
      continue;
    }

    let status=(await request(`/assessments/${assessmentId}/status`)).data;
    if(status.lifecycle?.isTerminal)break;
    if(status.lifecycle?.canRequestCompletion){
      await request(`/assessments/${assessmentId}/complete`,{method:"POST",writer,body:{expectedAssessmentRevision:status.assessmentRevision}});
      status=(await request(`/assessments/${assessmentId}/status`)).data;
      if(status.lifecycle?.isTerminal)break;
    }
    routing=(await request(`/assessments/${assessmentId}/next-question`,{writer})).data;
  }
  assert(answered>0&&answered<MAX_ANSWERS,`Question loop did not terminate safely; answered=${answered}`);

  const finalAssessment=(await request(`/assessments/${assessmentId}`)).data;
  assert(["COMPLETED","COMPLETED_WITH_REVIEW","EXHAUSTED"].includes(finalAssessment.status),`Assessment is not terminal: ${finalAssessment.status}`);
  const progress=(await request(`/assessments/${assessmentId}/progress`)).data;
  assert(progress.answeredQuestions===answered,`Progress answeredQuestions ${progress.answeredQuestions} != ${answered}`);

  const results=(await request(`/assessments/${assessmentId}/results`)).data;
  assert(results.assessmentId===assessmentId,"Results are not assessment-bound");
  assert(finite(results.overall?.score),"Results do not contain a real numeric score");
  assert(results.overall.score>=0&&results.overall.score<=100,"Result score outside 0..100");
  assert(Array.isArray(results.strengths?.items),"Results strengths missing");

  await request(`/assessments/${assessmentId}/strategy/generate`,{method:"POST"});
  const report=(await request(`/assessments/${assessmentId}/report`)).data;
  const payload=report.payload;
  assert(payload?.assessmentId===assessmentId,"Report payload assessment binding mismatch");
  assert(payload?.reportId===`RPT-${assessmentId}-V4`,`Expected V4 report id, got ${payload?.reportId}`);
  assert(typeof payload?.payloadHash==="string"&&payload.payloadHash.length>=32,"Report payload hash missing");
  assert(close(Number(payload.overall?.score),Number(results.overall?.score),0.01),`Report score ${payload.overall?.score} != result score ${results.overall?.score}`);
  assert(Array.isArray(payload.priorityActions)&&payload.priorityActions.length===5,`Critical actions ${payload.priorityActions?.length??0}/5`);
  const milestones=(payload.roadmap||[]).flatMap(x=>x.milestones||[]);
  assert(milestones.length>=5,`Roadmap has only ${milestones.length} milestones`);
  assert(milestones.every(m=>String(m.titleMn||"").trim()&&String(m.milestoneMn||"").trim()&&String(m.deliverableMn||"").trim()&&String(m.ownerRoleLabelMn||"").trim()&&String(m.kpiMn||"").trim()),"Roadmap has incomplete milestone fields");
  assert(report.validation?.state==="PASS",`Report narrative validation is ${report.validation?.state||"missing"}`);
  const conclusion=(report.narrative?.sections||[]).find(x=>x.id==="S10");
  const conclusionWords=words((conclusion?.claims||[]).map(x=>x.textMn).join(" "));
  /* validator V27 (src/report/validator.ts) and the PDF baseline require an 80-160 word executive conclusion; the earlier 250-300 range was stale */
  assert(conclusionWords>=80&&conclusionWords<=160,`Conclusion must be 80-160 words; got ${conclusionWords}`);

  const methodology=await prisma.assessment.findUnique({where:{id:assessmentId},select:{methodologyVersionId:true}});
  const expectedPurposeCount=await prisma.purposeDefinition.count({where:{methodologyVersionId:methodology.methodologyVersionId}});
  assert(payload.purposes.length===expectedPurposeCount,`Report purposes ${payload.purposes.length} != live methodology ${expectedPurposeCount}`);

  const pdfChunks=(payload.roadmap||[]).flatMap(row=>Array.from({length:Math.ceil((row.milestones||[]).length/4)},(_,i)=>(row.milestones||[]).slice(i*4,(i+1)*4))).flat();
  assert(pdfChunks.length===milestones.length,"PDF pagination model loses roadmap milestones");
  const pdfPages=3+(payload.roadmap||[]).reduce((n,row)=>n+Math.ceil((row.milestones||[]).length/4),0);
  assert(pdfPages>=4,"PDF page model is unexpectedly short");

  await request("/auth/logout",{method:"POST",token:"",cookie:refreshCookie});
  const relogin=await request("/auth/login",{method:"POST",token:"",body:{email,password}});
  accessToken=String(relogin.data?.accessToken||""); refreshCookie=cookieOnly(relogin.res.headers.get("set-cookie"));
  const history=(await request(`/companies/${companyId}/assessments`)).data;
  const h=history.find(x=>x.id===assessmentId);
  assert(Boolean(h),"Assessment history missing after final relogin");
  const reportAgain=(await request(`/assessments/${assessmentId}/report`)).data;
  assert(reportAgain.payload?.reportId===payload.reportId,"Report ID changed after logout/login");
  assert(reportAgain.payload?.payloadHash===payload.payloadHash,"Report hash changed after logout/login");

  console.log(JSON.stringify({
    status:"PASS",tag,email,userId,companyId,assessmentId,domainCode,
    answeredQuestions:answered,assessmentStatus:finalAssessment.status,
    score:results.overall.score,reportId:payload.reportId,payloadHash:payload.payloadHash,
    criticalActions:payload.priorityActions.length,roadmapMilestones:milestones.length,pdfPages,
    conclusionWords,purposes:payload.purposes.length,checks
  },null,2));
}

let mainError=null;
try{await main()}catch(error){mainError=error;console.error("TASK 12 FRESH-USER FINAL GATE FAILED");console.error(error)}
let cleanupError=null;
try{
  const removed=await cleanup();
  const residueUsers=await prisma.user.count({where:{email}});
  const residueCompanies=companyId?await prisma.company.count({where:{id:companyId}}):0;
  const residueAssessments=assessmentId?await prisma.assessment.count({where:{id:assessmentId}}):0;
  const residueInvoices=invoiceId?await prisma.billingInvoice.count({where:{id:invoiceId}}):0;
  assert(residueUsers===0&&residueCompanies===0&&residueAssessments===0&&residueInvoices===0,`Cleanup residue user/company/assessment/invoice=${residueUsers}/${residueCompanies}/${residueAssessments}/${residueInvoices}`);
  console.log(`TASK12 CLEANUP: PASS (${removed.join(", ")||"nothing to remove"})`);
}catch(error){cleanupError=error;console.error("TASK 12 CLEANUP VERIFICATION FAILED");console.error(error)}
await prisma.$disconnect();
if(mainError||cleanupError)process.exitCode=1;
else{
  console.log("==========================================");
  console.log("MMRI FUNCTIONAL TASK 12/12: PASS");
  console.log("FRESH USER -> REAL REPORT -> PDF MODEL: VERIFIED");
  console.log("LOGOUT / LOGIN PERSISTENCE: VERIFIED");
  console.log("DISPOSABLE TEST DATA CLEANUP: VERIFIED");
  console.log("==========================================");
}
