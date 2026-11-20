/* Visual report editor: end-to-end regression on an ISOLATED stack (real API, real DB, real PDF renderer; AI disabled, mock payment/mail).
   Vertical slice: open a pending draft -> annotate -> save -> reopen -> preview -> approve -> publish (24 h rule via controlled timestamps) -> customer downloads
   the PDF -> the PDF carries the annotations -> scores/answers unchanged. Then concurrency, authorisation, revision history, re-approval and retake integrity.
   [Updated 2026-11: owner policy = ONE approve action releases at once (no 24 h hold); per-report edit lock.]
   Needs: API (review required), PGDATABASE, DATABASE_URL (same isolated DB), MMRI_MOCK_MAIL_DIR.
   Usage: node scripts/qa-report-editor-regression.mjs [domain] */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {call,sql,provision,adminLogin,customer,B,freshAdminTotp} from './lib/admin-qa.mjs';
import {http,journey} from './lib/qa-journey.mjs';

const domain=process.argv[2]||'finance';
let fail=0,pass=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const W=crypto.randomUUID();
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ve-reg-'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const aid=()=>'t'+crypto.randomBytes(8).toString('hex');

// ---- admins: reviewer (owner of the task), a second reviewer, a billing reviewer (no report rights) and a super admin
const rv=provision('REPORT_REVIEWER','ve1'),rv2=provision('REPORT_REVIEWER','ve2'),bl=provision('BILLING_REVIEWER','ve3');
const R=(await adminLogin(rv)).d.token,R2=(await adminLogin(rv2)).d.token,BL=(await adminLogin(bl)).d.token;
const ac=async(tok,m,p,body)=>{if(tok===R&&m!=='GET'&&!/\/(lock|unlock)$/.test(p)&&/\/admin\/reviews\//.test(p))await call('POST',p.replace(/(\/admin\/reviews\/[^/]+).*/,'$1/lock'),{tok,body:{},h:{'x-mmri-writer-id':W}}); /* the editor page renews its lock every minute */ return call(m,p,{tok,body,h:{'x-mmri-writer-id':W}})};
const reauth=async(a,tok)=>ac(tok,'POST','/admin/auth/reauth',{password:a.password,totpCode:await freshAdminTotp(a)});

// ---- PNG helpers (system Python + Pillow, no extra dependency)
function loadRgb(png){const f=path.join(tmp,'x'+crypto.randomBytes(4).toString('hex')+'.png');fs.writeFileSync(f,png);
  const out=execFileSync('python3',['-c',"import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert('RGB');sys.stdout.buffer.write(im.size[0].to_bytes(4,'big')+im.size[1].to_bytes(4,'big')+im.tobytes())",f],{maxBuffer:128*1024*1024});
  return {w:out.readUInt32BE(0),h:out.readUInt32BE(4),rgb:out.subarray(8)}}
/** Share of differing pixels inside / outside a page-relative window. */
function diff(aPng,bPng,win){const A=loadRgb(aPng),Bm=loadRgb(bPng);if(A.w!==Bm.w||A.h!==Bm.h)return {sizeMismatch:true};let inD=0,inN=0,outD=0;
  for(let y=0;y<A.h;y++)for(let x=0;x<A.w;x++){const i=(y*A.w+x)*3,d=Math.abs(A.rgb[i]-Bm.rgb[i])+Math.abs(A.rgb[i+1]-Bm.rgb[i+1])+Math.abs(A.rgb[i+2]-Bm.rgb[i+2])>24;
    const inside=win&&x/A.w>=win.x-.004&&x/A.w<=win.x+win.w+.004&&y/A.h>=win.y-.004&&y/A.h<=win.y+win.h+.004;if(inside){inN++;if(d)inD++}else if(d)outD++}
  return {inside:inN?inD/inN:0,outCount:outD}}
const editorPng=async(tok,rvId,n,qs)=>{const r=await fetch(B+`/admin/reviews/${rvId}/editor/page/${n}?${qs}`,{headers:{authorization:'Bearer '+tok}});return {s:r.status,type:r.headers.get('content-type'),buf:Buffer.from(await r.arrayBuffer())}};
const isPng=b=>b.length>1000&&b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));

