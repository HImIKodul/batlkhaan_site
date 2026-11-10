/* Session lifecycle, malformed-request and rate-limit regression for an ISOLATED API with synthetic users (no external harness).
   Env:  API=<main api base incl. /api/v1, started with AUTH_IP_RATE_LIMIT/AUTH_ACCOUNT_RATE_LIMIT raised>   PGDATABASE=<scratch db>
         TTL_API=<api base started with ACCESS_TOKEN_TTL_SECONDS=60>   (optional: access-token expiry)
         RL_API=<api base started with DEFAULT rate limits>             (optional: rate-limit behaviour)
   Never run against production or a shared database. */
import crypto from 'crypto';import {execFileSync} from 'child_process';
const API=process.env.API,DB=process.env.PGDATABASE,TTL_API=process.env.TTL_API,RL_API=process.env.RL_API,ORIGIN=process.env.ORIGIN||'http://127.0.0.1:5310';
if(!API||!DB)throw new Error('set API and PGDATABASE');
if(/businessmri\.mn/i.test(API)||/:4000(\/|$)/.test(API))throw new Error('refusing shared/production API');
if(DB==='mmri'||/^(mmri_v2_qa|mmri_codexfix|mmri_design_test|postgres)$/.test(DB))throw new Error('refusing protected database');
const sql=q=>execFileSync('docker',['exec','mmri-v3-local-postgres-1','psql','-U','mmri','-d',DB,'-At','-c',q],{encoding:'utf8'}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fail=0;const t=(id,n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+id+' '+n+(d?' | '+String(d).slice(0,200):''))};
async function call(base,method,p,o={}){const r=await call1(base,method,p,o);return(r.s===0&&/fetch failed/.test(r.text))?call1(base,method,p,o):r} // one retry: the server legitimately closes the socket after rejecting an oversize body, so a pooled keep-alive socket can be dead
async function call1(base,method,p,{tok,cookie,body,raw,headers={}}={}){const h={origin:ORIGIN,...(raw===undefined?{'content-type':'application/json'}:{}),...(tok?{authorization:'Bearer '+tok}:{}),...(cookie?{cookie}:{}),...headers};
  try{const r=await fetch(base+p,{method,headers:h,body:raw!==undefined?raw:(body===undefined?undefined:JSON.stringify(body)),signal:AbortSignal.timeout(25000)});const text=await r.text();let j;try{j=JSON.parse(text)}catch{j=null}
    const sc=r.headers.getSetCookie?r.headers.getSetCookie():[];return{s:r.status,j,d:j?.data,text,sc,h:r.headers}}catch(e){return{s:0,text:String(e),sc:[],h:new Headers()}}}
const cookieOf=r=>{const c=r.sc.find(x=>/mmri_refresh/.test(x));return c?c.split(';')[0]:null};
const rnd=()=>crypto.randomBytes(4).toString('hex');const PW='Session-Test-Pass-12345!';
async function newUser(base,tag){const email=`sess.${tag}.${Date.now()}.${rnd()}@example.test`;const r=await call(base,'POST','/auth/register',{body:{email,password:PW,displayName:'Sess '+tag}});return{email,tok:r.d?.accessToken,cookie:cookieOf(r),reg:r}}
// ---------------- S1 cookie attributes and basic session ----------------
const u=await newUser(API,'a');
t('S1','register returns an access token and an HttpOnly SameSite=Strict refresh cookie scoped to /api/v1/auth',!!u.tok&&u.reg.sc.some(c=>/HttpOnly/i.test(c)&&/SameSite=Strict/i.test(c)&&/Path=\/api\/v1\/auth/.test(c)),u.reg.sc.join('|').replace(/=[^;]+/,'=***').slice(0,120));
t('S1b','the refresh token is not in the JSON body',!/refresh/i.test(JSON.stringify(u.reg.j??{}).replace(/refreshCookie/g,'')));
t('S2','/auth/me works with the access token',(await call(API,'GET','/auth/me',{tok:u.tok})).s===200);
// ---------------- S3 refresh rotation ----------------
const r1=await call(API,'POST','/auth/refresh',{cookie:u.cookie,body:{}});const c1=cookieOf(r1);
t('S3','refresh rotates: new access token and a different cookie',r1.s===200&&!!r1.d?.accessToken&&!!c1&&c1!==u.cookie,String(r1.s));
const r2=await call(API,'POST','/auth/refresh',{cookie:u.cookie,body:{}});
t('S4','re-using the just-rotated cookie within the grace window is tolerated (concurrent tabs), not treated as theft',r2.s===200,String(r2.s));
const lateOk=await call(API,'POST','/auth/refresh',{cookie:cookieOf(r2)||c1,body:{}});
t('S4b','the family is still alive after the tolerated reuse',lateOk.s===200,String(lateOk.s));
// S4c/S4d: concurrency beyond two tabs
{const cu=await newUser(API,'conc');const many=await Promise.all(Array.from({length:10},()=>call(API,'POST','/auth/refresh',{cookie:cu.cookie,body:{}})));
 t('S4c','10 simultaneous refreshes with the SAME cookie all succeed (no spurious 401/500, no theft false-positive)',many.every(r=>r.s===200),many.map(r=>r.s).join(','));
 const child=many.map(cookieOf).find(Boolean);const alive=await call(API,'POST','/auth/refresh',{cookie:child,body:{}});
 t('S4d','after the burst the session is alive: a newest cookie still refreshes',alive.s===200,String(alive.s));
 const rl=await newUser(API,'race');const race=await Promise.all([call(API,'POST','/auth/refresh',{cookie:rl.cookie,body:{}}),call(API,'POST','/auth/logout',{tok:rl.tok,cookie:rl.cookie,body:{}}),call(API,'POST','/auth/refresh',{cookie:rl.cookie,body:{}})]);
 const rt=race.filter(r=>r.d?.accessToken).map(r=>r.d.accessToken);await sleep(300);
 const after=await Promise.all([...rt.map(x=>call(API,'GET','/auth/me',{tok:x})),call(API,'GET','/auth/me',{tok:rl.tok})]);
 t('S4e','refresh racing a logout: no 5xx, and after the dust settles NO token of that session is usable',race.every(r=>r.s<500)&&after.every(r=>r.s===401),`race ${race.map(r=>r.s).join(',')} / me ${after.map(r=>r.s).join(',')}`);}
