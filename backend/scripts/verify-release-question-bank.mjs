// Independent source-bank census; does not modify bundles or connect to a database.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const files=[
 'methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json',
 ...['HRMRI:4.1.7','FINMRI:4.2.7','ISMRI:4.3.7','OPMRI:4.4.7'].map(x=>{const [code,version]=x.split(':');return `methodology/businessmri-v2.6-runtime-bundles/MMRI_${code}_Methodology_${version}_BUSINESSMRI_V2.json`})
];
const domains=[];const failures=[];let total=0;
for(const file of files){
 const bytes=fs.readFileSync(path.join(root,file));const bank=JSON.parse(bytes.toString());
 const domain=bank.domainCode||'marketing';const ids=new Set();const cells=new Map();const optionCounts={};const states={};
 const categoryIds=new Set(bank.categories.map(c=>c.ID));
 for(const cell of bank.cellInstances){const key=`${cell.categoryId}:${cell.cellId}`;if(cells.has(key))failures.push(`${domain}: duplicate cell ${key}`);cells.set(key,0)}
 for(const q of bank.questions){
  if(!q.questionId||ids.has(q.questionId))failures.push(`${domain}: duplicate or empty question id`);ids.add(q.questionId);
  const key=`${q.categoryId}:${q.cellId}`;
  if(!categoryIds.has(q.categoryId)||!cells.has(key))failures.push(`${domain}: invalid cell/category reference ${q.questionId}`);
  cells.set(key,(cells.get(key)||0)+1);
  if(!q.textMn?.trim()||!Array.isArray(q.optionsMn)||q.optionsMn.length<2||q.optionsMn.some(x=>typeof x!=='string'||!x.trim()))failures.push(`${domain}: malformed question/options ${q.questionId}`);
  optionCounts[q.optionsMn.length]=(optionCounts[q.optionsMn.length]||0)+1;
  if(q.explicitOptions){
   if(q.explicitOptions.length!==q.optionsMn.length)failures.push(`${domain}: explicit option count mismatch ${q.questionId}`);
   q.explicitOptions.forEach((option,index)=>{
    if(option.optionIndex!==index+1||option.labelMn!==q.optionsMn[index]||(option.score!==null&&(!Number.isFinite(option.score)||option.score<0||option.score>100)))failures.push(`${domain}: invalid explicit option ${q.questionId}`);
    states[option.state]=(states[option.state]||0)+1;
   });
  }
 }
 if(categoryIds.size!==64||cells.size!==3072||ids.size!==12288||[...cells.values()].some(n=>n!==4))failures.push(`${domain}: expected 64 capabilities, 3072 cells, 12288 questions, four per cell`);
 if(bank.runtimePolicy?.questionPolicies){
  const policies=bank.runtimePolicy.questionPolicies;
  if(policies.length!==ids.size||new Set(policies.map(p=>p.questionId)).size!==ids.size||policies.some(p=>!ids.has(p.questionId)))failures.push(`${domain}: runtime policy coverage mismatch`);
 }
 total+=ids.size;domains.push({domain,file,sha256:createHash('sha256').update(bytes).digest('hex'),capabilities:categoryIds.size,cells:cells.size,questions:ids.size,optionCounts,states});
}
if(new Set(domains.map(d=>d.domain)).size!==5||total!==61440)failures.push('Expected five domains and 61,440 questions');
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',totalQuestions:total,domains,failures},null,2));
if(failures.length)process.exitCode=1;
