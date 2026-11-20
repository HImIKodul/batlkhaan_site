/* Release policy regression (owner decision 2026-11): approval releases immediately, 24 h is a review TARGET (overdue highlight), never a hold.
   Runs against an ISOLATED stack only: API=<loopback api> PGDATABASE=<qa db> DATABASE_URL=<same db> MMRI_MOCK_MAIL_DIR=<mock mailbox> REPORT_DIR=<report storage of that API>
   ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_TOTP_SECRET = an existing QA SUPER_ADMIN. Creates synthetic customers only; one throw-away BILLING_REVIEWER for the authorization checks. */
import fs from 'node:fs';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
import {call,sql,provision,adminLogin,customer,B,freshAdminTotp} from './lib/admin-qa.mjs';
import {journey,http} from './lib/qa-journey.mjs';
let fail=0,pass=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sup={email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,secret:process.env.ADMIN_TOTP_SECRET};
if(!sup.email||!sup.secret)throw new Error('ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_TOTP_SECRET required');
const REPORT_DIR=process.env.REPORT_DIR||'';
const login=async a=>{const r=await call('POST','/admin/auth/login',{body:{email:a.email,password:a.password,totpCode:await freshAdminTotp(a)}});if(r.s!==200)throw new Error('admin login failed '+r.s);return r.d.token};
let S=await login(sup);
const reauth=async()=>call('POST','/admin/auth/reauth',{tok:S,body:{password:sup.password,totpCode:await freshAdminTotp(sup)}});
const adm=async(m,p,body,tok)=>{const own=tok===undefined;tok=own?S:tok;let r=await call(m,'/admin'+p,{tok,body});if(own&&r.s===401&&r.e?.code!=='ADMIN_REAUTH_REQUIRED'&&r.e?.code!=='ADMIN_LOGIN_FAILED'){S=await login(sup);tok=S;r=await call(m,'/admin'+p,{tok,body})}if(own&&r.s===401&&r.e?.code==='ADMIN_REAUTH_REQUIRED'){await reauth();r=await call(m,'/admin'+p,{tok:S,body})}return r};
const W=crypto.randomUUID();
const stat=id=>sql(`select status from report_reviews where id='${id}'`);
const reviewOf=a=>sql(`select id from report_reviews where "assessmentId"='${a}'`);
async function waitStatus(id,want,ms=120000){const t=Date.now();while(Date.now()-t<ms){if(stat(id)===want)return true;await sleep(1000)}return false}
const cust=await customer('rp');let ct=cust.tok,ctAt=Date.now();const CT=async()=>{if(Date.now()-ctAt>420000){const l=await http(B,'POST','/auth/login',{body:{email:cust.email,password:cust.password}});ct=l.d.accessToken;ctAt=Date.now()}return ct};const co=await http(B,'POST','/companies',{tok:ct,body:{name:'Release Policy QA ХХК'}});const companyId=co.d.id;
const other=await customer('rp-other');const OT=async()=>(await http(B,'POST','/auth/login',{body:{email:other.email,password:other.password}})).d.accessToken;
const domains=['marketing','it','finance','people','operations'];const elapsed=[[5,'minutes'],[3,'hours'],[23,'hours'],[25,'hours'],[48,'hours']];
const A={};
for(const d of domains){const j=await journey(B,await CT(),companyId,d);A[d]=j.a}
console.log('assessments',JSON.stringify(A));
for(const d of domains)rec(`${d}: review row created and draft generated`,await waitStatus(reviewOf(A[d]),'AWAITING_REVIEW'));
for(const d of domains){const row=sql(`select status||','||extract(epoch from ("deadlineAt"-"submittedAt"))::int from report_reviews where id='${reviewOf(A[d])}'`).split(',');rec(`${d}: target deadline of a fresh review is submittedAt + 24 h (not 48 h)`,row[0]==='AWAITING_REVIEW'&&Math.abs(Number(row[1])-86400)<=1,`status=${row[0]} deadline-submitted=${row[1]}s`)}
const customerReport=async(a,t)=>call('GET',`/assessments/${a}/report`,{tok:t??await CT()});
const pdf=async(a,t)=>{const r=await fetch(B+`/assessments/${a}/report/pdf`,{headers:{authorization:'Bearer '+(t??await CT())}});return {s:r.status,buf:Buffer.from(await r.arrayBuffer())}};
const pages=buf=>{const f=`/tmp/rp-${crypto.randomUUID()}.pdf`;fs.writeFileSync(f,buf);try{return Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo',[f],{encoding:'utf8'}))?.[1]||0)}finally{fs.unlinkSync(f)}};
const notifCount=(a)=>Number(sql(`select count(*) from customer_notifications where type='REPORT_RELEASED' and payload->>'assessmentId'='${a}'`));
// ---- gates before approval
{const d='marketing',a=A[d],rid=reviewOf(a);
 rec('unapproved (AWAITING_REVIEW) report: report API 409 REPORT_PENDING_REVIEW',(await customerReport(a)).e?.code==='REPORT_PENDING_REVIEW');
 rec('unapproved report: PDF refused',(await pdf(a)).s===409);
 rec('another customer cannot read it either',(await customerReport(a,await OT())).s>=400);
 const cl=await adm('POST',`/reviews/${rid}/claim`);rec('claim',cl.s===200,String(cl.s));
 rec('IN_REVIEW report still withheld',(await customerReport(a)).s===409);
 const ed=(await adm('GET',`/reviews/${rid}`)).d;const rv=ed.revision;
 const rdy=await adm('POST',`/reviews/${rid}/ready`);rec('mark ready',rdy.s===200,String(rdy.s));
 const ret=await adm('POST',`/reviews/${rid}/return`);rec('return for revision -> IN_REVIEW and still withheld',ret.s===200&&stat(rid)==='IN_REVIEW'&&(await customerReport(a)).s===409&&(await pdf(a)).s===409,String(ret.s));
 await adm('POST',`/reviews/${rid}/ready`);
 let upd='ok';try{sql(`update report_review_revisions set reason='x' where "reviewId"='${rid}'`)}catch{upd='blocked'}
 rec('revision rows are immutable (database trigger refuses UPDATE)',upd==='blocked');
}
// ---- approval after N elapsed time: every one releases immediately
for(let i=0;i<domains.length;i++){const d=domains[i],a=A[d],rid=reviewOf(a),[n,unit]=elapsed[i];
 if(i>0){await adm('POST',`/reviews/${rid}/claim`);await adm('POST',`/reviews/${rid}/ready`)}
 sql(`update report_reviews set "submittedAt"="submittedAt"-interval '${n} ${unit}' where id='${rid}'`);
 const rev=Number(sql(`select "currentRevision" from report_reviews where id='${rid}'`));
 let calls=[adm('POST',`/reviews/${rid}/approve`,{baseRevision:rev})];
 if(i===1)calls.push(adm('POST',`/reviews/${rid}/approve`,{baseRevision:rev}),adm('POST',`/reviews/${rid}/approve`,{baseRevision:rev}));
 const res=await Promise.all(calls);
 const okCount=res.filter(r=>r.s===200).length;
 rec(`approved after ${n} ${unit}: released at once (PUBLISHED, no RELEASE_NOT_DUE)`,stat(rid)==='PUBLISHED'&&okCount>=1&&!res.some(r=>r.e?.code==='RELEASE_NOT_DUE'),`statuses ${res.map(r=>r.s+(r.e?.code?':'+r.e.code:'')).join(',')}`);
 const cr=await customerReport(a);rec(`${n} ${unit}: customer can open the report`,cr.s===200);
 const p=await pdf(a);rec(`${n} ${unit}: customer PDF 200, 3 pages`,p.s===200&&pages(p.buf)===3);
 rec(`${n} ${unit}: exactly one customer REPORT_RELEASED notification`,notifCount(a)===1,`count ${notifCount(a)}`);
 if(i===1)rec('concurrent approve x3: one release, no duplicate notification, others safe (200 already-published or 409)',res.every(r=>r.s===200||r.s===409)&&notifCount(a)===1);
 if(i===0){const again=await adm('POST',`/reviews/${rid}/approve`,{baseRevision:rev});rec('repeated approve is idempotent (200 alreadyPublished) and sends nothing more',again.s===200&&again.d?.alreadyPublished===true&&notifCount(a)===1);
  rec('other customer cannot read the released report or PDF',(await customerReport(a,await OT())).s>=400&&(await pdf(a,await OT())).s>=400);
  const unauth=await fetch(B+`/assessments/${a}/report/pdf`);rec('unauthenticated PDF refused',unauth.status===401);}
}
// ---- e-mail: dispatch once, exactly one REPORT_RELEASED mail per release
const mx=await adm('POST','/maintenance/run');rec('maintenance run ok',mx.s===200,JSON.stringify(mx.d));
const box=process.env.MMRI_MOCK_MAIL_DIR+'/outbox.jsonl';const mails=fs.readFileSync(box,'utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(m=>m.to===cust.email);
const relMails=mails.filter(m=>m.kind==='REPORT_RELEASED');
rec('mock mailbox: exactly one release e-mail per released report (5)',relMails.length===5,`found ${relMails.length}`);
await adm('POST','/maintenance/run');const mails2=fs.readFileSync(box,'utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(m=>m.to===cust.email&&m.kind==='REPORT_RELEASED');
rec('second dispatch pass sends no duplicates',mails2.length===5);
rec('release e-mail has no attachment and links to the authenticated app',relMails.every(m=>!m.attachments&&/#\/report|\/report/.test(m.text||'')));
// ---- PDF failure must not expose anything; retry finishes
{const j=await journey(B,await CT(),companyId,'marketing','RETAKE');const a=j.a,rid=reviewOf(a);
 rec('retake: new independent review (old report unchanged and still readable)',rid!==reviewOf(A.marketing)&&(await customerReport(A.marketing)).s===200&&(await customerReport(a)).s===409);
 await waitStatus(rid,'AWAITING_REVIEW');await adm('POST',`/reviews/${rid}/claim`);await adm('POST',`/reviews/${rid}/ready`);
 const rev=Number(sql(`select "currentRevision" from report_reviews where id='${rid}'`));
 if(REPORT_DIR){fs.chmodSync(REPORT_DIR,0o000);}
 const bad=await adm('POST',`/reviews/${rid}/approve`,{baseRevision:rev});
 if(REPORT_DIR){fs.chmodSync(REPORT_DIR,0o700);}
 rec('PDF generation failure: publish fails cleanly (500), review stays APPROVED, nothing exposed',REPORT_DIR?bad.s>=500&&stat(rid)==='APPROVED'&&(await customerReport(a)).s===409&&(await pdf(a)).s===409&&notifCount(a)===0:true,REPORT_DIR?`status ${bad.s} ${stat(rid)}`:'REPORT_DIR not set: SKIPPED');
 const retry=await adm('POST',`/reviews/${rid}/approve`,{baseRevision:rev});rec('retry after failure finishes publication; one notification',retry.s===200&&stat(rid)==='PUBLISHED'&&notifCount(a)===1,`status ${retry.s}`);
 rec('retake release did not alter the first report',(await customerReport(A.marketing)).s===200);
}
// ---- authorization
{const bl=provision('BILLING_REVIEWER','rp');const Bt=await login(bl);const rid=reviewOf(A.it);
 rec('billing reviewer cannot claim/edit/approve a report (403)',[(await adm('POST',`/reviews/${rid}/claim`,undefined,Bt)).s,(await adm('PUT',`/reviews/${rid}/draft`,{baseRevision:1,reason:'xxx',edits:[]},Bt)).s,(await adm('POST',`/reviews/${rid}/approve`,{baseRevision:1},Bt)).s].every(s=>s===403));
 rec('customer token is useless on admin API',(await call('GET','/admin/reviews',{tok:await CT()})).s===401);}
// ---- deadline/overdue
const ov=(await adm('GET','/dashboard')).d;rec('dashboard answers with overdue counter',typeof ov?.reports?.overdue==='number');
console.log(`\nRESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
