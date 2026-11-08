/* WS-E MMRI-30 / MMRI-13 (PDF side): the PDF roadmap must list every milestone with its own period, description, deliverable and measure
   (no merging across horizons), stay exactly 3 A4 pages, and show approved explanations. Runs the real Python renderer on PDF sources built
   by the real TypeScript source builder from a real report (needs the API for the report JSON).
   Usage: API=http://127.0.0.1:4115 RENDERER=<path to render_report_pdf.py, default backend/pdf_renderer> ASSESSMENT=<id> node scripts/qa-wse-pdf-roadmap-regression.mjs */
import {execFileSync,spawnSync} from 'child_process';import fs from 'fs';import os from 'os';import path from 'path';
const API=process.env.API||'http://127.0.0.1:4115',B=API+'/api/v1',ORIGIN=`http://127.0.0.1:${Number(new URL(API).port)+100}`;
const H='/home/kirby/Downloads/MMRI_FUNCTIONAL_REPAIR/harness';const kv=f=>Object.fromEntries(fs.readFileSync(f,'utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const qa=kv(H+'/creds-qa.local');const RENDERER=process.env.RENDERER||new URL('../pdf_renderer/render_report_pdf.py',import.meta.url).pathname;const aid=process.env.ASSESSMENT;
let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wse30-'));
const tok=(await (await fetch(B+'/auth/login',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({email:qa.email,password:qa.password})})).json()).data.accessToken;
const rep=await (await fetch(`${B}/assessments/${aid}/report`,{headers:{origin:ORIGIN,authorization:'Bearer '+tok}})).json();fs.writeFileSync(path.join(tmp,'rep.json'),JSON.stringify(rep));
execFileSync('npx',['tsx','scripts/qa-wse-dump-pdf-source.mts',path.join(tmp,'rep.json'),path.join(tmp,'src.json'),'it'],{cwd:new URL('..',import.meta.url).pathname,stdio:'pipe'});
const norm=t=>t.replace(/\s+/g,' ').replace(/\s*[—―]\s*/g,' - ');
function render(src,name,extra=[]){const i=path.join(tmp,name+'.json'),o=path.join(tmp,name+'.pdf');fs.writeFileSync(i,JSON.stringify(src));const r=spawnSync('python3',[RENDERER,'--input',i,'--output',o,...extra],{encoding:'utf8'});if(r.status!==0)return {status:r.status,err:(r.stderr||'').trim()};
 const pages=+(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo',[o],{encoding:'utf8'}))?.[1]||0);return {pages,text:norm(execFileSync('pdftotext',[o,'-'],{encoding:'utf8'}))}}
const src=JSON.parse(fs.readFileSync(path.join(tmp,'src.json'),'utf8'));
// (a) the real report: every milestone's period, deliverable and measure are present, repeated milestones are not merged
const ms=src.roadmap.flatMap(h=>h.milestones.map(m=>({h,m})));
let r=render(src,'real');rec('R30-00 real report renders as exactly 3 pages',r.pages===3,r.err||`pages=${r.pages}`);
const periods=[...new Set(ms.map(x=>`${x.h.dayStart}-${x.h.dayEnd} өдөр`))];
rec('R30-01 every horizon period of the plan is printed',periods.every(p=>r.text?.includes(p)),periods.filter(p=>!r.text?.includes(p)).join(';'));
const descMissing=ms.filter(({m})=>!r.text?.includes(norm(m.milestoneMn).slice(0,40)));
rec('R30-02 every milestone description is printed',descMissing.length===0,`${descMissing.length} missing`);
// same recommendation in two horizons: both occurrences must appear (the old table printed the last one only)
const byRec={};for(const x of ms)(byRec[x.m.recommendationId]??=[]).push(x);
const multi=Object.values(byRec).filter(v=>v.length>1);
const occ=(t,s)=>t.split(s).length-1;
rec('R30-03 a recommendation spanning several horizons keeps each horizon\'s own milestone line',multi.length>0&&multi.every(v=>occ(r.text||'',norm(v[0].m.milestoneMn).slice(0,40))>=v.length),`multi=${multi.length}`);
// (b) a 22-milestone plan with unique markers: complete, ordered, 3 pages
const big=JSON.parse(JSON.stringify(src));const pool=ms.map(x=>x.m);for(const h of big.roadmap)h.milestones=[];
for(let i=0;i<22;i++){const m=JSON.parse(JSON.stringify(pool[i%pool.length]));m.milestoneId='M'+i;m.deliverableMn=`${m.deliverableMn} ГАРЦ${String(i).padStart(2,'0')}`;m.kpiMn=`${m.kpiMn} ХЭМЖ${String(i).padStart(2,'0')}`;big.roadmap[Math.floor(i*5/22)].milestones.push(m)}
r=render(big,'big');rec('R30-04 a 22-milestone plan renders as exactly 3 pages',r.pages===3,r.err||`pages=${r.pages}`);
const marks=Array.from({length:22},(_,i)=>[`ГАРЦ${String(i).padStart(2,'0')}`,`ХЭМЖ${String(i).padStart(2,'0')}`]).flat();
rec('R30-05 all 22 deliverables and measures are printed',marks.every(k=>r.text?.includes(k)),marks.filter(k=>!r.text?.includes(k)).join(','));
const pos=Array.from({length:22},(_,i)=>r.text?.indexOf(`ГАРЦ${String(i).padStart(2,'0')}`)??-1);
const groups={};pos.forEach((p,i)=>{(groups[pool[i%pool.length].recommendationId]??=[]).push(p)});
rec('R30-06 milestones appear in plan order within each recommendation (chronology kept)',pos.every(p=>p>=0)&&Object.values(groups).every(g=>g.every((p,i)=>i===0||p>g[i-1])));
// (c) approved explanations on pages 1-2 do not break the page contract
const exp=JSON.parse(JSON.stringify(big));for(const k of ['strengths','weaknesses'])for(const it of exp[k])it.explanationMn='ЯЛАГДСАН-ТАЙЛБАР '+k+' Хянагчийн нэмэлт тайлбар: энэ дүгнэлтийг тухайн салбарын нөхцөлд тулгуурлан ойлгоно уу.';
for(const a of exp.criticalActions)a.explanationMn='ЯЛАГДСАН-ТАЙЛБАР action Хянагчийн засвар: эхний алхмыг хариуцагч нэг хүнд оноож, гүйцэтгэлийг сар бүр хянана.';
r=render(exp,'exp');rec('R30-07 approved explanations (10 findings + 5 actions) and a 22-milestone plan still render as exactly 3 pages',r.pages===3,r.err||`pages=${r.pages}`);
rec('R30-08 all 15 approved explanations are printed in full',occ(r.text||'','ЯЛАГДСАН-ТАЙЛБАР')===15,`found ${occ(r.text||'','ЯЛАГДСАН-ТАЙЛБАР')}`);
// (d) the review service allows 4000 characters per claim: the worst permitted content must never make the customer PDF fail
const worst=JSON.parse(JSON.stringify(big));const long='ЯЛАГДСАН-ТАЙЛБАР '+'Хянагчийн нэмэлт тайлбар, энэ дүгнэлтийг тухайн салбарын нөхцөлд тулгуурлан ойлгоно уу. '.repeat(45);
for(const k of ['strengths','weaknesses'])for(const it of worst[k])it.explanationMn=long;for(const a of worst.criticalActions)a.explanationMn=long;
r=render(worst,'worst');rec('R30-09 worst permitted content (15 x ~4000 chars + 22 milestones) still yields exactly 3 pages in the customer renderer (never a hard failure)',r.pages===3,r.err||`pages=${r.pages}`);
r=render(worst,'worst-strict',['--strict']);rec('R30-10 the approval-time strict check reports it as not fitting (exit 3) instead of truncating',r.status===3,`status=${r.status}`);
r=render(exp,'exp-strict',['--strict']);rec('R30-11 realistic approved explanations pass the strict check with all text printed',r.pages===3&&occ(r.text,'ЯЛАГДСАН-ТАЙЛБАР')===15,r.err||`pages=${r.pages}`);
console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
