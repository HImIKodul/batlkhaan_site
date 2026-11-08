/* Admin security and workflow regression (API level). Needs the dev API on :4000 and the local Postgres container; provisions throw-away admins through the
   real CLI and disables them at the end. Usage: node scripts/qa-admin-regression.mjs */
import {call,sql,totp,provision,adminLogin,customer,rndPw} from './lib/admin-qa.mjs';
let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// ---------- provisioning through the CLI ----------
const sup=provision('SUPER_ADMIN','super'),rev=provision('REPORT_REVIEWER','rev'),bil=provision('BILLING_REVIEWER','bil');
rec('ADM-01 bootstrap CLI creates admins; secret is printed once, password never printed',/Secret : [A-Z2-7]{32}/.test(sup.out)&&!sup.out.includes(sup.password)&&!sup.err.includes(sup.password));
rec('ADM-02 the MFA secret is stored encrypted, never in clear text',!sql(`select "mfaSecretEnc" from admin_accounts a join users u on u.id=a."userId" where u.email='${sup.email}'`).includes(sup.secret)&&sql(`select "mfaSecretEnc" like 'v1.%' from admin_accounts a join users u on u.id=a."userId" where u.email='${sup.email}'`)==='t');
const weak=await import('node:child_process').then(c=>c.spawnSync('npx',['tsx','src/admin-cli.ts','bootstrap','--email','weak.qa@mmri.test','--password-stdin','--allow-additional-super'],{cwd:new URL('../',import.meta.url).pathname,input:'short',encoding:'utf8'}));
rec('ADM-03 a weak admin password is refused by the CLI',weak.status!==0&&/14-128/.test(weak.stderr));
// ---------- login ----------
const bad1=await call('POST','/admin/auth/login',{body:{email:'nobody@mmri.test',password:rndPw(),totpCode:'123456'}});
const bad2=await call('POST','/admin/auth/login',{body:{email:rev.email,password:'wrong-Password-123',totpCode:totp(rev.secret)}});
const bad3=await call('POST','/admin/auth/login',{body:{email:rev.email,password:rev.password,totpCode:'000000'}});
rec('ADM-04 unknown account, wrong password and wrong MFA code all give the same generic 401',[bad1,bad2,bad3].every(x=>x.s===401&&x.e.code==='ADMIN_LOGIN_FAILED')&&bad1.e.message===bad2.e.message&&bad2.e.message===bad3.e.message);
const L={};for(const a of [sup,rev,bil]){const r=await adminLogin(a);L[a.role]=r;}
rec('ADM-05 valid password + MFA code logs in and activates the account (PENDING_MFA to ACTIVE)',Object.values(L).every(r=>r.s===200&&/^adm_/.test(r.d.token))&&sql(`select a.status from admin_accounts a join users u on u.id=a."userId" where u.email='${rev.email}'`)==='ACTIVE');
const reuse=await call('POST','/admin/auth/login',{body:{email:rev.email,password:rev.password,totpCode:totp(rev.secret)}});
rec('ADM-06 an MFA code cannot be replayed',reuse.s===401);
const T={sup:L.SUPER_ADMIN.d.token,rev:L.REPORT_REVIEWER.d.token,bil:L.BILLING_REVIEWER.d.token};
// ---------- no shared/default admin, no public registration, tokens not interchangeable ----------
const cu=await customer('adm');
rec('ADM-07 customer credentials cannot sign in to the admin area; no admin registration route exists',(await call('POST','/admin/auth/login',{body:{email:cu.email,password:cu.password,totpCode:'123456'}})).s===401&&(await call('POST','/admin/auth/register',{body:{email:'x@y.mn',password:rndPw()}})).s===404);
rec('ADM-08 a customer token is useless on every admin endpoint; an admin token is useless on customer endpoints',(await call('GET','/admin/dashboard',{tok:cu.tok})).s===401&&(await call('GET','/admin/reviews',{tok:cu.tok})).s===401&&(await call('GET','/companies',{tok:T.sup})).s===401);
rec('ADM-09 missing, malformed and tampered admin tokens are rejected',(await call('GET','/admin/auth/me')).s===401&&(await call('GET','/admin/auth/me',{tok:'adm_'+'A'.repeat(43)})).s===401&&(await call('GET','/admin/auth/me',{tok:T.sup.slice(0,-2)+'xx'})).s===401);
const reg=await call('POST','/auth/register',{body:{email:`esc.${Date.now()}@mmri.test`,password:rndPw(),displayName:'x',role:'SUPER_ADMIN',isAdmin:true,adminRole:'SUPER_ADMIN'}});
rec('ADM-10 privilege escalation through registration fields creates no admin',reg.s===201&&sql(`select count(*) from admin_accounts a join users u on u.id=a."userId" where u.id='${reg.d.user.id}'`)==='0'&&(await call('GET','/admin/dashboard',{tok:reg.d.accessToken})).s===401);
// ---------- authorization matrix (server side) ----------
const M=[['GET','/admin/payments',['sup','bil'],['rev']],['GET','/admin/reviews',['sup','rev'],['bil']],['GET','/admin/settings',['sup'],['rev','bil']],['GET','/admin/audit',['sup'],['rev','bil']],['GET','/admin/ops',['sup'],['rev','bil']],['GET','/admin/companies',['sup','rev','bil'],[]],['GET','/admin/notifications',['sup','rev','bil'],[]]];
let matrixOk=true,matrixDetail=[];for(const [m,p,allow,deny] of M){for(const k of allow){const r=await call(m,p,{tok:T[k]});if(r.s!==200){matrixOk=false;matrixDetail.push(`${k} ${p} ${r.s}`)}}for(const k of deny){const r=await call(m,p,{tok:T[k]});if(r.s!==403){matrixOk=false;matrixDetail.push(`${k} ${p} ${r.s}`)}}}
rec('ADM-11 role matrix: reviewer cannot read payments, billing reviewer cannot read reports, only SUPER_ADMIN sees settings, audit and ops',matrixOk,matrixDetail.join('; '));
rec('ADM-12 billing reviewer cannot approve or publish; report reviewer cannot decide disputes',(await call('POST','/admin/reviews/x/approve',{tok:T.bil,body:{baseRevision:1}})).s===403&&(await call('POST','/admin/reviews/x/publish',{tok:T.bil})).s===403&&(await call('POST','/admin/disputes/x/status',{tok:T.rev,body:{status:'APPROVED',version:0,note:'x'}})).s===403&&(await call('POST','/admin/disputes/x/refund-approval',{tok:T.rev})).s===403);
rec('ADM-13 there is no route that marks an invoice paid or executes a refund',(await call('POST','/admin/payments/x/mark-paid',{tok:T.sup,body:{}})).s===404&&(await call('PUT','/admin/payments/x',{tok:T.sup,body:{status:'PAID'}})).s===404&&(await call('POST','/admin/disputes/x/refund',{tok:T.sup,body:{}})).s===404);
// ---------- re-authentication for sensitive actions ----------
sql(`update admin_sessions set "reauthAt"=now()-interval '10 minutes' where "tokenHash" is not null and "adminId"=(select a.id from admin_accounts a join users u on u.id=a."userId" where u.email='${sup.email}')`);
const needRe=await call('POST','/admin/maintenance/run',{tok:T.sup});
rec('ADM-14 a sensitive action with a stale login needs re-authentication (401 ADMIN_REAUTH_REQUIRED)',needRe.s===401&&needRe.e.code==='ADMIN_REAUTH_REQUIRED');
const badRe=await call('POST','/admin/auth/reauth',{tok:T.sup,body:{password:'nope-nope-nope-1',totpCode:'111111'}});
const goodRe=await call('POST','/admin/auth/reauth',{tok:T.sup,body:{password:sup.password,totpCode:totp(sup.secret,1)}});
const afterRe=await call('POST','/admin/maintenance/run',{tok:T.sup});
rec('ADM-15 re-authentication with wrong credentials fails; with password + fresh MFA code the sensitive action then works',badRe.s===401&&goodRe.s===200&&afterRe.s===200,`${badRe.s}/${goodRe.s}/${afterRe.s}`);
// ---------- dashboard counts are real ----------
const dash=await call('GET','/admin/dashboard',{tok:T.sup});
rec('ADM-16 dashboard numbers equal the database (no invented statistics)',dash.s===200&&dash.d.reports.published===Number(sql(`select count(*) from report_reviews where status='PUBLISHED'`))&&dash.d.reports.generationFailed===Number(sql(`select count(*) from report_reviews where status='GENERATION_FAILED'`))&&dash.d.payments.openRequests===Number(sql(`select count(*) from payment_disputes where status in ('OPEN','UNDER_REVIEW','MORE_INFORMATION_REQUIRED')`)),JSON.stringify(dash.d.reports));
const dashBil=await call('GET','/admin/dashboard',{tok:T.bil});rec('ADM-17 the billing reviewer dashboard hides report counts, the report reviewer hides payment counts',!dashBil.d.reports&&!!dashBil.d.payments&&!(await call('GET','/admin/dashboard',{tok:T.rev})).d.payments);
// ---------- notifications ----------
sql(`delete from admin_notifications where "dedupeKey"='QA-DEDUPE-1'`);const n0=await call('GET','/admin/notifications?unread=1',{tok:T.sup});
sql(`insert into admin_notifications(id,type,"dedupeKey","targetType","targetId",severity,title,body) values('qa-n1','SYSTEM_WARNING','QA-DEDUPE-1','SYSTEM','x','INFO','t','b') on conflict do nothing`);
let dup='';try{sql(`insert into admin_notifications(id,type,"dedupeKey","targetType","targetId",severity,title,body) values('qa-n2','SYSTEM_WARNING','QA-DEDUPE-1','SYSTEM','x','INFO','t','b')`)}catch(e){dup=String(e.stderr||e.message)}
const n1=await call('GET','/admin/notifications?unread=1',{tok:T.sup});await call('POST','/admin/notifications/qa-n1/read',{tok:T.sup,body:{}});const n2=await call('GET','/admin/notifications?unread=1',{tok:T.sup});const other=await call('GET','/admin/notifications?unread=1',{tok:T.rev});
rec('ADM-18 notifications: dedupe key is unique, unread count drops after read, read state is per administrator',/duplicate key/.test(dup)&&n1.d.unread===n0.d.unread+1&&n2.d.unread===n1.d.unread-1&&other.d.unread>=n2.d.unread+1,`${n0.d.unread}/${n1.d.unread}/${n2.d.unread}/${other.d.unread}`);
await call('POST','/admin/notifications/read-all',{tok:T.sup,body:{}});rec('ADM-19 mark all read',(await call('GET','/admin/notifications?unread=1',{tok:T.sup})).d.unread===0);
sql(`delete from admin_notifications where id like 'qa-n%'`);
// ---------- disputes and support ----------
const co=await call('POST','/companies',{tok:cu.tok,body:{name:'Admin QA ХХК'}});const invId='qa-inv-'+Date.now();const cid=co.d.id;
sql(`insert into billing_invoices(id,"companyId","createdByUserId","planCode","amountMnt",currency,provider,"senderInvoiceNo","callbackTokenHash",status,"domainCode","providerPaymentId","paidAt","createdAt","updatedAt") values('${invId}','${cid}','${cu.id}','DIAGNOSTIC',300000,'MNT','MOCK','QA-${invId}','x','PAID','it','QA-PAY-${invId}',now(),now(),now())`);
const dsp=await call('POST',`/billing/invoices/${invId}/dispute`,{tok:cu.tok,body:{summary:'Төлбөр хоёр удаа хасагдсан гэж үзэж байна.'}});
const other2=await customer('other');const dspOther=await call('POST',`/billing/invoices/${invId}/dispute`,{tok:other2.tok,body:{summary:'Бусдын нэхэмжлэхэд маргаан нээх оролдлого'}});
rec('ADM-20 a customer can open a dispute only on an invoice of their own company; it notifies admins once',dsp.s===201&&dspOther.s===403&&Number(sql(`select count(*) from admin_notifications where "dedupeKey"='PAYMENT_DISPUTE:${dsp.d.id}'`))===1);
const dd=await call('GET',`/admin/disputes/${dsp.d.id}`,{tok:T.bil});
const st1=await call('POST',`/admin/disputes/${dsp.d.id}/status`,{tok:T.bil,body:{status:'UNDER_REVIEW',version:dd.d.dispute.version}});
sql(`update admin_sessions set "reauthAt"=now()-interval '10 minutes' where "adminId"=(select a.id from admin_accounts a join users u on u.id=a."userId" where u.email='${bil.email}')`);
const st2=await call('POST',`/admin/disputes/${dsp.d.id}/status`,{tok:T.bil,body:{status:'APPROVED',version:st1.d?1:0,note:'Давхар хасалт баталгаажсан'}});
await call('POST','/admin/auth/reauth',{tok:T.bil,body:{password:bil.password,totpCode:totp(bil.secret,1)}});
const dd2=await call('GET',`/admin/disputes/${dsp.d.id}`,{tok:T.bil});const st3=await call('POST',`/admin/disputes/${dsp.d.id}/status`,{tok:T.bil,body:{status:'APPROVED',version:dd2.d.dispute.version,note:'Давхар хасалт баталгаажсан'}});
const stale=await call('POST',`/admin/disputes/${dsp.d.id}/status`,{tok:T.bil,body:{status:'RESOLVED',version:0,note:'stale'}});
rec('ADM-21 dispute workflow: review step, decisive statuses need re-authentication, stale version is refused (409)',st1.s===200&&st2.s===401&&st3.s===200&&stale.s===409,`${st1.s}/${st2.s}/${st3.s}/${stale.s}`);
const ra=await call('POST',`/admin/disputes/${dsp.d.id}/refund-approval`,{tok:T.bil});
rec('ADM-22 refund approval is recorded but NOT executed; the invoice stays PAID and history is untouched',ra.s===200&&ra.d.refundExecuted===false&&sql(`select "refundExecutedAt" is null and "refundApprovedAt" is not null from payment_disputes where id='${dsp.d.id}'`)==='t'&&sql(`select status from billing_invoices where id='${invId}'`)==='PAID');
const sc=await call('POST','/support/cases',{tok:cu.tok,body:{category:'REPORT_QUESTION',subject:'Тайлангийн асуулт',message:'Тайлангийн нэг хэсгийг тайлбарлана уу.',companyId:cid}});
const scBad=await call('POST','/support/cases',{tok:cu.tok,body:{category:'HACK',subject:'xx',message:'yyyyy'}});const scFor=await call('POST','/support/cases',{tok:other2.tok,body:{category:'REPORT_QUESTION',subject:'abc',message:'abcdef',companyId:cid}});
const sa=await call('POST',`/admin/support/${sc.d.id}`,{tok:T.rev,body:{status:'IN_PROGRESS',assignToMe:true,note:'Хүлээн авлаа'}});
rec('ADM-23 support: customer creates a case for own company only; admin assigns and updates; invalid category refused',sc.s===201&&scBad.s===400&&scFor.s===403&&sa.s===200&&sa.d.status==='IN_PROGRESS');
// ---------- companies and audit ----------
const cl=await call('GET','/admin/companies?q=Admin%20QA',{tok:T.rev});const cd=await call('GET',`/admin/companies/${cid}`,{tok:T.rev});
rec('ADM-24 company search and detail work with server-side pagination; the view is audited',cl.s===200&&cl.d.total>=1&&cd.s===200&&cd.d.company.name==='Admin QA ХХК'&&Number(sql(`select count(*) from admin_audit_events where action='COMPANY_VIEWED' and "targetId"='${cid}'`))>=1);
const au=await call('GET','/admin/audit?action=ADMIN_LOGIN',{tok:T.sup});
rec('ADM-25 audit log records logins, failures and denials with outcome; no passwords, tokens or MFA codes are stored',au.d.items.some(x=>x.outcome==='FAILURE')&&au.d.items.some(x=>x.outcome==='SUCCESS')&&![sup.password,rev.password,bil.password,sup.secret,rev.secret,bil.secret,T.sup,T.rev,T.bil].some(v=>sql(`select string_agg(coalesce(metadata::text,'')||coalesce(action,''),' ') from admin_audit_events`).includes(v)));
let upd='';try{sql(`update admin_audit_events set outcome='SUCCESS' where id=(select id from admin_audit_events limit 1)`)}catch(e){upd=String(e.stderr||e.message)}
rec('ADM-26 the audit log cannot be altered (database trigger)',/append-only/.test(upd));
// ---------- lockout ----------
const lk=provision('REPORT_REVIEWER','lock');let last;for(let i=0;i<6;i++){last=await call('POST','/admin/auth/login',{body:{email:lk.email,password:'wrong-Password-123',totpCode:totp(lk.secret)}});await sleep(120)}
const lockedGood=await adminLogin(lk,1);
rec('ADM-27 after 5 failures the account is locked: even correct credentials are refused (429)',last.s===429&&lockedGood.s===429,`${last.s}/${lockedGood.s}`);
// ---------- admin management ----------
const meSelf=await call('GET','/admin/auth/me',{tok:T.sup});sql(`update admin_sessions set "reauthAt"=now() where "adminId"='${meSelf.d.id}'`);
const dSelf=await call('POST',`/admin/admins/${meSelf.d.id}/disable`,{tok:T.sup,body:{}});
const revId=(await call('GET','/admin/settings',{tok:T.sup})).d.admins.find(a=>a.email===rev.email).id;const dRev=await call('POST',`/admin/admins/${revId}/disable`,{tok:T.sup});const meAfter=await call('GET','/admin/auth/me',{tok:T.rev});
rec('ADM-28 disabling an admin revokes their sessions at once; an admin cannot disable or demote themselves',dSelf.s===409&&dRev.s===200&&meAfter.s===401);
const lo=await call('POST','/admin/auth/logout',{tok:T.bil,body:{}});rec('ADM-29 logout revokes the session',lo.s===200&&(await call('GET','/admin/auth/me',{tok:T.bil})).s===401);
sql(`update admin_sessions set "expiresAt"=now()-interval '1 minute' where "adminId"='${meSelf.d.id}'`);rec('ADM-30 an idle-expired session is refused',(await call('GET','/admin/auth/me',{tok:T.sup})).s===401);
// ---------- cleanup: disable every QA admin ----------
sql(`update admin_accounts set status='DISABLED',"disabledAt"=now() where "userId" in (select id from users where email like 'admin.qa.%')`);sql(`update admin_sessions set "revokedAt"=now() where "adminId" in (select a.id from admin_accounts a join users u on u.id=a."userId" where u.email like 'admin.qa.%')`);
console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
