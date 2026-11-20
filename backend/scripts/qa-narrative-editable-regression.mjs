/* Only customer-visible narrative text is editable (S04 strengths, S05 weaknesses, S06 priority actions, S10 conclusion). Calculated values and mandatory disclosures
   (S01 facts, S02 score statement + required warnings, S03 purpose scores, S07/S08/S09 measures, roadmap and risks) are refused server-side. Isolated QA stack only.
   Uses ONE pending QA review (claimed, edited once in S10; left in review). Needs API, PGDATABASE, DATABASE_URL, ADMIN_* like the other QA scripts. */
import {call,sql,freshAdminTotp} from './lib/admin-qa.mjs';
let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const sup={email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,secret:process.env.ADMIN_TOTP_SECRET};
const S=(await call('POST','/admin/auth/login',{body:{email:sup.email,password:sup.password,totpCode:await freshAdminTotp(sup)}})).d.token;
const rid=sql(`select id from report_reviews where status in ('IN_REVIEW','AWAITING_REVIEW') and ("lockedByAdminId" is null or "lockExpiresAt"<now()) order by "submittedAt" asc limit 1`);
await call('POST',`/admin/reviews/${rid}/claim`,{tok:S});
const d=(await call('GET',`/admin/reviews/${rid}`,{tok:S})).d;const claims=d.claims;
const secs=[...new Set(claims.map(c=>c.sectionId))];
rec('claims carry an editable flag; editable sections are exactly S04, S05, S06, S10',claims.every(c=>typeof c.editable==='boolean')&&[...new Set(claims.filter(c=>c.editable).map(c=>c.sectionId))].sort().join()==='S04,S05,S06,S10',secs.join());
let rev=Number(sql(`select "currentRevision" from report_reviews where id='${rid}'`));
for(const sec of ['S01','S02','S03','S07','S08','S09'].filter(s=>secs.includes(s))){
  const c=claims.find(x=>x.sectionId===sec);const r=await call('PUT',`/admin/reviews/${rid}/draft`,{tok:S,body:{baseRevision:rev,reason:'Тест засвар',edits:[{claimId:c.claimId,text:c.text+' Нэмэлт.'}]}});
  rec(`${sec} «${c.sectionTitle}» is refused (400 CLAIM_NOT_EDITABLE) and no revision is created`,r.s===400&&r.e?.code==='CLAIM_NOT_EDITABLE'&&Number(sql(`select "currentRevision" from report_reviews where id='${rid}'`))===rev,`${r.s} ${r.e?.code??''}`);
}
const ok10=claims.find(x=>x.sectionId==='S10');const e=await call('PUT',`/admin/reviews/${rid}/draft`,{tok:S,body:{baseRevision:rev,reason:'Тест засвар',edits:[{claimId:ok10.claimId,text:ok10.text.replace(/\s*$/,'')+' Хяналтын нэмэлт.'}]}});
rec('S10 conclusion edit is accepted as one new revision',e.s===200&&e.d.revision===rev+1,`${e.s} ${e.e?.code??''}`);
const mixed=await call('PUT',`/admin/reviews/${rid}/draft`,{tok:S,body:{baseRevision:rev+1,reason:'Тест засвар',edits:[{claimId:ok10.claimId,text:ok10.text+' Хоёр.'},{claimId:claims.find(x=>!x.editable).claimId,text:'x yz'}]}});
rec('a request mixing an editable and a non-editable claim is refused as a whole (nothing partially saved)',mixed.s===400&&Number(sql(`select "currentRevision" from report_reviews where id='${rid}'`))===rev+1);
const sc=await call('POST',`/admin/reviews/${rid}/scan`,{tok:S});const ne=new Set(claims.filter(x=>!x.editable).map(x=>x.claimId));
rec('scan findings on non-editable claims carry no text proposal and say so',sc.s===200&&sc.d.findings.filter(f=>f.claimId&&ne.has(f.claimId)).every(f=>!f.suggestion&&/засахгүй/.test(f.message)));
const ai=await call('POST',`/admin/reviews/${rid}/ai/suggest`,{tok:S,body:{}});
rec('assist proposals are only generated for editable claims',ai.s===200&&(ai.d.suggestions??[]).every(x=>!ne.has(x.claimId)),`${(ai.d.suggestions??[]).length} proposals`);
// ---- executive conclusion length contract (80-160 words): oversized edits are saved as drafts with a clear warning but can never be approved; the approval error is plain Mongolian
const wcount=t=>t.trim()?t.trim().split(/\s+/).length:0;
const cur=(await call('GET',`/admin/reviews/${rid}`,{tok:S})).d;const c10=cur.claims.find(x=>x.sectionId==='S10');let rv=Number(sql(`select "currentRevision" from report_reviews where id='${rid}'`));
const filler=' Нэмэлт тайлбар үгс орууллаа.';let long=c10.text;while(wcount(long)<165)long+=filler;
const sl=await call('PUT',`/admin/reviews/${rid}/draft`,{tok:S,body:{baseRevision:rv,reason:'Хэт урт тест',edits:[{claimId:c10.claimId,text:long}]}});
rec('an over-long conclusion is saved as a draft and the response carries the V27 warning',sl.s===200&&sl.d.validation?.issues?.some(i=>i.checkId==='V27'),`${wcount(long)} words`);rv=sl.d.revision;
let ap=await call('POST',`/admin/reviews/${rid}/approve`,{tok:S,body:{baseRevision:rv}});if(ap.s===401){await call('POST','/admin/auth/reauth',{tok:S,body:{password:sup.password,totpCode:await freshAdminTotp(sup)}});ap=await call('POST',`/admin/reviews/${rid}/approve`,{tok:S,body:{baseRevision:rv}})}
rec('approving it is refused (422) with the Mongolian message that states the range and the current count',ap.s===422&&/80-160 үгтэй/.test(ap.e?.message)&&new RegExp(`${wcount(long)} үг`).test(ap.e.message)&&sql(`select status from report_reviews where id='${rid}'`)!=='PUBLISHED',ap.e?.message);
const base=cur.claims.find(x=>x.sectionId==='S10').text;let short=base;const words=short.trim().split(/\s+/);short=words.slice(0,Math.min(words.length,150)).join(' ')+(/[.!?]$/.test(words[Math.min(words.length,150)-1])?'':'.');
const ss=await call('PUT',`/admin/reviews/${rid}/draft`,{tok:S,body:{baseRevision:rv,reason:'Богиносгосон тест',edits:[{claimId:c10.claimId,text:short}]}});
rec('replacing the text with a conclusion inside 80-160 words clears the warning',ss.s===200&&!(ss.d.validation?.issues||[]).some(i=>i.checkId==='V27'),`${wcount(short)} words`);
const back=(await call('GET',`/admin/reviews/${rid}`,{tok:S})).d.claims.find(x=>x.sectionId==='S10').text;rec('Mongolian text (Ө, Ү, quotes) survives save and reload byte for byte',back===short&&/[ӨөҮү]/.test(back));
await call('POST',`/admin/reviews/${rid}/unlock`,{tok:S});
console.log(`\nRESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
