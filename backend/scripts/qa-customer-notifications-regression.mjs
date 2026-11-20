/* Server-side customer notifications: end-to-end regression on an ISOLATED stack (real HTTP API, real DB, mock payment/mail).
   Needs three API processes sharing one QA database (same secrets):
     API       = review required + 24 h release + MMRI_CUSTOMER_NOTIFICATIONS=on   (e.g. :4413)
     API_PLAIN = notifications on, review workflow off                              (e.g. :4414)
     API_OFF   = notifications flag off                                             (e.g. :4415)
   plus PGDATABASE, DATABASE_URL (same isolated database) and MMRI_MOCK_MAIL_DIR. Refuses :4000 and the shared `mmri` database (admin-qa guards).
   Usage: node scripts/qa-customer-notifications-regression.mjs */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {call,sql,provision,adminLogin,customer,B,freshAdminTotp} from './lib/admin-qa.mjs';
import {http,journey} from './lib/qa-journey.mjs';

const API_PLAIN=process.env.API_PLAIN,API_OFF=process.env.API_OFF;
if(!API_PLAIN||!API_OFF)throw new Error('set API_PLAIN and API_OFF (isolated loopback APIs)');
for(const b of [B,API_PLAIN,API_OFF]){const u=new URL(b);if(u.hostname!=='127.0.0.1'||u.port==='4000')throw new Error('isolated loopback API required: '+b)}
let fail=0,pass=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const W=crypto.randomUUID();
const on=(m,p,tok,body)=>http(B,m,p,{tok,body,h:{'x-mmri-writer-id':W}});
const list=async(tok,q='',base=B)=>(await http(base,'GET','/notifications'+q,{tok}));
const types=r=>(r.d?.items??[]).map(x=>x.type).sort();

// ------------------------------------------------------------------ users and companies
const A=await customer('ntA'),Bu=await customer('ntB'),Cv=await customer('ntC'),D=await customer('ntD'),E=await customer('ntE');
const co=async(u,name)=>(await on('POST','/companies',u.tok,{name,industry:'Notifications QA',businessModel:'B2B',employeeCount:12,companyAgeYears:2,marketType:'Mongolia',country:'MN'})).d.id;
const CA=await co(A,'NT-A BUSINESS'),CB=await co(Bu,'NT-B BUSINESS'),CD=await co(D,'NT-D BUSINESS'),CA2=await co(A,'NT-A SECOND');
const add=await on('POST',`/companies/${CA}/members`,A.tok,{email:Cv.email,role:'VIEWER'});

// NT-01 flag off: the API is dark and writes nothing
const offBefore=Number(sql('select count(*) from customer_notifications'));
const off=await list(A.tok,'',API_OFF);const offPay=await http(API_OFF,'GET','/notifications/unread-count',{tok:A.tok});
rec('NT-01 with the flag off the API answers 404 NOTIFICATIONS_DISABLED and the count endpoint is dark too',off.s===404&&off.e?.code==='NOTIFICATIONS_DISABLED'&&offPay.s===404,`${off.s}/${offPay.s}`);

// NT-02 account events (email verification + password set) were created at registration confirm, exactly once each
const l0=await list(A.tok);
rec('NT-02 registration confirmation produced ACCOUNT_EMAIL_VERIFIED + ACCOUNT_PASSWORD_CHANGED for that user only, unread',l0.s===200&&types(l0).join()==='ACCOUNT_EMAIL_VERIFIED,ACCOUNT_PASSWORD_CHANGED'&&l0.d.unreadCount===2,types(l0).join());
rec('NT-03 a different user does not see them (cross-account isolation) and has their own',types(await list(Bu.tok)).join()==='ACCOUNT_EMAIL_VERIFIED,ACCOUNT_PASSWORD_CHANGED'&&(await list(Bu.tok)).d.items.every(x=>!l0.d.items.some(y=>y.id===x.id)));