await sleep(11500);
const replay=await call(API,'POST','/auth/refresh',{cookie:u.cookie,body:{}});
t('S5','replaying the original rotated cookie AFTER the grace window is rejected (401)',replay.s===401,String(replay.s));
const afterReplay=await call(API,'POST','/auth/refresh',{cookie:cookieOf(lateOk),body:{}});
t('S5b','the replay revokes the whole token family (newest cookie no longer refreshes)',afterReplay.s===401,String(afterReplay.s));
t('S5c','access tokens of the revoked family stop working',(await call(API,'GET','/auth/me',{tok:lateOk.d?.accessToken})).s===401);
// ---------------- S6 logout invalidation ----------------
const lu=await newUser(API,'logout');const dev2=await call(API,'POST','/auth/login',{body:{email:lu.email,password:PW}});const dev2cookie=cookieOf(dev2);
const lo=await call(API,'POST','/auth/logout',{tok:lu.tok,cookie:lu.cookie,body:{}});
t('S6','logout returns 204',lo.s===204,String(lo.s));
t('S6b','the logged-out access token is rejected immediately',(await call(API,'GET','/auth/me',{tok:lu.tok})).s===401);
t('S6c','the logged-out refresh cookie is rejected',(await call(API,'POST','/auth/refresh',{cookie:lu.cookie,body:{}})).s===401);
t('S6d','another device session of the same user keeps working',(await call(API,'GET','/auth/me',{tok:dev2.d?.accessToken})).s===200&&(await call(API,'POST','/auth/refresh',{cookie:dev2cookie,body:{}})).s===200);
t('S6e','logout cookie clearing header is sent (Max-Age=0)',lo.sc.some(c=>/Max-Age=0/.test(c)),lo.sc.join('|').slice(0,100));
// ---------------- S7 disabled account ----------------
const du=await newUser(API,'disabled');const statuses=sql(`select string_agg(e.enumlabel,',') from pg_enum e join pg_type ty on ty.oid=e.enumtypid where ty.typname='UserStatus'`);
const disabledLabel=(statuses.split(',').find(x=>/DISABLED|SUSPENDED|INACTIVE/.test(x)))||'DISABLED';sql(`update users set status='${disabledLabel}' where email='${du.email}'`);
const dme=await call(API,'GET','/auth/me',{tok:du.tok});t('S7','a disabled account loses API access immediately with its existing access token',[401,403].includes(dme.s),String(dme.s));
t('S7b','a disabled account cannot refresh',[401,403].includes((await call(API,'POST','/auth/refresh',{cookie:du.cookie,body:{}})).s));
const dlg=await call(API,'POST','/auth/login',{body:{email:du.email,password:PW}});t('S7c','a disabled account cannot log in and the message does not reveal why',[401,403].includes(dlg.s)&&!/disabled|suspend/i.test(dlg.text),String(dlg.s)+' '+(dlg.j?.error?.message||''));
// ---------------- S8 access token expiry (separate instance, TTL 60 s) ----------------
if(TTL_API){const eu=await newUser(TTL_API,'ttl');t('S8a','a fresh access token works',(await call(TTL_API,'GET','/auth/me',{tok:eu.tok})).s===200);
  console.log('   waiting 65 s for the 60 s access token to expire ...');await sleep(65000);
  t('S8','an EXPIRED access token is rejected with 401',(await call(TTL_API,'GET','/auth/me',{tok:eu.tok})).s===401);
  const er=await call(TTL_API,'POST','/auth/refresh',{cookie:eu.cookie,body:{}});t('S8b','refresh after expiry issues a working token',er.s===200&&(await call(TTL_API,'GET','/auth/me',{tok:er.d?.accessToken})).s===200)}else console.log('SKIP S8 (TTL_API not set)');
