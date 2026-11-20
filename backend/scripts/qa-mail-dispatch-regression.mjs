/* Lifecycle mail dispatcher regression (isolated QA stack only; mock mailbox). Reproduces the original defect: more than 120 already-sent notifications in the 48 h window used to
   hide newer pending ones (the oldest 120 were read BEFORE sent rows were skipped). Needs API, PGDATABASE, DATABASE_URL, MMRI_MOCK_MAIL_DIR, ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_TOTP_SECRET (QA SUPER_ADMIN).
   Seeds clearly tagged synthetic rows (ids `mdt-*`), removes them at the end. */
import fs from 'node:fs';import crypto from 'node:crypto';
import {call,sql,customer,B,freshAdminTotp} from './lib/admin-qa.mjs';import {http} from './lib/qa-journey.mjs';
let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const sup={email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,secret:process.env.ADMIN_TOTP_SECRET};
const S=(await call('POST','/admin/auth/login',{body:{email:sup.email,password:sup.password,totpCode:await freshAdminTotp(sup)}})).d.token;
const maint=async()=>{let r=await call('POST','/admin/maintenance/run',{tok:S,body:{}});if(r.s===401&&r.e?.code==='ADMIN_REAUTH_REQUIRED'){await call('POST','/admin/auth/reauth',{tok:S,body:{password:sup.password,totpCode:await freshAdminTotp(sup)}});r=await call('POST','/admin/maintenance/run',{tok:S,body:{}})}return r};
const outbox=process.env.MMRI_MOCK_MAIL_DIR+'/outbox.jsonl';const mails=()=>fs.readFileSync(outbox,'utf8').trim().split('\n').map(l=>JSON.parse(l));
const tag=crypto.randomBytes(3).toString('hex');
const mk=async(label,name)=>{const cu=await customer(label);const co=await http(B,'POST','/companies',{tok:cu.tok,body:{name}});const uid=sql(`select id from users where email='${cu.email}'`);return {...cu,uid,cid:co.d.id,name}};
const A=await mk('mda',`Dispatch A ${tag} ХХК`),Bc=await mk('mdb',`Dispatch B ${tag} ХХК`),C=await mk('mdc',`Dispatch C ${tag} ХХК`);
const TYPES="'ASSESSMENT_COMPLETED','REPORT_UNDER_REVIEW','REPORT_RELEASED'";
// Drain any backlog left by earlier suites first (the dispatcher sends at most 40 per pass, oldest first: a fresh mail waits behind a backlog, it is never lost). Bounded: 40 passes.
for(let i=0;i<40;i++){const pend=Number(sql(`select count(*) from customer_notifications n where n.type in (${TYPES}) and n."createdAt">=now()-interval '48 hours' and not exists (select 1 from mail_dispatch_marks m where m."dedupeKey"='CN:'||n.id and (m."sentAt" is not null or m.attempts>=5 or m."nextAttemptAt">now()))`));if(pend===0)break;await maint()}
const ins=(id,u,c,type,ageH,dom='finance')=>sql(`insert into customer_notifications (id,"userId","companyId",type,title,message,destination,payload,"eventRef","dedupeKey","createdAt") values ('${id}','${u}','${c}','${type}','t','m','report','{"domainCode":"${dom}"}'::jsonb,'mdt','MDT:${id}',now()-interval '${ageH} hours')`);
// 1. > 120 already-sent notifications inside the 48 h window (the original defect needs them to be OLDER than the pending ones)
for(let i=0;i<130;i++){const id=`mdt-old-${tag}-${i}`;ins(id,A.uid,A.cid,'ASSESSMENT_COMPLETED',47);sql(`insert into mail_dispatch_marks ("dedupeKey",kind,attempts,"sentAt") values ('CN:${id}','ASSESSMENT_COMPLETED',1,now()-interval '46 hours')`)}
ins(`mdt-newA-${tag}`,A.uid,A.cid,'REPORT_RELEASED',0);ins(`mdt-newB-${tag}`,Bc.uid,Bc.cid,'REPORT_RELEASED',0);ins(`mdt-newC-${tag}`,C.uid,C.cid,'ASSESSMENT_COMPLETED',0);
const blocked=`mdt-blocked-${tag}@blocked.test`,okC=C.email;sql(`update users set email='${blocked}' where id='${C.uid}'`);
rec('seeded 130 sent notifications (older) + 3 new pending ones in the 48 h window',Number(sql(`select count(*) from customer_notifications where id like 'mdt-old-${tag}-%'`))===130&&Number(sql(`select count(*) from customer_notifications where id like 'mdt-new_-${tag}'`))===3);
// 2. reproduce the ORIGINAL selection (oldest 120 first, sent rows skipped afterwards): it can no longer reach the new rows
const oldSel=Number(sql(`select count(*) from (select n.id from customer_notifications n where n.type in (${TYPES}) and n."createdAt">=now()-interval '48 hours' order by n."createdAt" asc limit 120) x where not exists (select 1 from mail_dispatch_marks m where m."dedupeKey"='CN:'||x.id and m."sentAt" is not null)`));
rec('ORIGINAL algorithm reproduced: the oldest-120 window contains no deliverable row (the defect)',oldSel===0,`deliverable in oldest 120 = ${oldSel}`);
const newSel=sql(`select string_agg(id,',') from (select n.id from customer_notifications n where n.type in (${TYPES}) and n."createdAt">=now()-interval '48 hours' and not exists (select 1 from mail_dispatch_marks m where m."dedupeKey"='CN:'||n.id and (m."sentAt" is not null or m.attempts>=5 or m."nextAttemptAt">now())) order by n."createdAt" asc limit 120) y where id like 'mdt-new_-${tag}'`);
rec('FIXED selection reaches all three new pending rows',(newSel||'').split(',').length===3,newSel);
// 3. dispatch (a few passes: other synthetic QA rows may be pending too; each pass sends at most 40)
const before=mails().length;let r1;const t0=Date.now();for(let i=0;i<8;i++){r1=await maint();if(Number(sql(`select count(*) from mail_dispatch_marks where "dedupeKey" in ('CN:mdt-newA-${tag}','CN:mdt-newB-${tag}') and "sentAt" is not null`))===2)break}
const dur=Date.now()-t0;const fresh=mails().slice(before);const toA=fresh.filter(m=>m.to===A.email),toB=fresh.filter(m=>m.to===Bc.email);
rec('new eligible e-mails were dispatched: exactly one REPORT_RELEASED each to tenant A and tenant B',toA.filter(m=>m.kind==='REPORT_RELEASED').length===1&&toB.filter(m=>m.kind==='REPORT_RELEASED').length===1,`A ${toA.length} B ${toB.length}`);
rec('the 130 previously sent notifications were NOT mailed again',toA.filter(m=>m.kind==='ASSESSMENT_COMPLETED').length===0,`ASSESSMENT_COMPLETED to A: ${toA.filter(m=>m.kind==='ASSESSMENT_COMPLETED').length}`);
rec('tenant isolation: each mail goes to its own owner and names only its own company',toA[0]?.text.includes(A.name)&&!toA[0].text.includes(Bc.name)&&toB[0]?.text.includes(Bc.name)&&!toB[0].text.includes(A.name)&&!fresh.some(m=>m.to===A.email&&m.text.includes(Bc.name)));
rec('delivery marks: sentAt set for A and B (exactly-once claim rows)',sql(`select count(*) from mail_dispatch_marks where "dedupeKey" in ('CN:mdt-newA-${tag}','CN:mdt-newB-${tag}') and "sentAt" is not null and attempts>=0`)==='2');
// 4. failed delivery: recipient not allow-listed -> provider drops it -> failure recorded, retry scheduled, nothing sent
const mC=sql(`select attempts||'|'||("sentAt" is null)||'|'||("nextAttemptAt">now())||'|'||coalesce("lastError",'') from mail_dispatch_marks where "dedupeKey"='CN:mdt-newC-${tag}'`);
rec('failed delivery recorded: attempts>=1, not sent, retry scheduled in the future, error stored (no recipient address)',/^[1-9]\|true\|true\|.+/.test(mC)&&!mC.includes('blocked.test'),mC);
const att1=Number(mC.split('|')[0]);await maint();
rec('no retry before its scheduled time (attempts unchanged, still unsent)',Number(sql(`select attempts from mail_dispatch_marks where "dedupeKey"='CN:mdt-newC-${tag}'`))===att1&&sql(`select "sentAt" is null from mail_dispatch_marks where "dedupeKey"='CN:mdt-newC-${tag}'`)==='t');
// 5. retry once the address is fixed and the retry time arrived
sql(`update users set email='${okC}' where id='${C.uid}'`);sql(`update mail_dispatch_marks set "nextAttemptAt"=now()-interval '1 minute' where "dedupeKey"='CN:mdt-newC-${tag}'`);
const b2=mails().length;for(let i=0;i<4;i++){await maint();if(sql(`select "sentAt" is not null from mail_dispatch_marks where "dedupeKey"='CN:mdt-newC-${tag}'`)==='t')break}
const toC=mails().slice(b2).filter(m=>m.to===okC);rec('failed delivery is retried and then delivered exactly once',toC.length===1&&toC[0].kind==='ASSESSMENT_COMPLETED'&&sql(`select "sentAt" is not null and "lastError" is null from mail_dispatch_marks where "dedupeKey"='CN:mdt-newC-${tag}'`)==='t',`mails ${toC.length}`);
await maint();await maint();const after=mails().slice(before);rec('repeated dispatch passes create no duplicates for A, B or C',after.filter(m=>m.to===A.email).length===1&&after.filter(m=>m.to===Bc.email).length===1&&after.filter(m=>m.to===okC).length===1);
// 6. concurrency: two simultaneous dispatch passes for one new notification -> one mail (atomic claim)
ins(`mdt-newD-${tag}`,Bc.uid,Bc.cid,'REPORT_UNDER_REVIEW',0);const b3=mails().length;await Promise.all([maint(),maint(),maint()]);for(let i=0;i<3&&sql(`select count(*) from mail_dispatch_marks where "dedupeKey"='CN:mdt-newD-${tag}' and "sentAt" is not null`)!=='1';i++)await maint();
rec('three simultaneous dispatch passes send exactly one e-mail for one notification',mails().slice(b3).filter(m=>m.to===Bc.email&&m.kind==='REPORT_UNDER_REVIEW').length===1);
// 7. bounded and efficient
const plan=sql(`explain (analyze, format json) select n.id from customer_notifications n where n.type = any(array[${TYPES}]) and n."createdAt">=now()-interval '48 hours' and not exists (select 1 from mail_dispatch_marks m where m."dedupeKey"='CN:'||n.id and (m."sentAt" is not null or m.attempts>=5 or m."nextAttemptAt">now())) order by n."createdAt" asc limit 120`);
const ms=Number(JSON.parse(plan)[0]['Execution Time']);const rows=JSON.stringify(JSON.parse(plan)[0].Plan).match(/"Actual Rows":(\d+)/)?.[1];
rec('the selection query is bounded (LIMIT 120) and fast',ms<200&&/"Node Type":\s*"Limit"/.test(plan),`execution ${ms.toFixed(1)} ms, rows ${rows}; a dispatch pass took ${dur} ms`);
rec('a dispatch pass over the seeded backlog finishes in bounded time (< 15 s for up to 8 passes)',dur<15000,`${dur} ms`);
// cleanup (best effort; tagged rows only)
for(const t of ["delete from mail_dispatch_marks where \"dedupeKey\" like 'CN:mdt-%'","delete from customer_notifications where id like 'mdt-%'"]){try{sql(t)}catch{}}
console.log(`\nRESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