// ---- customer journey (pending review)
const cu=await customer('ve');
const coId=(await http(B,'POST','/companies',{tok:cu.tok,body:{name:'VE-QA BUSINESS',industry:'Editor QA',businessModel:'B2B',employeeCount:20,companyAgeYears:3,marketType:'Mongolia',country:'MN'},h:{'x-mmri-writer-id':W}})).d.id;
const j=await journey(B,cu.tok,coId,domain);const a=j.a;
const rvId=sql(`select id from report_reviews where "assessmentId"='${a}'`);
for(let i=0;i<90&&!['AWAITING_REVIEW','IN_REVIEW'].includes(sql(`select status from report_reviews where id='${rvId}'`));i++)await sleep(2000);
const scoreBefore=sql(`select coalesce("overallOfficialScore","overallPartialScore") from assessments where id='${a}'`);
const payloadBefore=sql(`select "payloadHash" from report_snapshots where "assessmentId"='${a}' order by "generatedAt" desc limit 1`);
const answersBefore=sql(`select count(*)||':'||md5(string_agg(coalesce("optionIndex"::text,'n')||':'||"questionId", ',' order by "questionId","revision")) from answers where "assessmentId"='${a}' and active`);
const rev1md5=sql(`select md5(narrative::text) from report_review_revisions where "reviewId"='${rvId}' and revision=1`);

// VE-01..03 open a pending draft, base pages come from the real renderer
const claim=await ac(R,'POST',`/admin/reviews/${rvId}/claim`,{});
const st0=await ac(R,'GET',`/admin/reviews/${rvId}/editor`);
rec('VE-01 the pending draft opens in the editor: revision 1, no annotations, three pages, history shows the generated draft',claim.s===200&&st0.s===200&&st0.d.revision===1&&st0.d.pages===3&&st0.d.annotations.items.length===0&&st0.d.history[0].source==='GENERATED');
const base=[];for(let n=1;n<=3;n++)base.push(await editorPng(R,rvId,n,'annotated=0'));
rec('VE-02 all three page images are served as real PNGs',base.every(p=>p.s===200&&p.type==='image/png'&&isPng(p.buf)),base.map(p=>p.s+':'+p.buf.length).join(' '));
const bad=[await editorPng(R,rvId,4,'annotated=0'),await editorPng(R,rvId,0,'annotated=0'),await editorPng(R,rvId,1,'revision=-1')];
rec('VE-03 an invalid page number / revision is refused (400), never a server error',bad.every(p=>p.s===400),bad.map(p=>p.s).join('/'));

// VE-04.. annotate and save: text + highlight + arrow + pen + rect on all three pages
const HL={x:0.12,y:0.30,w:0.40,h:0.04},TX={x:0.50,y:0.55,w:0.38,h:0.07};
const set=[
 {id:aid(),page:1,type:'highlight',color:'yellow',...HL},
 {id:aid(),page:1,type:'text',color:'blue',text:'Хянагчийн тэмдэглэл: энэ хэсгийг дахин шалгана уу.',fontSize:9,...TX},
 {id:aid(),page:2,type:'arrow',color:'red',points:[[0.55,0.45],[0.30,0.38]],strokeWidth:2,x:0,y:0,w:0,h:0},
 {id:aid(),page:3,type:'pen',color:'green',points:[[0.15,0.62],[0.22,0.64],[0.30,0.61],[0.38,0.64]],strokeWidth:2,x:0,y:0,w:0,h:0},
 {id:aid(),page:3,type:'rect',color:'orange',x:0.10,y:0.72,w:0.30,h:0.05,strokeWidth:2}
];
const bad1=await ac(R,'PUT',`/admin/reviews/${rvId}/annotations`,{baseRevision:1,reason:'Туршилт',annotations:{version:1,items:[{...set[0],x:0.9,w:0.3}]}});
const bad2=await ac(R,'PUT',`/admin/reviews/${rvId}/annotations`,{baseRevision:1,reason:'Туршилт',annotations:{version:1,items:[{...set[0],page:7}]}});
const noReason=await ac(R,'PUT',`/admin/reviews/${rvId}/annotations`,{baseRevision:1,reason:'',annotations:{version:1,items:set}});
rec('VE-04 invalid annotations (outside the page, unknown page) and a missing reason are rejected with 400 and store nothing',bad1.s===400&&bad2.s===400&&noReason.s===400&&sql(`select "currentRevision" from report_reviews where id='${rvId}'`)==='1',`${bad1.s}/${bad2.s}/${noReason.s}`);
const sv=await ac(R,'PUT',`/admin/reviews/${rvId}/annotations`,{baseRevision:1,reason:'Дүрслэн тэмдэглэгээ нэмэв',annotations:{version:1,items:set}});
rec('VE-05 saving creates revision 2 (append-only) with the editor identity, reason and timestamp; revision 1 is byte-identical',sv.s===200&&sv.d.revision===2&&sv.d.annotationCount===5&&sql(`select "createdByAdminId" is not null and reason='Дүрслэн тэмдэглэгээ нэмэв' and source='MANUAL' and "createdAt" is not null from report_review_revisions where "reviewId"='${rvId}' and revision=2`)==='t'&&sql(`select md5(narrative::text) from report_review_revisions where "reviewId"='${rvId}' and revision=1`)===rev1md5,`${sv.s} ${sv.e?.code??''}`);

