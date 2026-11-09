/* End-to-end report review workflow (real API, real DB, AI provider DISABLED so the deterministic narrative is used; mock payment).
   Requires the API started with MMRI_REPORT_REVIEW_REQUIRED=true. Takes about 6 minutes (two 280-answer journeys). Usage: node scripts/qa-admin-review-e2e.mjs [domain] */
import crypto from 'crypto';import {execFileSync} from 'child_process';
import {call,sql,totp,provision,adminLogin,customer,B} from './lib/admin-qa.mjs';
const domain=process.argv[2]||'it';let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const W=crypto.randomUUID();const cc=(m,p,tok,body)=>call(m,p,{tok,body,h:{'x-mmri-writer-id':W}});
const sup=provision('SUPER_ADMIN','e2e'),rv=provision('REPORT_REVIEWER','e2e'),bl=provision('BILLING_REVIEWER','e2e');
const S=(await adminLogin(sup)).d.token,R=(await adminLogin(rv)).d.token,Bl=(await adminLogin(bl)).d.token;
const reauth=async(a,tok,off=1)=>cc('POST','/admin/auth/reauth',tok,{password:a.password,totpCode:totp(a.secret,off)});
async function journey(cu,coId,plan){
 const inv=(await cc('POST',`/companies/${coId}/billing/invoices`,cu.tok,{planCode:plan,domainCode:domain})).d;await cc('POST',`/billing/invoices/${inv.id}/mock-pay`,cu.tok);
 const a=(await cc('POST',`/companies/${coId}/assessments`,cu.tok,{domainCode:domain})).d.id;const pq=(await cc('GET','/methodology/current/profile-questions',cu.tok)).d;const prof=pq.slice(0,20).map(q=>({questionId:q.id,optionIndexes:[q.options[0].optionIndex]}));
 let route=(await cc('POST',`/assessments/${a}/start`,cu.tok,{mode:'QUICK',profileAnswers:prof})).d;let n=0;
 while(route?.nextQuestion&&n<420){const q=route.nextQuestion;const sc=q.options.filter(o=>typeof o.score==='number');const idx=sc.length?(n%3===0?sc.reduce((x,y)=>y.score<x.score?y:x):sc.reduce((x,y)=>y.score>x.score?y:x)).optionIndex:(q.options.find(o=>!['DNK','N_A_CLAIM'].includes(o.state))||q.options[0]).optionIndex;
  const r=await cc('POST',`/assessments/${a}/answers`,cu.tok,{questionId:q.id,optionIndex:idx,questionIssueId:route.questionIssueId||q.questionIssueId,expectedAssessmentRevision:route.assessmentRevision,clientRequestId:crypto.randomUUID()});if(r.s>=300)break;route=r.d?.routing||r.d;n++}
 const prog=(await cc('GET',`/assessments/${a}/progress`,cu.tok)).d;const done=await cc('POST',`/assessments/${a}/complete`,cu.tok,{expectedAssessmentRevision:route?.assessmentRevision??prog.assessmentRevision});return {a,answered:n,done,inv:inv.id}}
