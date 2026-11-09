import fs from 'node:fs';
import {buildDefinition,calculateRuntimeSnapshot,evidenceFromAnswer} from '../dist-engine/engine/index.js';
const b=JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.0_FINAL_CANDIDATE.json','utf8')); const d=buildDefinition(b);
const checks=[]; const check=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
function ev(q,opt){return evidenceFromAnswer({definition:d,question:q,optionIndex:opt,explicitAuthority:.9});}
function qs(cat,cell){return [1,2,3,4].map(p=>d.questionByCategoryCellPath.get(`${cat}:${cell}:${p}`));}
// find C31 instance whose questions expose N/A
let c31cat=null;
for(const c of d.categories){const arr=qs(c.id,'C31'); if(arr[0]?.options.some(o=>o.state==='N_A_CLAIM')){c31cat=c.id;break;}}
const c31=qs(c31cat,'C31'); const naEv=c31.slice(0,3).map(q=>ev(q,q.options.find(o=>o.state==='N_A_CLAIM').optionIndex));
let snap=calculateRuntimeSnapshot(d,naEv); let st=snap.cells.get(`${c31cat}:C31`);
check('C31 three N/A claims confirm N/A',st?.status==='NOT_APPLICABLE',st?.status);
check('C31 N/A has no score',st?.effectiveScore===null,String(st?.effectiveScore));
// N/A plus scored conflict should not confirm N/A
const scoredQ=c31[3], scoredOpt=scoredQ.options.find(o=>o.state==='SCORED'&&o.score!==null);
snap=calculateRuntimeSnapshot(d,[...naEv,ev(scoredQ,scoredOpt.optionIndex)]); st=snap.cells.get(`${c31cat}:C31`);
check('N/A plus scored conflict reopens review',st?.status!=='NOT_APPLICABLE',st?.status);
check('N/A plus scored conflict is flagged',Boolean(st?.hasHardContradiction||st?.status==='REVIEW_REQUIRED'||snap.contradictions.some(x=>x.categoryId===c31cat&&x.affectedCellIds?.includes('C31'))),JSON.stringify({status:st?.status,hard:st?.hasHardContradiction}));
// Four DNKs: unresolved, no fabricated score
const q16=qs('MS01','C16'); const dnkEv=q16.map(q=>ev(q,q.options.find(o=>o.state==='DNK').optionIndex)); snap=calculateRuntimeSnapshot(d,dnkEv); st=snap.cells.get('MS01:C16');
check('four DNK unresolved',st?.status==='UNRESOLVED',st?.status); check('four DNK no score',st?.effectiveScore===null,String(st?.effectiveScore)); check('four DNK no direct confidence',st?.directConfidence===0,String(st?.directConfidence));
// coherent three scored direct answers: final
const coherent=q16.slice(0,3).map(q=>{const s=q.options.filter(o=>o.state==='SCORED'&&o.score!==null); return ev(q,s[Math.floor(s.length/2)].optionIndex);}); snap=calculateRuntimeSnapshot(d,coherent); st=snap.cells.get('MS01:C16');
check('three coherent direct answers can finalize',st?.status==='DIRECT_FINAL',JSON.stringify({status:st?.status,conf:st?.directConfidence,count:st?.directAnswerCount})); check('direct final confidence >=0.80',(st?.directConfidence??0)>=.80,String(st?.directConfidence));
// hard contradiction caps confidence and blocks finalization
const c2=qs('MS01','C02'); const lo=c2[0].options.find(o=>o.state==='SCORED'&&o.score===0); const hi=c2[1].options.find(o=>o.state==='SCORED'&&o.score===100); snap=calculateRuntimeSnapshot(d,[ev(c2[0],lo.optionIndex),ev(c2[1],hi.optionIndex)]); st=snap.cells.get('MS01:C02');
check('hard contradiction detected',Boolean(st?.hasHardContradiction),JSON.stringify({status:st?.status,hard:st?.hasHardContradiction})); check('hard contradiction confidence capped <=0.65',(st?.directConfidence??1)<=.6500001,String(st?.directConfidence)); check('hard contradiction not direct final',st?.status!=='DIRECT_FINAL',st?.status);
const out={suite:'MMRI v3 N/A, DNK and contradiction validation',status:checks.every(x=>x.pass)?'PASS':'FAIL',totalChecks:checks.length,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length,c31Category:c31cat,checks}; fs.writeFileSync('methodology/STEP2_NA_DNK_CONTRADICTION_VALIDATION.json',JSON.stringify(out,null,2)+'\n'); console.log(JSON.stringify(out,null,2)); if(out.failed)process.exit(1);
