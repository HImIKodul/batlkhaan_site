/* Live regression for password recovery. Needs the API on :4000 (development, MMRI_MAIL_PROVIDER=mock) and the local Postgres container.
   Reads reset e-mails from the mock mailbox file. No real e-mail is sent. Usage: node scripts/qa-password-recovery-regression.mjs */
import crypto from 'crypto';import fs from 'fs';import path from 'path';import {execFileSync} from 'child_process';
const B=process.env.API||'http://localhost:4000';const BOX=process.env.MMRI_MOCK_MAIL_DIR||new URL('../.mock-mailbox',import.meta.url).pathname;const OUT=path.join(BOX,'outbox.jsonl');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const sql=q=>execFileSync('docker',['exec','mmri-v3-local-postgres-1','psql','-U','mmri','-d',process.env.PGDATABASE||'mmri','-At','-c',q],{encoding:'utf8'}).trim();
const call=async(m,p,b,h={})=>{const t=Date.now();const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json',...h},body:b===undefined?undefined:JSON.stringify(b)});let j=null;try{j=await r.json()}catch{}return {s:r.status,j,ms:Date.now()-t,setCookie:r.headers.get('set-cookie')}};
const mails=()=>fs.existsSync(OUT)?fs.readFileSync(OUT,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];
const mailsTo=e=>mails().filter(m=>m.to===e);const tokenOf=m=>(m.text.match(/token=([A-Za-z0-9_-]{43})/)||[])[1];
const pw1=crypto.randomBytes(12).toString('base64url')+'Aa1!',pw2=crypto.randomBytes(12).toString('base64url')+'Bb2!';
const email=`pwr.${Date.now()}@mmri.test`;
const reg=await call('POST','/api/v1/auth/register',{email,password:pw1,displayName:'PWR'});const access1=reg.j.data.accessToken;
const refreshCookie=(reg.setCookie||'').split(';')[0];
// 1 enumeration protection
const known=await call('POST','/api/v1/auth/password-reset/request',{email});const unknown=await call('POST','/api/v1/auth/password-reset/request',{email:`nobody.${Date.now()}@mmri.test`});const bad=await call('POST','/api/v1/auth/password-reset/request',{email:'not-an-email'});
rec('PWR-1 request answers 202 with identical body for known, unknown and malformed addresses',known.s===202&&unknown.s===202&&bad.s===202&&JSON.stringify(known.j)===JSON.stringify(unknown.j)&&JSON.stringify(known.j)===JSON.stringify(bad.j),`${known.s}/${unknown.s}/${bad.s}`);
rec('PWR-2 response time does not reveal the account (both take at least the fixed minimum)',known.ms>=330&&unknown.ms>=330,`${known.ms} ms vs ${unknown.ms} ms`);
await sleep(300);const m1=mailsTo(email);rec('PWR-3 exactly one (mock) e-mail for the real account, none for the unknown address',m1.length===1&&mails().every(m=>m.to!==`nobody@mmri.test`),`mails to account ${m1.length}`);
const tok1=m1[0]&&tokenOf(m1[0]);rec('PWR-4 e-mail is Mongolian and carries a 43-character one-time link with a stated lifetime',!!tok1&&/Нууц үг|нууц үг/.test(m1[0].subject)&&/30 минут/.test(m1[0].text)&&/#\/reset-password\?token=/.test(m1[0].text),m1[0]&&m1[0].subject);
// 2 secure storage
const rows=sql(`select length(t."tokenHash"),t."tokenHash" like '%${tok1}%',((t."expiresAt"-t."createdAt") between interval '29 minutes 59 seconds' and interval '30 minutes 1 second') from password_reset_tokens t join users u on u.id=t."userId" where u.email='${email}'`);
rec('PWR-5 only a 64-hex hash is stored (never the token) with a 30 minute lifetime',/^64\|f\|t$/.test(rows),rows);
// 3 invalid inputs do not consume the token
const garbage=await call('POST','/api/v1/auth/password-reset/confirm',{token:'x'.repeat(43),password:pw2});const short=await call('POST','/api/v1/auth/password-reset/confirm',{token:tok1,password:'short'});const notoken=await call('POST','/api/v1/auth/password-reset/confirm',{password:pw2});
rec('PWR-6 garbage or missing token gives 400 INVALID_RESET_TOKEN (Mongolian), weak password gives 400 WEAK_PASSWORD',garbage.s===400&&notoken.s===400&&garbage.j.error.code==='INVALID_RESET_TOKEN'&&short.s===400&&short.j.error.code==='WEAK_PASSWORD'&&/[А-Яа-я]/.test(garbage.j.error.message),`${garbage.s}/${notoken.s}/${short.s}`);
// 4 a newer request voids the older token
await call('POST','/api/v1/auth/password-reset/request',{email});await sleep(300);const m2=mailsTo(email);const tok2=tokenOf(m2[m2.length-1]);
const stale=await call('POST','/api/v1/auth/password-reset/confirm',{token:tok1,password:pw2});
rec('PWR-7 a second request issues a new token and the older one stops working',m2.length===2&&tok2&&tok2!==tok1&&stale.s===400,`mails ${m2.length}, old token ${stale.s}`);
// 5 expiry
sql(`update password_reset_tokens set "expiresAt"=now()-interval '1 minute' where "tokenHash" is not null and "userId"=(select id from users where email='${email}') and "usedAt" is null`);
const expired=await call('POST','/api/v1/auth/password-reset/confirm',{token:tok2,password:pw2});rec('PWR-8 an expired token is refused',expired.s===400&&expired.j.error.code==='INVALID_RESET_TOKEN',String(expired.s));
// 6 parallel confirmation: exactly one wins
await call('POST','/api/v1/auth/password-reset/request',{email});await sleep(300);const m3=mailsTo(email);const tok3=tokenOf(m3[m3.length-1]);
const race=await Promise.all(Array.from({length:5},()=>call('POST','/api/v1/auth/password-reset/confirm',{token:tok3,password:pw2})));
rec('PWR-9 five parallel confirmations of one token: exactly one succeeds',race.filter(r=>r.s===200).length===1&&race.every(r=>[200,400].includes(r.s)),race.map(r=>r.s).join(','));
// 7 effects of a successful reset
const oldLogin=await call('POST','/api/v1/auth/login',{email,password:pw1});const newLogin=await call('POST','/api/v1/auth/login',{email,password:pw2});
rec('PWR-10 old password no longer works, new password works',oldLogin.s===401&&newLogin.s===200,`${oldLogin.s}/${newLogin.s}`);
const meOld=await call('GET','/api/v1/auth/me',undefined,{authorization:'Bearer '+access1});rec('PWR-11 access tokens issued before the reset are invalidated',meOld.s===401,String(meOld.s));
const refreshOld=await call('POST','/api/v1/auth/refresh',undefined,{cookie:refreshCookie,origin:'http://localhost:5173'});rec('PWR-12 refresh sessions issued before the reset are revoked',refreshOld.s===401,String(refreshOld.s));
const reuse=await call('POST','/api/v1/auth/password-reset/confirm',{token:tok3,password:crypto.randomBytes(12).toString('base64url')+'Cc3!'});const stillNew=await call('POST','/api/v1/auth/login',{email,password:pw2});
rec('PWR-13 a used token cannot be used again and does not change the password',reuse.s===400&&stillNew.s===200,`${reuse.s}/${stillNew.s}`);
await sleep(200);rec('PWR-14 a "password changed" notice is sent after the reset',mailsTo(email).some(m=>m.kind==='PASSWORD_CHANGED'&&/солигдлоо/.test(m.subject)));
// 8 hourly cap and disabled accounts
const email2=`pwr2.${Date.now()}@mmri.test`;await call('POST','/api/v1/auth/register',{email:email2,password:pw1});for(let i=0;i<5;i++){await call('POST','/api/v1/auth/password-reset/request',{email:email2})}await sleep(400);
rec('PWR-15 at most 3 reset e-mails per account per hour (5 requests, 3 mails)',mailsTo(email2).length===3,`mails ${mailsTo(email2).length}`);
const email3=`pwr3.${Date.now()}@mmri.test`;await call('POST','/api/v1/auth/register',{email:email3,password:pw1});sql(`update users set status='DISABLED' where email='${email3}'`);const dis=await call('POST','/api/v1/auth/password-reset/request',{email:email3});await sleep(300);
rec('PWR-16 a disabled account gets the same 202 but no e-mail',dis.s===202&&mailsTo(email3).length===0);
// 9 rate limiting on the endpoint itself
const limited=[];for(let i=0;i<14;i++){limited.push((await call('POST','/api/v1/auth/password-reset/request',{email:`flood@mmri.test`})).s)}
rec('PWR-17 repeated requests for one address are rate limited (429)',limited.includes(429),limited.join(','));
console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
