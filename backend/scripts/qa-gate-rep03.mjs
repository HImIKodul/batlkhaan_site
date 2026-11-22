/* REP-03: customer review-status and the content gate must agree when a review row is missing. ISOLATED fresh install (mock billing). */
const R=new URL('./lib/',import.meta.url).pathname;const {sql,customer,B}=await import(R+'admin-qa.mjs');const {journey,http}=await import(R+'qa-journey.mjs');
let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const A=await customer('rep03');const cid=(await http(B,'POST','/companies',{tok:A.tok,body:{name:'REP03 ХХК'}})).d.id;
const j=await journey(B,A.tok,cid,'marketing');const aid=j.a;rec('assessment completed through the API',!!aid);
await new Promise(r=>setTimeout(r,3000));
const st0=await http(B,'GET',`/assessments/${aid}/review-status`,{tok:A.tok});rec('normal flow: status says pending review and content is withheld',st0.d?.state==='PENDING_REVIEW'&&st0.d?.available===false);
const g0=await http(B,'GET',`/assessments/${aid}/report`,{tok:A.tok});rec('normal flow: report is refused with 409 REPORT_PENDING_REVIEW',g0.s===409&&g0.e?.code==='REPORT_PENDING_REVIEW',`${g0.s}`);
// post-cutover assessment whose review row is lost
sql(`delete from report_reviews where "assessmentId"='${aid}'`);rec('review row removed (simulated loss)',Number(sql(`select count(*) from report_reviews where "assessmentId"='${aid}'`))===0);
const st1=await http(B,'GET',`/assessments/${aid}/review-status`,{tok:A.tok});
rec('REP-03: status does NOT claim availability when the review row is missing (post-cutover)',st1.d?.available===false&&st1.d?.state==='PENDING_REVIEW',JSON.stringify({state:st1.d?.state,available:st1.d?.available}));
rec('REP-03: the missing review was repaired (row recreated, queued)',Number(sql(`select count(*) from report_reviews where "assessmentId"='${aid}'`))===1);
const g1=await http(B,'GET',`/assessments/${aid}/report`,{tok:A.tok});rec('REP-03: content gate agrees (409 pending), never "available then 409"',g1.s===409,String(g1.s));
// a genuine LEGACY assessment (completed before review was enforced) stays available and consistent
sql(`delete from report_reviews where "assessmentId"='${aid}'`);sql(`update assessments set "completedAt"='2026-01-01T00:00:00Z' where id='${aid}'`);
const st2=await http(B,'GET',`/assessments/${aid}/review-status`,{tok:A.tok});const g2=await http(B,'GET',`/assessments/${aid}/report`,{tok:A.tok});
rec('legacy assessment: status says available and the gate does not block it',st2.d?.available===true&&st2.d?.state==='LEGACY_AVAILABLE'&&g2.e?.code!=='REPORT_PENDING_REVIEW',`${st2.d?.state} report=${g2.s} ${g2.e?.code||''}`);
rec('legacy assessment: no review row was invented',Number(sql(`select count(*) from report_reviews where "assessmentId"='${aid}'`))===0);
console.log(`RESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