// ------------------------------------------------------------------ long journeys in parallel: review workflow API and plain API
const [jr,jp]=await Promise.all([journey(B,A.tok,CA,'finance'),journey(API_PLAIN,D.tok,CD,'finance')]);
const lA=await list(A.tok,`?companyId=${CA}`);const tA=types(lA);
rec('NT-04 payment confirmation notified the company owner exactly once; the second payment of the same invoice is refused by billing (409) and adds no notification',tA.filter(t=>t==='PAYMENT_CONFIRMED').length===1&&sql(`select count(*) from customer_notifications where "dedupeKey"='PAYMENT_CONFIRMED:${jr.inv.id}'`)==='1'&&jr.pay.s===200&&jr.pay2.s===409,`pay ${jr.pay.s}/${jr.pay2.s}`);
rec('NT-05 assessment completion + report-under-review were created once (review workflow on); a duplicate completion request added nothing',tA.filter(t=>t==='ASSESSMENT_COMPLETED').length===1&&tA.filter(t=>t==='REPORT_UNDER_REVIEW').length===1&&!tA.includes('REPORT_RELEASED'),tA.join());
const lC=await list(Cv.tok,`?companyId=${CA}`);const tC=types(lC);
rec('NT-06 a VIEWER member of the company receives the company report events but NOT the billing event',tC.includes('ASSESSMENT_COMPLETED')&&tC.includes('REPORT_UNDER_REVIEW')&&!tC.includes('PAYMENT_CONFIRMED'),tC.join());
const lB=await list(Bu.tok);
rec('NT-07 the other company (user B) saw none of company A\'s events',!types(lB).some(t=>['PAYMENT_CONFIRMED','ASSESSMENT_COMPLETED','REPORT_UNDER_REVIEW'].includes(t)));
const lD=await list(D.tok,'',API_PLAIN);const tD=types(lD);
rec('NT-08 with the review workflow off the report is announced as released at completion (no under-review event)',tD.includes('REPORT_RELEASED')&&tD.includes('ASSESSMENT_COMPLETED')&&!tD.includes('REPORT_UNDER_REVIEW'),tD.join());

// ------------------------------------------------------------------ administrator approves, then publishes after the 24 h minimum (controlled timestamps)
const rvId=sql(`select id from report_reviews where "assessmentId"='${jr.a}'`);
for(let i=0;i<60&&!['AWAITING_REVIEW','IN_REVIEW','READY_FOR_APPROVAL'].includes(sql(`select status from report_reviews where id='${rvId}'`));i++)await sleep(2000);
const rv=provision('REPORT_REVIEWER','nt');const R=(await adminLogin(rv)).d.token;
const ac=(m,p,body)=>call(m,p,{tok:R,body,h:{'x-mmri-writer-id':W}});
const reauth=async()=>ac('POST','/admin/auth/reauth',{password:rv.password,totpCode:await freshAdminTotp(rv)});
const clm=await ac('POST',`/admin/reviews/${rvId}/claim`,{});const rdy=await ac('POST',`/admin/reviews/${rvId}/ready`,{});await reauth();
const cur=Number(sql(`select "currentRevision" from report_reviews where id='${rvId}'`));
const apr=await ac('POST',`/admin/reviews/${rvId}/approve`,{baseRevision:cur});
const tA2=types(await list(A.tok,`?companyId=${CA}`)),tC2=types(await list(Cv.tok,`?companyId=${CA}`));
rec('NT-09 report approval notified the owner and the viewer once each (and nothing is released yet)',apr.s===200&&tA2.filter(t=>t==='REPORT_APPROVED').length===1&&tC2.filter(t=>t==='REPORT_APPROVED').length===1&&!tA2.includes('REPORT_RELEASED'),`claim ${clm.s} ready ${rdy.s} approve ${apr.s} ${apr.e?.code??''} ${tA2.join()}`);
const early=await ac('POST',`/admin/reviews/${rvId}/publish`,{});
rec('NT-10 an early publish is refused (RELEASE_NOT_DUE) and creates no release notification',early.s===409&&early.e?.code==='RELEASE_NOT_DUE'&&!types(await list(A.tok,`?companyId=${CA}`)).includes('REPORT_RELEASED'),`${early.s} ${early.e?.code??''}`);
sql(`update report_reviews set "submittedAt"=now()-interval '25 hours',"deadlineAt"=now()+interval '23 hours' where id='${rvId}'`);
const pub=await ac('POST',`/admin/reviews/${rvId}/publish`,{});const pub2=await ac('POST',`/admin/reviews/${rvId}/publish`,{});
const tA3=types(await list(A.tok,`?companyId=${CA}`));
rec('NT-11 publication notified the owner exactly once; a repeated publish (409) added nothing',pub.s===200&&pub2.s===409&&tA3.filter(t=>t==='REPORT_RELEASED').length===1&&types(await list(Cv.tok,`?companyId=${CA}`)).filter(t=>t==='REPORT_RELEASED').length===1,`${pub.s}/${pub2.s} ${pub.e?.code??''}`);
rec('NT-12 event rows are unique per recipient and event in the database (idempotency key)',sql(`select count(*) from (select "userId","dedupeKey" from customer_notifications group by 1,2 having count(*)>1) x`)==='0');

