/* Per-methodology-version / per-domain coverage of answer shapes and colour roles over the question-bank export.
   node qa/answer-domain-coverage.mjs <options2.tsv>   (tsv: questionId, externalId, methodologyVersion, optionIndex, state, score, label) */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(path.resolve('frontend/package.json'));const {build}=require('esbuild');const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cv-'));
const load=async(src,n)=>{await build({entryPoints:[src],bundle:true,format:'esm',outfile:`${tmp}/${n}.mjs`,logLevel:'error'});return import(`${tmp}/${n}.mjs`)};
const N=await load('frontend/src/data/answerTone.ts','new');
const q=new Map();for(const l of fs.readFileSync(process.argv[2],'utf8').split('\n')){if(!l)continue;const [id,ext,mv,idx,state,score,label]=l.split('\t');if(!q.has(id))q.set(id,{ext,mv,o:[]});q.get(id).o.push({optionIndex:+idx,state,score:score===''?null:+score,labelMn:label})}
const dom=ext=>({MMRI:'marketing',ISMRI:'it',FMRI:'finance',FIMRI:'finance',HRMRI:'people',OPMRI:'operations',OMRI:'operations'})[ext.split('-')[0]]||ext.split('-')[0];
const rows={};let greyOld=0,greyNew=0;
for(const [,{ext,mv,o}] of q){const key=`${dom(ext)} v${mv}`;const L=N.buildAnswerLayout(o);const g=L.main.filter(x=>x.quality!==null);
 const shape=g.length===0?'no-colour':L.main.some(x=>x.role==='affirmative')?'affirmative-gate(green)':`${g.length}-graded`;(rows[key]??={})[shape]=(rows[key][shape]||0)+1;
 if(L.main.every(x=>x.quality===null||x.role==='affirmative'))greyOld++ // before the repair the affirmative gate answer rendered neutral gray
 if(L.main.every(x=>x.quality===null))greyNew++}
for(const k of Object.keys(rows).sort())console.log(k.padEnd(22),JSON.stringify(rows[k]));
console.log(`questions whose every main answer is grey: before-repair=${greyOld} after=${greyNew} of ${q.size}`);
process.exit(greyNew?1:0);
