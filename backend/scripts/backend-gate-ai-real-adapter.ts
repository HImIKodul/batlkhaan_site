// Live gate: stored frozen payload -> MMRI provider factory (env) -> OpenAI Responses -> MMRI validator -> PDF source -> PDF.
// Non-persisting: nothing is written to ReportSnapshot. Requires network + OPENAI_API_KEY in backend/.env (never printed).
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "../src/db.js";
import { createNarrativeProviderFromEnv } from "../src/api/ai-report-provider.js";
import { generateValidatedNarrative } from "../src/report/index.js";
import { buildReportPdfSource } from "../src/report/pdf-artifact.js";
import { sha256Json } from "../src/lib/hash.js";

const provider=createNarrativeProviderFromEnv("development") as any;
if(!provider)throw new Error("AI provider not configured");
const out:any[]=[];let failed=0;
const check=(name:string,ok:boolean,d="")=>{if(!ok)failed++;console.log(`${ok?"PASS":"FAIL"} ${name}${d?` — ${d}`:""}`);};
check("MMRI_AI_REPORT_PROVIDER=openai selects OpenAI Responses adapter",provider.metadata.provider==="OPENAI_RESPONSES"&&provider.constructor.name==="OpenAiNarrativeProvider");
check("MMRI_AI_REPORT_MODEL consumed by adapter",provider.metadata.modelIdentifier===process.env.MMRI_AI_REPORT_MODEL&&provider.options.model===process.env.MMRI_AI_REPORT_MODEL,provider.metadata.modelIdentifier);
check("configured Responses endpoint used",provider.endpoint===(process.env.MMRI_AI_REPORT_ENDPOINT??"https://api.openai.com/v1/responses"),provider.endpoint);
const sel=process.argv[2];
const rows:any[]=await (prisma as any).reportSnapshot.findMany({where:{publishedAt:{not:null},...(sel?{assessmentId:{endsWith:sel}}:{})},orderBy:{publishedAt:"asc"}});
const results=await Promise.all(rows.map(async r=>{
  const before=sha256Json(r.payload);const t=Date.now();
  const res=await generateValidatedNarrative(r.payload,provider);
  return {r,res,ms:Date.now()-t,before};
}));
for(const {r,res,ms,before} of results){
  const tag=r.assessmentId.slice(-6),p=r.payload,n=res.narrative;
  check(`[${tag}] OPENAI PROVIDER USED, FALLBACK NOT USED`,res.state==="PASS"&&res.providerError===null&&res.providerHttpAttempts>=1&&res.providerMetadata.provider==="OPENAI_RESPONSES"&&res.providerRequestIds.length>=1,`state=${res.state} http=${res.providerHttpAttempts} retries=${res.providerRetryCount} requestIds=${res.providerRequestIds.length} ${ms}ms`);
  check(`[${tag}] deterministic payload untouched`,sha256Json(r.payload)===before&&n.payloadHash===p.payloadHash&&res.validation.state==="PASS");
  const text=n.sections.flatMap((s:any)=>s.claims.map((c:any)=>c.textMn)).join("\n");
  const ids=n.sections.map((s:any)=>s.id);
  check(`[${tag}] required sections present & populated`,["S01","S02","S03","S04","S05","S06","S08","S09","S10"].filter(id=>!(id==="S08"&&!p.roadmap.some((x:any)=>x.milestones.length))&&!(id==="S09"&&!p.risks.length&&!p.requiredWarnings.length)).every(id=>n.sections.find((s:any)=>s.id===id)?.claims.length>0),ids.join(","));
  check(`[${tag}] strengths/weaknesses/priorities preserved in order`,
    p.strengths.slice(0,5).every((s:any,i:number)=>n.sections.find((x:any)=>x.id==="S04")?.claims[i]?.textMn.includes(s.nameMn))&&
    p.weaknesses.slice(0,5).every((s:any,i:number)=>n.sections.find((x:any)=>x.id==="S05")?.claims[i]?.textMn.includes(s.nameMn))&&
    p.priorityActions.slice(0,5).every((a:any,i:number)=>n.sections.find((x:any)=>x.id==="S06")?.claims[i]?.recommendationId===a.id&&n.sections.find((x:any)=>x.id==="S06")?.claims[i]?.textMn.includes(a.titleMn)));
  const cyr=(text.match(/[Ѐ-ӿ]/g)||[]).length,lat=(text.match(/[A-Za-z]/g)||[]).length;
  check(`[${tag}] valid Mongolian, no placeholders/corruption`,cyr>500&&lat/(cyr+lat)<0.02&&!/�|undefined|\bnull\b|TODO|lorem|\{\{|\[object/i.test(text),`cyr=${cyr} latin=${lat}`);
  const concl=n.sections.find((s:any)=>s.id==="S10").claims[0].textMn;const w=concl.trim().split(/\s+/).length;
  check(`[${tag}] executive conclusion 80–160 words`,w>=80&&w<=160,String(w));
  // PDF compatibility with the AI narrative (rendered to a temp dir, not stored).
  const dir=mkdtempSync(path.join(os.tmpdir(),"mmri-ai-pdf-"));
  try{
    const src=buildReportPdfSource(p,n);writeFileSync(path.join(dir,"s.json"),JSON.stringify({...src,render:{domainCode:"marketing"}}));
    execFileSync("python3",["pdf_renderer/render_report_pdf.py","--input",path.join(dir,"s.json"),"--output",path.join(dir,"o.pdf")]);
    const pages=Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo",[path.join(dir,"o.pdf")]).toString())?.[1]);
    check(`[${tag}] AI narrative renders to exactly 3 pages with unchanged facts`,pages===3&&src.overallScore===p.overall.score&&src.strengths.length===Math.min(5,p.strengths.length)&&src.criticalActions.length===Math.min(5,p.priorityActions.length)&&src.roadmap.length===p.roadmap.length,`pages=${pages}`);
  }finally{rmSync(dir,{recursive:true,force:true});}
  out.push({report:tag,state:res.state,provider:res.providerMetadata.provider,model:res.providerMetadata.modelIdentifier,http:res.providerHttpAttempts,ms});
}
await prisma.$disconnect();
console.log(JSON.stringify({status:failed?"FAIL":"PASS",failed,results:out}));
process.exit(failed?1:0);
