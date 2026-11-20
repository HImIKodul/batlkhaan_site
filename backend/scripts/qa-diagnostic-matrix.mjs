/* Diagnostic matrix runner (adapted from the Phase 2.7 scenario runner; QA_PORTS=4410,4411 selects the isolated API ports). Drives the REAL HTTP API of an ISOLATED stack with a deterministic answer policy and records the full trace.
   Usage: BASE=http://127.0.0.1:4395/api/v1 MMRI_MOCK_MAIL_DIR=<dir> DOMAIN=finance BANK=live PROFILES=strong,weak OUT=<dir> node p2-scenario-runner.mjs
   Refuses :4000 and any non-loopback base. Creates synthetic users only (example.test addresses). Never touches the DB directly. */
import crypto from "node:crypto";import fs from "node:fs";import path from "node:path";
import {downloadAndVerifyApiPdf} from "./lib/actual-pdf-acceptance.mjs";
import {registerVerifiedFixture} from "./lib/verified-test-registration.mjs";
import {execFileSync} from "node:child_process";
const BASE=(process.env.BASE||"").replace(/\/$/,"");const u=new URL(BASE||"http://x");
const QA_PORTS=(process.env.QA_PORTS||"").split(",").filter(Boolean);
if(!BASE||u.hostname!=="127.0.0.1"||!QA_PORTS.includes(u.port)||u.port==="4000")throw new Error("set QA_PORTS to the isolated loopback API port(s); :4000 is never allowed");
const DOMAIN=process.env.DOMAIN,BANK=process.env.BANK||"live",OUT=process.env.OUT;const PROFILES=(process.env.PROFILES||"strong,weak,mixed,uncertain,contradictory").split(",");
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const fin=v=>typeof v==="number"&&Number.isFinite(v);
const h32=s=>parseInt(crypto.createHash("md5").update(s).digest("hex").slice(0,8),16);
async function run(profile){
  const tag=`P27-${DOMAIN}-${profile}-${process.env.SUFFIX||"run"}-${Date.now()}`;const email=`p27.${DOMAIN}.${profile}.${Date.now()}.${crypto.randomBytes(2).toString("hex")}@example.test`;const password=`P2-${crypto.randomBytes(9).toString("base64url")}!x1`;
  let token="",cookie="";
  const refresh=async()=>{const r=await fetch(BASE+"/auth/refresh",{method:"POST",headers:{"content-type":"application/json",cookie},body:"{}"});const j=await r.json().catch(()=>({}));
    if(!r.ok||!j?.data?.accessToken)throw new Error(`refresh failed ${r.status}`);token=j.data.accessToken;const sc=r.headers.get("set-cookie");if(sc)cookie=sc.split(";")[0]};
  const req=async(p,{method="GET",body,writer,tok}={},retried=false)=>{const headers={accept:"application/json"};if(body!==undefined)headers["content-type"]="application/json";const t0=tok??token;if(t0)headers.authorization=`Bearer ${t0}`;if(writer)headers["x-mmri-writer-id"]=writer;
    const r=await fetch(BASE+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{j=t}
    if(r.status===401&&!retried&&tok===undefined&&cookie){await refresh();return req(p,{method,body,writer},true)} // short-lived access token: renew via the refresh cookie, exactly as the browser client does
    if(!r.ok)throw new Error(`${method} ${p} -> ${r.status}: ${j?.error?.message||t.slice(0,160)}`);return j&&typeof j==="object"&&"data" in j?j.data:j};
  let co,profileAnswers,inv;
  if(process.env.REUSE_CREDS){ // retake: same synthetic user/company, RETAKE invoice
    const C=JSON.parse(fs.readFileSync(process.env.REUSE_CREDS,"utf8"));const lg=await fetch(BASE+"/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:C.email,password:C.password})});
    if(!lg.ok)throw new Error("login failed");token=(await lg.json()).data.accessToken;cookie=(lg.headers.get("set-cookie")||"").split(";")[0];co={id:C.companyId};
    const pq0=await req("/methodology/current/profile-questions");profileAnswers=pq0.map(q=>({questionId:q.id,optionIndexes:[Number(q.options?.[0]?.optionIndex??1)]}));
    inv=await req(`/companies/${co.id}/billing/invoices`,{method:"POST",body:{planCode:"RETAKE",domainCode:DOMAIN}});
  }else{
    const login=await registerVerifiedFixture(BASE,{email,password,displayName:"P27 scenario"});const lj=(await login.json()).data;token=lj.accessToken;cookie=(login.headers.get("set-cookie")||"").split(";")[0];
    co=await req("/companies",{method:"POST",body:{name:`${tag} BUSINESS`,industry:"Phase 2.7 scenario",businessModel:"B2B",employeeCount:25,companyAgeYears:3,marketType:"Mongolia",country:"MN"}});
    const pq=await req("/methodology/current/profile-questions");profileAnswers=pq.map(q=>({questionId:q.id,optionIndexes:[Number(q.options?.[0]?.optionIndex??1)]}));
    await req(`/companies/${co.id}/profile-answers`,{method:"PUT",body:{profileAnswers,basicInfoAnswers:Array.from({length:20},(_,i)=>({questionId:`B${String(i+1).padStart(2,"0")}`,optionIndexes:[1]}))}});
    inv=await req(`/companies/${co.id}/billing/invoices`,{method:"POST",body:{planCode:"DIAGNOSTIC",domainCode:DOMAIN}});
  }
  if(inv.provider!=="MOCK"&&!inv.testMode)throw new Error("not a mock invoice");await req(`/billing/invoices/${inv.id}/mock-pay`,{method:"POST"});
  const a=await req(`/companies/${co.id}/assessments`,{method:"POST",body:{domainCode:DOMAIN}});let writer=`p2-${crypto.randomBytes(6).toString("hex")}`;
  let routing=await req(`/assessments/${a.id}/start`,{method:"POST",writer,body:{mode:process.env.MODE||"QUICK",profileAnswers}});
  const trace=[];let answered=0;
  const choose=q=>{const o=q.options;const scored=o.filter(x=>fin(x.score)).sort((x,y)=>x.score-y.score);const dnk=o.find(x=>x.state==="DNK");
    const m=String(q.id).match(/-C(\d\d)-D(\d\d)-Q(\d)$/);const cat=m?+m[1]:0,path=m?+m[3]:0;
    const positive=()=>o.find(x=>["APPLICABLE","MOSTLY_APPLICABLE","PARTIAL_APPLICABILITY"].includes(x.state))||o.find(x=>x.optionIndex===1&&!["N_A_CLAIM","DNK"].includes(x.state))||o.find(x=>!["N_A_CLAIM","DNK"].includes(x.state))||o[0];
    const best=()=>scored.length?scored[scored.length-1]:positive(),worst=()=>scored.length?scored[0]:positive();
    const dim=m?+m[2]:0,naOpt=()=>o.find(x=>x.state==="N_A_CLAIM")||positive();
    switch(profile){case"strong":return best();case"weak":return worst();case"mixed":return cat%2?best():worst();
      /* F9 real-API scenarios: capabilities 1-14 either excluded via the gate (N/A) or honestly answered worst; every other capability best */
      case"na_gaming":return cat<=14?(dim===1?naOpt():best()):best();
      case"na_gate_late":return cat<=14?(dim===1?(path===1?(dnk||naOpt()):naOpt()):worst()):best(); /* Phase 2.7: gate first answered DNK, later N/A, while the capability is otherwise answered worst => scored evidence can precede the N/A confirmation */
      case"honest_weak":return cat<=14?(dim===1?positive():worst()):best();
      case"uncertain":return h32(q.id)%10<7&&dnk?dnk:best();case"contradictory":return path===1?best():path===2?worst():positive();default:throw new Error("profile")}};
  const STOP_AT=Number(process.env.STOP_AT||0);
  const MAXA=Number(process.env.MAX_ANSWERS||285);
  const INTERRUPT_AT=Number(process.env.INTERRUPT_AT||0);let interrupted=null;
  while(answered<MAXA){
    if(INTERRUPT_AT&&!interrupted&&answered>=INTERRUPT_AT){ // pause on "device 1", resume on "device 2" (new login session + new writer lease); the old lease must be refused
      const oldWriter=writer;const st0=await req(`/assessments/${a.id}/status`);
      await req(`/assessments/${a.id}/pause`,{method:"POST",writer,body:{expectedAssessmentRevision:st0.assessmentRevision}});
      const lg=await fetch(BASE+"/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});const lj=await lg.json();token=lj.data.accessToken;cookie=(lg.headers.get("set-cookie")||"").split(";")[0];
      writer=`p2-dev2-${crypto.randomBytes(6).toString("hex")}`;const st1=await req(`/assessments/${a.id}/status`);
      await req(`/assessments/${a.id}/resume`,{method:"POST",writer,body:{expectedAssessmentRevision:st1.assessmentRevision}});
      routing=await req(`/assessments/${a.id}/next-question`,{writer});
      let oldRejected=null;try{await req(`/assessments/${a.id}/answers`,{method:"POST",writer:oldWriter,body:{questionId:routing.nextQuestion.id,optionIndex:routing.nextQuestion.options[0].optionIndex,questionIssueId:routing.questionIssueId,expectedAssessmentRevision:routing.assessmentRevision,clientRequestId:crypto.randomUUID()}});oldRejected=false}catch(e){oldRejected=/409|423|412|lease|writer/i.test(String(e.message))}
      interrupted={at:answered,oldWriterRejected:oldRejected,resumedQuestion:routing?.nextQuestion?.id||null,progressSavedAtResume:(await req(`/assessments/${a.id}/progress`)).answeredQuestions};
    }
    if(STOP_AT&&answered>=STOP_AT){ // hand the live, in-progress assessment to a browser test (synthetic QA account only)
      fs.writeFileSync(path.join(OUT,`prepared_${DOMAIN}_${STOP_AT}.json`),JSON.stringify({domain:DOMAIN,stopAt:STOP_AT,email,password,companyId:co.id,assessmentId:a.id,writer,profile,answered}),{mode:0o600});
      console.log(JSON.stringify({prepared:true,domain:DOMAIN,stopAt:STOP_AT,assessmentId:a.id}));return}
    if(routing?.nextQuestion){const q=routing.nextQuestion;const c=choose(q);
      const out=await req(`/assessments/${a.id}/answers`,{method:"POST",writer,body:{questionId:q.id,optionIndex:c.optionIndex,questionIssueId:routing.questionIssueId,expectedAssessmentRevision:routing.assessmentRevision,clientRequestId:`${tag}-${answered+1}`}});
      trace.push({n:answered+1,id:q.id,opts:q.options.length,chosen:c.optionIndex,state:c.state||null,score:c.score??null});routing=out.routing;answered++;if(answered%40===0)await req(`/assessments/${a.id}/writer-lease/heartbeat`,{method:"POST",writer}).catch(()=>{});continue}
    let st=await req(`/assessments/${a.id}/status`);if(st.lifecycle?.isTerminal)break;
    if(st.lifecycle?.canRequestCompletion){await req(`/assessments/${a.id}/complete`,{method:"POST",writer,body:{expectedAssessmentRevision:st.assessmentRevision}});st=await req(`/assessments/${a.id}/status`);if(st.lifecycle?.isTerminal)break}
    routing=await req(`/assessments/${a.id}/next-question`,{writer});
  }
  if(process.env.MODE==="FULL"){ // FULL-mode probe: no completion/PDF; capture in-progress results/progress/trace for policy comparison
    const progress=await req(`/assessments/${a.id}/progress`);let results=null,rerr=null;try{results=await req(`/assessments/${a.id}/results`)}catch(e){rerr=String(e.message).slice(0,200)}
    fs.writeFileSync(path.join(OUT,`${DOMAIN}_${profile}_${process.env.SUFFIX}_FULL.json`),JSON.stringify({tag,domain:DOMAIN,profile,suffix:process.env.SUFFIX,mode:"FULL",assessmentId:a.id,answered,progress,results,resultsError:rerr,trace}));
    console.log(JSON.stringify({mode:"FULL",domain:DOMAIN,profile,answered,routing:progress.routingState,resultsError:rerr,score:results?.overall?.score,hard:results?.quality?.hardContradictions}));return}
  const final=await req(`/assessments/${a.id}`);const progress=await req(`/assessments/${a.id}/progress`);const results=await req(`/assessments/${a.id}/results`);
  await req(`/assessments/${a.id}/strategy/generate`,{method:"POST"});const report=await req(`/assessments/${a.id}/report`);
  const pdf=await downloadAndVerifyApiPdf({base:BASE,assessmentId:a.id,token,score:results.overall.score,domain:`${DOMAIN}_${profile}_${process.env.SUFFIX||BANK}`,out:OUT});
  const pdfFile=path.join(OUT,`${DOMAIN}_${profile}_${process.env.SUFFIX||BANK}.pdf`);const text=execFileSync("pdftotext",["-layout",pdfFile,"-"],{encoding:"utf8"});fs.writeFileSync(path.join(OUT,`${DOMAIN}_${profile}_${process.env.SUFFIX||BANK}.pdf.txt`),text);
  if(process.env.CREDS_OUT)fs.writeFileSync(process.env.CREDS_OUT,JSON.stringify({email,password,companyId:co.id,assessmentId:a.id}),{mode:0o600}); // private scratch only, never the evidence folder
  const rec={tag,domain:DOMAIN,bank:BANK,suffix:process.env.SUFFIX||null,base:BASE,profile,assessmentId:a.id,status:final.status,answered,progress,results,report,pdf,trace,interrupted};
  fs.writeFileSync(path.join(OUT,`${DOMAIN}_${profile}_${process.env.SUFFIX||BANK}.json`),JSON.stringify(rec));
  console.log(JSON.stringify({domain:DOMAIN,bank:BANK,profile,status:final.status,answered,score:results.overall?.score,coverage:results.overall?.coverage,confidence:results.overall?.confidence,stop:progress.routingState,pdfPages:pdf.pages}));
}
for(const p of PROFILES){try{await run(p)}catch(e){console.log(JSON.stringify({domain:DOMAIN,bank:BANK,profile:p,error:String(e.message).slice(0,300)}))}}
