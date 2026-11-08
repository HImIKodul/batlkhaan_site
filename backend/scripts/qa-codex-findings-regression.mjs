/* Regression for the Codex audit findings H01 H02 H03 H05 M01 M02 against a REAL API (isolated test database, AI provider disabled, mock billing/mail).
   Needs: the API started with MMRI_REPORT_REVIEW_REQUIRED=true; PGDATABASE (and DATABASE_URL for the admin CLI) pointing at the isolated database; MMRI_MOCK_MAIL_DIR shared with the API.
   Refuses to run against the default "mmri" database. One 280-answer journey, about 5 minutes. Usage: node scripts/qa-codex-findings-regression.mjs [marketing|it|finance|people|operations] */
import crypto from 'crypto';import fs from 'fs';import path from 'path';import {execFileSync} from 'child_process';
import {call,sql,totp,provision,adminLogin,customer,B} from './lib/admin-qa.mjs';
if(!process.env.PGDATABASE||process.env.PGDATABASE==='mmri'||!/codexfix|test/.test(process.env.PGDATABASE)){console.error('Refusing to run: PGDATABASE must name an isolated test database');process.exit(2)}
const domain=process.argv[2]||'people';let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const W=crypto.randomUUID();const cc=(m,p,tok,body)=>call(m,p,{tok,body,h:{'x-mmri-writer-id':W}});
const rv=provision('REPORT_REVIEWER','cx'),sup=provision('SUPER_ADMIN','cx');const R=(await adminLogin(rv)).d.token,S=(await adminLogin(sup)).d.token;
const reauth=async(a,tok,off=1)=>cc('POST','/admin/auth/reauth',tok,{password:a.password,totpCode:totp(a.secret,off)});
let off=1;const re=async(a,t)=>{off++;return reauth(a,t,off)};
const cu=await customer('cx');const co=(await cc('POST','/companies',cu.tok,{name:'Codex Findings ХХК'})).d.id;
const pq=(await cc('GET','/methodology/current/profile-questions',cu.tok)).d;await cc('PUT',`/companies/${co}/profile-answers`,cu.tok,{profileAnswers:pq.slice(0,20).map(q=>({questionId:q.id,optionIndexes:[q.options[0].optionIndex]}))});
// ---- journey WITHOUT calling /complete: the terminal answer itself must enqueue the review (H01)
const inv=(await cc('POST',`/companies/${co}/billing/invoices`,cu.tok,{planCode:'DIAGNOSTIC',domainCode:domain})).d;await cc('POST',`/billing/invoices/${inv.id}/mock-pay`,cu.tok);
const aid=(await cc('POST',`/companies/${co}/assessments`,cu.tok,{domainCode:domain})).d.id;
let route=(await cc('POST',`/assessments/${aid}/start`,cu.tok,{mode:'QUICK',profileAnswers:pq.slice(0,20).map(q=>({questionId:q.id,optionIndexes:[q.options[0].optionIndex]}))})).d;let n=0;
while(route?.nextQuestion&&n<420){const q=route.nextQuestion;const sc=q.options.filter(o=>typeof o.score==='number');const idx=sc.length?(n%3===0?sc.reduce((x,y)=>y.score<x.score?y:x):sc.reduce((x,y)=>y.score>x.score?y:x)).optionIndex:(q.options.find(o=>!['DNK','N_A_CLAIM'].includes(o.state))||q.options[0]).optionIndex;
 const r=await cc('POST',`/assessments/${aid}/answers`,cu.tok,{questionId:q.id,optionIndex:idx,questionIssueId:route.questionIssueId||q.questionIssueId,expectedAssessmentRevision:route.assessmentRevision,clientRequestId:crypto.randomUUID()});if(r.s>=300)break;route=r.d?.routing||r.d;n++}