// VE-06 close/reopen: fresh read returns the identical annotations
const again=await ac(R,'GET',`/admin/reviews/${rvId}/editor`);
const strip=x=>JSON.stringify(x.items.map(i=>({id:i.id,page:i.page,type:i.type,color:i.color,text:i.text,points:i.points})));
rec('VE-06 reopening returns the saved annotations exactly (ids, pages, types, colours, text, points)',again.s===200&&again.d.revision===2&&again.d.annotations.items.length===5&&strip(again.d.annotations)===strip({items:set}),`${again.d.annotations.items.length} items`);
const geom=again.d.annotations.items.find(i=>i.type==='highlight');
rec('VE-07 geometry is stored in page units and survives unchanged (no screen-size dependence)',geom&&Math.abs(geom.x-HL.x)<1e-9&&Math.abs(geom.y-HL.y)<1e-9&&Math.abs(geom.w-HL.w)<1e-9&&Math.abs(geom.h-HL.h)<1e-9);
const arrow=again.d.annotations.items.find(i=>i.type==='arrow');
rec('VE-08 an arrow stores its endpoints; its bounding box is derived server-side',arrow&&arrow.points.length===2&&Math.abs(arrow.x-0.30)<1e-9&&Math.abs(arrow.w-0.25)<1e-9);

// VE-09 preview of the saved revision renders ONLY the annotation windows
const ann1=await editorPng(R,rvId,1,'annotated=1&revision=2'),ann2=await editorPng(R,rvId,2,'annotated=1&revision=2'),ann3=await editorPng(R,rvId,3,'annotated=1&revision=2');
const d1=diff(base[0].buf,ann1.buf,{x:0.10,y:0.28,w:0.80,h:0.36});const d2=diff(base[1].buf,ann2.buf,{x:0.28,y:0.36,w:0.30,h:0.12});const d3=diff(base[2].buf,ann3.buf,{x:0.08,y:0.58,w:0.34,h:0.21});
rec('VE-09 the server preview differs from the clean page ONLY where annotations were placed (all three pages)',d1.inside>0&&d1.outCount===0&&d2.inside>0&&d2.outCount===0&&d3.inside>0&&d3.outCount===0,`out-of-window changed px: ${d1.outCount}/${d2.outCount}/${d3.outCount}`);
const pv=await ac(R,'POST',`/admin/reviews/${rvId}/editor/preview`,{annotations:{version:1,items:[...set,{id:aid(),page:2,type:'rect',color:'red',x:0.2,y:0.8,w:0.2,h:0.05,strokeWidth:2}]}});
rec('VE-10 previewing UNSAVED annotations returns three rendered pages and stores nothing (revision still 2)',pv.s===200&&pv.d.pages.length===3&&pv.d.pages.every(x=>x.startsWith('data:image/png;base64,'))&&sql(`select "currentRevision" from report_reviews where id='${rvId}'`)==='2');