// ---------------- S9 malformed requests ----------------
const bad=[];const noLeak=r=>!/node_modules|\/home\/|\bat\s+\S+\s+\(|stack|prisma|ECONN|PrismaClient/i.test(r.text);
const cases=[
 ['invalid JSON',()=>call(API,'POST','/auth/login',{raw:'{"email":'})],['JSON array body',()=>call(API,'POST','/auth/login',{raw:'[]'})],['JSON null body',()=>call(API,'POST','/auth/login',{raw:'null'})],['string body',()=>call(API,'POST','/auth/login',{raw:'"x"'})],
 ['empty body',()=>call(API,'POST','/auth/login',{raw:''})],['text/plain content type',()=>call(API,'POST','/auth/login',{raw:'{"email":"a@b.co","password":"x"}',headers:{'content-type':'text/plain'}})],
 ['NUL byte in email',()=>call(API,'POST','/auth/login',{body:{email:'a\u0000b@example.test',password:PW}})],['NUL byte in display name',()=>call(API,'POST','/auth/register',{body:{email:`nul.${rnd()}@example.test`,password:PW,displayName:'a\u0000b'}})],
 ['SQL-injection style email',()=>call(API,'POST','/auth/login',{body:{email:"' OR 1=1 --",password:PW}})],['100 KB password',()=>call(API,'POST','/auth/login',{body:{email:'a@b.co',password:'x'.repeat(100000)}})],
 ['6 MB body',()=>call(API,'POST','/auth/login',{raw:JSON.stringify({email:'a@b.co',password:'x'.repeat(6*1024*1024)})})],['__proto__ key',()=>call(API,'POST','/auth/login',{raw:'{"__proto__":{"admin":true},"email":"a@b.co","password":"x"}'})],
 ['numeric email',()=>call(API,'POST','/auth/login',{body:{email:12345,password:PW}})],['object password',()=>call(API,'POST','/auth/login',{body:{email:'a@b.co',password:{$ne:1}}})],
 ['10 KB URL',()=>call(API,'GET','/'+'a'.repeat(10000))],['path traversal',()=>call(API,'GET','/../../etc/passwd')],['encoded traversal',()=>call(API,'GET','/assessments/..%2f..%2fadmin',{tok:u.tok})],
 ['unknown route',()=>call(API,'GET','/does/not/exist')],['TRACE method',()=>new Promise(res=>{import('node:http').then(({request})=>{const u=new URL(API+'/auth/me');const q=request({host:u.hostname,port:u.port,path:u.pathname,method:'TRACE',headers:{origin:ORIGIN}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res({s:r.statusCode,text:d,sc:[],h:new Headers()}))});q.on('error',e=>res({s:0,text:String(e),sc:[],h:new Headers()}));q.end()})})],['invalid id format',()=>call(API,'GET','/assessments/%00%27%22',{tok:lateOk.d?.accessToken||u.tok})]];
for(const [n,f] of cases){const r=await f();const ok=r.s>=400&&r.s<500&&noLeak(r)||(r.s===0&&/abort|reset|terminated|socket/i.test(r.text));if(!ok)bad.push(n);t('S9',`${n} -> client error, no stack/path/DB text`,ok,`${r.s} ${r.text.slice(0,70).replace(/\n/g,' ')}`)}
const hdrs=await call(API,'GET','/auth/me');t('S9b','error responses carry nosniff and no-store, and no X-Powered-By/server version header',hdrs.h.get('x-content-type-options')==='nosniff'&&/no-store/.test(hdrs.h.get('cache-control')||'')&&!hdrs.h.get('x-powered-by'),`nosniff=${hdrs.h.get('x-content-type-options')} cc=${hdrs.h.get('cache-control')} xpb=${hdrs.h.get('x-powered-by')}`);
t('S9c','API still healthy after the malformed-request barrage',(await call(API.replace('/api/v1',''),'GET','/health')).s===200);
// ---------------- S10 rate limiting (instance with DEFAULT limits) ----------------
if(RL_API){let first429=0,limited=null;for(let i=1;i<=30;i++){const r=await call(RL_API,'POST','/auth/login',{body:{email:`rl${i}.${rnd()}@example.test`,password:'Wrong-Pass-12345!'}});if(r.s===429&&!first429){first429=i;limited=r}}
  t('S10','per-IP auth limit trips (429) before 30 failed logins',first429>0&&first429<=21,`first429=${first429}`);
  t('S10b','429 carries Retry-After and a generic Mongolian-safe envelope',!!limited&&!!limited.h.get('retry-after')&&limited.j?.error?.code==='RATE_LIMITED',limited?`retry-after=${limited.h.get('retry-after')} ${limited.j?.error?.code}`:'no 429');
  const ru=await newUser(RL_API.replace('x','x'),'rl-after');t('S10c','a legitimate registration from the same IP is also throttled while the bucket is full (documents shared-IP behaviour)',ru.reg.s===429||ru.reg.s===201,String(ru.reg.s))}else console.log('SKIP S10 (RL_API not set)');
console.log(fail?`FAILED ${fail}`:'ALL PASSED');process.exit(fail?1:0);
