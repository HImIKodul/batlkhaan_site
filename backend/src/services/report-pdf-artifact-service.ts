import { planStartDate } from "../report/annual-plan.js";
import { randomUUID } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { access, chmod, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { prisma } from "../db.js";
import { buildReportPdfSource, reportPdfSourceHash, assertPdfBuffer, sha256Buffer, MMRI_PDF_GENERATOR_VERSION, generatorVersionFor } from "../report/pdf-artifact.js";
import { readPolicyFlags } from "../engine/policy-flags.js";
import { ApiError } from "../api/errors.js";
import { companyLogos } from "../company/company-logo-service.js";
import type { FrozenReportPayload, NarrativeDraft } from "../report/types.js";

const MAX_PDF_BYTES=50*1024*1024;
function boundedEnvInt(name:string,fallback:number,min:number,max:number){const raw=process.env[name];const value=raw===undefined?fallback:Number(raw);if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer between ${min} and ${max}`);return value;}
function storageRoot(){return path.resolve(process.env.MMRI_REPORT_STORAGE_DIR||process.env.REPORT_STORAGE_DIR||path.join(process.cwd(),"report-storage"));}
function safeSegment(value:string,label:string){if(!/^[A-Za-z0-9_-]{3,160}$/.test(value))throw new Error(`Unsafe ${label} for report storage`);return value;}
function resolveStorageKey(key:string){
  if(path.isAbsolute(key)||key.includes("\\"))throw new Error("Invalid report artifact storage key");
  const root=storageRoot(),abs=path.resolve(root,key);
  if(abs===root||!abs.startsWith(root+path.sep))throw new Error("Report artifact path escapes storage root");
  return abs;
}
function pdfFileName(payload:FrozenReportPayload){return `BusinessMRI.mn-${safeSegment(payload.assessmentId,"assessment id")}.pdf`;}

async function runPdfRenderer(sourcePath:string,pdfPath:string){
  const timeoutMs=boundedEnvInt("MMRI_PDF_RENDER_TIMEOUT_MS",45_000,5_000,120_000);
  const python=String(process.env.MMRI_PDF_PYTHON_PATH||"python3").trim()||"python3";
  const renderer=path.resolve(process.env.MMRI_PDF_RENDERER_SCRIPT||path.join(process.cwd(),"pdf_renderer","render_report_pdf.py"));
  if(readPolicyFlags().b4&&!/b4_proposed/.test(path.basename(renderer)))throw new Error("B4 placeholders require the proposed renderer (render_report_pdf_b4_proposed.py); refusing to render with the approved renderer");
  if(!readPolicyFlags().b4&&/b4_proposed/.test(path.basename(renderer)))throw new Error("The proposed B4 renderer is configured but the B4 flag is OFF; refusing");
  await access(renderer);
  await new Promise<void>((resolve,reject)=>{
    const rendererEnv:NodeJS.ProcessEnv={PATH:process.env.PATH||"/usr/local/bin:/usr/bin:/bin",HOME:process.env.HOME||"/tmp",LANG:process.env.LANG||"C.UTF-8",LC_ALL:process.env.LC_ALL||process.env.LANG||"C.UTF-8",PYTHONIOENCODING:"utf-8"};
    const child=spawn(python,[renderer,"--input",sourcePath,"--output",pdfPath],{stdio:["ignore","pipe","pipe"],env:rendererEnv});
    let stderr="",stdout="";child.stderr?.on("data",d=>{stderr+=String(d);if(stderr.length>8000)stderr=stderr.slice(-8000)});child.stdout?.on("data",d=>{stdout+=String(d);if(stdout.length>4000)stdout=stdout.slice(-4000)});
    const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error(`PDF rendering timed out after ${timeoutMs}ms`));},timeoutMs);
    child.once("error",err=>{clearTimeout(timer);reject(new Error(`Cannot start PDF renderer: ${err.message}`));});
    child.once("exit",code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error(`ReportLab PDF renderer failed (${code}): ${(stderr||stdout).trim().slice(-1000)}`));});
  });
}

export interface ReportPdfArtifactResult {
  reportSnapshotId:string;
  storageKey:string;
  absolutePath:string;
  filename:string;
  mimeType:"application/pdf";
  sourceHash:string;
  contentHash:string;
  sizeBytes:number;
  generatorVersion:string;
  generatedAt:Date;
  verifiedAt:Date|null;
}

/** Number of pages. Uses poppler's pdfinfo when installed; otherwise counts /Type /Page objects of the PDF written by our renderer (ReportLab writes plain, uncompressed page objects), so publication does not hard-depend on poppler. */
export function pdfPageCount(pdfPath:string,buffer?:Buffer):number{
  try{const n=Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo",[pdfPath],{encoding:"utf8",timeout:15_000}))?.[1]??0);if(n>0)return n;}catch{/* pdfinfo missing or failed: use the structural count */}
  const text=(buffer??readFileSync(pdfPath)).toString("latin1");
  return (text.match(/\/Type\s*\/Page(?![A-Za-z])/g)??[]).length;
}

export interface StagedPdf {reportSnapshotId:string;assessmentId:string;dir:string;pdfPath:string;sourceHash:string;contentHash:string;sizeBytes:number;pages:number;payload:FrozenReportPayload}

export class ReportPdfArtifactService {
  private inFlight=new Map<string,Promise<ReportPdfArtifactResult>>();

  async ensure(reportSnapshotId:string,payload:FrozenReportPayload,narrative:NarrativeDraft,force=false):Promise<ReportPdfArtifactResult>{
    // Serialize all PDF work for the same immutable report. A force-regeneration
    // request racing a normal read must never render/write the same artifact concurrently.
    const key=reportSnapshotId;
    const current=this.inFlight.get(key);if(current)return current;
    const run=this.ensureInternal(reportSnapshotId,payload,narrative,force).finally(()=>{if(this.inFlight.get(key)===run)this.inFlight.delete(key)});
    this.inFlight.set(key,run);return run;
  }

  private async ensureInternal(reportSnapshotId:string,payload:FrozenReportPayload,narrative:NarrativeDraft,force:boolean):Promise<ReportPdfArtifactResult>{
    const source=buildReportPdfSource(payload,narrative);const sourceHash=reportPdfSourceHash(source);
    const existing=await (prisma as any).reportArtifact.findUnique({where:{reportSnapshotId_kind:{reportSnapshotId,kind:"PDF"}}});
    // A stored artifact whose source hash differs from the currently published report is stale
    // (older generator/source schema or a superseded narrative). It is never served: it is
    // re-rendered from the published report and atomically replaced.
    const stale=Boolean(existing&&existing.sourceHash!==sourceHash);
    // B7 (flag ON only): a stored historical PDF is never regenerated just because the generator version changed; an operator must opt in explicitly.
    const b7=readPolicyFlags().b7,upgradeAllowed=process.env.MMRI_PDF_ALLOW_GENERATOR_UPGRADE==="YES";
    if(existing&&!stale&&!force&&(existing.generatorVersion===generatorVersionFor()||(b7&&!upgradeAllowed))){
      const verified=await this.verifyExisting(existing,payload).catch(()=>null);if(verified)return verified;
    }
    return this.renderAndStore(reportSnapshotId,payload,sourceHash,source,existing??null,stale,narrative);
  }

  private async verifyExisting(row:any,payload:FrozenReportPayload):Promise<ReportPdfArtifactResult>{
    const absolutePath=resolveStorageKey(row.storageKey);await access(absolutePath);const info=await stat(absolutePath);
    if(!info.isFile()||info.size!==row.sizeBytes||info.size<=0||info.size>MAX_PDF_BYTES)throw new Error("Stored PDF artifact size mismatch");
    const buffer=await readFile(absolutePath);assertPdfBuffer(buffer);const contentHash=sha256Buffer(buffer);if(contentHash!==row.contentHash)throw new Error("Stored PDF artifact hash mismatch");
    const verifiedAt=new Date();await (prisma as any).reportArtifact.update({where:{id:row.id},data:{verifiedAt}}).catch(()=>undefined);
    return {reportSnapshotId:row.reportSnapshotId,storageKey:row.storageKey,absolutePath,filename:pdfFileName(payload),mimeType:"application/pdf",sourceHash:row.sourceHash,contentHash:row.contentHash,sizeBytes:row.sizeBytes,generatorVersion:row.generatorVersion,generatedAt:row.generatedAt,verifiedAt};
  }


  private async renderAndStore(reportSnapshotId:string,payload:FrozenReportPayload,sourceHash:string,source:any,existing:any,stale=false,narrative?:NarrativeDraft):Promise<ReportPdfArtifactResult>{
    const root=storageRoot();await mkdir(root,{recursive:true,mode:0o700});
    const tmp=await mkdtemp(path.join(root,".pdf-"));
    const sourcePath=path.join(tmp,"report-source.json"),tmpPdf=path.join(tmp,"report.pdf");
    try{
      // Presentation-only input (domain colour). Deliberately outside the hashed source so stored artifacts stay valid.
      const assessmentRow=await (prisma as any).assessment.findUnique({where:{id:payload.assessmentId},select:{domainCode:true,companyId:true}}).catch(()=>null);
      // Company logo: the bytes of the SNAPSHOT taken when the report was generated (never the company's current logo), checked against the hash in the source and against the owning company.
      let companyLogoPng:string|null=null;
      if(narrative?.companyLogo&&assessmentRow?.companyId){
        const asset=await companyLogos.assetBytes(assessmentRow.companyId,narrative.companyLogo.assetId).catch(()=>null);
        if(asset&&asset.sha256===narrative.companyLogo.sha256&&sha256Buffer(asset.bytes)===asset.sha256)companyLogoPng=asset.bytes.toString("base64");
      }
      await writeFile(sourcePath,JSON.stringify({...source,render:{domainCode:assessmentRow?.domainCode??null,reportDate:planStartDate(payload.generatedAt).toISOString().slice(0,10),...(companyLogoPng?{companyLogoPng}:{})}}),{encoding:"utf8",mode:0o600});
      await runPdfRenderer(sourcePath,tmpPdf);
      const buffer=await readFile(tmpPdf);assertPdfBuffer(buffer);if(buffer.length>MAX_PDF_BYTES)throw new Error("Generated PDF exceeds 50 MB safety limit");
      const contentHash=sha256Buffer(buffer);
      if(existing&&existing.sourceHash===sourceHash&&existing.generatorVersion===generatorVersionFor()&&existing.contentHash!==contentHash)throw new Error("PDF regeneration is not byte-deterministic for the same frozen report and generator version");
      const relDir=path.posix.join("pdf",safeSegment(payload.assessmentId,"assessment id"));
      const b7=readPolicyFlags().b7;
      // B7 (flag ON only): generator version + content hash are part of the identity, so a different PDF can never share a path.
      const storageKey=b7?path.posix.join(relDir,`${safeSegment(reportSnapshotId,"report snapshot id")}-${sourceHash.slice(0,16)}-${safeSegment(generatorVersionFor().replace(/[^A-Za-z0-9_-]/g,"_"),"generator version")}-${contentHash.slice(0,16)}.pdf`):path.posix.join(relDir,`${safeSegment(reportSnapshotId,"report snapshot id")}-${sourceHash.slice(0,16)}.pdf`);
      const finalPath=resolveStorageKey(storageKey);await mkdir(path.dirname(finalPath),{recursive:true,mode:0o700});
      // B7 (flag ON only): write-once. An existing file at this identity-derived path must already be byte-identical; anything else is a conflict, never an overwrite.
      if(b7){const present=await readFile(finalPath).catch(()=>null);if(present&&sha256Buffer(present)!==contentHash)throw new ApiError(409,"IMMUTABLE_ARTIFACT_CONFLICT","Энэ тайлангийн хадгалагдсан PDF өөр агуулгатай тул дарж бичихгүй.");}
      const staged=path.join(path.dirname(finalPath),`.${path.basename(finalPath)}.${randomUUID()}.tmp`);
      await writeFile(staged,buffer,{mode:0o600});await chmod(staged,0o600);await rename(staged,finalPath);
      const now=new Date();
      let row:any;
      try{
        row=await (prisma as any).reportArtifact.upsert({where:{reportSnapshotId_kind:{reportSnapshotId,kind:"PDF"}},create:{reportSnapshotId,kind:"PDF",mimeType:"application/pdf",storageKey,sourceHash,contentHash,sizeBytes:buffer.length,generatorVersion:generatorVersionFor(),verifiedAt:now},update:{storageKey,sourceHash,contentHash,sizeBytes:buffer.length,generatorVersion:generatorVersionFor(),generatedAt:now,verifiedAt:now}});
      }catch(error){await rm(finalPath,{force:true}).catch(()=>undefined);throw error;}
      // Superseded file kept for the backup window; removed later by sweepSuperseded().
      await prisma.auditEvent.create({data:{assessmentId:payload.assessmentId,eventType:"REPORT_GENERATED",entityType:"ReportArtifact",entityId:row.id,payload:{artifactOperation:existing?"REGENERATED":"GENERATED",...(b7&&existing?{previousStorageKey:existing.storageKey,previousContentHash:existing.contentHash,previousGeneratorVersion:existing.generatorVersion}:{}),staleReplaced:stale,...(stale?{previousSourceHash:existing.sourceHash,previousGeneratorVersion:existing.generatorVersion}:{}),reportSnapshotId,sourceHash,contentHash,sizeBytes:buffer.length,generatorVersion:generatorVersionFor(),storageKey}}});
      return {reportSnapshotId,storageKey,absolutePath:finalPath,filename:pdfFileName(payload),mimeType:"application/pdf",sourceHash,contentHash,sizeBytes:buffer.length,generatorVersion:generatorVersionFor(),generatedAt:row.generatedAt,verifiedAt:row.verifiedAt};
    }finally{await rm(tmp,{recursive:true,force:true}).catch(()=>undefined);}
  }


  /* ---- REP-02: recoverable publication ----
     stage():  render + verify a CANDIDATE pdf (exactly three A4 pages, valid PDF, hash) into a private staging directory. Nothing in the database or the published storage changes.
     commit(): move the verified file to its content-addressed final path (a NEW file: the previous artifact is never overwritten), then in ONE database transaction update the snapshot, the artifact row and (via `also`)
               the review status. If the transaction fails the new file is removed and the database is exactly as before. After success the superseded file is removed (an orphan is harmless and swept by sweepStaging()).
     A crash can therefore only leave (a) a staging directory / an unreferenced content-addressed file, never an inconsistent published pair. */
  async stage(reportSnapshotId:string,payload:FrozenReportPayload,narrative:NarrativeDraft):Promise<StagedPdf>{
    const root=storageRoot();const stagingRoot=path.join(root,".staging");await mkdir(stagingRoot,{recursive:true,mode:0o700});
    const dir=await mkdtemp(path.join(stagingRoot,"p-"));
    try{
      const source=buildReportPdfSource(payload,narrative);const sourceHash=reportPdfSourceHash(source);
      const assessmentRow=await (prisma as any).assessment.findUnique({where:{id:payload.assessmentId},select:{domainCode:true,companyId:true}}).catch(()=>null);
      let companyLogoPng:string|null=null;
      if(narrative?.companyLogo&&assessmentRow?.companyId){
        const asset=await companyLogos.assetBytes(assessmentRow.companyId,narrative.companyLogo.assetId).catch(()=>null);
        if(asset&&asset.sha256===narrative.companyLogo.sha256&&sha256Buffer(asset.bytes)===asset.sha256)companyLogoPng=asset.bytes.toString("base64");
      }
      const sourcePath=path.join(dir,"report-source.json"),pdfPath=path.join(dir,"report.pdf");
      await writeFile(sourcePath,JSON.stringify({...source,render:{domainCode:assessmentRow?.domainCode??null,reportDate:planStartDate(payload.generatedAt).toISOString().slice(0,10),...(companyLogoPng?{companyLogoPng}:{})}}),{encoding:"utf8",mode:0o600});
      await runPdfRenderer(sourcePath,pdfPath);
      const buffer=await readFile(pdfPath);assertPdfBuffer(buffer);if(buffer.length>MAX_PDF_BYTES)throw new Error("Generated PDF exceeds 50 MB safety limit");
      const pages=pdfPageCount(pdfPath,buffer);
      if(pages!==3)throw new Error(`PDF has ${pages} pages, expected exactly 3`);
      return {reportSnapshotId,assessmentId:payload.assessmentId,dir,pdfPath,sourceHash,contentHash:sha256Buffer(buffer),sizeBytes:buffer.length,pages,payload};
    }catch(e){await rm(dir,{recursive:true,force:true}).catch(()=>undefined);throw e;}
  }
  async discard(staged:StagedPdf){await rm(staged.dir,{recursive:true,force:true}).catch(()=>undefined);}
  async commit(staged:StagedPdf,snapshotUpdate:{narrative:unknown;narrativeHash:string;validation:unknown},also:(tx:any)=>Promise<void>):Promise<ReportPdfArtifactResult>{
    const {reportSnapshotId,payload}=staged;const relDir=path.posix.join("pdf",safeSegment(payload.assessmentId,"assessment id"));
    const storageKey=path.posix.join(relDir,`${safeSegment(reportSnapshotId,"report snapshot id")}-${staged.sourceHash.slice(0,16)}-${staged.contentHash.slice(0,16)}.pdf`);
    const finalPath=resolveStorageKey(storageKey);await mkdir(path.dirname(finalPath),{recursive:true,mode:0o700});
    const existingRow=await (prisma as any).reportArtifact.findUnique({where:{reportSnapshotId_kind:{reportSnapshotId,kind:"PDF"}}});
    const present=await readFile(finalPath).catch(()=>null);const alreadyThere=!!present&&sha256Buffer(present)===staged.contentHash;
    if(present&&!alreadyThere)throw new ApiError(409,"IMMUTABLE_ARTIFACT_CONFLICT","Энэ тайлангийн хадгалагдсан PDF өөр агуулгатай байна.");
    if(!alreadyThere){const tmpName=path.join(path.dirname(finalPath),`.${path.basename(finalPath)}.${randomUUID()}.tmp`);await writeFile(tmpName,await readFile(staged.pdfPath),{mode:0o600});await chmod(tmpName,0o600);await rename(tmpName,finalPath);}
    const now=new Date();let row:any;
    try{
      row=await prisma.$transaction(async(tx:any)=>{
        await tx.reportSnapshot.update({where:{id:reportSnapshotId},data:{narrative:snapshotUpdate.narrative as any,narrativeHash:snapshotUpdate.narrativeHash,validation:snapshotUpdate.validation as any}});
        const base={mimeType:"application/pdf",storageKey,sourceHash:staged.sourceHash,contentHash:staged.contentHash,sizeBytes:staged.sizeBytes,generatorVersion:generatorVersionFor(),generatedAt:now,verifiedAt:now};
        const r=await tx.reportArtifact.upsert({where:{reportSnapshotId_kind:{reportSnapshotId,kind:"PDF"}},create:{reportSnapshotId,kind:"PDF",...base},update:base});
        await also(tx);
        return r;
      },{maxWait:10_000,timeout:30_000});
    }catch(error){if(!alreadyThere)await rm(finalPath,{force:true}).catch(()=>undefined);await this.discard(staged);throw error;}
    // The superseded file is KEPT (aged out by sweepSuperseded): a backup that dumped the database just before this commit must still find the file its row points at.
    await this.discard(staged);
    await prisma.auditEvent.create({data:{assessmentId:payload.assessmentId,eventType:"REPORT_GENERATED",entityType:"ReportArtifact",entityId:row.id,payload:{artifactOperation:"PUBLISHED_ATOMIC",sourceHash:staged.sourceHash,contentHash:staged.contentHash,pages:staged.pages}}}).catch(()=>undefined);
    return {reportSnapshotId,storageKey,absolutePath:finalPath,filename:pdfFileName(payload),mimeType:"application/pdf",sourceHash:staged.sourceHash,contentHash:staged.contentHash,sizeBytes:staged.sizeBytes,generatorVersion:generatorVersionFor(),generatedAt:row.generatedAt,verifiedAt:row.verifiedAt??null};
  }
  /** Removes artifact files that no database row references any more AND are older than the retention window (default 7 days, so every backup taken in that window - database first, files second - stays restorable). */
  async sweepSuperseded(minAgeMs=7*86_400_000):Promise<number>{
    const {readdir}=await import("node:fs/promises");const base=path.join(storageRoot(),"pdf");let removed=0;
    const referenced=new Set<string>((await (prisma as any).reportArtifact.findMany({select:{storageKey:true}})).map((r:any)=>path.resolve(resolveStorageKey(r.storageKey))));
    const walk=async(dir:string):Promise<string[]>=>{const out:string[]=[];for(const e of await readdir(dir,{withFileTypes:true}).catch(()=>[] as any[])){const full=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(full));else if(e.name.endsWith(".pdf"))out.push(full)}return out};
    for(const f of await walk(base)){if(referenced.has(path.resolve(f)))continue;const info=await stat(f).catch(()=>null);if(info&&Date.now()-info.mtimeMs>minAgeMs){await rm(f,{force:true}).catch(()=>undefined);removed++}}
    return removed;
  }
  /** Crash recovery housekeeping: staging directories older than an hour belong to a publication that died before commit. */
  async sweepStaging(maxAgeMs=3_600_000):Promise<number>{
    const stagingRoot=path.join(storageRoot(),".staging");let n=0;
    const {readdir}=await import("node:fs/promises");const names=await readdir(stagingRoot).catch(()=>[] as string[]);
    for(const name of names){const full=path.join(stagingRoot,name);const info=await stat(full).catch(()=>null);if(info&&Date.now()-info.mtimeMs>maxAgeMs){await rm(full,{recursive:true,force:true}).catch(()=>undefined);n++}}
    return n;
  }

  openStream(result:ReportPdfArtifactResult){return createReadStream(result.absolutePath);}
}