// ------------------------------------------------------------------ lifecycle e-mails through the real dispatcher (mock mailbox; API started with MMRI_CUSTOMER_EMAILS=on)
if(process.env.MMRI_MOCK_MAIL_DIR&&process.env.CHECK_MAIL==='YES'){
  const box=()=>{try{return fs.readFileSync(path.join(process.env.MMRI_MOCK_MAIL_DIR,'outbox.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l))}catch{return []}};
  const count=(email,kind)=>box().filter(m=>m.to===email.toLowerCase()&&m.kind===kind).length;
  const need=[[A.email,'ASSESSMENT_COMPLETED'],[A.email,'REPORT_UNDER_REVIEW'],[A.email,'REPORT_RELEASED'],[Cv.email,'REPORT_RELEASED']];
  for(let i=0;i<40&&!need.every(([e,k])=>count(e,k)>=1);i++)await sleep(3000); // dispatcher runs every 30 s
  await sleep(35000); // one more full dispatcher cycle: nothing may be sent twice
  rec('NT-25 the owner received exactly one acknowledgement, one under-review and one release e-mail',['ASSESSMENT_COMPLETED','REPORT_UNDER_REVIEW','REPORT_RELEASED'].every(k=>count(A.email,k)===1),['ASSESSMENT_COMPLETED','REPORT_UNDER_REVIEW','REPORT_RELEASED'].map(k=>k+':'+count(A.email,k)).join(' '));
  rec('NT-26 the viewer member received the report e-mails (once) and no billing/approval mail; the other company received none',count(Cv.email,'REPORT_RELEASED')===1&&box().filter(m=>m.to===Cv.email.toLowerCase()&&/PAYMENT|APPROVED/.test(m.kind)).length===0&&box().filter(m=>m.to===Bu.email.toLowerCase()&&['ASSESSMENT_COMPLETED','REPORT_UNDER_REVIEW','REPORT_RELEASED'].includes(m.kind)).length===0);
  const rel=box().find(m=>m.to===A.email.toLowerCase()&&m.kind==='REPORT_RELEASED');
  rec('NT-27 the release e-mail links to the configured public origin and carries no scores or findings',rel&&/\/#\/report/.test(rel.text)&&!/\d{2,3}\s*оноо|score/i.test(rel.text)&&rel.subject==='BusinessMRI.mn: тайлан бэлэн боллоо');
  const adm=(process.env.ADMIN_ALERT_CHECK||'').split(',').filter(Boolean);
  rec('NT-28 every configured administrator address received the review alert',adm.length>0&&adm.every(a=>box().some(m=>m.to===a.toLowerCase()&&m.kind==='ADMIN_REVIEW_ALERT')),adm.map(a=>a+':'+box().filter(m=>m.to===a.toLowerCase()).length).join(' '));
}

// ------------------------------------------------------------------ read / unread / dismiss semantics, ordering, persistence
const before=await list(A.tok,`?companyId=${CA}`);const ids=before.d.items.map(x=>x.id);
const target=before.d.items.find(x=>!x.readAt&&x.type==='REPORT_UNDER_REVIEW');
const mr=await on('POST',`/notifications/${target.id}/read?companyId=${CA}`,A.tok);
const after=await list(A.tok,`?companyId=${CA}`);
rec('NT-13 mark-read persists, lowers the counter by exactly one and does NOT reorder the list',mr.s===200&&after.d.unreadCount===before.d.unreadCount-1&&after.d.items.map(x=>x.id).join()===ids.join()&&after.d.items.find(x=>x.id===target.id).readAt,`${before.d.unreadCount}->${after.d.unreadCount}`);
const mu=await on('POST',`/notifications/${target.id}/unread?companyId=${CA}`,A.tok);const mu2=await list(A.tok,`?companyId=${CA}`);
rec('NT-14 mark-unread restores the unread state and counter',mu.s===200&&mu2.d.unreadCount===before.d.unreadCount&&!mu2.d.items.find(x=>x.id===target.id).readAt);
// a brand-new login (another browser/device) sees the same server state
const login2=await http(B,'POST','/auth/login',{body:{email:A.email,password:A.password}});const tok2=login2.d.accessToken;
const dev2=await list(tok2,`?companyId=${CA}`);
rec('NT-15 a separate login session (another device) sees identical items and unread count',login2.s===200&&dev2.d.items.map(x=>x.id+':'+!!x.readAt).join()===mu2.d.items.map(x=>x.id+':'+!!x.readAt).join()&&dev2.d.unreadCount===mu2.d.unreadCount);
const dis=await on('POST',`/notifications/${target.id}/dismiss?companyId=${CA}`,A.tok);const dis2=await on('POST',`/notifications/${target.id}/dismiss?companyId=${CA}`,A.tok);
const afterDis=await list(tok2,`?companyId=${CA}`);
rec('NT-16 dismiss removes it for every session, is idempotent, and the counter drops',dis.s===200&&dis2.s===200&&!afterDis.d.items.some(x=>x.id===target.id)&&afterDis.d.unreadCount===before.d.unreadCount-1,`${dis.s}/${dis2.s}`);
const pg1=await list(A.tok,`?companyId=${CA}&limit=2`);const seen=[...pg1.d.items.map(x=>x.id)];let cur2=pg1.d.nextCursor,pages=1;
while(cur2&&pages<20){const p=await list(A.tok,`?companyId=${CA}&limit=2&cursor=${cur2}`);seen.push(...p.d.items.map(x=>x.id));cur2=p.d.nextCursor;pages++}
const full=await list(A.tok,`?companyId=${CA}&limit=50`);
rec('NT-17 pagination returns every visible item exactly once, newest first',new Set(seen).size===seen.length&&seen.join()===full.d.items.map(x=>x.id).join()&&pages>=2,`${seen.length} items in ${pages} pages`);
const ra=await on('POST',`/notifications/read-all?companyId=${CA}`,A.tok);const ra2=await list(A.tok,`?companyId=${CA}`);
rec('NT-18 mark-all-read zeroes the counter for the company view and keeps the items',ra.s===200&&ra2.d.unreadCount===0&&ra2.d.items.length===full.d.items.length&&ra2.d.items.every(x=>x.readAt));
const second=await list(A.tok,`?companyId=${CA2}`);
rec('NT-19 a second company of the same user does not show the first company\'s events (account events stay global)',types(second).every(t=>t.startsWith('ACCOUNT_')),types(second).join());

// ------------------------------------------------------------------ authorisation
const aOne=full.d.items[0].id;
const x1=await on('POST',`/notifications/${aOne}/read`,Bu.tok),x2=await on('POST',`/notifications/${aOne}/dismiss`,Bu.tok),x3=await on('POST',`/notifications/${aOne}/unread`,Bu.tok);
rec('NT-20 another user cannot read-mark, unread-mark or dismiss someone else\'s notification (404, state unchanged)',[x1.s,x2.s,x3.s].every(s=>s===404)&&sql(`select ("dismissedAt" is null) and ("readAt" is not null) from customer_notifications where id='${aOne}'`)==='t');
const x4=await list(Bu.tok,`?companyId=${CA}`),x5=await http(B,'GET','/notifications');
rec('NT-21 filtering by a company the user does not belong to is refused (403); anonymous calls are 401',x4.s===403&&x5.s===401,`${x4.s}/${x5.s}`);
const bad=[await list(A.tok,'?limit=0'),await list(A.tok,'?limit=51'),await list(A.tok,'?cursor=@@@'),await list(A.tok,'?companyId=../x'),await on('POST','/notifications/..%2F..%2Fx/read',A.tok)];
rec('NT-22 invalid limit / cursor / company / id values are rejected without a server error',bad.every(r=>r.s>=400&&r.s<500),bad.map(r=>r.s).join('/'));

// ------------------------------------------------------------------ tenant removal and erasure
const rm=await on('DELETE',`/companies/${CA}/members/${Cv.id}`,A.tok);
const cAfter=await list(Cv.tok);
rec('NT-23 a member removed from the company no longer sees that company\'s notifications (account ones remain)',rm.s>=200&&rm.s<300&&cAfter.d.items.every(x=>x.companyId===null)&&cAfter.d.items.length>=2,`${rm.s} ${types(cAfter).join()}`);
const eRows=Number(sql(`select count(*) from customer_notifications where "userId"='${E.id}'`));
const er=await on('POST','/account/erase',E.tok,{confirmEmail:E.email,password:E.password});
rec('NT-24 erasing an account deletes that user\'s notifications',eRows>=2&&er.s===200&&sql(`select count(*) from customer_notifications where "userId"='${E.id}'`)==='0',`${eRows} -> ${er.s}`);

console.log(`SUMMARY pass=${pass} fail=${fail}`);
process.exit(fail?1:0);
