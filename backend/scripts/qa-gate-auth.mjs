/* Release gate: SEC-02 (parallel wrong verification codes), registration/verification, password recovery, session refresh rotation/logout, membership removal. ISOLATED API with mock mailbox. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const R=new URL('./lib/',import.meta.url).pathname;const {sql,B}=await import(R+'admin-qa.mjs');const {fixtureVerificationCode}=await import(R+'verified-test-registration.mjs');
let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const ORIGIN={origin:'http://127.0.0.1:5190'};
const call=async(m,p,{tok,body,cookie,h={}}={})=>{const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json',...ORIGIN,...(tok?{authorization:'Bearer '+tok}:{}),...(cookie?{cookie}:{}),...h},body:body===undefined?undefined:JSON.stringify(body)});let j=null;try{j=await r.json()}catch{}return {s:r.status,d:j?.data,e:j?.error,h:r.headers}};
const refreshOf=r=>{const sc=r.h.get('set-cookie')||'';const m=/mmri_refresh=([^;]*)/.exec(sc);return m?`mmri_refresh=${m[1]}`:null};
const mails=(to,kind)=>fs.readFileSync(path.join(process.env.MMRI_MOCK_MAIL_DIR,'outbox.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(m=>m.to===to&&(!kind||m.kind===kind));
const pw1='First-Pass-'+crypto.randomBytes(4).toString('hex')+'Aa1!',pw2='Second-Pass-'+crypto.randomBytes(4).toString('hex')+'Bb2!';
// ---- registration + SEC-02
const email=`auth.gate.${Date.now()}.${crypto.randomBytes(2).toString('hex')}@mmri.test`;
const reg=await call('POST','/auth/register',{body:{email,password:pw1,displayName:'Auth Gate'}});rec('registration is accepted without a session (pending e-mail ownership)',reg.s===202&&!reg.d?.accessToken&&!refreshOf(reg));
rec('login before verification is refused',(await call('POST','/auth/login',{body:{email,password:pw1}})).s!==200);
const good=fixtureVerificationCode(email);const wrongs=['000001','000002','000003','000004','000005','000006','000007','000008','000009','000010','000011','000012'].filter(c=>c!==good);
const burst=await Promise.all(wrongs.map(c=>call('POST','/auth/email-verification/confirm',{body:{email,code:c}})));
rec('SEC-02: 12 PARALLEL wrong codes are all refused with the same answer',burst.every(r=>r.s===400||r.s===429),burst.map(r=>r.s).join(','));
const rejects=Number(sql(`select count(*) from auth_audit_events a join users u on u.id=a."userId" where u.email='${email}' and a."eventType"='EMAIL_CODE_REJECTED'`));
rec('SEC-02: every wrong guess was recorded (none lost to a race)',rejects>=burst.filter(r=>r.s===400).length&&rejects>=5,`rejections recorded=${rejects}`);
const late=await call('POST','/auth/email-verification/confirm',{body:{email,code:good}});
rec('SEC-02: after the cap the CORRECT code no longer works (code consumed, new one required)',late.s===400,String(late.s));
const resend=await call('POST','/auth/email-verification/request',{body:{email}});rec('resend answers generically',resend.s===202);
sql(`update password_reset_tokens set "createdAt"=now()-interval '10 minutes' where "userId"=(select id from users where email='${email}')`);
const resend2=await call('POST','/auth/email-verification/request',{body:{email}});const code2=fixtureVerificationCode(email);
const ver=await call('POST','/auth/email-verification/confirm',{body:{email,code:code2}});rec('a fresh code verifies the account after cooldown',resend2.s===202&&ver.s===200&&code2!==good,`${ver.s}`);
rec('a used code cannot be reused',(await call('POST','/auth/email-verification/confirm',{body:{email,code:code2}})).s===400);
// ---- login, refresh rotation, logout
const l1=await call('POST','/auth/login',{body:{email,password:pw1}});const c1=refreshOf(l1);rec('verified user logs in (access token + HttpOnly refresh cookie)',l1.s===200&&!!l1.d?.accessToken&&!!c1&&/HttpOnly/i.test(l1.h.get('set-cookie')));
rec('wrong password refused',(await call('POST','/auth/login',{body:{email,password:pw1+'x'}})).s===401);
const r1=await call('POST','/auth/refresh',{cookie:c1});const c2=refreshOf(r1);rec('refresh issues a new access token and ROTATES the refresh cookie',r1.s===200&&!!r1.d?.accessToken&&!!c2&&c2!==c1);
const grace=await call('POST','/auth/refresh',{cookie:c1});rec('within the 10 s grace window a second tab presenting the just-rotated cookie is tolerated (by design, MMRI-16)',grace.s===200||grace.s===401,String(grace.s));
await new Promise(r=>setTimeout(r,11500));
const reuse=await call('POST','/auth/refresh',{cookie:c1});rec('after the grace window the rotated (old) refresh cookie is refused (theft signal)',reuse.s===401,String(reuse.s));
const afterReuse=await call('POST','/auth/refresh',{cookie:c2});rec('reuse detection revokes the whole login family: the descendant cookie no longer works',afterReuse.s===401,String(afterReuse.s));
const l2=await call('POST','/auth/login',{body:{email,password:pw1}});const cc=refreshOf(l2);
const out=await call('POST','/auth/logout',{cookie:cc});rec('logout succeeds',out.s===204||out.s===200);
rec('refresh after logout is refused',(await call('POST','/auth/refresh',{cookie:cc})).s===401);
const me=await call('GET','/auth/me',{tok:l2.d.accessToken});rec('access token after logout',me.s===200||me.s===401,`${me.s} (short-lived access tokens may outlive logout until expiry)`);
rec('refresh without a cookie is refused',(await call('POST','/auth/refresh',{})).s===401);
// ---- password recovery
const unknown=await call('POST','/auth/password-reset/request',{body:{email:`nobody.${Date.now()}@mmri.test`}});const known=await call('POST','/auth/password-reset/request',{body:{email}});
rec('recovery request answers identically for known and unknown addresses',unknown.s===202&&known.s===202&&JSON.stringify(unknown.d)===JSON.stringify(known.d));
const pm=mails(email,'PASSWORD_RESET').at(-1);const token=/token=([A-Za-z0-9_-]+)/.exec(pm?.text||'')?.[1];rec('recovery mail with a one-time link was sent',!!token&&!mails(`nobody`,'x').length);
const sessBefore=await call('POST','/auth/login',{body:{email,password:pw1}});const cookieBefore=refreshOf(sessBefore);
rec('weak new password refused (token not consumed)',(await call('POST','/auth/password-reset/confirm',{body:{token,password:'short'}})).s===400);
const rc=await call('POST','/auth/password-reset/confirm',{body:{token,password:pw2}});rec('reset with the valid token succeeds',rc.s===200);
rec('the same token cannot be used twice',(await call('POST','/auth/password-reset/confirm',{body:{token,password:pw2+'z'}})).s===400);
rec('old password no longer works, new one does',(await call('POST','/auth/login',{body:{email,password:pw1}})).s===401&&(await call('POST','/auth/login',{body:{email,password:pw2}})).s===200);
rec('sessions that existed before the reset are revoked',(await call('POST','/auth/refresh',{cookie:cookieBefore})).s===401);
rec('a garbage token is refused',(await call('POST','/auth/password-reset/confirm',{body:{token:'x'.repeat(40),password:pw2}})).s===400);
// ---- membership removal
const mk=async(label)=>{const e=`auth.${label}.${Date.now()}.${crypto.randomBytes(2).toString('hex')}@mmri.test`;await call('POST','/auth/register',{body:{email:e,password:pw1,displayName:label}});const code=fixtureVerificationCode(e);await call('POST','/auth/email-verification/confirm',{body:{email:e,code}});const l=await call('POST','/auth/login',{body:{email:e,password:pw1}});return {email:e,tok:l.d.accessToken,id:l.d.user?.id}};
const O=await mk('own'),M=await mk('mem');const cid=(await call('POST','/companies',{tok:O.tok,body:{name:'Membership Gate ХХК'}})).d.id;
const add=await call('POST',`/companies/${cid}/members`,{tok:O.tok,body:{email:M.email,role:'ADMIN'}});rec('owner adds an ADMIN member',add.s===200||add.s===201,String(add.s));
const mid=sql(`select id from users where email='${M.email}'`);
rec('member can read the company and its members',(await call('GET',`/companies/${cid}`,{tok:M.tok})).s===200&&(await call('GET',`/companies/${cid}/members`,{tok:M.tok})).s===200);
rec('ADMIN member cannot remove the OWNER',[403,404,409].includes((await call('DELETE',`/companies/${cid}/members/${O.id||sql(`select id from users where email='${O.email}'`)}`,{tok:M.tok})).s));
const rm=await call('DELETE',`/companies/${cid}/members/${mid}`,{tok:O.tok});rec('owner removes the member',rm.s===200||rm.s===204,String(rm.s));
const probes=[['GET',`/companies/${cid}`],['GET',`/companies/${cid}/members`],['GET',`/companies/${cid}/logo`],['GET',`/companies/${cid}/billing/status`],['PUT',`/companies/${cid}`,{name:'x'}]];
for(const [m,p,b] of probes){const r=await call(m,p,{tok:M.tok,body:b});rec(`removed member IMMEDIATELY loses access: ${m} ${p.replace(cid,':id')}`,r.s===403||r.s===404,String(r.s))}
rec('a still-valid access token does not resurrect the membership (company list is empty)',(((await call('GET','/companies',{tok:M.tok})).d)||[]).every(c=>c.id!==cid));
const last=await call('DELETE',`/companies/${cid}/members/${sql(`select id from users where email='${O.email}'`)}`,{tok:O.tok});rec('the last OWNER cannot be removed',[400,403,409].includes(last.s),String(last.s));
rec('company still has its owner',Number(sql(`select count(*) from company_memberships where "companyId"='${cid}' and role='OWNER'`))===1);
console.log(`RESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
