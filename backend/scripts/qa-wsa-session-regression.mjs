/* WS-A regression: MMRI-16 (concurrent refresh), MMRI-19 (logout kills access token).
   Live test. Env: API (default http://127.0.0.1:4111), PGLETTER (default a). Uses the synthetic QA login in the private clone.
   Usage: node scripts/qa-wsa-session-regression.mjs */
import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const H='/home/kirby/Downloads/MMRI_FUNCTIONAL_REPAIR/harness';
const B=(process.env.API||'http://127.0.0.1:4111')+'/api/v1';const ORIGIN=new URL(process.env.API||'http://127.0.0.1:4111');ORIGIN.port=String(Number(ORIGIN.port)+100);
const creds=Object.fromEntries(fs.readFileSync(H+'/creds-qa.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const sql=q=>execFileSync(H+'/psql.sh',[process.env.PGLETTER||'a','-At','-c',q],{encoding:'utf8'}).trim();
let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function call(method,path,{token,cookie,body}={}){const h={origin:ORIGIN.origin,'content-type':'application/json'};if(token)h.authorization='Bearer '+token;if(cookie)h.cookie=cookie;
  const r=await fetch(B+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});let j=null;try{j=await r.json()}catch{}
  const sc=r.headers.get('set-cookie');return {status:r.status,j,cookie:sc?sc.split(';')[0]:null,token:j?.data?.accessToken}}
const login=()=>call('POST','/auth/login',{body:{email:creds.email,password:creds.password}});
const refresh=cookie=>call('POST','/auth/refresh',{cookie});
const me=token=>call('GET','/auth/me',{token});

// ---- MMRI-16: two tabs refresh with the same cookie at once
{const l=await login();rec('setup: login',l.status===200&&!!l.cookie);
 const [a,b]=await Promise.all([refresh(l.cookie),refresh(l.cookie)]);
 rec('16a: two simultaneous refreshes with the same cookie both succeed',a.status===200&&b.status===200,`statuses ${a.status}/${b.status}`);
 const latest=[a,b].find(x=>x.cookie)?.cookie;
 const follow=latest?await refresh(latest):{status:0};
 rec('16b: the session is still alive afterwards (newest cookie refreshes)',follow.status===200,`status ${follow.status}`);
 const m=await me(a.token||b.token);rec('16c: access token from the concurrent refresh still works',m.status===200,`status ${m.status}`);
 // sequential reuse of the just-rotated cookie, inside the grace window (second tab arrives late)
 const l2=await login();const r1=await refresh(l2.cookie);const r2=await refresh(l2.cookie);
 rec('16d: reuse of a just-rotated cookie within the grace window is tolerated',r1.status===200&&r2.status===200,`statuses ${r1.status}/${r2.status}`);
 const r3=await refresh(r1.cookie);rec('16e: and the family is not revoked by it',r3.status===200,`status ${r3.status}`);
 // ---- replay detection outside the grace window must still work
 const l3=await login();const n1=await refresh(l3.cookie);
 sql(`update refresh_sessions set "rotatedAt"="rotatedAt"-interval '120 seconds' where "rotatedAt" is not null and "userId"=(select id from users where email='${creds.email}')`);
 const replay=await refresh(l3.cookie);
 rec('16f: replay of a rotated cookie after the grace window is rejected (401)',replay.status===401,`status ${replay.status}`);
 const afterFam=await refresh(n1.cookie);rec('16g: replay revokes the whole token family',afterFam.status===401,`status ${afterFam.status}`);
 const oldAcc=await me(n1.token);rec('16h: replay invalidates outstanding access tokens (tokenVersion bump)',oldAcc.status===401,`status ${oldAcc.status}`);
}
// ---- MMRI-19: logout invalidates the access token, other sessions survive
{const s1=await login();const s2=await login();
 rec('19a: both tokens work before logout',(await me(s1.token)).status===200&&(await me(s2.token)).status===200);
 const lo=await call('POST','/auth/logout',{cookie:s1.cookie});rec('19b: logout returns 204',lo.status===204,`status ${lo.status}`);
 const dead=await me(s1.token);rec('19c: logged-out access token is rejected',dead.status===401,`status ${dead.status}`);
 const rf=await refresh(s1.cookie);rec('19d: logged-out refresh cookie is rejected',rf.status===401,`status ${rf.status}`);
 const other=await me(s2.token);rec('19e: another device session keeps working',other.status===200,`status ${other.status}`);
 const otherRf=await refresh(s2.cookie);rec('19f: other device can still refresh',otherRf.status===200,`status ${otherRf.status}`);
 // access token minted by refresh is also bound to the session
 const s3=await login();const r=await refresh(s3.cookie);
 await call('POST','/auth/logout',{cookie:r.cookie});
 const dead2=await me(r.token);rec('19g: access token minted by refresh dies on logout too',dead2.status===401,`status ${dead2.status}`);
 // logout using a stale (already rotated) cookie must still end the live session
 const s4=await login();const r4=await refresh(s4.cookie);
 await call('POST','/auth/logout',{cookie:s4.cookie});
 const dead3=await me(r4.token);rec('19h: logout with a stale cookie still ends the live session',dead3.status===401,`status ${dead3.status}`);
 // a stale cookie inside the grace window must not resurrect a session that was logged out afterwards
 const s5=await login();const r5=await refresh(s5.cookie);await call('POST','/auth/logout',{cookie:r5.cookie});
 const resurrect=await refresh(s5.cookie);rec('19i: stale cookie within grace cannot resurrect a logged-out session',resurrect.status===401,`status ${resurrect.status}`);
}
console.log(fail?`\n${fail} FAILED`:'\nALL PASSED');process.exit(fail?1:0);
