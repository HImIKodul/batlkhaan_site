/* Regression for the SUPER_ADMIN account-management API (users, e-mail, activation, ADMIN_GRANT access grant/revoke, company details, origin/history).
   Needs an ISOLATED API and database (the shared helpers refuse :4000 and `mmri`):
     API=http://127.0.0.1:4200/api/v1 PGDATABASE=mmri_v2_qa node scripts/qa-admin-accounts-regression.mjs
   Provisions throw-away admins through the real CLI and throw-away customers through the real register endpoint. */
import {call,sql,totp,provision,adminLogin,rndPw} from './lib/admin-qa.mjs';
import crypto from 'crypto';
let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const sup=provision('SUPER_ADMIN','acc-super'),rev=provision('REPORT_REVIEWER','acc-rev'),bil=provision('BILLING_REVIEWER','acc-bil');
const tok={};for(const [k,a] of [['sup',sup],['rev',rev],['bil',bil]]){const r=await adminLogin(a);if(r.s!==200)throw new Error('admin login failed for '+k);tok[k]=r.d.token}
const reauth=async()=>{await new Promise(r=>setTimeout(r,31000));return call('POST','/admin/auth/reauth',{tok:tok.sup,body:{password:sup.password,totpCode:totp(sup.secret,0)}})};
const mkCustomer=async(label)=>{const email=`cu.acc.${label}.${Date.now()}.${crypto.randomBytes(2).toString('hex')}@mmri.test`,password=rndPw();
 const r=await call('POST','/auth/register',{body:{email,password,displayName:'QA '+label}});const co=await call('POST','/companies',{tok:r.d.accessToken,body:{name:'QA Acc '+label+' '+Date.now()}});return {email,password,tok:r.d.accessToken,id:r.d.user.id,companyId:co.d.id}};
const A=await mkCustomer('a'),B=await mkCustomer('b');
const supUserId=sql(`select u.id from users u where u.email='${sup.email}'`);

// ---- authorization ----
const routes=[['GET','/admin/users'],['GET',`/admin/users/${A.id}`],['POST',`/admin/users/${A.id}/email`],['POST',`/admin/users/${A.id}/status`],["GET",`/admin/companies/${A.companyId}/entitlements`],["POST",`/admin/companies/${A.companyId}/entitlements/grant`],["POST","/admin/entitlements/x/revoke"],["POST",`/admin/companies/${A.companyId}/details`]];
const anon=await Promise.all(routes.map(([m,p])=>call(m,p,{body:m==='POST'?{}:undefined})));
rec('ACC-01 no token: every account route answers 401',anon.every(r=>r.s===401),anon.map(r=>r.s).join(','));
const cust=await Promise.all(routes.map(([m,p])=>call(m,p,{tok:A.tok,body:m==='POST'?{}:undefined})));
rec('ACC-02 a customer token is rejected on every account route',cust.every(r=>r.s===401),cust.map(r=>r.s).join(','));
const denied=[];for(const t of ['rev','bil'])for(const [m,p] of routes){const r=await call(m,p,{tok:tok[t],body:m==='POST'?{}:undefined});denied.push(r.s===403&&r.e?.code==='ADMIN_FORBIDDEN')}
rec('ACC-03 REPORT_REVIEWER and BILLING_REVIEWER get 403 ADMIN_FORBIDDEN on every account route',denied.every(Boolean));
rec('ACC-04 each denied attempt is audited',Number(sql(`select count(*) from admin_audit_events where action='PERMISSION_DENIED' and metadata->>'permission'='accounts.manage'`))>=routes.length*2);

// ---- read: list / search / inspect, never leaking credentials ----
const frag=A.email.split('@')[0].slice(0,18);
const list=await call('GET',`/admin/users?q=${encodeURIComponent(frag)}`,{tok:tok.sup});
rec('ACC-05 SUPER_ADMIN lists and searches accounts',list.s===200&&list.d.items.some(u=>u.id===A.id),`total=${list.d?.total}`);
const det=await call('GET',`/admin/users/${A.id}`,{tok:tok.sup});
rec('ACC-06 account detail shows companies and sign-in history',det.s===200&&det.d.companies.some(c=>c.id===A.companyId)&&Array.isArray(det.d.recentSignIns));
rec('ACC-07 no password hash, token version, MFA or token material in list or detail',!/passwordHash|tokenVersion|mfa|refresh|\$argon|\$2[aby]\$/i.test(list.raw+det.raw));
rec('ACC-08 status filter rejects junk',(await call('GET','/admin/users?status=HACK',{tok:tok.sup})).s===400);

