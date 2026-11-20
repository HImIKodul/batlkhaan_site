import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, chmod, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { prisma } from "../db.js";
import { buildReportPdfSource, reportPdfSourceHash, assertPdfBuffer, sha256Buffer, MMRI_PDF_GENERATOR_VERSION, generatorVersionFor } from "../report/pdf-artifact.js";
import { readPolicyFlags } from "../engine/policy-flags.js";
import { ApiError } from "../api/errors.js";
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
    return this.renderAndStore(reportSnapshotId,payload,sourceHash,source,existing??null,stale);
  }

  private async verifyExisting(row:any,payload:FrozenReportPayload):Promise<ReportPdfArtifactResult>{
    const absolutePath=resolveStorageKey(row.storageKey);await access(absolutePath);const info=await stat(absolutePath);
    if(!info.isFile()||info.size!==row.sizeBytes||info.size<=0||info.size>MAX_PDF_BYTES)throw new Error("Stored PDF artifact size mismatch");
    const buffer=await readFile(absolutePath);assertPdfBuffer(buffer);const contentHash=sha256Buffer(buffer);if(contentHash!==row.contentHash)throw new Error("Stored PDF artifact hash mismatch");
    const verifiedAt=new Date();await (prisma as any).reportArtifact.update({where:{id:row.id},data:{verifiedAt}}).catch(()=>undefined);
    return {reportSnapshotId:row.reportSnapshotId,storageKey:row.storageKey,absolutePath,filename:pdfFileName(payload),mimeType:"application/pdf",sourceHash:row.sourceHash,contentHash:row.contentHash,sizeBytes:row.sizeBytes,generatorVersion:row.generatorVersion,generatedAt:row.generatedAt,verifiedAt};
  }


  private async renderAndStore(reportSnapshotId:string,payload:FrozenReportPayload,sourceHash:string,source:any,existing:any,stale=false):Promise<ReportPdfArtifactResult>{
    const root=storageRoot();await mkdir(root,{recursive:true,mode:0o700});
    const tmp=await mkdtemp(path.join(root,".pdf-"));
    const sourcePath=path.join(tmp,"report-source.json"),tmpPdf=path.join(tmp,"report.pdf");
    try{
      // Presentation-only input (domain colour). Deliberately outside the hashed source so stored artifacts stay valid.
      const assessmentRow=await (prisma as any).assessment.findUnique({where:{id:payload.assessmentId},select:{domainCode:true}}).catch(()=>null);
      await writeFile(sourcePath,JSON.stringify({...source,render:{domainCode:assessmentRow?.domainCode??null}}),{encoding:"utf8",mode:0o600});
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
      if(!b7)if(existing&&existing.storageKey!==storageKey)await rm(resolveStorageKey(existing.storageKey),{force:true}).catch(()=>undefined);
      await prisma.auditEvent.create({data:{assessmentId:payload.assessmentId,eventType:"REPORT_GENERATED",entityType:"ReportArtifact",entityId:row.id,payload:{artifactOperation:existing?"REGENERATED":"GENERATED",...(b7&&existing?{previousStorageKey:existing.storageKey,previousContentHash:existing.contentHash,previousGeneratorVersion:existing.generatorVersion}:{}),staleReplaced:stale,...(stale?{previousSourceHash:existing.sourceHash,previousGeneratorVersion:existing.generatorVersion}:{}),reportSnapshotId,sourceHash,contentHash,sizeBytes:buffer.length,generatorVersion:generatorVersionFor(),storageKey}}});
      return {reportSnapshotId,storageKey,absolutePath:finalPath,filename:pdfFileName(payload),mimeType:"application/pdf",sourceHash,contentHash,sizeBytes:buffer.length,generatorVersion:generatorVersionFor(),generatedAt:row.generatedAt,verifiedAt:row.verifiedAt};
    }finally{await rm(tmp,{recursive:true,force:true}).catch(()=>undefined);}
  }

  openStream(result:ReportPdfArtifactResult){return createReadStream(result.absolutePath);}
}
