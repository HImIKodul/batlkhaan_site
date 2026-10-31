// Runtime gate for PDF artifact handling (stale recovery, caching, concurrency, event-loop responsiveness).
// Non-destructive: operates on published snapshots; the only mutation is deliberately staling an artifact row, which the service repairs.
import { execFileSync } from "node:child_process";
import { prisma } from "../src/db.js";
import { ReportPdfArtifactService } from "../src/services/report-pdf-artifact-service.js";
import { MMRI_PDF_GENERATOR_VERSION } from "../src/report/pdf-artifact.js";

const results:{name:string;pass:boolean;detail?:string}[]=[];
const check=(name:string,pass:boolean,detail?:string)=>{results.push({name,pass,detail});console.log(`${pass?"PASS":"FAIL"} ${name}${detail?` — ${detail}`:""}`);};
const pages=(p:string)=>Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo",[p]).toString())?.[1]);
const timed=async<T,>(f:()=>Promise<T>)=>{const t=Date.now();const v=await f();return {v,ms:Date.now()-t};};

const rows:any[]=await (prisma as any).reportSnapshot.findMany({where:{publishedAt:{not:null},narrative:{not:null}},orderBy:{publishedAt:"asc"}});
if(rows.length<2)throw new Error("Need at least two published reports");
const svc=new ReportPdfArtifactService();
const ensure=(r:any,f=false,s=svc)=>s.ensure(r.id,r.payload,r.narrative,f);

// 1. Every published report: recover/serve, 3 pages, identity matches the report.
for(const r of rows){
  const {v,ms}=await timed(()=>ensure(r));
  const art=await (prisma as any).reportArtifact.findUnique({where:{reportSnapshotId_kind:{reportSnapshotId:r.id,kind:"PDF"}}});
  check(`serve ${r.assessmentId.slice(-6)}`,v.generatorVersion===MMRI_PDF_GENERATOR_VERSION&&pages(v.absolutePath)===3&&art.sourceHash===v.sourceHash&&v.storageKey.includes(r.id)&&v.storageKey.includes(r.assessmentId),`${ms}ms pages=${pages(v.absolutePath)}`);
}
// 2. Cached path timing (< 2s) and byte identity.
const base=rows[0];
const first=await ensure(base);
const cached=await timed(()=>ensure(base));
check("cached PDF < 2s",cached.ms<2000&&cached.v.contentHash===first.contentHash,`${cached.ms}ms`);
// 3. Stale artifact (wrong source hash + old generator) -> regenerated, never served, no throw.
await (prisma as any).reportArtifact.update({where:{reportSnapshotId_kind:{reportSnapshotId:base.id,kind:"PDF"}},data:{sourceHash:"0".repeat(64),generatorVersion:"MMRI-PDF-1.4-BUSINESS-REPORT"}});
const stale=await timed(()=>ensure(base));
const after=await (prisma as any).reportArtifact.findUnique({where:{reportSnapshotId_kind:{reportSnapshotId:base.id,kind:"PDF"}}});
check("stale artifact regenerated (no 500)",stale.v.sourceHash===first.sourceHash&&after.sourceHash===first.sourceHash&&after.generatorVersion===MMRI_PDF_GENERATOR_VERSION&&pages(stale.v.absolutePath)===3,`${stale.ms}ms`);
// 4. Stale source hash with CURRENT generator version (the exact original failure) and missing file.
await (prisma as any).reportArtifact.update({where:{id:after.id},data:{sourceHash:"f".repeat(64)}});
const stale2=await ensure(base);
check("stale hash w/ current generator regenerated",stale2.sourceHash===first.sourceHash&&stale2.contentHash===first.contentHash);
// 5. Simultaneous same-report requests from two independent service instances (no shared in-flight map) + force.
const a=new ReportPdfArtifactService(),b=new ReportPdfArtifactService();
await (prisma as any).reportArtifact.update({where:{id:after.id},data:{sourceHash:"a".repeat(64)}});
const conc=await Promise.all([ensure(base,false,a),ensure(base,false,b),ensure(base,true,a)]);
check("concurrent same report: identical, valid",conc.every(c=>c.contentHash===first.contentHash&&c.sourceHash===first.sourceHash&&pages(c.absolutePath)===3));
// 6. Different reports concurrently + event-loop responsiveness while rendering.
let maxLag=0,last=Date.now();const iv=setInterval(()=>{const n=Date.now();maxLag=Math.max(maxLag,n-last-20);last=n;},20);
const t0=Date.now();
const dbPings:number[]=[];
const ping=(async()=>{for(let i=0;i<8;i++){const t=Date.now();await prisma.$queryRaw`select 1`;dbPings.push(Date.now()-t);await new Promise(r=>setTimeout(r,50));}})();
const many=await Promise.all([...rows.map(r=>ensure(r,true,new ReportPdfArtifactService())),ping]);
clearInterval(iv);
const arts=many.slice(0,rows.length) as any[];
check("different reports concurrently: distinct & 3 pages",new Set(arts.map(x=>x.storageKey)).size===rows.length&&arts.every(x=>pages(x.absolutePath)===3),`${Date.now()-t0}ms for ${rows.length} forced renders`);
check("event loop not blocked during rendering (max lag < 250ms)",maxLag<250,`maxLag=${maxLag}ms dbPingMax=${Math.max(...dbPings)}ms`);
// 7. Retry after failure: bad renderer path fails cleanly, then recovers.
const savedScript=process.env.MMRI_PDF_RENDERER_SCRIPT;process.env.MMRI_PDF_RENDERER_SCRIPT="/nonexistent/render.py";
let failed=false;try{await ensure(base,true,new ReportPdfArtifactService());}catch{failed=true;}
if(savedScript===undefined)delete process.env.MMRI_PDF_RENDERER_SCRIPT;else process.env.MMRI_PDF_RENDERER_SCRIPT=savedScript;
const rec=await ensure(base,false,new ReportPdfArtifactService());
check("failure leaves valid artifact; retry succeeds",failed&&rec.contentHash===first.contentHash&&pages(rec.absolutePath)===3);
// 8. Fresh service instance (restart) serves from cache fast.
const restart=await timed(()=>ensure(base,false,new ReportPdfArtifactService()));
check("cache valid after restart < 2s",restart.ms<2000&&restart.v.contentHash===first.contentHash,`${restart.ms}ms`);
// 9. Uncached (forced) render time.
const unc=await timed(()=>ensure(base,true,new ReportPdfArtifactService()));
check("uncached render < 15s",unc.ms<15000,`${unc.ms}ms`);

await prisma.$disconnect();
const bad=results.filter(r=>!r.pass);
console.log(JSON.stringify({status:bad.length?"FAIL":"PASS",passed:results.length-bad.length,total:results.length}));
process.exit(bad.length?1:0);