const st=sql(`select status from assessments where id='${aid}'`);const reviewCount=()=>Number(sql(`select count(*) from report_reviews where "assessmentId"='${aid}'`));
rec('H01-1 an assessment finished by its LAST ANSWER (no /complete call) already has exactly one review record and one admin notification',['COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED'].includes(st)&&reviewCount()===1,`status ${st}, answered ${n}, reviews ${reviewCount()}`);
const rvId=sql(`select id from report_reviews where "assessmentId"='${aid}'`);rec('H01-2 exactly one NEW_ASSESSMENT notification for that review',Number(sql(`select count(*) from admin_notifications where "dedupeKey"='NEW_ASSESSMENT:${rvId}'`))===1);
const gates=['report','report/pdf','report/pdf/metadata','report-payload','results','diagnosis','recommendations','action-plan','trace'];const blocked=[];for(const g of gates){const r=await cc('GET',`/assessments/${aid}/${g}`,cu.tok);if(r.s===409&&r.e?.code==='REPORT_PENDING_REVIEW')blocked.push(g)}
const ap=await cc('POST',`/assessments/${aid}/report/pdf/regenerate`,cu.tok);const ms=await cc('PATCH',`/assessments/${aid}/action-plan/milestones/none`,cu.tok,{status:'DONE'});
rec('H01-3 every customer report/result/PDF/plan endpoint refuses with REPORT_PENDING_REVIEW while pending',blocked.length===gates.length&&ap.s===409&&ms.s===409,`${blocked.length}/${gates.length} regen ${ap.s} patch ${ms.s}`);
// fail-closed: simulate a completion path that skipped the workflow (test DB only: bypass triggers/FKs to remove the review)
let st2='';for(let i=0;i<60;i++){st2=sql(`select status from report_reviews where "assessmentId"='${aid}'`);if(st2==='AWAITING_REVIEW'||st2==='GENERATION_FAILED')break;await sleep(2000)}
rec('H01-4 the automatically generated draft reaches AWAITING_REVIEW',st2==='AWAITING_REVIEW',st2);
const det0=await cc('GET',`/admin/reviews/${rvId}`,R);const claimsAll=det0.d.claims;const sample=claimsAll.find(c=>c.text.length>60)?.text.slice(0,60);
// ---- H02 export while pending
const exp=await cc('GET',`/companies/${co}/export`,cu.tok);const as=exp.d.assessments[0];
rec('H02-1 owner export of a PENDING assessment withholds scores, diagnosis, plan and report text',exp.s===200&&as.derivedContent==='WITHHELD_PENDING_REVIEW'&&!('overallOfficialScore' in as)&&!('overallPartialScore' in as)&&!('diagnosisSnapshots' in as)&&!('strategyPlanSnapshot' in as)&&!('reportSnapshots' in as));
rec('H02-2 the draft narrative text appears nowhere in the export payload',!!sample&&!exp.raw.includes(sample));
rec('H02-3 the customer still receives their own submitted answers and company data',as.answers.length>=n-1&&exp.d.company.name==='Codex Findings ХХК'&&exp.d.payments.length===1,`answers ${as.answers.length}`);
const acc=await cc('GET','/account/export',cu.tok);rec('H02-4 the account export contains no report content',acc.s===200&&!acc.raw.includes(sample)&&!/narrative|reportSnapshots|diagnosisSnapshots/.test(acc.raw));
const altEp=await Promise.all(['/report','/report-payload','/results'].map(p=>cc('GET',`/assessments/${aid}${p}`,cu.tok)));rec('H02-5 alternative endpoints also refuse the pending draft',altEp.every(r=>r.s===409));
// ---- H01 fail-closed gate
sql(`begin; set local session_replication_role=replica; delete from report_review_suggestions where "reviewId"='${rvId}'; delete from report_review_revisions where "reviewId"='${rvId}'; delete from report_reviews where id='${rvId}'; commit;`);
const gone=reviewCount()===0;const g1=await cc('GET',`/assessments/${aid}/report`,cu.tok);const back=reviewCount();
rec('H01-5 a completed assessment with NO review record (workflow skipped) is refused and its review is created on first access (fail closed)',gone&&g1.s===409&&g1.e?.code==='REPORT_PENDING_REVIEW'&&back===1,`gone=${gone} status=${g1.s} recreated=${back}`);
const rvId2=sql(`select id from report_reviews where "assessmentId"='${aid}'`);for(let i=0;i<60;i++){st2=sql(`select status from report_reviews where id='${rvId2}'`);if(st2==='AWAITING_REVIEW'||st2==='GENERATION_FAILED')break;await sleep(2000)}
rec('H01-6 the recreated review produces its draft and enters the admin queue',st2==='AWAITING_REVIEW');
// ---- admin flow
const claim=await cc('POST',`/admin/reviews/${rvId2}/claim`,R,{});const det=await cc('GET',`/admin/reviews/${rvId2}`,R);const cl=det.d.claims.find(c=>c.sectionId==='S10')||det.d.claims[det.d.claims.length-1];
const baseRev=Number(sql(`select "currentRevision" from report_reviews where id='${rvId2}'`));
// M02: a draft whose validation is REPAIR_REQUIRED (executive conclusion far below 80 words) must not be approvable
const shortE=await cc('PUT',`/admin/reviews/${rvId2}/draft`,R,{baseRevision:baseRev,reason:'M02 туршилт: хэт богино дүгнэлт',edits:[{claimId:cl.claimId,text:'Богино дүгнэлт.'}]});
await cc('POST',`/admin/reviews/${rvId2}/ready`,R,{});await re(rv,R);const apBad=await cc('POST',`/admin/reviews/${rvId2}/approve`,R,{baseRevision:shortE.d.revision});
rec('M02-1 a REPAIR_REQUIRED draft is refused at approval with a clear code (the customer page would reject it)',shortE.s===200&&shortE.d.validation.state==='REPAIR_REQUIRED'&&apBad.s===422&&apBad.e?.code==='VALIDATION_NOT_PUBLISHABLE'&&sql(`select status from report_reviews where id='${rvId2}'`)==='READY_FOR_APPROVAL',`validation ${shortE.d.validation?.state}, approve ${apBad.s} ${apBad.e?.code}`);
rec('M02-2 nothing was published or bound by the rejected approval',sql(`select ("approvedRevision" is null and "approvedNarrativeHash" is null)::text from report_reviews where id='${rvId2}'`)==='true');
await cc('POST',`/admin/reviews/${rvId2}/return`,R,{});const okE=await cc('PUT',`/admin/reviews/${rvId2}/draft`,R,{baseRevision:shortE.d.revision,reason:'M02 туршилт: анхны текстийг сэргээв',edits:[{claimId:cl.claimId,text:cl.text}]});
await cc('POST',`/admin/reviews/${rvId2}/ready`,R,{});await re(rv,R);const apOk=await cc('POST',`/admin/reviews/${rvId2}/approve`,R,{baseRevision:okE.d.revision});
const rowA=sql(`select status||'|'||"approvedRevision"||'|'||coalesce("approvedNarrativeHash",'') from report_reviews where id='${rvId2}'`).split('|');
rec('M02-3 a PASS draft is approved and the approval records the exact revision and narrative hash',okE.d.validation.state==='PASS'&&apOk.s===200&&rowA[0]==='APPROVED'&&Number(rowA[1])===okE.d.revision&&rowA[2].length===64,`validation ${okE.d.validation?.state} approve ${apOk.s} ${apOk.e?.code??''} ${rowA[0]}`);
// H03 deterministic exclusivity: while PUBLISHING nothing else may touch the review
const snapBefore=sql(`select "narrativeHash" from report_snapshots where "assessmentId"='${aid}' and "publishedAt" is not null order by "publishedAt" desc limit 1`);
sql(`update report_reviews set status='PUBLISHING' where id='${rvId2}'`);
const eP=await cc('PUT',`/admin/reviews/${rvId2}/draft`,R,{baseRevision:okE.d.revision,reason:'Нийтлэх үед засах оролдлого',edits:[{claimId:cl.claimId,text:cl.text+' Дараа нэмсэн.'}]});const rtP=await cc('POST',`/admin/reviews/${rvId2}/return`,R,{});await re(rv,R);const pP=await cc('POST',`/admin/reviews/${rvId2}/publish`,R,{});const apP=await cc('POST',`/admin/reviews/${rvId2}/approve`,R,{baseRevision:okE.d.revision});
const unchanged=sql(`select "currentRevision"::text||status from report_reviews where id='${rvId2}'`)===`${okE.d.revision}PUBLISHING`;
rec('H03-1 while a publication is in progress, edits, returns, a second publish and re-approval are all refused (exclusive PUBLISHING state)',eP.s===409&&rtP.s===409&&pP.s===409&&pP.e?.code==='PUBLISH_IN_PROGRESS'&&apP.s===409&&unchanged,`edit ${eP.s} return ${rtP.s} publish ${pP.s} approve ${apP.s}`);
sql(`update report_reviews set status='APPROVED' where id='${rvId2}'`);
// approval binding: a tampered approval hash must not publish
const goodHash=sql(`select "approvedNarrativeHash" from report_reviews where id='${rvId2}'`);sql(`update report_reviews set "approvedNarrativeHash"='${'0'.repeat(64)}' where id='${rvId2}'`);
await re(rv,R);const tam=await cc('POST',`/admin/reviews/${rvId2}/publish`,R,{});const afterTam=sql(`select status from report_reviews where id='${rvId2}'`);const snapAfterTam=sql(`select "narrativeHash" from report_snapshots where "assessmentId"='${aid}' and "publishedAt" is not null order by "publishedAt" desc limit 1`);
rec('H03-2 publication is bound to the approved narrative hash: a mismatch is refused, the review returns to APPROVED and the report is untouched',tam.s===409&&tam.e?.code==='APPROVAL_MISMATCH'&&afterTam==='APPROVED'&&snapAfterTam===snapBefore,`${tam.s} ${tam.e?.code} ${afterTam}`);
sql(`update report_reviews set "approvedNarrativeHash"='${goodHash}' where id='${rvId2}'`);
// H03 real race: publish x2 + edit + return in parallel
await re(rv,R);const race=await Promise.all([cc('POST',`/admin/reviews/${rvId2}/publish`,R,{}),cc('PUT',`/admin/reviews/${rvId2}/draft`,R,{baseRevision:okE.d.revision,reason:'Зэрэгцээ засвар',edits:[{claimId:cl.claimId,text:cl.text+' Зэрэгцээ.'}]}),cc('POST',`/admin/reviews/${rvId2}/publish`,R,{}),cc('POST',`/admin/reviews/${rvId2}/return`,R,{})]);
const fin=sql(`select status||'|'||"currentRevision"||'|'||coalesce("publishedRevision"::text,'')||'|'||coalesce("approvedRevision"::text,'') from report_reviews where id='${rvId2}'`).split('|');
const okPub=race.filter((x,i)=>(i===0||i===2)&&x.s===200).length;
let inv3=false,detail='';
if(fin[0]==='PUBLISHED'){const same=sql(`select (s.narrative=r.narrative and s."narrativeHash"=rv."approvedNarrativeHash")::text from report_snapshots s join report_reviews rv on rv."assessmentId"=s."assessmentId" join report_review_revisions r on r."reviewId"=rv.id and r.revision=rv."publishedRevision" where s."assessmentId"='${aid}' and s."publishedAt" is not null order by s."publishedAt" desc limit 1`);inv3=okPub===1&&fin[2]===fin[3]&&same==='true';detail=`published rev ${fin[2]} approved rev ${fin[3]} snapshot==approved:${same}`}
else{const snapNow=sql(`select "narrativeHash" from report_snapshots where "assessmentId"='${aid}' and "publishedAt" is not null order by "publishedAt" desc limit 1`);inv3=fin[0]==='IN_REVIEW'&&okPub===0&&snapNow===snapBefore&&fin[3]==='';detail=`edit/return won: status ${fin[0]}, publishes ${race.map(x=>x.s)}`}
rec('H03-3 simultaneous publish x2 + edit + return: exactly one consistent outcome (published == approved revision/hash, or untouched)',inv3,`${detail} | statuses ${race.map(x=>x.s).join(',')}`);
// make sure we end PUBLISHED for the remaining checks
if(fin[0]!=='PUBLISHED'){const cur=Number(sql(`select "currentRevision" from report_reviews where id='${rvId2}'`));const dd=await cc('GET',`/admin/reviews/${rvId2}`,R);const c3=dd.d.claims.find(c=>c.claimId===cl.claimId);const e=await cc('PUT',`/admin/reviews/${rvId2}/draft`,R,{baseRevision:cur,reason:'Эцсийн хувилбар',edits:[{claimId:cl.claimId,text:cl.text}]});await cc('POST',`/admin/reviews/${rvId2}/ready`,R,{});await re(rv,R);await cc('POST',`/admin/reviews/${rvId2}/approve`,R,{baseRevision:e.d.revision});await re(rv,R);
 const pubs=await Promise.all([1,2,3].map(()=>cc('POST',`/admin/reviews/${rvId2}/publish`,R,{})));rec('H03-4 three concurrent publishes of one approval: exactly one succeeds',pubs.filter(x=>x.s===200).length===1&&sql(`select status from report_reviews where id='${rvId2}'`)==='PUBLISHED',pubs.map(x=>x.s+':'+(x.e?.code??'ok')).join(','))}