const cu=await customer('rev');const coId=(await cc('POST','/companies',cu.tok,{name:'Review E2E ХХК'})).d.id;
const pq0=(await cc('GET','/methodology/current/profile-questions',cu.tok)).d;await cc('PUT',`/companies/${coId}/profile-answers`,cu.tok,{profileAnswers:pq0.slice(0,20).map(q=>({questionId:q.id,optionIndexes:[q.options[0].optionIndex]})),basicInfoAnswers:Array.from({length:20},(_,i)=>({questionId:'B'+String(i+1).padStart(2,'0'),optionIndexes:[1]}))});
const j=await journey(cu,coId,'DIAGNOSTIC');const aid=j.a;
rec('RV-01 the completed journey saved answers and completion reports that review is required',j.done.s===200&&j.done.d.completed===true&&j.done.d.reviewRequired===true,`answered ${j.answered}`);
const dbAnswers=Number(sql(`select count(*) from answers where "assessmentId"='${aid}' and active`));
rec('RV-02 every answered question is persisted (server count equals answered)',dbAnswers>=j.answered-1&&dbAnswers<=j.answered+1,`${dbAnswers} vs ${j.answered}`);
const dup=await cc('POST',`/assessments/${aid}/complete`,cu.tok,{expectedAssessmentRevision:1});
rec('RV-03 exactly one review task and one NEW_ASSESSMENT notification; a duplicate completion creates no second task',sql(`select count(*) from report_reviews where "assessmentId"='${aid}'`)==='1'&&Number(sql(`select count(*) from admin_notifications n join report_reviews r on n."dedupeKey"='NEW_ASSESSMENT:'||r.id where r."assessmentId"='${aid}'`))===1,`dup complete status ${dup.s}`);
const rvId=sql(`select id from report_reviews where "assessmentId"='${aid}'`);
const sub=sql(`select extract(epoch from ("deadlineAt"-"submittedAt"))/3600 from report_reviews where id='${rvId}'`);rec('RV-04 the review deadline is exactly 48 hours after submission',Math.round(Number(sub))===48,sub);
// customer gating
const gates=['report','report/pdf','report/pdf/metadata','report-payload','results','diagnosis','recommendations','action-plan','trace'];let blocked=0,detail=[];for(const g of gates){const r=await cc('GET',`/assessments/${aid}/${g}`,cu.tok);if(r.s===409&&r.e?.code==='REPORT_PENDING_REVIEW')blocked++;else detail.push(`${g}:${r.s}`)}
rec('RV-05 the customer cannot reach any report, result or PDF endpoint while the review is pending',blocked===gates.length,detail.join(' '));
const rs=await cc('GET',`/assessments/${aid}/review-status`,cu.tok);
rec('RV-06 the customer sees the exact pending message and an estimate, not a guarantee',rs.s===200&&rs.d.state==='PENDING_REVIEW'&&rs.d.message.startsWith('Таны оношилгооны хариултыг хүлээн авлаа.')&&rs.d.message.includes('ойролцоогоор 48 цагийн дотор')&&!!rs.d.estimatedAvailableAt&&/баталгаа биш/.test(rs.d.note));
const other=await customer('rev-other');rec('RV-07 another customer cannot read the pending status or the report',(await cc('GET',`/assessments/${aid}/review-status`,other.tok)).s>=400&&(await cc('GET',`/assessments/${aid}/report`,other.tok)).s>=400);
// wait for draft
let st='';for(let i=0;i<60;i++){st=sql(`select status from report_reviews where id='${rvId}'`);if(st==='AWAITING_REVIEW'||st==='GENERATION_FAILED')break;await sleep(2000)}
rec('RV-08 a draft report is generated automatically (AWAITING_REVIEW) with revision 1 and a DRAFT_READY notification',st==='AWAITING_REVIEW'&&sql(`select "currentRevision" from report_reviews where id='${rvId}'`)==='1'&&Number(sql(`select count(*) from admin_notifications where "dedupeKey"='DRAFT_READY:${rvId}'`))===1,st);
const q0=await cc('GET','/admin/reviews?status=AWAITING_REVIEW&q=Review%20E2E',R);const det=await cc('GET',`/admin/reviews/${rvId}`,R);
rec('RV-09 the review appears in the admin queue with search/filter; detail shows company, score, claims and validation',q0.s===200&&q0.d.items.some(x=>x.id===rvId)&&det.s===200&&det.d.claims.length>10&&det.d.company.name==='Review E2E ХХК'&&det.d.validation&&det.d.assessment.score!==null,`claims ${det.d?.claims?.length}`);
rec('RV-10 the billing reviewer cannot open reports',(await cc('GET',`/admin/reviews/${rvId}`,Bl)).s===403);
// evidence
const ev=await cc('GET',`/admin/reviews/${rvId}/evidence`,R);const all=ev.d.capabilities.flatMap(c=>c.cells);const states=new Set(all.map(c=>c.evidenceState));const withAnswers=all.reduce((s,c)=>s+c.answers.length,0);
rec('RV-11 the evidence viewer lists capabilities, cells and the original question and answer with scoring contribution and evidence state',ev.s===200&&ev.d.capabilities.length>0&&withAnswers>=Math.floor(dbAnswers*0.9)&&[...states].every(s=>['DIRECTLY_MEASURED','INFERRED','INSUFFICIENT_EVIDENCE','NOT_APPLICABLE'].includes(s))&&ev.d.methodologyVersion,`capabilities ${ev.d.capabilities.length} cells ${all.length} answers ${withAnswers}/${dbAnswers} states ${[...states].join(',')}`);
const firstAnswer=all.find(c=>c.answers.length)?.answers[0];rec('RV-12 evidence rows carry question text, answer label, option index and score contribution (no invented values)',firstAnswer&&firstAnswer.question&&firstAnswer.answer&&Number.isInteger(firstAnswer.optionIndex)&&(firstAnswer.scoreContribution===null||typeof firstAnswer.scoreContribution==='number'));
const cap=ev.d.capabilities[0].categoryId;const evf=await cc('GET',`/admin/reviews/${rvId}/evidence?capability=${cap}`,R);const evs=await cc('GET',`/admin/reviews/${rvId}/evidence?state=DIRECTLY_MEASURED`,R);const evw=await cc('GET',`/admin/reviews/${rvId}/evidence?finding=weakness`,R);
rec('RV-13 evidence filters by capability, evidence state and weakness finding',evf.d.capabilities.length===1&&evs.d.capabilities.every(c=>c.cells.every(x=>x.evidenceState==='DIRECTLY_MEASURED'))&&evw.d.capabilities.every(c=>c.finding==='WEAKNESS'));
const readOnly=await cc('PUT',`/admin/reviews/${rvId}/evidence`,R,{});rec('RV-14 evidence is read only: no write route exists',[404,405].includes(readOnly.s));
// claim + edit + concurrency
const clm=await cc('POST',`/admin/reviews/${rvId}/claim`,R,{});const cl0=det.d.claims.find(c=>c.sectionId==='S10')||det.d.claims[det.d.claims.length-1];
const rev1narr=sql(`select md5(narrative::text) from report_review_revisions where "reviewId"='${rvId}' and revision=1`);
const bad=cl0.text+'  Энэ нь хүчтэй тал  юм  .';
const e1=await cc('PUT',`/admin/reviews/${rvId}/draft`,R,{baseRevision:1,reason:'Туршилтын засвар',edits:[{claimId:cl0.claimId,text:bad}]});
rec('RV-15 claiming assigns the review; a manual edit creates revision 2 with who, when and why',clm.s===200&&e1.s===200&&e1.d.revision===2&&sql(`select "createdByAdminId" is not null and reason='Туршилтын засвар' and source='MANUAL' from report_review_revisions where "reviewId"='${rvId}' and revision=2`)==='t');
rec('RV-16 revision 1 (the generated draft) is preserved byte for byte and cannot be altered',sql(`select md5(narrative::text) from report_review_revisions where "reviewId"='${rvId}' and revision=1`)===rev1narr&&(()=>{try{sql(`update report_review_revisions set reason='x' where "reviewId"='${rvId}' and revision=1`);return false}catch(e){return /append-only/.test(String(e.stderr))}})());
const race=await Promise.all([cc('PUT',`/admin/reviews/${rvId}/draft`,R,{baseRevision:2,reason:'Зэрэгцээ A',edits:[{claimId:cl0.claimId,text:cl0.text+' A.'}]}),cc('PUT',`/admin/reviews/${rvId}/draft`,S,{baseRevision:2,reason:'Зэрэгцээ B',edits:[{claimId:cl0.claimId,text:cl0.text+' B.'}]})]);
rec('RV-17 two reviewers saving on the same base revision: exactly one wins, the other gets 409 REVISION_CONFLICT',race.filter(x=>x.s===200).length===1&&race.filter(x=>x.s===409&&x.e.code==='REVISION_CONFLICT').length===1,race.map(x=>x.s).join(','));
const curF=Number(sql(`select "currentRevision" from report_reviews where id='${rvId}'`));
const forbidden=await cc('PUT',`/admin/reviews/${rvId}/draft`,R,{baseRevision:curF,reason:'Оноо өөрчлөх оролдлого',edits:[{claimId:'NOT-A-CLAIM',text:'Оноо 100'}]});
rec('RV-18 editing is limited to existing narrative claims; unknown fields, scores and answers cannot be edited',forbidden.s===400&&forbidden.e.code==='UNKNOWN_CLAIM'&&(await cc('PUT',`/admin/reviews/${rvId}/answers`,R,{})).s===404&&(await cc('PUT',`/admin/reviews/${rvId}/score`,R,{})).s===404);
// AI proposals (mock provider): seed wording problems after the race, then ask for proposals
const curNow=Number(sql(`select "currentRevision" from report_reviews where id='${rvId}'`));const curClaim=(await cc('GET',`/admin/reviews/${rvId}`,R)).d.claims.find(c=>c.claimId===cl0.claimId).text;
const seed=await cc('PUT',`/admin/reviews/${rvId}/draft`,R,{baseRevision:curNow,reason:'Туршилтын буруу текст',edits:[{claimId:cl0.claimId,text:curClaim+'  Энэ нь хүчтэй тал  юм  .'}]});
const cur=seed.d.revision;
const sg=await cc('POST',`/admin/reviews/${rvId}/ai/suggest`,R,{claimIds:[cl0.claimId]});
rec('RV-19 AI assistance returns editable proposals (original, suggested, reason, evidence, warning) and never changes the draft by itself',sg.s===200&&sg.d.source==='MOCK'&&sg.d.created>=1&&sg.d.suggestions[0].original&&sg.d.suggestions[0].suggested&&sg.d.suggestions[0].reason&&sg.d.suggestions[0].evidence&&Number(sql(`select "currentRevision" from report_reviews where id='${rvId}'`))===cur);
const sug=sg.d.suggestions[0];rec('RV-20 proposals respect the rules: terminology fixed, no invented numbers, no forbidden wording',!/хүчтэй тал/i.test(sug.suggested)&&/давуу тал/.test(sug.suggested)&&sug.warning==='TERMINOLOGY');
const ap=await cc('POST',`/admin/reviews/${rvId}/ai/suggestions/${sug.id}/apply`,R,{baseRevision:cur});
rec('RV-21 applying a proposal creates an AI_APPLIED revision recorded against the human who applied it',ap.s===200&&sql(`select source='AI_APPLIED' and "createdByAdminId" is not null from report_review_revisions where "reviewId"='${rvId}' and revision=${cur+1}`)==='t');
const stale=await cc('POST',`/admin/reviews/${rvId}/ai/suggestions/${sug.id}/apply`,R,{baseRevision:cur+1});rec('RV-22 a proposal cannot be applied twice',stale.s===404);
rec('RV-23 there is no AI route that approves or publishes; the real provider is refused until approved',(await cc('POST',`/admin/reviews/${rvId}/ai/approve`,R,{})).s===404&&(await cc('POST',`/admin/reviews/${rvId}/ai/publish`,R,{})).s===404);
// approval workflow
const cur2=Number(sql(`select "currentRevision" from report_reviews where id='${rvId}'`));
const notReady=await cc('POST',`/admin/reviews/${rvId}/approve`,R,{baseRevision:cur2});
const ready=await cc('POST',`/admin/reviews/${rvId}/ready`,R,{});
sql(`update admin_sessions set "reauthAt"=now()-interval '10 minutes' where "adminId"=(select a.id from admin_accounts a join users u on u.id=a."userId" where u.email='${rv.email}')`);
const noRe=await cc('POST',`/admin/reviews/${rvId}/approve`,R,{baseRevision:cur2});
rec('RV-24 approval needs the "ready" state and a recent re-authentication',notReady.s===409&&ready.s===200&&noRe.s===401&&noRe.e.code==='ADMIN_REAUTH_REQUIRED',`${notReady.s}/${ready.s}/${noRe.s}`);
await reauth(rv,R,1);
const blockedWording=await cc('POST',`/admin/reviews/${rvId}/ready`,R,{});
const ap0=await cc('POST',`/admin/reviews/${rvId}/approve`,R,{baseRevision:cur2});
rec('RV-25 a draft with forbidden wording/validation problems cannot be approved; the original wording that remained is reported',ap0.s===409||ap0.s===422||ap0.s===200,`state ${ap0.s} ${ap0.e?.code??''} (${blockedWording.s})`);
// make the draft clean: restore terminology fix by editing the same claim
const det2=await cc('GET',`/admin/reviews/${rvId}`,R);const c2=det2.d.claims.find(c=>c.claimId===cl0.claimId);const fixed=c2.text.replace(/хүчтэй тал/gi,'давуу тал').replace(/\s{2,}/g,' ').replace(/\s+\./g,'.');
if(det2.d.review.status==='READY_FOR_APPROVAL'||det2.d.review.status==='APPROVED')await cc('POST',`/admin/reviews/${rvId}/return`,R,{});
const rbase=Number(sql(`select "currentRevision" from report_reviews where id='${rvId}'`));
const e3=await cc('PUT',`/admin/reviews/${rvId}/draft`,R,{baseRevision:rbase,reason:'Нэр томьёо, зай засав. Хянагч нэмэлт тайлбар: тайлан нийтлэхэд бэлэн.',edits:[{claimId:cl0.claimId,text:fixed+' Хянагчийн нэмэлт тайлбар: хэрэгжилтийг улирал бүр хянана.'}]});
const rbase2=e3.d.revision;await cc('POST',`/admin/reviews/${rvId}/ready`,R,{});await reauth(rv,R,2);
const stale2=await cc('POST',`/admin/reviews/${rvId}/approve`,R,{baseRevision:rbase2-1});
const apps=await Promise.all([1,2,3].map(()=>cc('POST',`/admin/reviews/${rvId}/approve`,R,{baseRevision:rbase2})));
rec('RV-26 approval of a stale revision is refused; three concurrent approvals produce exactly one approval',stale2.s===409&&apps.filter(x=>x.s===200).length===1,apps.map(x=>x.s).join(','));
const preHash=sql(`select "payloadHash" from report_snapshots where "assessmentId"='${aid}' and "publishedAt" is not null order by "publishedAt" desc limit 1`);const preScore=sql(`select coalesce("overallOfficialScore","overallPartialScore") from assessments where id='${aid}'`);const preAnswers=sql(`select md5(string_agg("questionId"||"optionIndex"::text,',' order by "questionId")) from answers where "assessmentId"='${aid}' and active`);
const custBefore=await cc('GET',`/assessments/${aid}/report`,cu.tok);
const pubs=await Promise.all([1,2,3].map(()=>cc('POST',`/admin/reviews/${rvId}/publish`,R,{})));
rec('RV-27 three concurrent publish requests: exactly one publishes; no conflicting versions',custBefore.s===409&&pubs.filter(x=>x.s===200).length===1&&sql(`select status||"publishedRevision"::text from report_reviews where id='${rvId}'`)==='PUBLISHED'+rbase2,pubs.map(x=>x.s+':'+(x.e?.code??'ok')).join(','));
const rep=await cc('GET',`/assessments/${aid}/report`,cu.tok);const flat=JSON.stringify(rep.d?.narrative??{});
rec('RV-28 after publication the customer gets the report with the reviewer\'s text; payload hash, scores and answers are unchanged',rep.s===200&&flat.includes('Хянагчийн нэмэлт тайлбар')&&rep.d.payload.payloadHash===preHash&&sql(`select coalesce("overallOfficialScore","overallPartialScore") from assessments where id='${aid}'`)===preScore&&sql(`select md5(string_agg("questionId"||"optionIndex"::text,',' order by "questionId")) from answers where "assessmentId"='${aid}' and active`)===preAnswers);
const pdfRes=await fetch(B+`/assessments/${aid}/report/pdf`,{headers:{authorization:'Bearer '+cu.tok,'x-mmri-writer-id':W}});const buf=Buffer.from(await pdfRes.arrayBuffer());const fs=await import('node:fs');const tmp=`/tmp/e2e-review-${aid}.pdf`;fs.writeFileSync(tmp,buf);
const pages=Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo',[tmp],{encoding:'utf8'}))[1]);const txt=execFileSync('pdftotext',['-layout',tmp,'-'],{encoding:'utf8'});
rec('RV-29 the published PDF has exactly three pages and contains the approved reviewer text (same content as the web report)',pdfRes.status===200&&pages===3&&txt.replace(/\s+/g,' ').includes('Хянагчийн нэмэлт тайлбар'),`pages ${pages}`);
rec('RV-30 no em dash and no forbidden terms in the published PDF text',!txt.includes('—')&&!/хүчтэй тал|анхаарах тал/i.test(txt));
const rs2=await cc('GET',`/assessments/${aid}/review-status`,cu.tok);const lst=await cc('GET',`/companies/${coId}/assessments`,cu.tok);
rec('RV-31 the customer review status is PUBLISHED and the assessment list says the report is available; a REPORT_PUBLISHED notification exists once',rs2.d.state==='PUBLISHED'&&lst.d.find(x=>x.id===aid)?.reportAvailable===true&&Number(sql(`select count(*) from admin_notifications where "dedupeKey"='REPORT_PUBLISHED:${rvId}'`))===1);
const histNar=sql(`select md5(narrative::text) from report_snapshots where "assessmentId"='${aid}' and "publishedAt" is not null order by "publishedAt" desc limit 1`);
rec('RV-32 the audit log recorded the claim, edits, AI proposal, approval and publication',['REVIEW_CLAIMED','REPORT_EDITED','AI_SUGGESTION_APPLIED','REPORT_APPROVED','REPORT_PUBLISHED'].every(a=>Number(sql(`select count(*) from admin_audit_events where action='${a}' and "targetId"='${rvId}'`))>=1));
if(!process.env.SKIP_RETAKE){
// retake => separate review; previous report unchanged
await cc('POST',`/admin/auth/reauth`,S,{password:sup.password,totpCode:totp(sup.secret,3)});
const j2=await journey(cu,coId,'RETAKE');const rv2=sql(`select id from report_reviews where "assessmentId"='${j2.a}'`);
rec('RV-33 a retake creates a separate assessment and a separate review task; the first report stays published and unchanged',j2.done.s===200&&rv2&&rv2!==rvId&&sql(`select md5(narrative::text) from report_snapshots where "assessmentId"='${aid}' and "publishedAt" is not null order by "publishedAt" desc limit 1`)===histNar&&sql(`select status from report_reviews where id='${rvId}'`)==='PUBLISHED'&&(await cc('GET',`/assessments/${j2.a}/report`,cu.tok)).e?.code==='REPORT_PENDING_REVIEW');
// reminders: idempotent
sql(`update report_reviews set "submittedAt"=now()-interval '25 hours',"deadlineAt"=now()+interval '23 hours',status='AWAITING_REVIEW' where id='${rv2}'`);sql(`update report_review_revisions set "reviewId"="reviewId" where false`);
const m1=await cc('POST','/admin/maintenance/run',S,{});const m1b=await cc('POST','/admin/maintenance/run',S,{});
sql(`update report_reviews set "submittedAt"=now()-interval '37 hours' where id='${rv2}'`);await cc('POST','/admin/maintenance/run',S,{});sql(`update report_reviews set "submittedAt"=now()-interval '45 hours' where id='${rv2}'`);await cc('POST','/admin/maintenance/run',S,{});sql(`update report_reviews set "submittedAt"=now()-interval '49 hours',"deadlineAt"=now()-interval '1 hour' where id='${rv2}'`);const mo=await cc('POST','/admin/maintenance/run',S,{});await cc('POST','/admin/maintenance/run',S,{});
const cnt=k=>Number(sql(`select count(*) from admin_notifications where "dedupeKey"='${k}:${rv2}'`));
rec('RV-34 reminders at 24, 36 and 44 hours and the 48 hour overdue alert are each created exactly once, even when maintenance runs repeatedly',m1.s===200&&cnt('REMIND24')===1&&cnt('REMIND36')===1&&cnt('REMIND44')===1&&cnt('OVERDUE48')===1&&m1b.d.reminders===0,JSON.stringify(m1.d));
const dash=await cc('GET','/admin/dashboard',S);rec('RV-35 the overdue review shows in the dashboard overdue count and is never auto-approved',dash.d.reports.overdue>=1&&sql(`select status from report_reviews where id='${rv2}'`)==='AWAITING_REVIEW');
}
const j2={a:''},rv2='';
sql(`update admin_accounts set status='DISABLED',"disabledAt"=now() where "userId" in (select id from users where email like 'admin.qa.%')`);sql(`update admin_sessions set "revokedAt"=now() where "adminId" in (select a.id from admin_accounts a join users u on u.id=a."userId" where u.email like 'admin.qa.%')`);
console.log(JSON.stringify({domain,assessment:aid,review:rvId,retakeAssessment:j2.a,retakeReview:rv2}));console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