// ---- sensitive actions need a fresh re-authentication ----
sql(`update admin_sessions set "reauthAt"=now()-interval '10 minutes' where "adminId" in (select a.id from admin_accounts a join users u on u.id=a."userId" where u.email='${sup.email}')`);
const noRe=await call('POST',`/admin/users/${A.id}/status`,{tok:tok.sup,body:{status:'DISABLED',reason:'automated regression check'}});
// login itself counts as a fresh authentication, so the session is aged 10 minutes in the isolated database to prove the 5-minute window is enforced
rec('ACC-09 a change without recent re-authentication is refused (401 ADMIN_REAUTH_REQUIRED) and nothing changes',noRe.s===401&&noRe.e?.code==='ADMIN_REAUTH_REQUIRED'&&sql(`select status from users where id='${A.id}'`)==='ACTIVE');
const re=await reauth();rec('ACC-10 password + MFA re-authentication succeeds',re.s===200,String(re.s));

// ---- e-mail change ----
const ep=`/admin/users/${A.id}/email`;const newA=`cu.acc.renamed.${Date.now()}@mmri.test`;
const v=[await call('POST',ep,{tok:tok.sup,body:{newEmail:newA,confirmNewEmail:newA}}),await call('POST',ep,{tok:tok.sup,body:{newEmail:'not-an-email',confirmNewEmail:'not-an-email',reason:'automated regression check'}}),await call('POST',ep,{tok:tok.sup,body:{newEmail:newA,confirmNewEmail:newA+'x',reason:'automated regression check'}})];
rec('ACC-11 missing reason, malformed address and mismatched confirmation are 400',v.every(r=>r.s===400),v.map(r=>r.s).join(','));
const taken=await call('POST',ep,{tok:tok.sup,body:{newEmail:B.email.toUpperCase(),confirmNewEmail:B.email.toUpperCase(),reason:'automated regression check'}});
rec('ACC-12 an address already used by another account (any letter case) is 409 EMAIL_TAKEN',taken.s===409&&taken.e?.code==='EMAIL_TAKEN');
const same=await call('POST',ep,{tok:tok.sup,body:{newEmail:A.email,confirmNewEmail:A.email,reason:'automated regression check'}});
rec('ACC-13 setting the same address is 409 EMAIL_UNCHANGED',same.s===409&&same.e?.code==='EMAIL_UNCHANGED');
const onAdmin=await call('POST',`/admin/users/${supUserId}/email`,{tok:tok.sup,body:{newEmail:'x.y.'+Date.now()+'@mmri.test',confirmNewEmail:'x.y.'+Date.now()+'@mmri.test',reason:'automated regression check'}});
rec('ACC-14 an administrator account cannot be re-addressed through this menu (409 ADMIN_ACCOUNT_PROTECTED)',onAdmin.s===409&&onAdmin.e?.code==='ADMIN_ACCOUNT_PROTECTED');
const okMail=await call('POST',ep,{tok:tok.sup,body:{newEmail:newA,confirmNewEmail:newA,reason:'automated regression check'}});
rec('ACC-15 valid change succeeds',okMail.s===200&&okMail.d.email===newA);
rec('ACC-16 the user\'s existing access token and old address stop working; the new address signs in',(await call('GET','/auth/me',{tok:A.tok})).s===401&&(await call('POST','/auth/login',{body:{email:A.email,password:A.password}})).s===401&&(await call('POST','/auth/login',{body:{email:newA,password:A.password}})).s===200);
const audMail=sql(`select metadata::text from admin_audit_events where action='ADMIN_USER_EMAIL_CHANGED' and outcome='SUCCESS' and "targetId"='${A.id}' order by "createdAt" desc limit 1`);
rec('ACC-17 audit row has actor, target, reason and MASKED addresses only',audMail.includes('automated regression check')&&!audMail.includes(newA)&&!audMail.includes(A.email)&&sql(`select "adminId" is not null from admin_audit_events where action='ADMIN_USER_EMAIL_CHANGED' and outcome='SUCCESS' and "targetId"='${A.id}' limit 1`)==='t');
rec('ACC-18 the refused attempts were audited as FAILURE',Number(sql(`select count(*) from admin_audit_events where action='ADMIN_USER_EMAIL_CHANGED' and outcome='FAILURE' and "targetId"='${A.id}'`))>=4);