else rec('H03-4 (covered by H03-3: the race published exactly once)',okPub===1);
// web == pdf == approved
const rep=await cc('GET',`/assessments/${aid}/report`,cu.tok);const pdfRes=await fetch(B+`/assessments/${aid}/report/pdf`,{headers:{authorization:'Bearer '+cu.tok,'x-mmri-writer-id':W}});const buf=Buffer.from(await pdfRes.arrayBuffer());const tmp=`/tmp/claude-cx-${aid}.pdf`;fs.writeFileSync(tmp,buf);
const pages=Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo',[tmp],{encoding:'utf8'}))[1]);const txt=execFileSync('pdftotext',['-layout',tmp,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');
const pubRevN=Number(sql(`select "publishedRevision" from report_reviews where id='${rvId2}'`));const approvedNarr=JSON.parse(sql(`select narrative::text from report_review_revisions where "reviewId"='${rvId2}' and revision=${pubRevN}`));
const webSame=JSON.stringify(rep.d.narrative)===JSON.stringify(approvedNarr);const s10=approvedNarr.sections.find(s=>s.id==='S10').claims[0].textMn.replace(/\s+/g,' ');
rec('H03-5 the customer web report is exactly the approved revision, and the PDF is 3 pages carrying the same conclusion',rep.s===200&&webSame&&pdfRes.status===200&&pages===3&&txt.includes(s10.slice(0,60)),`web==approved:${webSame} pages ${pages}`);
// H02 after publication
const exp2=await cc('GET',`/companies/${co}/export`,cu.tok);const a2=exp2.d.assessments[0];
rec('H02-6 once PUBLISHED, the owner export includes the published scores and report',exp2.s===200&&a2.derivedContent==='INCLUDED'&&Array.isArray(a2.reportSnapshots)&&a2.reportSnapshots.length===1&&a2.overallOfficialScore!==undefined);
// ---- H05 erasure with review records (revisions are append-only, FK RESTRICT)
const revCount=Number(sql(`select count(*) from report_review_revisions where "reviewId"='${rvId2}'`));const auditBefore=Number(sql(`select count(*) from admin_audit_events`));
let upd='',del='';try{sql(`update report_review_revisions set reason='x' where "reviewId"='${rvId2}' and revision=1`);upd='allowed'}catch{upd='blocked'}try{sql(`delete from report_review_revisions where "reviewId"='${rvId2}' and revision=1`);del='allowed'}catch{del='blocked'}
rec('H05-1 outside an erasure, revisions stay append-only: UPDATE and DELETE are both refused by the database',upd==='blocked'&&del==='blocked',`${upd}/${del}`);
const other=await customer('cx-other');const xe=await cc('POST',`/companies/${co}/erase`,other.tok,{confirmName:'Codex Findings ХХК',password:other.password});
const er=await cc('POST',`/companies/${co}/erase`,cu.tok,{confirmName:'Codex Findings ХХК',password:cu.password});
const left=Number(sql(`select count(*) from report_reviews where "assessmentId"='${aid}'`))+Number(sql(`select count(*) from report_review_revisions where "reviewId"='${rvId2}'`))+Number(sql(`select count(*) from assessments where "companyId"='${co}'`));
rec('H05-2 company erasure succeeds although reviews and append-only revisions exist; assessment, review and revision rows are gone',xe.s===403&&er.s===200&&er.d.erased===true&&left===0,`other ${xe.s}, erase ${er.s} ${er.e?.code??''} left ${left}, revisions were ${revCount}`);
const auditAfter=Number(sql(`select count(*) from admin_audit_events`));
rec('H05-3 legally relevant evidence is kept: content-free REVIEW_ERASED events were appended, the audit log did not shrink, the invoice remains, the company is anonymised',auditAfter>=auditBefore+1&&Number(sql(`select count(*) from admin_audit_events where action='REVIEW_ERASED_WITH_COMPANY' and "targetId"='${rvId2}'`))===1&&Number(sql(`select count(*) from billing_invoices where "companyId"='${co}'`))===1&&sql(`select name from companies where id='${co}'`)==='Устгасан байгууллага');
const meta=sql(`select metadata::text from admin_audit_events where action='REVIEW_ERASED_WITH_COMPANY' and "targetId"='${rvId2}'`);rec('H05-4 the retained audit evidence holds no report text or customer name',!meta.includes('Codex Findings')&&!meta.includes(sample??'zzz')&&!/narrative|textMn/.test(meta));
rec('H05-5 admin notification text for the erased review no longer carries the company name',!sql(`select string_agg(body,' ') from admin_notifications where "targetId"='${rvId2}'`).includes('Codex Findings'));
const again=await cc('POST',`/companies/${co}/erase`,cu.tok,{confirmName:'Устгасан байгууллага',password:cu.password});rec('H05-6 erasing again is refused cleanly (already erased)',again.s>=400&&again.s<500);
// ---- M01 HTTP: authorisation and throttling of customer reconciliation
const co2=(await cc('POST','/companies',other.tok,{name:'Reconcile ХХК'})).d.id;const inv2=(await cc('POST',`/companies/${co2}/billing/invoices`,other.tok,{planCode:'DIAGNOSTIC',domainCode:'finance'})).d;
const invStatus0=sql(`select status from billing_invoices where id='${inv2.id}'`);const anon=await cc('POST',`/billing/invoices/${inv2.id}/reconcile`,undefined);const foreign=await cc('POST',`/billing/invoices/${inv2.id}/reconcile`,cu.tok);const mine=await cc('POST',`/billing/invoices/${inv2.id}/reconcile`,other.tok);
rec('M01-6 reconcile requires authentication and invoice ownership; a mock invoice answers a clear 409 and stays unpaid',anon.s===401&&(foreign.s===403||foreign.s===404)&&mine.s===409&&mine.e?.code==='AUTOMATIC_RECONCILIATION_UNAVAILABLE'&&sql(`select status from billing_invoices where id='${inv2.id}'`)===invStatus0&&invStatus0!=='PAID',`${anon.s}/${foreign.s}/${mine.s} ${mine.e?.code}`);
const spam=[];for(let i=0;i<9;i++)spam.push((await cc('POST',`/billing/invoices/${inv2.id}/reconcile`,other.tok)).s);
rec('M01-7 repeated reconciliation is throttled (HTTP 429) per user and invoice',spam.includes(429)&&sql(`select status from billing_invoices where id='${inv2.id}'`)===invStatus0&&invStatus0!=='PAID',spam.join(','));
// H06 (password reset vs administrator sessions) lives in qa-admin-reset-sessions-regression.mjs
// cleanup of throw-away admins
sql(`update admin_accounts set status='DISABLED',"disabledAt"=now() where "userId" in (select id from users where email like 'admin.qa.%')`);sql(`update admin_sessions set "revokedAt"=now() where "adminId" in (select a.id from admin_accounts a join users u on u.id=a."userId" where u.email like 'admin.qa.%')`);
console.log(JSON.stringify({domain,assessment:aid,review:rvId2}));console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