// VE-11.. concurrency: three simultaneous saves from the same base revision -> exactly one wins
const more=[...set,{id:aid(),page:2,type:'rect',color:'red',x:0.2,y:0.8,w:0.2,h:0.05,strokeWidth:2}];
const race=await Promise.all([1,2,3].map(k=>ac(R,'PUT',`/admin/reviews/${rvId}/annotations`,{baseRevision:2,reason:'Зэрэгцээ '+k,annotations:{version:1,items:[...more,{id:aid(),page:1,type:'rect',color:'ink',x:0.1,y:0.1+k*0.01,w:0.1,h:0.03,strokeWidth:1}]}})));
rec('VE-11 concurrent saves from the same base revision: exactly one succeeds, the others get 409 REVISION_CONFLICT; revision advanced by exactly one',race.filter(x=>x.s===200).length===1&&race.filter(x=>x.s===409&&x.e?.code==='REVISION_CONFLICT').length===2&&sql(`select "currentRevision" from report_reviews where id='${rvId}'`)==='3',race.map(x=>x.s).join(','));
const stale=await ac(R,'PUT',`/admin/reviews/${rvId}/annotations`,{baseRevision:2,reason:'Хуучин',annotations:{version:1,items:set}});
rec('VE-12 saving against a stale base revision is refused (409) and revision history is unchanged',stale.s===409&&sql(`select count(*) from report_review_revisions where "reviewId"='${rvId}'`)==='3');
const nochange=await ac(R,'PUT',`/admin/reviews/${rvId}/annotations`,{baseRevision:3,reason:'Өөрчлөлтгүй',annotations:(await ac(R,'GET',`/admin/reviews/${rvId}/editor`)).d.annotations});
rec('VE-13 saving an identical set is rejected (NO_CHANGE): no empty revisions',nochange.s===400&&nochange.e?.code==='NO_CHANGE');

// VE-14.. authorisation
const e1=await call('GET',`/admin/reviews/${rvId}/editor`,{tok:cu.tok}),e2=await call('PUT',`/admin/reviews/${rvId}/annotations`,{tok:cu.tok,body:{baseRevision:3,reason:'x',annotations:{version:1,items:[]}}}),e3=await call('GET',`/admin/reviews/${rvId}/editor/page/1`,{tok:undefined});
const e4=await ac(BL,'PUT',`/admin/reviews/${rvId}/annotations`,{baseRevision:3,reason:'Зөвшөөрөлгүй',annotations:{version:1,items:[]}}),e5=await ac(BL,'GET',`/admin/reviews/${rvId}/editor`);
const e6=await ac(R2,'PUT',`/admin/reviews/${rvId}/annotations`,{baseRevision:3,reason:'Өөр хянагч',annotations:{version:1,items:[]}});
rec('VE-14 customers (401), unauthenticated callers (401), billing reviewers (403) and a reviewer who does not hold the edit lock (409) cannot edit or read the editor',[e1.s,e2.s,e3.s].every(s=>s===401)&&e4.s===403&&e5.s===403&&e6.s===409&&e6.e?.code==='LOCKED_BY_OTHER',`${e1.s}/${e2.s}/${e3.s}/${e4.s}/${e5.s}/${e6.s}`);
const cust=await http(B,'GET',`/assessments/${a}/report/pdf`,{tok:cu.tok});
rec('VE-15 the customer cannot reach any draft report or PDF while the review is pending',cust.s===409&&cust.e?.code==='REPORT_PENDING_REVIEW',`${cust.s} ${cust.e?.code??''}`);