// ---- activation / deactivation ----
const sp=`/admin/users/${B.id}/status`;
rec('ACC-19 invalid status / missing reason are 400',(await call('POST',sp,{tok:tok.sup,body:{status:'DELETED',reason:'automated regression check'}})).s===400&&(await call('POST',sp,{tok:tok.sup,body:{status:'DISABLED'}})).s===400);
rec('ACC-20 an administrator cannot deactivate their own account',(await call('POST',`/admin/users/${supUserId}/status`,{tok:tok.sup,body:{status:'DISABLED',reason:'automated regression check'}})).s===409);
const off=await call('POST',sp,{tok:tok.sup,body:{status:'DISABLED',reason:'automated regression check'}});
rec('ACC-21 deactivation succeeds and revokes sessions',off.s===200&&off.d.changed===true&&off.d.sessionsRevoked>=1,JSON.stringify(off.d));
rec('ACC-22 a deactivated account cannot sign in and its token stops working',(await call('POST','/auth/login',{body:{email:B.email,password:B.password}})).s===401&&(await call('GET','/auth/me',{tok:B.tok})).s===401);
rec('ACC-23 repeating the same status is idempotent (changed:false)',(await call('POST',sp,{tok:tok.sup,body:{status:'DISABLED',reason:'automated regression check'}})).d?.changed===false);
const on=await call('POST',sp,{tok:tok.sup,body:{status:'ACTIVE',reason:'automated regression check'}});
rec('ACC-24 reactivation restores sign-in',on.s===200&&(await call('POST','/auth/login',{body:{email:B.email,password:B.password}})).s===200);

