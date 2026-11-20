import {registerVerifiedFixture} from './lib/verified-test-registration.mjs';
/* Concurrent full-diagnosis load test on an ISOLATED API (mock billing) with synthetic customers. Measures per-endpoint latency, errors, API CPU/RSS and database activity.
   Each virtual customer: register -> company -> 20-question profile -> mock purchase -> assessment (domain rotates over the five domains) -> answer every question -> complete -> read results/report.
   Usage: API=http://127.0.0.1:4310/api/v1 PGDATABASE=<scratch db> USERS=4 [API_PID=<pid>] node scripts/qa-load-journeys.mjs
   Writes a JSON summary to $OUT_DIR (default /tmp). Never run against production or a shared database. */
import crypto from 'crypto';import fs from 'fs';import {execFileSync,execSync} from 'child_process';
const API=process.env.API,DB=process.env.PGDATABASE,USERS=Number(process.env.USERS||4),ORIGIN=process.env.ORIGIN||'http://127.0.0.1:5310',OUT=process.env.OUT_DIR||'/tmp',MAXQ=Number(process.env.MAX_QUESTIONS||420);
if(!API||!DB)throw new Error('set API and PGDATABASE');
if(/businessmri\.mn/i.test(API)||/:4000(\/|$)/.test(API))throw new Error('refusing shared/production API');
if(DB==='mmri'||/^(mmri_v2_qa|mmri_codexfix|mmri_design_test|postgres)$/.test(DB))throw new Error('refusing protected database');
const sql=q=>execFileSync('docker',['exec','mmri-v3-local-postgres-1','psql','-U','mmri','-d',DB,'-At','-c',q],{encoding:'utf8'}).trim();
const DOMAINS=(process.env.DOMAINS||'marketing,it,finance,people,operations').split(',');const lat={};const errs=[];const t0=Date.now();
async function call(tag,method,p,{tok,body,w}={}){const s=process.hrtime.bigint();let r,text;try{r=await fetch(API+p,{method,headers:{'content-type':'application/json',origin:ORIGIN,...(tok?{authorization:'Bearer '+tok}:{}),...(w?{'x-mmri-writer-id':w}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000)});text=await r.text()}catch(e){(lat[tag]??=[]).push(120000);errs.push(`${tag} network ${e}`);return{s:0}}
  const ms=Number(process.hrtime.bigint()-s)/1e6;(lat[tag]??=[]).push(ms);let j;try{j=JSON.parse(text)}catch{}if(r.status>=500)errs.push(`${tag} ${r.status}`);return{s:r.status,d:j?.data,e:j?.error}}
async function journey(i){const domain=DOMAINS[i%DOMAINS.length];const W=crypto.randomUUID();const email=`load.${i}.${Date.now()}.${crypto.randomBytes(2).toString('hex')}@example.test`;
  const registrationStarted=performance.now();const registered=await registerVerifiedFixture(API,{email,password:'Load-Test-Pass-12345!',displayName:'Load '+i},{origin:ORIGIN});const reg=(await registered.json()).data;const tok=reg.accessToken;(lat.verifiedRegistration??=[]).push(performance.now()-registrationStarted);if(!tok)return{i,domain,ok:false,why:'verified registration'};
  const co=await call('createCompany','POST','/companies',{tok,body:{name:`Load ${i} ХХК`}});const coId=co.d?.id;
  const pq=(await call('profileQuestions','GET','/methodology/current/profile-questions',{tok})).d||[];const prof=pq.slice(0,20).map(q=>({questionId:q.id,optionIndexes:[q.options[0].optionIndex]}));
  await call('saveProfile','PUT',`/companies/${coId}/profile-answers`,{tok,w:W,body:{profileAnswers:prof,basicInfoAnswers:Array.from({length:20},(_,k)=>({questionId:'B'+String(k+1).padStart(2,'0'),optionIndexes:[1]}))}});
  const inv=await call('createInvoice','POST',`/companies/${coId}/billing/invoices`,{tok,w:W,body:{planCode:'DIAGNOSTIC',domainCode:domain}});await call('mockPay','POST',`/billing/invoices/${inv.d?.id}/mock-pay`,{tok,w:W});
  const as=await call('createAssessment','POST',`/companies/${coId}/assessments`,{tok,w:W,body:{domainCode:domain}});const a=as.d?.id;if(!a)return{i,domain,ok:false,why:'assessment '+as.s+' '+JSON.stringify(as.e).slice(0,80)};
  let route=(await call('start','POST',`/assessments/${a}/start`,{tok,w:W,body:{mode:'QUICK',profileAnswers:prof}})).d;let n=0;
  while(route?.nextQuestion&&n<MAXQ){const q=route.nextQuestion;const sc=q.options.filter(o=>typeof o.score==='number');const idx=sc.length?(n%3===0?sc.reduce((x,y)=>y.score<x.score?y:x):sc.reduce((x,y)=>y.score>x.score?y:x)).optionIndex:(q.options.find(o=>!['DNK','N_A_CLAIM'].includes(o.state))||q.options[0]).optionIndex;
    const r=await call('answer','POST',`/assessments/${a}/answers`,{tok,w:W,body:{questionId:q.id,optionIndex:idx,questionIssueId:route.questionIssueId||q.questionIssueId,expectedAssessmentRevision:route.assessmentRevision,clientRequestId:crypto.randomUUID()}});if(r.s>=300){errs.push(`answer ${r.s} ${JSON.stringify(r.e).slice(0,80)}`);break}route=r.d?.routing||r.d;n++}
  const prog=(await call('progress','GET',`/assessments/${a}/progress`,{tok})).d;const done=await call('complete','POST',`/assessments/${a}/complete`,{tok,w:W,body:{expectedAssessmentRevision:route?.assessmentRevision??prog?.assessmentRevision}});
  for(const [tag,p] of [['results',`/assessments/${a}/results`],['diagnosis',`/assessments/${a}/diagnosis`],['report',`/assessments/${a}/report`],['recommendations',`/assessments/${a}/recommendations`],['actionPlan',`/assessments/${a}/action-plan`],['pdfMeta',`/assessments/${a}/report/pdf/metadata`]])await call(tag,'GET',p,{tok});
  return{i,domain,ok:done.s===200,answered:n,completeStatus:done.s,assessmentId:a}}
// ---- resource sampler ----
const samples=[];const pid=process.env.API_PID;const sample=()=>{try{const ps=pid?execSync(`ps -o %cpu=,rss= -p ${pid}`,{encoding:'utf8'}).trim().split(/\s+/):[];const dk=execSync(`docker stats --no-stream --format '{{.CPUPerc}} {{.MemUsage}}' mmri-v3-local-postgres-1`,{encoding:'utf8'}).trim();const la=fs.readFileSync('/proc/loadavg','utf8').split(' ')[0];const mem=fs.readFileSync('/proc/meminfo','utf8');const av=Number(mem.match(/MemAvailable:\s+(\d+)/)[1])/1024;samples.push({t:Math.round((Date.now()-t0)/1000),apiCpu:Number(ps[0]||0),apiRssMb:Math.round(Number(ps[1]||0)/1024),pg:dk,load1:Number(la),memAvailMb:Math.round(av),conns:Number(sql(`select count(*) from pg_stat_activity where datname='${DB}'`))})}catch{}};
sql(`alter database ${DB} set log_min_duration_statement=150`);sql('select pg_stat_reset()');
const timer=setInterval(sample,5000);sample();
const results=await Promise.all(Array.from({length:USERS},(_,i)=>journey(i)));clearInterval(timer);sample();
const pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(s.length*p))]};
const table=Object.fromEntries(Object.entries(lat).map(([k,v])=>[k,{n:v.length,p50:Math.round(pct(v,.5)),p95:Math.round(pct(v,.95)),max:Math.round(Math.max(...v))}]));
const seq=sql(`select relname||':'||seq_scan||'/'||coalesce(idx_scan,0)||' rows='||n_live_tup from pg_stat_user_tables where seq_scan>20 and n_live_tup>2000 order by seq_tup_read desc limit 8`);
const summary={users:USERS,wallSeconds:Math.round((Date.now()-t0)/1000),completed:results.filter(r=>r.ok).length,results,errors5xxOrNetwork:errs.length,errorSamples:errs.slice(0,8),latencyMs:table,peak:{apiCpu:Math.max(...samples.map(s=>s.apiCpu)),apiRssMb:Math.max(...samples.map(s=>s.apiRssMb)),load1:Math.max(...samples.map(s=>s.load1)),minMemAvailMb:Math.min(...samples.map(s=>s.memAvailMb)),maxDbConns:Math.max(...samples.map(s=>s.conns))},samples,seqScanTables:seq.split('\n')};
fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(`${OUT}/load-${USERS}users${process.env.TAG||""}.json`,JSON.stringify(summary,null,1));
console.log(`users=${USERS} completed=${summary.completed}/${USERS} wall=${summary.wallSeconds}s 5xx/network errors=${errs.length}`);console.table(table);console.log('peak',JSON.stringify(summary.peak));console.log('tables with many seq scans (seq/idx):\n  '+seq.split('\n').join('\n  '));
process.exit(summary.completed===USERS&&errs.length===0?0:1);
