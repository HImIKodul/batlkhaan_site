/* REP-02 acceptance on an ISOLATED staging database (DATABASE_URL + MMRI_REPORT_STORAGE_DIR must point at the disposable copy; refused otherwise).
   Exercises the real ReportPdfArtifactService against a really published report: renderer failure, database failure after a verified render, crash debris, retry, atomic success. */
import fs from "node:fs";import path from "node:path";import {execFileSync} from "node:child_process";
import {prisma} from "../src/db.js";import {ReportPdfArtifactService} from "../src/services/report-pdf-artifact-service.js";
import {sha256Json} from "../src/lib/hash.js";
const db=new URL(process.env.DATABASE_URL!).pathname;if(!/stage|scratch|final|audit|qa_gate/.test(db)||/\/mmri$/.test(db))throw new Error("REFUSED: not a disposable database "+db);
const storage=process.env.MMRI_REPORT_STORAGE_DIR!;if(!/stage/.test(storage))throw new Error("REFUSED: storage dir is not the staging copy");
let pass=0,fail=0;const rec=(n:string,ok:boolean,d="")=>{ok?pass++:fail++;console.log((ok?"PASS ":"FAIL ")+n+(d?" | "+d:""))};
const svc=new ReportPdfArtifactService();const sha=(f:string)=>execFileSync("sha256sum",[f],{encoding:"utf8"}).split(" ")[0];
const snap:any=await prisma.reportSnapshot.findFirst({where:{publishedAt:{not:null},artifacts:{some:{kind:"PDF"}}} as any,orderBy:{publishedAt:"desc"}});
const art0:any=await (prisma as any).reportArtifact.findUnique({where:{reportSnapshotId_kind:{reportSnapshotId:snap.id,kind:"PDF"}}});
const payload=snap.payload,narr0=snap.narrative as any;const file0=path.join(storage,art0.storageKey);
const state=async()=>{const s:any=await prisma.reportSnapshot.findUnique({where:{id:snap.id}});const a:any=await (prisma as any).reportArtifact.findUnique({where:{reportSnapshotId_kind:{reportSnapshotId:snap.id,kind:"PDF"}}});return {nh:s.narrativeHash,vh:sha256Json(s.validation),sk:a.storageKey,ch:a.contentHash,sh:a.sourceHash,file:fs.existsSync(path.join(storage,a.storageKey))?sha(path.join(storage,a.storageKey)):null}};
const before=await state();rec("baseline: published snapshot, artifact row and file agree",!!before.file&&before.file===before.ch,`pdf ${before.ch.slice(0,12)}`);
const mutated:any=JSON.parse(JSON.stringify(narr0));mutated.sections[0].claims[0].textMn=narr0.sections[0].claims[0].textMn+" Шинэчилсэн.";const mHash=sha256Json(mutated);
const sameState=async(label:string)=>{const now=await state();rec(label,JSON.stringify(now)===JSON.stringify(before),JSON.stringify(now)===JSON.stringify(before)?"":JSON.stringify(now))};
const stagingCount=()=>fs.existsSync(path.join(storage,".staging"))?fs.readdirSync(path.join(storage,".staging")).length:0;
// 1. renderer failure
process.env.MMRI_PDF_RENDERER_SCRIPT="/nonexistent/renderer.py";let e1="";try{await svc.stage(snap.id,payload,mutated)}catch(e:any){e1=String(e?.message)}delete process.env.MMRI_PDF_RENDERER_SCRIPT;
rec("renderer failure: staging throws",!!e1,e1.slice(0,60));await sameState("renderer failure: published pair unchanged (DB + file)");rec("renderer failure: no staging debris left",stagingCount()===0);
// 2. database failure AFTER a verified render
const st=await svc.stage(snap.id,payload,mutated);rec("stage verifies exactly three pages and a PDF hash",st.pages===3&&/^[0-9a-f]{64}$/.test(st.contentHash),`pages=${st.pages}`);await sameState("staging alone changes nothing");
let e2="";try{await svc.commit(st,{narrative:mutated,narrativeHash:mHash,validation:{state:"PASS"}},async()=>{throw new Error("injected database failure inside the publication transaction")})}catch(e:any){e2=String(e?.message)}
rec("injected failure inside the transaction propagates",/injected/.test(e2));await sameState("DB failure after render: snapshot, artifact row and old file all unchanged (transaction rolled back)");
const newKeyPrefix=`pdf/${snap.assessmentId}/${snap.id}-${st.sourceHash.slice(0,16)}-${st.contentHash.slice(0,16)}.pdf`;rec("DB failure: the newly written file was removed (no orphan)",!fs.existsSync(path.join(storage,newKeyPrefix)));rec("DB failure: staging directory removed",stagingCount()===0);
// 3. crash simulation: stage, then 'die' (never commit/discard)
const st2=await svc.stage(snap.id,payload,mutated);rec("crash before commit leaves only staging debris",stagingCount()===1);await sameState("crash before commit: published pair unchanged");
const swept=await svc.sweepStaging(0);rec("restart housekeeping removes the debris",swept>=1&&stagingCount()===0,`swept ${swept}`);
// 4. orphan content-addressed file (crash after the file move, before the DB commit) must not block or corrupt a retry
const st3=await svc.stage(snap.id,payload,mutated);const orphan=path.join(storage,newKeyPrefix);fs.mkdirSync(path.dirname(orphan),{recursive:true});fs.copyFileSync(st3.pdfPath,orphan);
await sameState("orphan file present: served artifact still the previous one");
// 5. successful atomic commit on retry
const res=await svc.commit(st3,{narrative:mutated,narrativeHash:mHash,validation:{state:"PASS",retry:true}},async()=>{});
const after=await state();rec("retry commits: snapshot narrative hash is the approved hash",after.nh===mHash);rec("artifact row now points to the new content-addressed file and its hash matches the bytes",after.sk===newKeyPrefix&&after.file===after.ch&&after.ch===st3.contentHash);
rec("superseded file is KEPT after the commit (backup window) and only referenced files are served",fs.existsSync(file0)||art0.storageKey===after.sk);
rec("the committed PDF is exactly three pages",Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo",[path.join(storage,after.sk)],{encoding:"utf8"}))?.[1])===3);
const web:any=await prisma.reportSnapshot.findUnique({where:{id:snap.id}});rec("web narrative hash == snapshot hash == committed hash",sha256Json(web.narrative)===after.nh);
// 6. serve path agrees (ensure() must NOT consider the committed artifact stale)
const served=await svc.ensure(snap.id,payload,web.narrative as any,false);rec("ensure(): committed artifact is accepted as current (no re-render, same bytes)",served.contentHash===after.ch&&served.storageKey===after.sk);
// restore the baseline so the staging copy stays a faithful copy
const back=await svc.stage(snap.id,payload,narr0);await svc.commit(back,{narrative:narr0,narrativeHash:snap.narrativeHash,validation:snap.validation},async()=>{});
const restored=await state();rec("rollback to the original narrative republishes a consistent pair",restored.nh===before.nh&&restored.file===restored.ch);
console.log(`RESULT pass=${pass} fail=${fail}`);await prisma.$disconnect();process.exit(fail?1:0);
