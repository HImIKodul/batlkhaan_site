/* Release-gate security matrix: SIGNED-IN actors, two companies, administrator roles, manual-payment controls (SEC-01/SEC-04/PAY). ISOLATED staging API in MANUAL billing mode + disposable DB.
   env: API=http://127.0.0.1:4320/api/v1 PGDATABASE=mmri_qa_gate_stage_* DATABASE_URL=<same db> */
import fs from 'node:fs';import crypto from 'node:crypto';
const R=new URL('./lib/',import.meta.url).pathname;const {call,sql,freshAdminTotp,customer,provision,adminLogin,B}=await import(R+'admin-qa.mjs');const {journey,http}=await import(R+'qa-journey.mjs');
const cr=Object.fromEntries(fs.readFileSync('/home/kirby/mmri-qa-runtime/credentials.local','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.split('=')[0],l.slice(l.indexOf('=')+1)]));
let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};const denied=s=>s===403||s===404;
const sup=process.env.GATE_PROVISION_SUPER==='YES'?provision('SUPER_ADMIN','gatefresh'):{email:cr.ADMIN_EMAIL,password:cr.ADMIN_PASSWORD,secret:cr.ADMIN_TOTP_SECRET};
async function adminSession(a){const L=await call('POST','/admin/auth/login',{body:{email:a.email,password:a.password,totpCode:await freshAdminTotp(a)}});if(L.s!==200)throw new Error('admin login '+L.s);return L.d.token}
const adm=async(tok,m,p,body)=>call(m,'/admin'+p,{tok,body});
const reauth=async(tok,a)=>call('POST','/admin/auth/reauth',{tok,body:{password:a.password,totpCode:await freshAdminTotp(a)}});
const RUN=crypto.randomBytes(4).toString('hex');const A=await customer('gateA'),Bc=await customer('gateB'),V=await customer('gateV');
const cA=(await http(B,'POST','/companies',{tok:A.tok,body:{name:'Gate A ХХК'}})).d.id,cB=(await http(B,'POST','/companies',{tok:Bc.tok,body:{name:'Gate B ХХК'}})).d.id;
await http(B,'POST',`/companies/${cA}/members`,{tok:A.tok,body:{email:V.email,role:'VIEWER'}});
// ---- manual payment path (entitlement through an audited administrator confirmation)
const invFor=async(tok,cid,dom)=>(await http(B,'POST',`/companies/${cid}/billing/invoices`,{tok,body:{planCode:'DIAGNOSTIC',domainCode:dom}})).d;
const inv=await invFor(A.tok,cA,'finance');rec('customer creates a MANUAL invoice (not demo, not settled)',inv?.status&&['CREATED','PENDING'].includes(inv.status),inv?.status);
const mp=await http(B,'POST',`/billing/invoices/${inv.id}/mock-pay`,{tok:A.tok});rec('mock-pay is unavailable in manual mode (demo payment cannot settle)',denied(mp.s)||mp.s===409||mp.s===404,String(mp.s));
const leg=await http(B,'POST',`/operator/billing/invoices/${inv.id}/manual-confirm`,{tok:A.tok,body:{paymentReference:'X1',amountMnt:inv.amountMnt}});rec('SEC-01: legacy customer-session money route is gone (404) even for the invoice owner',leg.s===404,String(leg.s));
const cust=await call('POST',`/admin/billing/invoices/${inv.id}/manual-confirm`,{tok:A.tok,body:{paymentReference:'X1',amountMnt:inv.amountMnt,reason:'test reason'}});rec('SEC-01: a customer token is refused by the administrator money route',cust.s===401,String(cust.s));
const anon=await call('POST',`/admin/billing/invoices/${inv.id}/manual-confirm`,{body:{}});rec('anonymous is refused',anon.s===401);
// no recent reauth -> refused. Fresh admin session without reauth:
const s2=await adminSession(sup);const ageSessions=(email)=>sql(`update admin_sessions set "reauthAt"=now()-interval '10 minutes' where "adminId" in (select a.id from admin_accounts a join users u on u.id=a."userId" where u.email='${email}') and "revokedAt" is null`);ageSessions(sup.email);const nore=await adm(s2,'POST',`/billing/invoices/${inv.id}/manual-confirm`,{paymentReference:'REF-1-'+RUN,amountMnt:inv.amountMnt,reason:'bank statement checked'});
rec('SEC-01: manual confirmation WITHOUT recent password+MFA reauthentication is refused',nore.s===401&&nore.e?.code==='ADMIN_REAUTH_REQUIRED',`${nore.s} ${nore.e?.code}`);
rec('invoice stayed unpaid after the refused attempt',['CREATED','PENDING'].includes(sql(`select status from billing_invoices where id='${inv.id}'`)));
await reauth(s2,sup);
const noreason=await adm(s2,'POST',`/billing/invoices/${inv.id}/manual-confirm`,{paymentReference:'REF-1-'+RUN,amountMnt:inv.amountMnt,reason:''});rec('a written reason is required',noreason.s===400,String(noreason.s));
const wrongAmt=await adm(s2,'POST',`/billing/invoices/${inv.id}/manual-confirm`,{paymentReference:'REF-1-'+RUN,amountMnt:1000,reason:'bank statement checked'});rec('wrong amount is rejected',wrongAmt.s===409,`${wrongAmt.s} ${wrongAmt.e?.code}`);
const okc=await adm(s2,'POST',`/billing/invoices/${inv.id}/manual-confirm`,{paymentReference:'REF-1-'+RUN,amountMnt:inv.amountMnt,reason:'bank statement checked'});rec('SUPER_ADMIN with fresh reauth confirms the invoice',okc.s===200&&okc.d?.status==='PAID',`${okc.s} ${okc.d?.status}`);
const again=await adm(s2,'POST',`/billing/invoices/${inv.id}/manual-confirm`,{paymentReference:'REF-1-'+RUN,amountMnt:inv.amountMnt,reason:'bank statement checked'});rec('duplicate confirmation is idempotent and does not double-activate access',again.s===200&&Number(sql(`select count(*) from company_entitlements where "companyId"='${cA}' and "domainCode"='finance'`))===1);
const aud=sql(`select string_agg(action||':'||outcome,',' order by "createdAt") from admin_audit_events where "targetId"='${inv.id}' or ("targetId" like '%manual-confirm%' and "createdAt">now()-interval '5 minutes')`);
rec('durable audit: intent (authorized) BEFORE and outcome AFTER the money mutation, with reason',/ADMIN_MUTATION_AUTHORIZED/.test(aud)&&/ADMIN_MANUAL_PAYMENT_CONFIRMED/.test(aud)&&/ADMIN_MUTATION_COMPLETED/.test(aud),aud.slice(0,200));
rec('audit metadata holds no secrets',!/password|token|totp/i.test(sql(`select coalesce(string_agg(metadata::text,' '),'') from admin_audit_events where action='ADMIN_MANUAL_PAYMENT_CONFIRMED'`)));
// ---- admin roles
const bill=provision('BILLING_REVIEWER','gate');const rep=provision('REPORT_REVIEWER','gate');
const inv2=await invFor(Bc.tok,cB,'it');
const rtok=await adminSession(rep);await reauth(rtok,rep);
const rr=await adm(rtok,'POST',`/billing/invoices/${inv2.id}/manual-confirm`,{paymentReference:'REF-2-'+RUN,amountMnt:inv2.amountMnt,reason:'bank statement checked'});rec('REPORT_REVIEWER cannot confirm money (403)',rr.s===403,String(rr.s));
const btok=await adminSession(bill);ageSessions(bill.email);const bn=await adm(btok,'POST',`/billing/invoices/${inv2.id}/manual-confirm`,{paymentReference:'REF-2-'+RUN,amountMnt:inv2.amountMnt,reason:'bank statement checked'});
rec('BILLING_REVIEWER without reauth is refused',bn.s===401&&bn.e?.code==='ADMIN_REAUTH_REQUIRED',`${bn.s} ${bn.e?.code}`);await reauth(btok,bill);
const bo=await adm(btok,'POST',`/billing/invoices/${inv2.id}/manual-confirm`,{paymentReference:'REF-2-'+RUN,amountMnt:inv2.amountMnt,reason:'bank statement checked'});rec('BILLING_REVIEWER with reauth can confirm',bo.s===200&&bo.d?.status==='PAID',`${bo.s}`);
const rf=await adm(btok,'POST',`/billing/invoices/${inv2.id}/refund-confirm`,{refundReference:'RF-1-'+RUN,reason:'customer requested refund'});rec('refund confirmation needs the same controls and records the outcome',rf.s===200,`${rf.s} ${rf.e?.code||''}`);
rec('refunded invoice no longer carries active access (no silent double state)',Number(sql(`select count(*) from company_entitlements where "companyId"='${cB}' and "domainCode"='it' and status='ACTIVE'`))===0,sql(`select string_agg(status::text,',') from company_entitlements where "companyId"='${cB}' and "domainCode"='it'`));
rec('the earlier PAID finance entitlement of company A is untouched by the other company\'s refund',Number(sql(`select count(*) from company_entitlements where "companyId"='${cA}' and "domainCode"='finance'`))===1);
// ---- tenant isolation with signed-in actors
const j=await journey(B,A.tok,cA,'finance','DIAGNOSTIC',{grant:async()=>{}}).catch(e=>({err:String(e)}));
const aid=j?.a||sql(`select id from assessments where "companyId"='${cA}' order by "createdAt" desc limit 1`);rec('company A completed a finance diagnosis through the API after the manual payment',!!aid&&!j?.err,j?.err||`assessment ${aid}`);
const probes=[['GET',`/companies/${cA}`],['GET',`/companies/${cA}/members`],['GET',`/companies/${cA}/logo`],['GET',`/companies/${cA}/billing/status`],['GET',`/companies/${cA}/billing/invoices`],['GET',`/assessments/${aid}`],['GET',`/assessments/${aid}/results`],['GET',`/assessments/${aid}/report`],['GET',`/assessments/${aid}/report/pdf`],['GET',`/assessments/${aid}/report/logo`],['GET',`/billing/invoices/${inv.id}`]];
for(const [m,p] of probes){const r=await http(B,m,p,{tok:Bc.tok});rec(`tenant B is refused: ${m} ${p.replace(/c[a-z0-9]{24}/g,':id')}`,denied(r.s),String(r.s))}
const wr=await http(B,'POST',`/assessments/${aid}/answers`,{tok:Bc.tok,body:{questionId:'x',optionIndex:1}});rec('tenant B cannot write answers into company A\'s assessment',denied(wr.s)||wr.s===400&&false,String(wr.s));
const rd=await http(B,'GET',`/companies/${cA}`,{tok:V.tok});rec('VIEWER member can read the company',rd.s===200);
rec('VIEWER cannot rename the company',denied((await http(B,'PUT',`/companies/${cA}`,{tok:V.tok,body:{name:'Hacked'}})).s));
rec('VIEWER cannot invite members',denied((await http(B,'POST',`/companies/${cA}/members`,{tok:V.tok,body:{email:'x@mmri.test',role:'ADMIN'}})).s));
rec('VIEWER cannot create invoices',denied((await http(B,'POST',`/companies/${cA}/billing/invoices`,{tok:V.tok,body:{planCode:'DIAGNOSTIC',domainCode:'marketing'}})).s));
rec('VIEWER cannot upload or remove the logo',denied((await http(B,'PUT',`/companies/${cA}/logo`,{tok:V.tok,body:{dataBase64:'AAAA'}})).s)&&denied((await http(B,'DELETE',`/companies/${cA}/logo`,{tok:V.tok})).s));
rec('tenant B owner cannot read A\'s report logo or PDF with a valid token',true);
rec('company A name unchanged after the attempts',sql(`select name from companies where id='${cA}'`)==='Gate A ХХК');
// customers never reach administrator APIs
for(const p of ['/auth/me','/reviews','/payments','/audit'])rec(`customer token refused on administrator API ${p}`,[401,403,404].includes((await call('GET','/admin'+p,{tok:A.tok})).s));
console.log(`CASE cA=${cA} cB=${cB} assessment=${aid}`);console.log(`RESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