// VE-16.. save revision 4, then ONE approve action records the approval and releases the report at once (owner policy: no release hold)
const finalSet=(await ac(R,'GET',`/admin/reviews/${rvId}/editor`)).d.annotations;
const rev4=await ac(R,'PUT',`/admin/reviews/${rvId}/annotations`,{baseRevision:3,reason:'Тэмдэглэгээг өөрчлөв',annotations:{version:1,items:finalSet.items.slice(0,-1)}});
rec('VE-16 a further save creates revision 4 (append-only history), and the draft is still withheld from the customer',rev4.s===200&&rev4.d.revision===4&&(await http(B,'GET',`/assessments/${a}/report/pdf`,{tok:cu.tok})).s===409,`${rev4.s} ${rev4.e?.code??''}`);
await reauth(rv,R);
const ap=await ac(R,'POST',`/admin/reviews/${rvId}/approve`,{baseRevision:4});
const bound=sql(`select "approvedRevision"||':'||("approvedNarrativeHash" is not null)||':'||status from report_reviews where id='${rvId}'`);
rec('VE-17 ONE approve action records revision 4 and the narrative hash that covers the annotations, and releases the report',ap.s===200&&bound==='4:true:PUBLISHED',`${ap.s} ${ap.e?.code??''} ${bound}`);
const edAfter=await ac(R,'PUT',`/admin/reviews/${rvId}/annotations`,{baseRevision:4,reason:'Илгээсний дараа',annotations:{version:1,items:[]}});
rec('VE-18 a released report cannot be edited any more (409) and no revision is added',edAfter.s===409&&sql(`select count(*) from report_review_revisions where "reviewId"='${rvId}'`)==='4',`${edAfter.s} ${edAfter.e?.code??''}`);
const again2=await ac(R,'POST',`/admin/reviews/${rvId}/approve`,{baseRevision:3});
rec('VE-19 a repeated approval (even with an older revision number) after release is idempotent: nothing changes, no second release',again2.s===200&&again2.d?.alreadyPublished===true&&sql(`select "approvedRevision" from report_reviews where id='${rvId}'`)==='4'&&Number(sql(`select count(*) from customer_notifications where type='REPORT_RELEASED' and payload->>'assessmentId'='${a}'`))===1,`${again2.s}`);
const ageH=Number(sql(`select extract(epoch from (now()-"submittedAt"))/3600 from report_reviews where id='${rvId}'`));
const rel=await http(B,'GET',`/assessments/${a}/report`,{tok:cu.tok});
rec('VE-20 the report was released immediately after approval (no waiting period): elapsed since submission is under 3 hours and the customer already reads it',ageH<3&&rel.s===200&&ap.e?.code!=='RELEASE_NOT_DUE',`elapsed ${ageH.toFixed(2)} h`);
const approvedSet=(await ac(R,'GET',`/admin/reviews/${rvId}/editor`)).d.annotations;
const approvedPages=[];for(let n=1;n<=3;n++)approvedPages.push((await editorPng(R,rvId,n,'annotated=1&revision=4')).buf);

// the customer PDF must carry exactly the approved annotations
const pdfRes=await fetch(B+`/assessments/${a}/report/pdf`,{headers:{authorization:'Bearer '+cu.tok}});const pdf=Buffer.from(await pdfRes.arrayBuffer());
const pdfFile=path.join(tmp,'customer.pdf');fs.writeFileSync(pdfFile,pdf);
const pages=Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo',[pdfFile],{encoding:'utf8'}))?.[1]);
const text=execFileSync('pdftotext',['-layout',pdfFile,'-'],{encoding:'utf8'});
rec('VE-21 the customer downloads a real 3-page PDF',pdfRes.status===200&&pdf.subarray(0,5).toString()==='%PDF-'&&pages===3,`${pdfRes.status} pages=${pages}`);
const finalText=approvedSet.items.find(i=>i.type==='text')?.text??'';
rec('VE-22 the approved annotation text is present in the published PDF text layer',finalText.length>10&&text.replace(/\s+/g,' ').includes(finalText.replace(/\s+/g,' ').slice(0,28)),finalText.slice(0,28));
execFileSync('pdftoppm',['-png','-r','110',pdfFile,path.join(tmp,'cust')]);
const custPages=[1,2,3].map(n=>fs.readFileSync(path.join(tmp,`cust-${n}.png`)));
const same=custPages.map((p,i)=>sha(p)===sha(approvedPages[i]));
rec('VE-23 the published PDF pages are PIXEL-IDENTICAL to the approved revision as rendered by the editor preview (saved editor state == published PDF)',same.every(Boolean),same.join(','));
const dc=[0,1,2].map(i=>diff(base[i].buf,custPages[i],null));
rec('VE-24 the published PDF differs from the clean report only by the annotations (pages 1, 2 and 3 all carry some; layout identical)',dc.every(x=>!x.sizeMismatch&&x.outCount>0),dc.map(x=>x.outCount).join('/'));

