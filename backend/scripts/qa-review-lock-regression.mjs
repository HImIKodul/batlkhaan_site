/* Multi-administrator lock + direct-edit fidelity regression (isolated QA stack only). Needs API, PGDATABASE, DATABASE_URL, MMRI_MOCK_MAIL_DIR and ADMIN_* (QA SUPER_ADMIN) like qa-release-policy-regression.mjs.
   Creates one throw-away REPORT_REVIEWER, one synthetic customer and one completed diagnosis; uses two OTHER pending reviews of the QA database for the lock checks (they are only claimed/locked, never approved). */
import fs from 'node:fs';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
import {call,sql,provision,customer,B,freshAdminTotp} from './lib/admin-qa.mjs';import {journey,http} from './lib/qa-journey.mjs';
let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const login=async a=>{const r=await call('POST','/admin/auth/login',{body:{email:a.email,password:a.password,totpCode:await freshAdminTotp(a)}});if(r.s!==200)throw new Error('login '+r.s);return r.d.token};
const sup={email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,secret:process.env.ADMIN_TOTP_SECRET};const rv=provision('REPORT_REVIEWER','lk');
const S1=await login(sup),S2=await login(rv);
const reauth=async(a,t)=>call('POST','/admin/auth/reauth',{tok:t,body:{password:a.password,totpCode:await freshAdminTotp(a)}});
const ad=async(t,a,m,p,body)=>{let r=await call(m,'/admin'+p,{tok:t,body});if(r.s===401&&r.e?.code==='ADMIN_REAUTH_REQUIRED'){await reauth(a,t);r=await call(m,'/admin'+p,{tok:t,body})}return r};
const A1=(m,p,b)=>ad(S1,sup,m,p,b),A2=(m,p,b)=>ad(S2,rv,m,p,b);
/* Free (unlocked) reviews: fresh submissions first, then drafts whose lock was released; the suite needs three and must not run against fewer. */
const pending=sql(`select id from report_reviews where status in ('AWAITING_REVIEW','IN_REVIEW') and ("lockedByAdminId" is null or "lockExpiresAt"<now()) order by (status='AWAITING_REVIEW') desc, "submittedAt" limit 4`).split('\n').filter(Boolean);if(pending.length<3){console.log('FAIL fixture: need 3 free reviews, found '+pending.length);process.exit(2)}const [RA,RB,RC]=pending;
// ---- claim + exclusivity
const c1=await A1('POST',`/reviews/${RA}/claim`);rec('admin 1 claims report A and holds its lock',c1.s===200&&(await A1('GET',`/reviews/${RA}`)).d.lock.heldByMe===true);
const c2=await A2('POST',`/reviews/${RA}/claim`);rec('admin 2 cannot take report A (409 LOCKED_BY_OTHER)',c2.s===409&&c2.e?.code==='LOCKED_BY_OTHER',`${c2.s} ${c2.e?.code}`);
const v2=await A2('GET',`/reviews/${RA}/report-view`);rec('admin 2 can still VIEW report A (read-only, lock not mine)',v2.s===200&&v2.d.lock.heldByMe===false&&!!v2.d.lock.holderEmail);
const claimsA=(await A1('GET',`/reviews/${RA}`)).d.claims;const cl=claimsA[0];const rev0=Number(sql(`select "currentRevision" from report_reviews where id='${RA}'`));
const w2=await A2('PUT',`/reviews/${RA}/draft`,{baseRevision:rev0,reason:'x y z',edits:[{claimId:cl.claimId,text:cl.text+' X'}]});rec('admin 2 cannot save edits on report A (409)',w2.s===409&&['LOCKED_BY_OTHER'].includes(w2.e?.code),`${w2.s} ${w2.e?.code}`);
rec('admin 2 cannot approve or mark ready report A',[(await A2('POST',`/reviews/${RA}/ready`)).s,(await A2('POST',`/reviews/${RA}/approve`,{baseRevision:rev0})).s].every(s=>s===409));
rec('refused writes created no revision',Number(sql(`select "currentRevision" from report_reviews where id='${RA}'`))===rev0);
// ---- parallel work on different reports
const [pa,pb]=await Promise.all([A1('POST',`/reviews/${RA}/lock`),A2('POST',`/reviews/${RB}/claim`)]);rec('different reports are worked on simultaneously by different admins',pa.s===200&&pb.s===200,`${pa.s}/${pb.s}`);
rec('each report records its own holder',sql(`select count(distinct "lockedByAdminId") from report_reviews where id in ('${RA}','${RB}')`)==='2');
// ---- race on a free report: exactly one winner
const [r1,r2]=await Promise.all([A1('POST',`/reviews/${RC}/claim`),A2('POST',`/reviews/${RC}/claim`)]);rec('two admins claiming the same free report at once: exactly one wins',[r1.s,r2.s].filter(s=>s===200).length===1&&[r1.s,r2.s].some(s=>s===409),`${r1.s}/${r2.s}`);
rec('no duplicate review record per assessment',sql(`select count(*) from (select "assessmentId" from report_reviews group by 1 having count(*)>1) x`)==='0');
// ---- heartbeat + expiry + stale save
const exp0=sql(`select "lockExpiresAt" from report_reviews where id='${RA}'`);await new Promise(r=>setTimeout(r,1200));await A1('POST',`/reviews/${RA}/lock`);rec('heartbeat renews the lock',sql(`select "lockExpiresAt" > '${exp0}' from report_reviews where id='${RA}'`)==='t');
sql(`update report_reviews set "lockExpiresAt"=now()-interval '1 minute' where id='${RA}'`);
const stale=await A1('PUT',`/reviews/${RA}/draft`,{baseRevision:rev0,reason:'x y z',edits:[{claimId:cl.claimId,text:cl.text+' stale'}]});rec('expired lock: the (stale) holder cannot save any more (409 LOCK_EXPIRED)',stale.s===409&&stale.e?.code==='LOCK_EXPIRED',`${stale.s} ${stale.e?.code}`);
const take=await A2('POST',`/reviews/${RA}/lock`);rec('after expiry another admin can take the report',take.s===200&&take.d.heldByMe===true);
const back=await A1('PUT',`/reviews/${RA}/draft`,{baseRevision:rev0,reason:'x y z',edits:[{claimId:cl.claimId,text:cl.text+' late'}]});rec('the former holder (stale tab) is refused while admin 2 holds it',back.s===409&&back.e?.code==='LOCKED_BY_OTHER');
await A2('POST',`/reviews/${RA}/unlock`);rec('unlock frees the report',sql(`select "lockedByAdminId" is null from report_reviews where id='${RA}'`)==='t');
// ---- narrative-only edit: scores/evidence/identity are not editable
const bad=await A2('PUT',`/reviews/${RB}/draft`,{baseRevision:Number(sql(`select "currentRevision" from report_reviews where id='${RB}'`)),reason:'x y z',edits:[{claimId:'score',text:'100'}]});rec('only narrative claims are editable (unknown/score id refused 400)',bad.s===400&&bad.e?.code==='UNKNOWN_CLAIM');
// ---- fidelity: edit -> approve -> customer report + PDF
const cu=await customer('lk');const co=await http(B,'POST','/companies',{tok:cu.tok,body:{name:'Lock Fidelity QA ХХК'}});const j=await journey(B,cu.tok,co.d.id,'finance');
const rid=sql(`select id from report_reviews where "assessmentId"='${j.a}'`);const t0=Date.now();while(sql(`select status from report_reviews where id='${rid}'`)!=='AWAITING_REVIEW'&&Date.now()-t0<120000)await new Promise(r=>setTimeout(r,1500));
await A1('POST',`/reviews/${rid}/claim`);const d=(await A1('GET',`/reviews/${rid}`)).d;const concl=d.claims.find(c=>c.sectionId==='S10')||d.claims[0];const MARK='Эцсийн шалгалтын тэмдэглэл';const newText=concl.text.replace(/\.?\s*$/,'')+'. '+MARK+'.';
const scoreBefore=(await call('GET',`/admin/reviews/${rid}/report-view`,{tok:S1})).d.report.payload.overall.score;
const sv=await A1('PUT',`/reviews/${rid}/draft`,{baseRevision:d.revision,reason:'Шууд засвар',edits:[{claimId:concl.claimId,text:newText}]});rec('direct text edit saved as a new revision',sv.s===200&&sv.d.revision===d.revision+1,`${sv.s} ${sv.e?.code??''}`);
const rv2=(await A1('GET',`/reviews/${rid}/report-view`)).d;rec('report-view (the page the admin edits) shows the saved text and the SAME score',JSON.stringify(rv2.report.narrative).includes(MARK)&&rv2.report.payload.overall.score===scoreBefore);
rec('customer still sees nothing before release',(await call('GET',`/assessments/${j.a}/report`,{tok:cu.tok})).s===409);
const ap=await A1('POST',`/reviews/${rid}/approve`,{baseRevision:sv.d.revision});rec('approve and release',ap.s===200&&sql(`select status from report_reviews where id='${rid}'`)==='PUBLISHED',`${ap.s} ${ap.e?.code??''}`);
const web=(await call('GET',`/assessments/${j.a}/report`,{tok:cu.tok})).d;rec('customer web report carries the edited text',JSON.stringify(web.narrative).includes(MARK)&&web.payload.overall.score===scoreBefore);
const pr=await fetch(B+`/assessments/${j.a}/report/pdf`,{headers:{authorization:'Bearer '+cu.tok}});const f=`/tmp/lk-${crypto.randomUUID()}.pdf`;fs.writeFileSync(f,Buffer.from(await pr.arrayBuffer()));
const txt=execFileSync('pdftotext',['-layout',f,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');const pages=Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo',[f],{encoding:'utf8'}))[1]);fs.unlinkSync(f);
rec('final PDF is 3 pages and contains the edited sentence exactly',pr.status===200&&pages===3&&txt.includes(MARK),`pages ${pages}`);
rec('approved revision hash equals the published narrative hash (revision integrity)',sql(`select ("approvedNarrativeHash" is not null)::text from report_reviews where id='${rid}'`)==='true');
rec('edit lock cleared after release',sql(`select "lockedByAdminId" is null from report_reviews where id='${rid}'`)==='t');
console.log(`\nRESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
