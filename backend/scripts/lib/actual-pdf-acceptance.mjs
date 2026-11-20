import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const ensure=(ok,message)=>{if(!ok)throw new Error(message)};
function output(cmd,args){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'businessmri-pdf-check-')),file=path.join(dir,'output');const fd=fs.openSync(file,'w',0o600);
 try{const r=spawnSync(cmd,args,{stdio:['ignore',fd,'inherit'],timeout:20000});ensure(!r.error&&r.status===0,`PDF inspection tool ${cmd} failed or is unavailable`);return fs.readFileSync(file,'utf8')}finally{fs.closeSync(fd);fs.rmSync(dir,{recursive:true,force:true})}
}
export function inspectActualPdf(file,expectedScore){
 const info=output('pdfinfo',[file]);ensure(/^Pages:\s+3\s*$/m.test(info),'Actual PDF must contain exactly three pages');
 ensure(/^Author:\s+BusinessMRI\.mn\s*$/m.test(info),'Actual PDF author is not BusinessMRI.mn');
 const text=output('pdftotext',[file,'-']);const pages=text.split('\f').filter(t=>t.trim());ensure(pages.length===3,'PDF text extraction must contain three pages');
 ensure(pages.every(p=>p.includes('BusinessMRI.mn')),'Every PDF page must contain BusinessMRI.mn');
 const badge=text.match(/(\d{1,3})\s+НИЙТ\s+ҮНЭЛГЭЭ/u);ensure(badge,'Actual PDF overall score badge missing');
 const value=Number(expectedScore),floor=Math.floor(value);const rounded=value-floor===.5?(floor%2?floor+1:floor):Math.round(value);
 ensure(Number.isFinite(value)&&Number(badge[1])===rounded,'Actual PDF overall score differs from frozen results');
 return {pages:3,overallScore:Number(badge[1]),brandedPages:3,author:'BusinessMRI.mn'};
}
export async function downloadAndVerifyApiPdf({base,assessmentId,token,score,domain,out}){
 const url=new URL(base);ensure(['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.port!=='4000','PDF acceptance requires an isolated loopback API');
 const response=await fetch(`${base}/assessments/${encodeURIComponent(assessmentId)}/report/pdf`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000)});
 ensure(response.ok&&response.headers.get('content-type')?.includes('application/pdf'),'API did not return a PDF');
 const data=Buffer.from(await response.arrayBuffer());ensure(data.subarray(0,5).toString()==='%PDF-','API PDF signature missing');
 const sha256=createHash('sha256').update(data).digest('hex');ensure(response.headers.get('x-mmri-pdf-content-hash')===sha256,'PDF byte hash differs from API integrity header');
 ensure(/^[a-f0-9]{64}$/.test(response.headers.get('x-mmri-pdf-source-hash')||''),'PDF source hash missing');
 ensure((response.headers.get('content-disposition')||'').includes('BusinessMRI.mn-'),'PDF filename is not branded');
 fs.mkdirSync(out,{recursive:true,mode:0o700});const file=path.join(out,domain+'.pdf');fs.writeFileSync(file,data,{mode:0o600});
 const verified=inspectActualPdf(file,score);const result={status:'PASS',domain,assessmentId,sha256,sourceHash:response.headers.get('x-mmri-pdf-source-hash'),...verified};fs.writeFileSync(path.join(out,domain+'-verification.json'),JSON.stringify(result,null,2)+'\n');return result;
}
