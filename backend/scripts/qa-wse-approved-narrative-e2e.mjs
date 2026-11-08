/* WS-E MMRI-13 end-to-end: approved reviewer edits must reach the customer report JSON, the on-screen report model and the PDF text.
   Real API + real private clone DB (no mock of the pipeline). Creates a review row for the target assessment by SQL (test setup only), lets the real
   draft generator run (via regenerate-draft), edits S04/S05/S06 claims as a reviewer, approves, publishes, then fetches report JSON and PDF.
   Usage: API=http://127.0.0.1:4115/api/v1 WS=e ASSESSMENT=<completed assessment id with no review row> node scripts/qa-wse-approved-narrative-e2e.mjs */
import crypto from 'crypto';import fs from 'fs';import os from 'os';import path from 'path';import {execFileSync} from 'child_process';
const B=process.env.API||'http://127.0.0.1:4115/api/v1',WS=process.env.WS||'e',PORT=Number(new URL(B).port),ORIGIN=`http://127.0.0.1:${PORT+100}`;
const H='/home/kirby/Downloads/MMRI_FUNCTIONAL_REPAIR/harness';
const kv=f=>Object.fromEntries(fs.readFileSync(f,'utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const qa=kv(H+'/creds-qa.local'),adm=kv(H+'/creds-admin.local');
const sql=q=>execFileSync(H+'/psql.sh',[WS,'-At','-c',q],{encoding:'utf8'}).trim();
const A32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';const dec=t=>{let bits=0,v=0;const o=[];for(const ch of t){v=(v<<5)|A32.indexOf(ch);bits+=5;if(bits>=8){o.push((v>>>(bits-8))&255);bits-=8}}return Buffer.from(o)};
const totp=(s,off=0)=>{const c=Buffer.alloc(8);c.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)+off));const h=crypto.createHmac('sha1',dec(s)).update(c).digest();const o=h[h.length-1]&15;return String((((h[o]&0x7f)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3])%1000000).padStart(6,'0')};
const call=async(m,p,{tok,body,h={}}={})=>{const r=await fetch(B+p,{method:m,headers:{origin:ORIGIN,'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{}),...h},body:body===undefined?undefined:JSON.stringify(body)});const buf=Buffer.from(await r.arrayBuffer());let j=null;try{j=JSON.parse(buf.toString())}catch{}return {s:r.status,d:j?.data,e:j?.error,buf}};
let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const aid=process.env.ASSESSMENT;if(!aid){console.log('set ASSESSMENT');process.exit(2)}
const W=crypto.randomUUID();const cc=(m,p,tok,body)=>call(m,p,{tok,body,h:{'x-mmri-writer-id':W}});
// admin login (TOTP replay guard: try successive steps)
let S;for(const off of [0,1,2,3]){const r=await cc('POST','/admin/auth/login',undefined,{email:adm.email,password:adm.password,totpCode:totp(adm.secret,off)});if(r.s===200){S=r.d.token;break}if(off===3){console.log('admin login failed',r.s,r.e);process.exit(2)}await sleep(1000)}
const reauth=async()=>{for(const off of [1,2,3,4]){const r=await cc('POST','/admin/auth/reauth',S,{password:adm.password,totpCode:totp(adm.secret,off)});if(r.s===200)return true}return false};
const qlogin=await call('POST','/auth/login',{body:{email:qa.email,password:qa.password}});const cu=qlogin.d.accessToken;
// review row (test setup) then real draft generation through the API
let rvId=sql(`select id from report_reviews where "assessmentId"='${aid}'`);
if(!rvId){rvId='rv'+crypto.randomBytes(10).toString('hex');sql(`insert into report_reviews(id,"assessmentId","companyId","domainCode",status,"submittedAt","deadlineAt","lastError",version,"updatedAt") select '${rvId}',id,"companyId","domainCode",'GENERATION_FAILED',now(),now()+interval '48 hours','setup',0,now() from assessments where id='${aid}'`)}
rec('E2E-00 customer report is withheld while the review is pending',(await cc('GET',`/assessments/${aid}/report`,cu)).s===409);
if(sql(`select status from report_reviews where id='${rvId}'`)==='GENERATION_FAILED'){const rg=await cc('POST',`/admin/reviews/${rvId}/regenerate-draft`,S);rec('E2E-01 draft generation started',rg.s===200,String(rg.s))}
let st='';for(let i=0;i<60;i++){st=sql(`select status from report_reviews where id='${rvId}'`);if(st==='AWAITING_REVIEW'||st==='GENERATION_FAILED')break;await sleep(1000)}
rec('E2E-02 draft is AWAITING_REVIEW',st==='AWAITING_REVIEW',st+' '+sql(`select "lastError" from report_reviews where id='${rvId}'`));
const det=await cc('GET',`/admin/reviews/${rvId}`,S);const claims=det.d.claims;
const first=sec=>claims.find(c=>c.sectionId===sec);const c4=first('S04'),c5=first('S05'),c6=first('S06'),c10=first('S10');
const M4='Хянагчийн нэмэлт тайлбар: энэ давуу талыг зөвхөн тухайн салбарын нөхцөлд тулгуурлан ойлгоно уу.';
const M5='Хянагчийн нэмэлт тайлбар: энэ сул тал нь шалтгааны дүгнэлт биш, нэмэлт нотолгоо шаардана.';
const M6='Хянагчийн засвар: эхний алхмыг хариуцагч нэг хүнд оноож, гүйцэтгэлийг сар бүр хянана.';
const edits=[{claimId:c4.claimId,text:c4.text+' '+M4},{claimId:c5.claimId,text:c5.text+' '+M5},{claimId:c6.claimId,text:c6.text+' '+M6}];
await cc('POST',`/admin/reviews/${rvId}/claim`,S);
const big=' Хянагчийн нэмэлт тайлбар, энэ дүгнэлтийг тухайн салбарын нөхцөлд тулгуурлан ойлгоно уу.'.repeat(12);
const over=await cc('PUT',`/admin/reviews/${rvId}/draft`,S,{baseRevision:1,reason:'WS-E хэт урт тайлбар',edits:claims.filter(c=>c.sectionId==='S04'||c.sectionId==='S05'||c.sectionId==='S06').map(c=>({claimId:c.claimId,text:c.text+big}))});
rec('E2E-02b over-long approved wording is refused at save with 422 PDF_LAYOUT_BUDGET and no revision is written',over.s===422&&over.e?.code==='PDF_LAYOUT_BUDGET'&&sql(`select "currentRevision" from report_reviews where id='${rvId}'`)==='1',`${over.s} ${over.e?.code}`);
const e=await cc('PUT',`/admin/reviews/${rvId}/draft`,S,{baseRevision:1,reason:'WS-E MMRI-13 туршилт',edits});
rec('E2E-03 reviewer edit saved as revision 2 and validated PASS',e.s===200&&e.d.revision===2&&e.d.validation.state==='PASS',`${e.s} ${e.d?.validation?.state} ${JSON.stringify(e.e||'')}`);
await cc('POST',`/admin/reviews/${rvId}/ready`,S);await reauth();
const ap=await cc('POST',`/admin/reviews/${rvId}/approve`,S,{baseRevision:2});rec('E2E-04 approve',ap.s===200,`${ap.s} ${JSON.stringify(ap.e||'')}`);
await reauth();const pub=await cc('POST',`/admin/reviews/${rvId}/publish`,S);rec('E2E-05 publish',pub.s===200,`${pub.s} ${JSON.stringify(pub.e||'')}`);
// customer surfaces
const rep=await cc('GET',`/assessments/${aid}/report`,cu);const rj=rep.d;const flat=JSON.stringify(rj.narrative);
const sec=(id)=>rj.narrative.sections.find(s=>s.id===id);
rec('E2E-06 report JSON narrative carries all three approved edits',[M4,M5,M6].every(m=>flat.includes(m)));
const pdf=await call('GET',`/assessments/${aid}/report/pdf`,{tok:cu});const f=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'wse13-')),'r.pdf');fs.writeFileSync(f,pdf.buf);
const pages=+(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo',[f],{encoding:'utf8'}))?.[1]||0);const txt=execFileSync('pdftotext',[f,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');
rec('E2E-07 PDF still exactly 3 pages',pdf.s===200&&pages===3,`pages=${pages}`);
rec('E2E-08 PDF text contains the approved strength qualification (S04)',txt.includes(M4));
rec('E2E-09 PDF text contains the approved weakness qualification (S05)',txt.includes(M5));
rec('E2E-10 PDF text contains the approved action correction (S06)',txt.includes(M6));
// on-screen report model: the web renderer reads claims by trace / recommendation id; prove the claims are addressable that way
const rec6=(rj.payload.priorityActions[0]||{}).id;const w6=sec('S06').claims.find(c=>c.recommendationId===rec6);
rec('E2E-11 web renderer inputs: edited S06 claim is addressable by the first priority action id and holds the edit',!!w6&&w6.textMn.includes(M6));
const fe=fs.readFileSync(new URL('../../frontend/src/pages/Report.tsx',import.meta.url),'utf8');
rec('E2E-12 Report.tsx action text is taken from the approved S06 claim (by recommendationId), not rebuilt from frozen fields only',/detail:approvedActionText\(report,rec\.id\)/.test(fe)&&/id==='S06'\)\?\.claims\.find\(c=>c\.recommendationId===recommendationId\)/.test(fe));
console.log(fail?`FAILED ${fail}`:'ALL PASS');console.log('assessment',aid,'review',rvId);process.exit(fail?1:0);
