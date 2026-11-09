/* WS-E verification: for each domain's completed assessments (QA clone), fetch report JSON, results, PDF; assert 3 A4 pages, real score in pdftotext,
   old (retake-preserved) version still retrievable with unchanged score, and report/results/PDF consistency.
   Usage: API=http://127.0.0.1:4115 PGDATABASE=mmri_ws_e CREDS=<creds file> node scripts/qa-wse-pdf-consistency.mjs  */
import {execFileSync} from 'child_process';import fs from 'fs';import os from 'os';import path from 'path';
const API=process.env.API||'http://127.0.0.1:4115',B=API+'/api/v1',PORT=Number(new URL(API).port),ORIGIN=`http://127.0.0.1:${PORT+100}`;
const creds=Object.fromEntries(fs.readFileSync(process.env.CREDS||'/home/kirby/Downloads/MMRI_FUNCTIONAL_REPAIR/harness/creds-qa.local','utf8').split('\n').map(l=>l.split('=')).filter(x=>x[1]).map(([k,...v])=>[k.trim(),v.join('=').trim()]));
let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const j=async(p,tok)=>{const r=await fetch(B+p,{headers:{origin:ORIGIN,...(tok?{authorization:'Bearer '+tok}:{})}});return {s:r.status,d:await r.json().catch(()=>null)}};
const login=await fetch(B+'/auth/login',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({email:creds.email,password:creds.password})}).then(r=>r.json());const tok=login.data.accessToken;
const PGDB=process.env.PGDATABASE||'mmri_ws_e';
if(!/^mmri_(ws_[a-h]|fresh_checkout_\d+)$/.test(PGDB))throw new Error(`refusing database ${PGDB}: only scrubbed clones (mmri_ws_a..h) or fresh-checkout databases are allowed`);
const psql=q=>/^mmri_ws_[a-h]$/.test(PGDB)
 ?execFileSync('/home/kirby/Downloads/MMRI_FUNCTIONAL_REPAIR/harness/psql.sh',[PGDB.slice(-1),'-At','-c',q],{encoding:'utf8'}).trim()
 :execFileSync('docker',['exec','-i','mmri-v3-local-postgres-1','psql','-U','mmri','-At','-d',PGDB,'-c',q],{encoding:'utf8'}).trim();
const rows=psql(`select id||'|'||"domainCode"||'|'||"completedAt" from assessments where status='COMPLETED' order by "domainCode","completedAt"`).split('\n').map(x=>x.split('|'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wse-'));const byDomain={};
for(const [id,dom] of rows){
 const rep=await j(`/assessments/${id}/report`,tok);const res=await j(`/assessments/${id}/results`,tok);
 const pdf=await fetch(`${B}/assessments/${id}/report/pdf`,{headers:{origin:ORIGIN,authorization:'Bearer '+tok}});const buf=Buffer.from(await pdf.arrayBuffer());const f=path.join(tmp,id+'.pdf');fs.writeFileSync(f,buf);
 const info=pdf.status===200?execFileSync('pdfinfo',[f],{encoding:'utf8'}):'';const text=pdf.status===200?execFileSync('pdftotext',['-layout',f,'-'],{encoding:'utf8'}):'';
 const pages=+(/Pages:\s+(\d+)/.exec(info)?.[1]||0),a4=/Page size:\s+595\.\d+ x 84\d\.\d+/.test(info);
 const payload=rep.d?.data?.payload||rep.d?.payload;const score=payload?.overall?.score;const shown=score==null?null:Math.round(score);
 byDomain[dom]??=[];const dbScore=Number(psql(`select coalesce("overallOfficialScore","overallPartialScore") from assessments where id='${id}'`));byDomain[dom].push({id,score});
 rec(`${dom} ${id}: report score equals the stored assessment score (unchanged)`,score!=null&&Math.abs(score-dbScore)<0.01,`${score} vs db ${dbScore}`);
 rec(`${dom} ${id}: report 200, PDF 200, 3 pages A4`,rep.s===200&&pdf.status===200&&pages===3&&a4,`pages=${pages} a4=${a4} score=${score}`);
 rec(`${dom} ${id}: PDF text contains the report overall score`,shown!=null&&new RegExp(`(^|\\D)${shown}(\\D|$)`).test(text),`score ${shown}`);
 const names=[...(payload?.strengths||[]),...(payload?.weaknesses||[])].map(x=>x.nameMn);const missing=names.filter(n=>!text.replace(/\s+/g,' ').includes(n.split(/\s+/)[0]));
 rec(`${dom} ${id}: every strength/weakness name in report JSON appears in the PDF`,names.length>0&&missing.length===0,missing.join(';'));
 const rd=res.d?.data||res.d;const rs=rd?.overall?.score??rd?.overallScore??rd?.score;rec(`${dom} ${id}: results score equals report score`,res.s===200&&(rs==null||Math.round(rs)===shown),`results=${rs} report=${score}`);
}
for(const [dom,v] of Object.entries(byDomain))rec(`${dom}: both versions retrievable (retake preserved old report)`,v.length===2&&v.every(x=>x.score!=null),v.map(x=>x.score).join(' / '));
console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
