import {registerVerifiedFixture} from './lib/verified-test-registration.mjs';
/* Authorization and tenant-isolation MATRIX generated from the real route table (136 routes: 88 customer + 48 admin).
   For every route it checks: (1) no credentials, (2) forged/garbage/wrong-secret/alg=none tokens, (3) a customer of ANOTHER company acting on company A's real ids,
   (4) a customer token on every admin route. PASS = 401/403/404; WARN = 400/409/422 (request validated before authorization, nothing changed);
   FAIL = any 2xx on a victim resource, any 5xx, or a data leak. Fixtures come from a SEEDED scratch database (npm run qa:seed) - never run against a shared DB.
   Usage:  API=http://127.0.0.1:4310/api/v1 PGDATABASE=<scratch db> node scripts/qa-authorization-matrix.mjs   (PGDATABASE must be a protected-name-free scratch DB) */
import fs from 'fs';import path from 'path';import crypto from 'crypto';import {execFileSync} from 'child_process';import {fileURLToPath} from 'url';
const API=process.env.API,DB=process.env.PGDATABASE,ORIGIN=process.env.ORIGIN||'http://127.0.0.1:5310';
if(!API||!DB)throw new Error('set API and PGDATABASE (scratch database)');
if(/businessmri\.mn/i.test(API)||/(localhost|127\.0\.0\.1):4000(\/|$)/.test(API))throw new Error('refusing shared/production API');
if(DB==='mmri'||/^(mmri_v2_qa|mmri_codexfix|mmri_design_test|postgres)$/.test(DB))throw new Error('refusing protected database '+DB);
const sql=q=>execFileSync('docker',['exec','mmri-v3-local-postgres-1','psql','-U','mmri','-d',DB,'-At','-c',q],{encoding:'utf8'}).trim();
const here=path.dirname(fileURLToPath(import.meta.url));const apiDir=path.join(here,'..','src','api');
// ---- route table from source ----
const routes=[];
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):e.name.endsWith('.ts')?[path.join(d,e.name)]:[]);
for(const f of walk(apiDir)){const t=fs.readFileSync(f,'utf8');
  for(const m of t.matchAll(/router\.add\(\s*"([A-Z]+)",\s*(?:A\s*\+\s*)?"([^"]+)"/g)){const isAdmin=/A\s*\+\s*"/.test(m[0]);routes.push({method:m[1],path:(isAdmin?'/api/v1/admin':'')+m[2]})}
  if(f.includes(path.join('admin','')))for(const m of t.matchAll(/\b(?:route|acct)\(\s*"([A-Z]+)",\s*"([^"]+)"/g))routes.push({method:m[1],path:'/api/v1/admin'+m[2]});}
const uniq=[...new Map(routes.map(r=>[r.method+' '+r.path,r])).values()].map(r=>({...r,path:r.path.replace(/^\/api\/v1/,'')}));
const admin=uniq.filter(r=>r.path.startsWith('/admin')),customer=uniq.filter(r=>!r.path.startsWith('/admin'));
// ---- routes that are PUBLIC by design (no 401 expected without credentials) ----
const PUBLIC=new Set(['GET /live','GET /health','GET /ready','GET /metrics','POST /auth/register','POST /auth/login','POST /auth/refresh','POST /auth/logout','POST /auth/password-reset/request','POST /auth/password-reset/confirm','POST /auth/email-verification/request','POST /auth/email-verification/confirm','GET /billing/qpay/callback/:invoiceId','POST /billing/qpay/callback/:invoiceId','GET /billing/plans','GET /methodology/current/profile-questions','GET /methodology/current/respondent-roles','POST /admin/auth/login','POST /admin/auth/reauth-public']);
// ---- fixtures ----
const one=q=>sql(q).split('\n')[0];
const companyA=one(`select c.id from companies c join assessments a on a."companyId"=c.id group by c.id order by count(*) desc limit 1`);
const F={companyId:companyA,
  assessmentId:one(`select a.id from assessments a left join report_reviews r on r."assessmentId"=a.id where a."companyId"='${companyA}' and a.status in ('COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED') order by (r.status='PUBLISHED') desc nulls last,a."createdAt" desc limit 1`),
  invoiceId:one(`select id from billing_invoices where "companyId"='${companyA}' order by "createdAt" desc limit 1`),
  userId:one(`select "userId" from company_memberships where "companyId"='${companyA}' limit 1`),
  milestoneId:(()=>{try{return one(`select id from action_plan_milestones limit 1`)}catch{return 'unknown-milestone'}})()||'unknown-milestone',
  studyId:'x-study',proposalId:'x-proposal',enrollmentId:'x-enrollment',id:'x-id',sid:'x-sid',n:'1'};
const fill=p=>p.replace(/:([A-Za-z]+)/g,(_,k)=>F[k]??'x');
const snapshot=()=>({c:sql(`select md5(string_agg(t::text,'|' order by id)) from companies t where id='${companyA}'`),a:sql(`select md5(string_agg(t::text,'|' order by id)) from assessments t where "companyId"='${companyA}'`),i:sql(`select md5(string_agg(t::text,'|' order by id)) from billing_invoices t where "companyId"='${companyA}'`),e:sql(`select md5(string_agg(t::text,'|' order by id)) from company_entitlements t where "companyId"='${companyA}'`),m:sql(`select md5(string_agg(t::text,'|' order by "userId"::text) ) from company_memberships t where "companyId"='${companyA}'`)});
if(!F.companyId||!F.assessmentId||!F.invoiceId||!F.userId||F.milestoneId==='unknown-milestone')throw new Error('Real victim company, completed assessment, invoice, owner and milestone fixtures are required; refusing empty-ID acceptance');
if(!process.env.OWNER_EMAIL||!process.env.OWNER_PASSWORD)throw new Error('Owner positive-control credentials required; refusing negative-only acceptance');
let before=snapshot();
async function req(method,p,{tok,body,h={}}={}){try{const r=await fetch(API+p,{method,headers:{'content-type':'application/json',origin:ORIGIN,...(tok?{authorization:tok}:{}),...h},body:['GET','HEAD'].includes(method)?undefined:JSON.stringify(body??{}),signal:AbortSignal.timeout(20000)});const t=await r.text();return{s:r.status,t}}catch(e){return{s:0,t:String(e)}}}
async function mkUser(tag){const email=`authz.${tag}.${Date.now()}.${crypto.randomBytes(2).toString('hex')}@example.test`;const pw='Authz-Test-Pass-12345!';const r=await registerVerifiedFixture(API,{email,password:pw,displayName:'Authz '+tag},{origin:ORIGIN});const j=await r.json();const tok=j.data.accessToken;const co=await req('POST','/companies',{tok:'Bearer '+tok,body:{name:'Authz '+tag+' ХХК'}});return{tok:'Bearer '+tok,email,companyId:(JSON.parse(co.t).data??JSON.parse(co.t)).id}}
let fail=0,warn=0,pass=0;const rows=[];
const rec=(kind,route,status,verdict,note='')=>{rows.push({kind,route,status,verdict,note});if(verdict==='FAIL'){fail++;console.log('FAIL',kind,route,status,note)}else if(verdict==='WARN'){warn++}else pass++};
const upgrade=(kind,route,note)=>{const r=rows.find(x=>x.kind===kind&&x.route===route&&x.verdict==='WARN');if(r){r.verdict='PASS';r.note=note;warn--;pass++}};
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const forged={ 'garbage':'Bearer not-a-token','no-bearer-scheme':'Basic abc','empty-bearer':'Bearer ','wrong-secret':(()=>{const h=b64({alg:'HS256',typ:'JWT'}),p=b64({sub:F.userId,exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)});return `Bearer ${h}.${p}.${crypto.createHmac('sha256','wrong-secret').update(h+'.'+p).digest('base64url')}`})(),'alg-none':(()=>{const h=b64({alg:'none',typ:'JWT'}),p=b64({sub:F.userId,exp:Math.floor(Date.now()/1000)+3600});return `Bearer ${h}.${p}.`})(),'expired-wrong-secret':(()=>{const h=b64({alg:'HS256',typ:'JWT'}),p=b64({sub:F.userId,exp:1,iat:0});return `Bearer ${h}.${p}.${crypto.createHmac('sha256','x').update(h+'.'+p).digest('base64url')}`})()};
const B=await mkUser('B');const C=await mkUser('C-nocompany-later');
console.log(`routes: ${uniq.length} (customer ${customer.length}, admin ${admin.length}); fixture company ${companyA.slice(0,8)}..., assessment ${F.assessmentId.slice(0,8)}..., invoice ${String(F.invoiceId).slice(0,8)}...`);
// (1)+(2) no credentials / forged credentials
for(const r of uniq){const key=`${r.method} ${r.path}`;const url=fill(r.path);const isPub=PUBLIC.has(key);
  const n=await req(r.method,url);
  if(isPub)rec('no-credentials',key,n.s,n.s>=500?'FAIL':'PASS','public by design');
  else rec('no-credentials',key,n.s,n.s===401?'PASS':(n.s===403||n.s===404?'WARN':'FAIL'),n.s===401?'':n.t.slice(0,80));
  if(!isPub&&!r.path.startsWith('/admin')){for(const [nm,tok] of Object.entries(forged)){const f=await req(r.method,url,{tok});rec('forged-'+nm,key,f.s,f.s===401?'PASS':(f.s===403||f.s===404?'WARN':'FAIL'),f.s===401?'':f.t.slice(0,80))}}}
// ---- ROLE MATRIX inside company A (required role group is read from the handler source; each non-owner role must be allowed/denied exactly as declared) ----
// In-service role checks (verified in source): export/erase -> requireCompanyRole(['OWNER']) in data-lifecycle-service.ts; disputes -> ['OWNER','ADMIN'] inline; members -> COMPANY_ADMIN inside the transaction.
const OVERRIDE={'GET /companies/:companyId/export':'OWNER_ONLY','POST /companies/:companyId/erase':'OWNER_ONLY','GET /companies/:companyId/disputes':'COMPANY_ADMIN','POST /companies/:companyId/members':'COMPANY_ADMIN'};
const GROUPS={OWNER_ONLY:['OWNER'],ALL_ROLES:['OWNER','ADMIN','ASSESSOR','CONSULTANT','VIEWER'],ASSESSMENT_INPUT:['OWNER','ADMIN','ASSESSOR'],COMPANY_ADMIN:['OWNER','ADMIN']};
const appSrc=fs.readFileSync(path.join(apiDir,'app.ts'),'utf8');
function roleGroupOf(r){if(OVERRIDE[`${r.method} ${r.path}`])return OVERRIDE[`${r.method} ${r.path}`];const i=appSrc.indexOf(`router.add("${r.method}","/api/v1${r.path}"`);if(i<0)return null;const j=appSrc.indexOf('router.add(',i+10);const blk=appSrc.slice(i,j<0?undefined:j);const m=blk.match(/requireCompanyRole\([^,]+,[^,]+,\s*([A-Z_]+)\)/);return m?m[1]:null}
if(process.env.OWNER_EMAIL&&process.env.OWNER_PASSWORD){
  const lg=await req('POST','/auth/login',{body:{email:process.env.OWNER_EMAIL,password:process.env.OWNER_PASSWORD}});const ot='Bearer '+(JSON.parse(lg.t).data??JSON.parse(lg.t)).accessToken;
  const members={};for(const role of ['ADMIN','ASSESSOR','CONSULTANT','VIEWER']){const u=await mkUser('role-'+role);const add=await req('POST',`/companies/${companyA}/members`,{tok:ot,body:{email:u.email,role}});members[role]={...u,addStatus:add.s};rec('role-setup','add '+role,add.s,add.s<300?'PASS':'FAIL',add.s<300?'':add.t.slice(0,80))}
  const companyRoutes=customer.filter(r=>r.path.includes(':companyId')&&!r.path.includes(':assessmentId')&&!PUBLIC.has(`${r.method} ${r.path}`)&&!/\/members\/:userId$/.test(r.path));
  for(const r of companyRoutes){const g=roleGroupOf(r);const key=`${r.method} ${r.path}`;
    if(!g||!GROUPS[g]){rec('role-matrix',key,0,'WARN','role group not found in source ('+g+'): in-handler or custom check');continue}
    for(const role of ['ADMIN','ASSESSOR','CONSULTANT','VIEWER']){const should=GROUPS[g].includes(role);const body=/\/members$/.test(r.path)?{email:`nobody.${Date.now()}@example.test`,role:'VIEWER'}:{};const x=await req(r.method,fill(r.path),{tok:members[role].tok,body});
      const denied=x.s===403;rec('role-matrix',`${key} as ${role} (${g})`,x.s,should?(denied||x.s===401?'FAIL':'PASS'):(denied?'PASS':'FAIL'),should?(denied?'allowed role was denied':''):(denied?'':'forbidden role was NOT denied: '+x.t.slice(0,80)))}}
  before=snapshot(); // victim baseline AFTER the legitimate role setup and role-matrix writes
  // privilege escalation attempts by a low role
  for(const role of ['VIEWER','CONSULTANT','ASSESSOR','ADMIN']){const x=await req('POST',`/companies/${companyA}/members`,{tok:members[role].tok,body:{email:members[role].email,role:'OWNER'}});rec('escalation',`${role} grants itself OWNER`,x.s,x.s===403?'PASS':'FAIL',x.t.slice(0,80))}
  const o=await req('GET',`/companies/${companyA}`,{tok:ot});const ownersNow=sql(`select count(*) from company_memberships where "companyId"='${companyA}' and role='OWNER'`);rec('escalation','owner count unchanged after attempts',0,ownersNow==='1'?'PASS':'FAIL','owners='+ownersNow);
}
// (3) another company's customer acting on company A's real ids (customer routes carrying a tenant id)
const tenant=customer.filter(r=>/:(companyId|assessmentId|invoiceId|milestoneId|userId)/.test(r.path)&&!PUBLIC.has(`${r.method} ${r.path}`));
for(const r of tenant){const key=`${r.method} ${r.path}`;const x=await req(r.method,fill(r.path),{tok:B.tok,body:{}});
  rec('cross-company',key,x.s,[401,403,404].includes(x.s)?'PASS':([400,409,422].includes(x.s)?'WARN':'FAIL'),[401,403,404].includes(x.s)?'':x.t.slice(0,100))}
// POSITIVE CONTROL: the real owner of company A must reach the same GET resources (proves the victim ids are valid, so 403/404 above is real protection)
if(process.env.OWNER_EMAIL&&process.env.OWNER_PASSWORD){
  const lg=await req('POST','/auth/login',{body:{email:process.env.OWNER_EMAIL,password:process.env.OWNER_PASSWORD}});const ot=lg.s===200?'Bearer '+(JSON.parse(lg.t).data??JSON.parse(lg.t)).accessToken:null;
  rec('owner-login','POST /auth/login',lg.s,lg.s===200?'PASS':'FAIL');
  if(ot)for(const r of tenant.filter(r=>r.method==='GET')){const key=`${r.method} ${r.path}`;const x=await req('GET',fill(r.path),{tok:ot});
    const completedNQ=x.s===409&&r.path.endsWith('/next-question')&&sql(`select status from assessments where id='${F.assessmentId}'`)==='COMPLETED';rec('owner-positive-control',key,x.s,(x.s===200||completedNQ)?'PASS':([401,403,404].includes(x.s)?'FAIL':'WARN'),x.s===200?'':(completedNQ?'409 CONFLICT is the expected business answer: the assessment is COMPLETED (attacker gets 404 on the same route)':x.t.slice(0,100)))}
}else console.log('NOTE: OWNER_EMAIL/OWNER_PASSWORD not set: positive control skipped (404 results are then not proof of protection)');
// VALID-BODY cross-company mutations: an empty body is validated (400) before authorization on some routes, so prove authorization with realistic bodies too
{const ownerEmail=sql(`select email from users where id=(select "userId" from company_memberships where "companyId"='${companyA}' and role='OWNER' limit 1)`);
 const vb=[['add existing user to company A',['POST',`/companies/${companyA}/members`,{email:ownerEmail,role:'VIEWER'}],'POST /companies/:companyId/members'],['add NONEXISTENT email (must be indistinguishable: no user enumeration)',['POST',`/companies/${companyA}/members`,{email:'nobody.nonexistent@example.test',role:'VIEWER'}],null],['add self as OWNER',['POST',`/companies/${companyA}/members`,{email:B.email,role:'OWNER'}],null],['rename company A',['PUT',`/companies/${companyA}`,{name:'Hijacked'}],null],['create invoice for A',['POST',`/companies/${companyA}/billing/invoices`,{planCode:'RETAKE',domainCode:'it'}],null],['create assessment for A',['POST',`/companies/${companyA}/assessments`,{domainCode:'it'}],null],['save 20 profile answers for A',['PUT',`/companies/${companyA}/profile-answers`,{profileAnswers:Array.from({length:20},(_,i)=>({questionId:'P'+String(i+1).padStart(2,'0'),optionIndexes:[1]}))}],null]];
 const codes=[];for(const [n,[m,p,bd],cover] of vb){const x=await req(m,p,{tok:B.tok,body:bd});codes.push(x.s+':'+(JSON.parse(x.t||'{}').error?.code||''));rec('cross-company-valid-body',`${m} ${p.replace(companyA,':companyId')} (${n})`,x.s,[403,404].includes(x.s)?'PASS':'FAIL',[403,404].includes(x.s)?'':x.t.slice(0,100));
   if(cover&&[403,404].includes(x.s))upgrade('cross-company',cover,'empty body is validated first (400); the VALID-body variant is refused with 403 (see cross-company-valid-body)')}
 rec('cross-company-valid-body','existing vs nonexistent email give identical answers (no enumeration oracle)',0,codes[0]===codes[1]?'PASS':'FAIL',codes.slice(0,2).join(' vs '))}
// operator-only (pilot/calibration) with an ordinary customer
for(const r of customer.filter(r=>/\/(pilot|calibration)\//.test(r.path))){const key=`${r.method} ${r.path}`;const x=await req(r.method,fill(r.path),{tok:B.tok,body:{}});rec('operator-only-as-customer',key,x.s,[401,403,404].includes(x.s)?'PASS':'FAIL',x.t.slice(0,80))}
// account-level routes that must never expose A's data to B
for(const [m,p] of [['GET','/companies'],['GET','/account/export'],['GET','/auth/me']]){const x=await req(m,p,{tok:B.tok});const leaks=x.t.includes(companyA)||x.t.includes(F.assessmentId)||x.t.includes(String(F.invoiceId));rec('listing-leak',`${m} ${p}`,x.s,leaks?'FAIL':'PASS',leaks?'victim id present in response':'')}
// (4) customer token on admin routes
for(const r of admin){const key=`${r.method} ${r.path}`;if(PUBLIC.has(key))continue;const x=await req(r.method,fill(r.path),{tok:B.tok,body:{}});rec('customer-on-admin',key,x.s,[401,403,404].includes(x.s)?'PASS':'FAIL',[401,403,404].includes(x.s)?'':x.t.slice(0,100));
  const y=await req(r.method,fill(r.path),{body:{}});rec('admin-no-credentials',key,y.s,[401,403,404].includes(y.s)?'PASS':'FAIL',[401,403,404].includes(y.s)?'':y.t.slice(0,100))}
// (5) the victim's data must be byte-identical afterwards
const after=snapshot();for(const k of Object.keys(before))rec('victim-unchanged',k,0,before[k]===after[k]?'PASS':'FAIL',before[k]===after[k]?'':'victim rows changed during the attack run');
fs.mkdirSync(process.env.OUT_DIR||'/tmp',{recursive:true});fs.writeFileSync(path.join(process.env.OUT_DIR||'/tmp','authz-matrix.json'),JSON.stringify({routes:uniq.length,customer:customer.length,admin:admin.length,pass,warn,fail,rows},null,1));
const byKind={};for(const r of rows){byKind[r.kind]??={PASS:0,WARN:0,FAIL:0};byKind[r.kind][r.verdict]++}
console.table(byKind);console.log(`TOTAL checks ${rows.length}: PASS ${pass}  WARN ${warn}  FAIL ${fail}`);
if(rows.filter(r=>r.verdict==='WARN').length){console.log('WARN list (validated/rejected before an explicit 401):');for(const r of rows.filter(r=>r.verdict==='WARN').slice(0,40))console.log('  ',r.kind,r.route,r.status)}
process.exit(fail?1:0);
