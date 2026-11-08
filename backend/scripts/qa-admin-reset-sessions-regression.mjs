/* H06: a successful password reset must revoke the administrator's existing sessions in the BACKEND, while MFA protection stays in force.
   Real API, isolated test database (refuses otherwise), mock mail. Needs the API with MMRI_MOCK_MAIL_DIR shared with this process.
   Usage: PGDATABASE=<test db> DATABASE_URL=<test db url> MMRI_MOCK_MAIL_DIR=<dir> node scripts/qa-admin-reset-sessions-regression.mjs */
import crypto from 'crypto';import fs from 'fs';import path from 'path';
import {call,sql,totp,provision,adminLogin} from './lib/admin-qa.mjs';
if(!process.env.PGDATABASE||process.env.PGDATABASE==='mmri'||!/codexfix|test/.test(process.env.PGDATABASE)){console.error('Refusing to run: PGDATABASE must name an isolated test database');process.exit(2)}
let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cc=(m,p,tok,body)=>call(m,p,{tok,body});
const other=provision('SUPER_ADMIN','pwr-other'),S=(await adminLogin(other)).d.token;
const adm=provision('REPORT_REVIEWER','pwr');
const AT=(await adminLogin(adm)).d.token;const before=await cc('GET','/admin/reviews',AT);
const AT2=(await adminLogin(adm,1)).d?.token;const BOX=path.join(process.env.MMRI_MOCK_MAIL_DIR,'outbox.jsonl');
await cc('POST','/auth/password-reset/request',undefined,{email:adm.email});await sleep(500);const mails=fs.readFileSync(BOX,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(m=>m.to===adm.email);const tok=(mails[mails.length-1]?.text.match(/token=([A-Za-z0-9_-]{43})/)||[])[1];
const newPw=crypto.randomBytes(12).toString('base64url')+'Zz9!x';const conf=await cc('POST','/auth/password-reset/confirm',undefined,{token:tok,password:newPw});
const old1=await cc('GET','/admin/reviews',AT);const old2=AT2?await cc('GET','/admin/reviews',AT2):{s:401};const supStill=await cc('GET','/admin/reviews',S);
rec('H06-1 after a successful password reset every existing session of that administrator is rejected by the backend (401)',before.s===200&&conf.s<300&&old1.s===401&&old2.s===401,`before ${before.s}, reset ${conf.s}, old tokens ${old1.s}/${old2.s}`);
rec('H06-2 other administrators are unaffected',supStill.s===200);
const oldPwLogin=await adminLogin(adm,0);
// TOTP codes are single use (replay protection). Wait until the current 30 s step is newer than the last step this account used, then sign in with the new password.
const lastStep=()=>Number(sql(`select a."mfaLastStep" from admin_accounts a join users u on u.id=a."userId" where u.email='${adm.email}'`));
while(Math.floor(Date.now()/30000)<=lastStep())await sleep(2000);
const newLogin=await adminLogin({...adm,password:newPw},0);
rec('H06-3 MFA is preserved: the old password no longer works; the new password still requires and accepts the TOTP code',oldPwLogin.s===401&&newLogin.s===200&&!!newLogin.d.token,`old ${oldPwLogin.s} new ${newLogin.s}`);
const noTotp=await call('POST','/admin/auth/login',{body:{email:adm.email,password:newPw}});rec('H06-4 the new password alone (without TOTP) cannot sign in',noTotp.s===401);
rec('H06-5 the revocation is stored server-side (admin_sessions.revokedAt set), not only dropped in the browser',Number(sql(`select count(*) from admin_sessions s join admin_accounts a on a.id=s."adminId" join users u on u.id=a."userId" where u.email='${adm.email}' and s."revokedAt" is not null`))>=2);

sql(`update admin_accounts set status='DISABLED',"disabledAt"=now() where "userId" in (select id from users where email like 'admin.qa.%')`);sql(`update admin_sessions set "revokedAt"=now() where "adminId" in (select a.id from admin_accounts a join users u on u.id=a."userId" where u.email like 'admin.qa.%')`);
console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
