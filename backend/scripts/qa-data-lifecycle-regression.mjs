/* Live regression for data export and erasure. Needs the API on :4000 (development, mock billing) and the local Postgres container.
   Uses only identities it creates itself; it never touches existing users, companies or assessments (checked by a before/after count). */
import crypto from 'crypto';import {execFileSync} from 'child_process';
const B=process.env.API||'http://localhost:4000/api/v1';let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const sql=q=>execFileSync('docker',['exec','mmri-v3-local-postgres-1','psql','-U','mmri','-d',process.env.PGDATABASE||'mmri','-At','-c',q],{encoding:'utf8'}).trim();
const W=crypto.randomUUID();
const call=async(m,p,tok,b)=>{const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json','x-mmri-writer-id':W,...(tok?{authorization:'Bearer '+tok}:{})},body:b===undefined?undefined:JSON.stringify(b)});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{}return {s:r.status,j,d:j?.data,e:j?.error,h:r.headers,raw:t}};
const pw=crypto.randomBytes(12).toString('base64url')+'Aa1!';
async function makeUser(label){const email=`lc.${label}.${Date.now()}.${crypto.randomBytes(2).toString('hex')}@mmri.test`;const r=await call('POST','/auth/register',null,{email,password:pw,displayName:'LC '+label});return {email,tok:r.d.accessToken,id:r.d.user.id}}
async function makeCompanyWithAssessment(u,name){
 const co=(await call('POST','/companies',u.tok,{name})).d.id;const pq=(await call('GET','/methodology/current/profile-questions',u.tok)).d;
 await call('PUT',`/companies/${co}/profile-answers`,u.tok,{profileAnswers:pq.slice(0,20).map(q=>({questionId:q.id,optionIndexes:[q.options[0].optionIndex]})),basicInfoAnswers:Array.from({length:20},(_,i)=>({questionId:'B'+String(i+1).padStart(2,'0'),optionIndexes:[1]}))});
 const inv=(await call('POST',`/companies/${co}/billing/invoices`,u.tok,{planCode:'DIAGNOSTIC',domainCode:'finance'})).d;await call('POST',`/billing/invoices/${inv.id}/mock-pay`,u.tok);
 const a=(await call('POST',`/companies/${co}/assessments`,u.tok,{domainCode:'finance'})).d.id;let route=(await call('POST',`/assessments/${a}/start`,u.tok,{mode:'QUICK',profileAnswers:pq.slice(0,20).map(q=>({questionId:q.id,optionIndexes:[q.options[0].optionIndex]}))})).d;
 for(let i=0;i<5;i++){const q=route.nextQuestion;const o=q.options.find(x=>!['DNK','N_A_CLAIM'].includes(x.state))||q.options[0];const r=await call('POST',`/assessments/${a}/answers`,u.tok,{questionId:q.id,optionIndex:o.optionIndex,questionIssueId:route.questionIssueId||q.questionIssueId,expectedAssessmentRevision:route.assessmentRevision,clientRequestId:crypto.randomUUID()});route=r.d?.routing||r.d}
 return {co,a,inv:inv.id}}
const totalBefore=sql(`select count(*) from assessments where "createdAt"<now()-interval '1 minute'`);
const A=await makeUser('a'),Bu=await makeUser('b');const ca=await makeCompanyWithAssessment(A,'Lifecycle А ХХК'),cb=await makeCompanyWithAssessment(Bu,'Lifecycle Б ХХК');
const cnt=(table,col,id)=>Number(sql(`select count(*) from ${table} where "${col}"='${id}'`));
const ansA=cnt('answers','assessmentId',ca.a);rec('LC-0 setup: company A has an assessment with saved answers and a paid invoice',ansA>=5&&cnt('billing_invoices','companyId',ca.co)===1,`answers ${ansA}`);
// export
const ex=await call('GET','/account/export',A.tok);const body=ex.raw;
rec('LC-1 account export is an attachment, not cacheable, and holds only own data',ex.s===200&&/attachment/.test(ex.h.get('content-disposition'))&&ex.h.get('cache-control')==='no-store'&&ex.d.account.email===A.email&&!body.includes(Bu.email),`${ex.s} ${ex.h.get('content-disposition')}`);
rec('LC-2 account export contains no password hash, token version or IP hash',!/passwordHash|tokenVersion|ipHash|userAgentHash/.test(body));
const exc=await call('GET',`/companies/${ca.co}/export`,A.tok);const cb2=exc.raw;
rec('LC-3 owner exports the company: assessment, all saved answers, payments',exc.s===200&&exc.d.assessments.length===1&&exc.d.assessments[0].answers.length===ansA&&exc.d.payments.length===1&&exc.d.company.name==='Lifecycle А ХХК',`answers ${exc.d?.assessments?.[0]?.answers?.length}`);
rec('LC-4 company export never contains hashes, callback tokens, QR payloads or provider metadata',!/passwordHash|callbackTokenHash|qrText|qrImage|providerMetadata|deeplinks|tokenHash/.test(cb2));
// isolation
const x1=await call('GET',`/companies/${ca.co}/export`,Bu.tok),x2=await call('POST',`/companies/${ca.co}/erase`,Bu.tok,{confirmName:'Lifecycle А ХХК',password:pw}),x3=await call('GET',`/companies/${ca.co}/export`,null),x4=await call('POST','/account/erase',null,{});
rec('LC-5 another account cannot export or erase company A; anonymous requests get 401',x1.s===403&&x2.s===403&&x3.s===401&&x4.s===401,`${x1.s}/${x2.s}/${x3.s}/${x4.s}`);
rec('LC-6 the refused attempts changed nothing',cnt('answers','assessmentId',ca.a)===ansA&&cnt('assessments','companyId',ca.co)===1);
// erase company: safeguards
const badPw=await call('POST',`/companies/${ca.co}/erase`,A.tok,{confirmName:'Lifecycle А ХХК',password:'wrong-password-123'}),badName=await call('POST',`/companies/${ca.co}/erase`,A.tok,{confirmName:'Өөр нэр',password:pw}),noConf=await call('POST',`/companies/${ca.co}/erase`,A.tok,{password:pw});
rec('LC-7 wrong password (403), wrong or missing confirmation name (400): nothing is erased',badPw.s===403&&badPw.e.code==='PASSWORD_INCORRECT'&&badName.s===400&&noConf.s===400&&badName.e.code==='CONFIRMATION_MISMATCH'&&cnt('answers','assessmentId',ca.a)===ansA,`${badPw.s}/${badName.s}/${noConf.s}`);
const invBefore=sql(`select id||status||"amountMnt" from billing_invoices where "companyId"='${ca.co}'`);const entBefore=cnt('company_entitlements','companyId',ca.co);const otherBefore=cnt('answers','assessmentId',cb.a);
const er=await call('POST',`/companies/${ca.co}/erase`,A.tok,{confirmName:'Lifecycle А ХХК',password:pw});
if(er.s!==200)console.log('DEBUG',er.s,String(er.e.message).split('\n').slice(-6).join(' / ').slice(0,700));rec('LC-8 erase succeeds and reports what was removed and what is retained',er.s===200&&er.d.erased===true&&er.d.assessmentsRemoved===1&&['payment invoices','entitlements','security audit events'].every(x=>er.d.retained.includes(x)),JSON.stringify(er.d).slice(0,160));
rec('LC-9 customer content is gone: assessment, answers, results, reports',cnt('assessments','companyId',ca.co)===0&&cnt('answers','assessmentId',ca.a)===0&&cnt('diagnosis_snapshots','assessmentId',ca.a)===0&&cnt('report_snapshots','assessmentId',ca.a)===0);
rec('LC-10 payment invoice and entitlement are RETAINED unchanged (retention decision is the owner\'s)',sql(`select id||status||"amountMnt" from billing_invoices where "companyId"='${ca.co}'`)===invBefore&&cnt('company_entitlements','companyId',ca.co)===entBefore&&entBefore>=1);
rec('LC-11 the company record is an anonymised shell marked erased; memberships removed',sql(`select name||'|'||(industry is null)||'|'||("erasedAt" is not null) from companies where id='${ca.co}'`)==='Устгасан байгууллага|true|true'&&cnt('company_memberships','companyId',ca.co)===0);
const after=await call('GET',`/companies/${ca.co}/export`,A.tok),again=await call('POST',`/companies/${ca.co}/erase`,A.tok,{confirmName:'Устгасан байгууллага',password:pw});
rec('LC-12 the erased company is no longer reachable by its former owner (403), also not erasable twice',after.s===403&&again.s===403,`${after.s}/${again.s}`);
rec('LC-13 an unrelated company (B) is untouched',cnt('answers','assessmentId',cb.a)===otherBefore&&cnt('assessments','companyId',cb.co)===1);
rec('LC-14 an audit event records the erasure with counts only (no names)',Number(sql(`select count(*) from auth_audit_events where "eventType"='COMPANY_ERASED' and "userId"='${A.id}' and metadata::text not like '%Lifecycle%'`))===1);
// erase account
const co2=(await call('POST','/companies',A.tok,{name:'Lifecycle В ХХК'})).d.id;
const sole=await call('POST','/account/erase',A.tok,{confirmEmail:A.email,password:pw});
rec('LC-15 a sole owner of a live company cannot erase the account (409 SOLE_OWNER, names the company)',sole.s===409&&sole.e.code==='SOLE_OWNER'&&/Lifecycle В/.test(JSON.stringify(sole.e.details)),`${sole.s} ${sole.e?.code}`);
await call('POST',`/companies/${co2}/erase`,A.tok,{confirmName:'Lifecycle В ХХК',password:pw});
const bad1=await call('POST','/account/erase',A.tok,{confirmEmail:'other@mmri.test',password:pw}),bad2=await call('POST','/account/erase',A.tok,{confirmEmail:A.email,password:'nope-nope-nope'});
rec('LC-16 account erasure needs the typed e-mail and the password',bad1.s===400&&bad2.s===403,`${bad1.s}/${bad2.s}`);
const ea=await call('POST','/account/erase',A.tok,{confirmEmail:A.email,password:pw});
rec('LC-17 account erasure succeeds and clears the session cookie',ea.s===200&&ea.d.erased===true&&/mmri_refresh=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(ea.h.get('set-cookie')||''),String(ea.s));
const login=await call('POST','/auth/login',null,{email:A.email,password:pw}),me=await call('GET','/auth/me',A.tok);
rec('LC-18 the erased account can no longer sign in and its old access token is dead',login.s===401&&me.s===401,`${login.s}/${me.s}`);
rec('LC-19 e-mail and name are anonymised, status disabled; the invoice it created is retained',sql(`select (email like 'erased+%@erased.invalid')||'|'||("displayName" is null)||'|'||status||'|'||("erasedAt" is not null) from users where id='${A.id}'`)==='true|true|DISABLED|true'&&cnt('billing_invoices','companyId',ca.co)===1);
rec('LC-20 no refresh session or reset token survives; audit events are retained',cnt('refresh_sessions','userId',A.id)===0&&cnt('password_reset_tokens','userId',A.id)===0&&Number(sql(`select count(*) from auth_audit_events where "userId"='${A.id}'`))>=3);
rec('LC-21 the same e-mail address can register again as a new account',(await call('POST','/auth/register',null,{email:A.email,password:pw})).s===201);
const totalAfter=sql(`select count(*) from assessments where "createdAt"<now()-interval '1 minute'`);
rec('LC-22 no pre-existing assessment was removed by this test',totalBefore===totalAfter,`${totalBefore} -> ${totalAfter}`);
console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
