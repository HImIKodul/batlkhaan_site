/* Administrator alert e-mail dispatcher regression (isolated QA stack, mock mailbox). Reproduces the starvation defect (processed alerts filling the selection window so newer pending alerts are
   never mailed) and checks retry states, duplicate suppression, concurrency, recipients (a DISABLED administrator's address receives nothing), bounded cost and that mail bodies carry only their own alert.
   QA env must have MMRI_ADMIN_ALERT_EMAILS="qa-admin@mmri.test,<address of a DISABLED administrator>" (second address: DISABLED_ADMIN). Seeds rows with ids `mda-*`, removes them at the end. */
import fs from 'node:fs';import crypto from 'node:crypto';
import {call,sql,freshAdminTotp} from './lib/admin-qa.mjs';
let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const sup={email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,secret:process.env.ADMIN_TOTP_SECRET};
const S=(await call('POST','/admin/auth/login',{body:{email:sup.email,password:sup.password,totpCode:await freshAdminTotp(sup)}})).d.token;
const maintStatuses=[];const maint=async()=>{let r=await call('POST','/admin/maintenance/run',{tok:S,body:{}});if(r.s===401&&r.e?.code==='ADMIN_REAUTH_REQUIRED'){await call('POST','/admin/auth/reauth',{tok:S,body:{password:sup.password,totpCode:await freshAdminTotp(sup)}});r=await call('POST','/admin/maintenance/run',{tok:S,body:{}})}if(r.s===429){await new Promise(x=>setTimeout(x,3000));r=await call('POST','/admin/maintenance/run',{tok:S,body:{}})}maintStatuses.push(r.s);return r};
const outbox=process.env.MMRI_MOCK_MAIL_DIR+'/outbox.jsonl';const mails=()=>fs.readFileSync(outbox,'utf8').trim().split('\n').map(l=>JSON.parse(l));
const R1='qa-admin@mmri.test',DIS=process.env.DISABLED_ADMIN||'admin.qa.nt.1794838165698.14ee@mmri.test';const hash=a=>crypto.createHash('sha256').update(a).digest('hex').slice(0,12);
const tag=crypto.randomBytes(3).toString('hex');
rec('precondition: the second configured recipient belongs to a DISABLED administrator account',sql(`select count(*) from admin_accounts a join users u on u.id=a."userId" where lower(u.email)='${DIS}' and a.status<>'ACTIVE'`)==='1');
const ins=(id,type,ageH,title)=>sql(`insert into admin_notifications (id,type,"dedupeKey","targetType","targetId",severity,title,body,"createdAt") values ('${id}','${type}','MDA:${id}','REVIEW','x-${id}','INFO','${title}','Тест ${id}',now()-interval '${ageH} hours')`);
const mark=(id,h,cols)=>sql(`insert into mail_dispatch_marks ("dedupeKey",kind,${cols[0]}) values ('AN:${id}:${h}','ADMIN_REVIEW_ALERT',${cols[1]})`);
// > 120 processed alerts, all OLDER than the pending ones
for(let i=0;i<130;i++){const id=`mda-old-${tag}-${i}`;ins(id,'NEW_ASSESSMENT',47,`Хуучин ${tag}-${i}`);mark(id,hash(R1),['attempts,"sentAt"','1,now()-interval \'46 hours\''])}
ins(`mda-new1-${tag}`,'NEW_ASSESSMENT',0,`Шинэ-1 ${tag}`);ins(`mda-new2-${tag}`,'REVIEW_OVERDUE',0,`Шинэ-2 ${tag}`);
ins(`mda-retry-${tag}`,'NEW_ASSESSMENT',1,`Дахин-${tag}`);mark(`mda-retry-${tag}`,hash(R1),['attempts,"nextAttemptAt","lastError"',"2,now()-interval '1 minute','provider did not accept the message'"]);
ins(`mda-wait-${tag}`,'NEW_ASSESSMENT',1,`Хүлээх-${tag}`);mark(`mda-wait-${tag}`,hash(R1),['attempts,"nextAttemptAt","lastError"',"1,now()+interval '30 minutes','provider did not accept the message'"]);
ins(`mda-dead-${tag}`,'NEW_ASSESSMENT',1,`Дууссан-${tag}`);mark(`mda-dead-${tag}`,hash(R1),['attempts,"nextAttemptAt","lastError"',"5,now()-interval '1 minute','gave up'"]);
const TYPES="'NEW_ASSESSMENT','REVIEW_OVERDUE'";
const oldSel=Number(sql(`select count(*) from (select a.id from admin_notifications a where a.type in (${TYPES}) and a."createdAt">=now()-interval '48 hours' order by a."createdAt" asc limit 120) x where not exists (select 1 from mail_dispatch_marks m where m."dedupeKey"='AN:'||x.id||':${hash(R1)}' and m."sentAt" is not null)`));
rec('ORIGINAL-style selection reproduced: the oldest-120 window holds no deliverable alert (the defect class)',oldSel===0,`deliverable in oldest 120 = ${oldSel}`);
const before=mails().length;for(let i=0;i<10;i++){await maint();const n=Number(sql(`select count(*) from mail_dispatch_marks where "dedupeKey" in ('AN:mda-new1-${tag}:${hash(R1)}','AN:mda-new2-${tag}:${hash(R1)}','AN:mda-retry-${tag}:${hash(R1)}') and "sentAt" is not null`));if(n===3)break}
const fresh=mails().slice(before).filter(m=>m.kind==='ADMIN_REVIEW_ALERT'&&m.text.includes(tag));
const titles=fresh.map(m=>(/(Шинэ-\d|Дахин|Хүлээх|Дууссан|Хуучин)/.exec(m.subject+m.text)||[])[1]);
rec('new pending alerts are delivered (2 new + 1 due retry) despite 130 older processed alerts',[`Шинэ-1 ${tag}`,`Шинэ-2 ${tag}`,`Дахин-${tag}`].every(k=>fresh.some(m=>m.text.includes(k))),`${fresh.length} mails`);
rec('exactly one mail per alert and recipient (no duplicates)',fresh.length===3&&new Set(fresh.map(m=>m.subject+m.to)).size===3);
rec('only the configured ACTIVE recipient is mailed; the disabled administrator\'s address receives nothing',fresh.every(m=>m.to===R1)&&!mails().some(m=>m.to===DIS&&m.kind==='ADMIN_REVIEW_ALERT'&&m.text.includes(tag)));
rec('the 130 already-sent alerts were not mailed again',!mails().some(m=>m.kind==='ADMIN_REVIEW_ALERT'&&/Хуучин/.test(m.text)&&m.text.includes(tag)));
rec('retry state respected: a retry that is due is sent; one still waiting is not; one that exhausted its attempts is not',fresh.some(m=>m.text.includes('Дахин-'+tag))&&!fresh.some(m=>m.text.includes('Хүлээх-'+tag))&&!fresh.some(m=>m.text.includes('Дууссан-'+tag)));
rec('each mail body contains only its own alert (no other alert or tenant text)',fresh.every(m=>(m.text.match(/Тест mda-[a-z0-9-]+/g)||[]).length===1));
const marks=sql(`select count(*) from mail_dispatch_marks where "dedupeKey" like 'AN:mda-new%-${tag}:%' and "sentAt" is not null`);rec('delivery marks written once per alert and recipient',marks==='2');
const b2=mails().length;await Promise.all([maint(),maint(),maint()]);rec('three simultaneous dispatch passes plus repeats send nothing more (atomic claims)',mails().slice(b2).filter(m=>m.kind==='ADMIN_REVIEW_ALERT'&&m.text.includes(tag)).length===0);
ins(`mda-new3-${tag}`,'NEW_ASSESSMENT',0,`Шинэ-3 ${tag}`);const b3=mails().length;await Promise.all([maint(),maint(),maint()]);for(let i=0;i<3&&sql(`select count(*) from mail_dispatch_marks where "dedupeKey"='AN:mda-new3-${tag}:${hash(R1)}' and "sentAt" is not null`)!=='1';i++)await maint();
rec('three simultaneous passes send exactly one mail for one new alert',mails().slice(b3).filter(m=>m.kind==='ADMIN_REVIEW_ALERT'&&m.text.includes('Шинэ-3 '+tag)).length===1);
const plan=sql(`explain (analyze, format json) select a.id from admin_notifications a where a.type = any(array[${TYPES}]) and a."createdAt">=now()-interval '48 hours' and exists (select 1 from unnest(array['${hash(R1)}']) h where not exists (select 1 from mail_dispatch_marks m where m."dedupeKey"='AN:'||a.id||':'||h and (m."sentAt" is not null or m.attempts>=5 or m."nextAttemptAt">now()))) order by a."createdAt" asc limit 120`);
const ms=Number(JSON.parse(plan)[0]['Execution Time']);rec('selection query is bounded (LIMIT) and fast',ms<200&&/"Node Type":\s*"Limit"/.test(plan),`${ms.toFixed(1)} ms`);
for(const t of ["delete from mail_dispatch_marks where \"dedupeKey\" like 'AN:mda-%'","delete from admin_notifications where id like 'mda-%'"]){try{sql(t)}catch{}}
rec('every maintenance pass was accepted (HTTP 200), so a missing mail cannot be a rejected trigger',maintStatuses.length>0&&maintStatuses.every(x=>x===200),[...new Set(maintStatuses)].join(','));
console.log(`\nRESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