// ---- domain access: ADMIN_GRANT (no invoice, no revenue) ----
const Bl=await call('POST','/auth/login',{body:{email:B.email,password:B.password}});B.tok=Bl.d.accessToken; // B was deactivated/reactivated above: its old token is (correctly) dead
const gp=`/admin/companies/${B.companyId}/entitlements/grant`;
const revenue=()=>sql(`select coalesce(sum("amountMnt"),0)||'|'||count(*) from billing_invoices where status='PAID'`);
const invCount=()=>sql(`select count(*) from billing_invoices`);
const rev0=revenue(),inv0=invCount();
rec('ACC-25 grant needs a valid domain and a reason (400)',(await call('POST',gp,{tok:tok.sup,body:{domainCode:'sales',reason:'automated regression check'}})).s===400&&(await call('POST',gp,{tok:tok.sup,body:{domainCode:'finance'}})).s===400);
const before=await call('POST',`/companies/${B.companyId}/assessments`,{tok:B.tok,body:{domainCode:'finance'},h:{'x-mmri-writer-id':'acc-w1'}});
rec('ACC-26 before the grant the customer cannot start a diagnosis (402 PAYMENT_REQUIRED)',before.s===402,String(before.s));
const g1=await call('POST',gp,{tok:tok.sup,body:{domainCode:'finance',reason:'automated regression check'}});
const row=sql(`select origin||'|'||status||'|'||"planCode"||'|'||coalesce("sourceInvoiceId",'NULL')||'|'||"assessmentLimit"||'|'||(select u.email from admin_accounts a join users u on u.id=a."userId" where a.id=e."grantedByAdminId") from company_entitlements e where id='${g1.d?.entitlementId}'`);
rec('ACC-27 grant creates an ACTIVE one-use ADMIN_GRANT entitlement with NO invoice, naming the granting admin',g1.s===200&&row===`ADMIN_GRANT|ACTIVE|DIAGNOSTIC|NULL|1|${sup.email}`,row);
rec('ACC-28 a grant creates no invoice and changes neither revenue nor payment history',invCount()===inv0&&revenue()===rev0,`${rev0} -> ${revenue()}`);
const pay=await call('GET','/admin/payments?pageSize=50',{tok:tok.sup});
rec('ACC-29 the payments list contains no row for the grant',pay.s===200&&!pay.raw.includes(g1.d?.entitlementId));
const g2=await call('POST',gp,{tok:tok.sup,body:{domainCode:'finance',reason:'automated regression check'}});
rec('ACC-30 a second open grant for the same domain is 409 ENTITLEMENT_EXISTS',g2.s===409&&g2.e?.code==='ENTITLEMENT_EXISTS');
const race=await Promise.all([1,2,3].map(()=>call('POST',gp,{tok:tok.sup,body:{domainCode:'it',reason:'automated regression check'}})));
rec('ACC-31 three concurrent grants for one domain create exactly one entitlement',race.filter(r=>r.s===200).length===1&&Number(sql(`select count(*) from company_entitlements where "companyId"='${B.companyId}' and "domainCode"='it' and status='ACTIVE'`))===1,race.map(r=>r.s).join(','));
const seededOpen=sql(`select "companyId"||'|'||"domainCode" from company_entitlements where status='ACTIVE' and origin='PAID' limit 1`).split('|');
const over=seededOpen[0]?await call('POST',`/admin/companies/${seededOpen[0]}/entitlements/grant`,{tok:tok.sup,body:{domainCode:seededOpen[1],reason:'automated regression check'}}):{s:0};
rec('ACC-32 a grant never overrides an open paid entitlement (409 ENTITLEMENT_EXISTS) and the paid one is unchanged',over.s===409&&over.e?.code==='ENTITLEMENT_EXISTS'&&sql(`select status from company_entitlements where "companyId"='${seededOpen[0]}' and "domainCode"='${seededOpen[1]}' and origin='PAID' and status='ACTIVE' limit 1`)==='ACTIVE');
const ent=await call('GET',`/admin/companies/${B.companyId}/entitlements`,{tok:tok.sup});
const er=ent.d?.entitlements.find(e=>e.id===g1.d?.entitlementId);
rec('ACC-33 the access list shows origin ADMIN_GRANT, who granted it, why, revocable=true and an audited history',ent.s===200&&er?.origin==='ADMIN_GRANT'&&er.grantedBy===sup.email&&er.grantReason==='automated regression check'&&er.revocable===true&&er.invoice===null&&ent.d.history.some(h=>h.action==='ADMIN_ENTITLEMENT_GRANTED'));
const start=await call('POST',`/companies/${B.companyId}/assessments`,{tok:B.tok,body:{domainCode:'finance'},h:{'x-mmri-writer-id':'acc-w1'}});
rec('ACC-34 after the grant the customer CAN start the diagnosis; the grant is consumed and linked to it',start.s===201&&sql(`select status||'|'||"assessmentsUsed" from company_entitlements where id='${g1.d?.entitlementId}'`)==='CONSUMED|1'&&sql(`select count(*) from assessments where "entitlementId"='${g1.d?.entitlementId}'`)==='1',`${start.s}`);
const used=await call('POST',`/admin/entitlements/${g1.d?.entitlementId}/revoke`,{tok:tok.sup,body:{reason:'automated regression check'}});
rec('ACC-35 a consumed grant cannot be revoked and its diagnosis is preserved (409)',used.s===409&&sql(`select count(*) from assessments where "entitlementId"='${g1.d?.entitlementId}'`)==='1');
sql(`update company_entitlements set "assessmentsUsed"=1 where id='${race.find(r=>r.s===200)?.d?.entitlementId}'`);
const inUse=await call('POST',`/admin/entitlements/${race.find(r=>r.s===200)?.d?.entitlementId}/revoke`,{tok:tok.sup,body:{reason:'automated regression check'}});
rec('ACC-36 an ACTIVE grant whose usage counter is non-zero is refused (409 ENTITLEMENT_IN_USE)',inUse.s===409&&inUse.e?.code==='ENTITLEMENT_IN_USE',inUse.e?.code);
sql(`update company_entitlements set "assessmentsUsed"=0 where id='${race.find(r=>r.s===200)?.d?.entitlementId}'`);
const rv=await call('POST',`/admin/entitlements/${race.find(r=>r.s===200)?.d?.entitlementId}/revoke`,{tok:tok.sup,body:{reason:'automated regression check cleanup'}});
const rvRow=sql(`select status||'|'||"revokeReason"||'|'||("revokedAt" is not null) from company_entitlements where id='${race.find(r=>r.s===200)?.d?.entitlementId}'`);
rec('ACC-37 an unused admin grant can be revoked; the row is kept with who/when/why',rv.s===200&&rvRow==='REVOKED|automated regression check cleanup|true',rvRow);
rec('ACC-38 revoking again is 409 ENTITLEMENT_NOT_ACTIVE; unknown id is 404; missing reason is 400',(await call('POST',`/admin/entitlements/${race.find(r=>r.s===200)?.d?.entitlementId}/revoke`,{tok:tok.sup,body:{reason:'automated regression check'}})).e?.code==='ENTITLEMENT_NOT_ACTIVE'&&(await call('POST','/admin/entitlements/nope/revoke',{tok:tok.sup,body:{reason:'automated regression check'}})).s===404&&(await call('POST',`/admin/entitlements/${g1.d?.entitlementId}/revoke`,{tok:tok.sup,body:{}})).s===400);
const paidId=sql(`select id from company_entitlements where origin='PAID' and status='ACTIVE' limit 1`)||sql(`select id from company_entitlements where origin='PAID' limit 1`);
const pr=await call('POST',`/admin/entitlements/${paidId}/revoke`,{tok:tok.sup,body:{reason:'automated regression check'}});
rec('ACC-39 a paid entitlement is never revoked here (409 PAID_ENTITLEMENT_PROTECTED) and stays unchanged',pr.s===409&&pr.e?.code==='PAID_ENTITLEMENT_PROTECTED'&&sql(`select origin from company_entitlements where id='${paidId}'`)==='PAID');
rec('ACC-40 revenue and invoices are still exactly as before every grant/revoke above',invCount()===inv0&&revenue()===rev0);
rec('ACC-41 the database refuses an invoice-less PAID entitlement and a reasonless grant (DB-level rules)',(()=>{const bad=(q)=>{try{sql(q);return false}catch(e){return true}};return bad(`insert into company_entitlements(id,"domainCode","companyId","planCode",status,"updatedAt") values('x_chk1','it','${B.companyId}','DIAGNOSTIC','ACTIVE',now())`)&&bad(`insert into company_entitlements(id,"domainCode","companyId","planCode",status,"updatedAt",origin,"grantedByAdminId") select 'x_chk2','people','${B.companyId}','DIAGNOSTIC','ACTIVE',now(),'ADMIN_GRANT',id from admin_accounts limit 1`)})());
rec('ACC-42 entitlement list for an unknown company is 404',(await call('GET','/admin/companies/nope/entitlements',{tok:tok.sup})).s===404);
// company details correction
const cd=`/admin/companies/${B.companyId}/details`;
rec('ACC-43 company correction needs a reason and a valid name (400)',(await call('POST',cd,{tok:tok.sup,body:{name:'Valid Name'}})).s===400&&(await call('POST',cd,{tok:tok.sup,body:{name:'x',reason:'automated regression check'}})).s===400);
const cdo=await call('POST',cd,{tok:tok.sup,body:{name:'QA Renamed Co',industry:'Үйлчилгээ',reason:'automated regression check'}});
rec('ACC-44 company name/industry correction succeeds, is audited, and customers keep their data',cdo.s===200&&sql(`select name||'|'||industry from companies where id='${B.companyId}'`)==='QA Renamed Co|Үйлчилгээ'&&Number(sql(`select count(*) from admin_audit_events where action='ADMIN_COMPANY_UPDATED' and outcome='SUCCESS' and "targetId"='${B.companyId}'`))===1);
rec('ACC-45 audit rows exist for every kind of change with a non-null actor',Number(sql(`select count(distinct action) from admin_audit_events where outcome='SUCCESS' and "adminId" is not null and action in ('ADMIN_USER_DEACTIVATED','ADMIN_USER_ACTIVATED','ADMIN_USER_EMAIL_CHANGED','ADMIN_ENTITLEMENT_GRANTED','ADMIN_ENTITLEMENT_REVOKED','ADMIN_COMPANY_UPDATED')`))===6);
rec('ACC-46 no secret material in any admin audit metadata written by these actions',!/passw|\$argon|secret|token/i.test(sql(`select coalesce(string_agg(metadata::text,' '),'') from admin_audit_events where action like 'ADMIN_USER%' or action like 'ADMIN_ENTITLEMENT%' or action like 'ADMIN_COMPANY%'`)));
// leave the QA admins disabled, as the other admin regressions do
for(const a of [sup,rev,bil]){sql(`update admin_accounts set status='DISABLED' where "userId" in (select id from users where email='${a.email}')`)}
console.log(fail?`\n${fail} FAILED`:'\nALL PASSED');process.exit(fail?1:0);