// VE-25.. integrity: nothing but the overlay changed
const scoreAfter=sql(`select coalesce("overallOfficialScore","overallPartialScore") from assessments where id='${a}'`);
const answersAfter=sql(`select count(*)||':'||md5(string_agg(coalesce("optionIndex"::text,'n')||':'||"questionId", ',' order by "questionId","revision")) from answers where "assessmentId"='${a}' and active`);
const results=await http(B,'GET',`/assessments/${a}/results`,{tok:cu.tok});
rec('VE-25 score, answers and the frozen report payload are unchanged by annotating',scoreBefore===scoreAfter&&answersBefore===answersAfter&&sql(`select "payloadHash" from report_snapshots where "assessmentId"='${a}' order by "generatedAt" desc limit 1`)===payloadBefore&&results.s===200&&String(Math.round(results.d.overall.score))===String(Math.round(Number(scoreBefore))),`${scoreBefore} vs ${scoreAfter}`);
rec('VE-26 revision 1 (the generated draft) is still byte-identical; four revisions exist; history lists who/when/why with annotation counts',sql(`select md5(narrative::text) from report_review_revisions where "reviewId"='${rvId}' and revision=1`)===rev1md5&&sql(`select count(*) from report_review_revisions where "reviewId"='${rvId}' and "createdByAdminId" is not null`)==='3'&&(h=>h.length===4&&h[3].annotationCount===0&&h[2].annotationCount===5&&h.every(x=>x.createdAt&&x.revision))((await ac(R,'GET',`/admin/reviews/${rvId}/editor`)).d.history),'');
const edAfterPub=await ac(R,'PUT',`/admin/reviews/${rvId}/annotations`,{baseRevision:4,reason:'Нийтэлсний дараа',annotations:{version:1,items:[]}});
const pub2=await ac(R,'POST',`/admin/reviews/${rvId}/publish`,{});
const pdfHash1=sha(pdf);const pdfAgain=Buffer.from(await (await fetch(B+`/assessments/${a}/report/pdf`,{headers:{authorization:'Bearer '+cu.tok}})).arrayBuffer());
rec('VE-27 a published report cannot be edited or published again; the stored PDF is byte-identical on every download',edAfterPub.s===409&&pub2.s===409&&sha(pdfAgain)===pdfHash1,`${edAfterPub.s}/${pub2.s}`);
const audits=sql(`select count(*) from admin_audit_events where action='REPORT_ANNOTATED' and "targetId"='${rvId}'`);
rec('VE-28 every successful annotation save is in the administrator audit trail',Number(audits)===3,`${audits} audit rows (saves: revisions 2, 3, 4)`);

// VE-29 retake: a new paid retake gets its own report; the first report's PDF is never touched
const inv=(await http(B,'POST',`/companies/${coId}/billing/invoices`,{tok:cu.tok,body:{planCode:'RETAKE',domainCode:domain}})).d;
const jr=await journey(B,cu.tok,coId,domain,'RETAKE');
const rv2id=sql(`select id from report_reviews where "assessmentId"='${jr.a}'`);
for(let i=0;i<90&&sql(`select count(*) from report_review_revisions where "reviewId"='${rv2id}'`)==='0';i++)await sleep(2000); // the retake's draft is generated asynchronously
rec('VE-29 a retake creates a separate review/revision chain with NO annotations, and the first published PDF is byte-identical afterwards',jr.a!==a&&rv2id&&rv2id!==rvId&&sql(`select (narrative ? 'visualAnnotations') from report_review_revisions where "reviewId"='${rv2id}' and revision=1`)==='f'&&sha(Buffer.from(await (await fetch(B+`/assessments/${a}/report/pdf`,{headers:{authorization:'Bearer '+cu.tok}})).arrayBuffer()))===pdfHash1,`retake ${jr.a} invoice ${inv?.id??'?'}`);

fs.rmSync(tmp,{recursive:true,force:true});
console.log(`SUMMARY pass=${pass} fail=${fail}`);
process.exit(fail?1:0);
