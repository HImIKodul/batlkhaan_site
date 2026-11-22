/* PAY-02 (stale invoice replacement), PAY-03 (one open dispute per invoice under concurrency), DX-02 (basic-info validation), duplicate/late payment idempotency. ISOLATED staging API in MOCK billing mode
   started with MMRI_INVOICE_TTL_MINUTES=5 MMRI_INVOICE_TTL_APPLY_ALL=on. */
import crypto from 'node:crypto';
const R=new URL('./lib/',import.meta.url).pathname;const {sql,customer,B}=await import(R+'admin-qa.mjs');const {http}=await import(R+'qa-journey.mjs');
let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const A=await customer('payA');const cid=(await http(B,'POST','/companies',{tok:A.tok,body:{name:'Pay Gate ХХК'}})).d.id;
// ---- PAY-02
const inv1=(await http(B,'POST',`/companies/${cid}/billing/invoices`,{tok:A.tok,body:{planCode:'DIAGNOSTIC',domainCode:'marketing'}})).d;
rec('a fresh invoice carries an expiry time (policy: created + TTL)',typeof inv1.expiresAt==='string'&&new Date(inv1.expiresAt)>new Date(),String(inv1.expiresAt));
const reuse=(await http(B,'POST',`/companies/${cid}/billing/invoices`,{tok:A.tok,body:{planCode:'DIAGNOSTIC',domainCode:'marketing'}})).d;rec('inside its lifetime the SAME open invoice is reused (no duplicate QR)',reuse.id===inv1.id);
sql(`update billing_invoices set "createdAt"=now()-interval '20 minutes' where id='${inv1.id}'`);
const inv2=(await http(B,'POST',`/companies/${cid}/billing/invoices`,{tok:A.tok,body:{planCode:'DIAGNOSTIC',domainCode:'marketing'}})).d;
rec('past its lifetime the stale invoice is replaced by a NEW invoice',inv2.id&&inv2.id!==inv1.id,`${inv1.id.slice(-6)} -> ${inv2.id?.slice(-6)}`);
rec('the stale invoice was retired (CANCELLED), not left open',sql(`select status from billing_invoices where id='${inv1.id}'`)==='CANCELLED');
rec('exactly one open invoice exists afterwards',Number(sql(`select count(*) from billing_invoices where "companyId"='${cid}' and "domainCode"='marketing' and status in ('CREATED','PENDING')`))===1);
// late payment of the retired invoice, then the replacement: access must be granted exactly once, never twice
const late=await http(B,'POST',`/billing/invoices/${inv1.id}/mock-pay`,{tok:A.tok});
const ent1=Number(sql(`select count(*) from company_entitlements where "companyId"='${cid}' and "domainCode"='marketing'`));
rec('late payment on the retired invoice is handled (accepted once or refused with a stable code, never a 500)',[200,409].includes(late.s),`${late.s} ${late.e?.code||late.d?.status||''}`);
const pay2=await http(B,'POST',`/billing/invoices/${inv2.id}/mock-pay`,{tok:A.tok});
const ent2=Number(sql(`select count(*) from company_entitlements where "companyId"='${cid}' and "domainCode"='marketing' and status in ('ACTIVE','CONSUMED')`));
rec('after both invoices were paid the domain still has ONE entitlement (no double allocation)',ent2<=1,`before=${ent1} after=${ent2}; second pay -> ${pay2.s} ${pay2.e?.code||''}`);
const again=await http(B,'POST',`/billing/invoices/${inv2.id}/mock-pay`,{tok:A.tok});rec('duplicate payment confirmation is idempotent',[200,409].includes(again.s)&&Number(sql(`select count(*) from company_entitlements where "companyId"='${cid}' and "domainCode"='marketing' and status in ('ACTIVE','CONSUMED')`))<=1);
// ---- PAY-03
const paidInv=inv2.id;const body={summary:'Төлбөр төлсөн боловч оношилгоо нээгдээгүй байна.'};
const rs=await Promise.all(Array.from({length:6},()=>http(B,'POST',`/billing/invoices/${paidInv}/dispute`,{tok:A.tok,body})));
const created=rs.filter(r=>r.s===201).length,conflicts=rs.filter(r=>r.s===409).length;
rec('6 concurrent dispute submissions create exactly ONE open dispute',created===1&&conflicts===5&&Number(sql(`select count(*) from payment_disputes where "invoiceId"='${paidInv}'`))===1,`201x${created} 409x${conflicts} other=${rs.length-created-conflicts}`);
rec('the database enforces it (partial unique index exists)',sql(`select count(*) from pg_indexes where indexname='payment_disputes_one_open_per_invoice'`)==='1');
// ---- DX-02
const pq=(await http(B,'GET','/methodology/current/profile-questions',{tok:A.tok})).d;
const profile=(basic)=>({profileAnswers:pq.map(q=>({questionId:q.id,optionIndexes:[Number(q.options?.[0]?.optionIndex??1)]})),basicInfoAnswers:basic});
const ok20=Array.from({length:20},(_,i)=>({questionId:`B${String(i+1).padStart(2,'0')}`,optionIndexes:[1]}));
rec('a valid 20-answer basic profile is accepted',(await http(B,'PUT',`/companies/${cid}/profile-answers`,{tok:A.tok,body:profile(ok20)})).s===200);
const snap=sql(`select profile::text from companies where id='${cid}'`);
const tryBad=async(label,mut)=>{const rows=ok20.map(r=>({...r}));mut(rows);const r=await http(B,'PUT',`/companies/${cid}/profile-answers`,{tok:A.tok,body:profile(rows)});rec(`DX-02 rejected: ${label}`,r.s===400,String(r.s));};
await tryBad('option index above the question\'s range (B01 has 5 options)',r=>{r[0].optionIndexes=[6]});
await tryBad('option index 99',r=>{r[3].optionIndexes=[99]});
await tryBad('two selections on a single-select question',r=>{r[2].optionIndexes=[1,2]});
await tryBad('duplicate option index',r=>{r[4].optionIndexes=[2,2]});
await tryBad('string option index',r=>{r[5].optionIndexes=['1']});
await tryBad('empty selection',r=>{r[6].optionIndexes=[]});
await tryBad('B09 allows 7 options but 8 is out of range',r=>{r[8].optionIndexes=[8]});
rec('rejected requests left the stored profile unchanged',sql(`select profile::text from companies where id='${cid}'`)===snap);
const up=ok20.map(r=>({...r}));up[8].optionIndexes=[7];rec('the widest valid choice (B09 option 7) is still accepted',(await http(B,'PUT',`/companies/${cid}/profile-answers`,{tok:A.tok,body:profile(up)})).s===200);
console.log(`RESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
