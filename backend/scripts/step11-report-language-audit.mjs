import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.cwd(),'..');
const bundle=JSON.parse(fs.readFileSync(path.join(process.cwd(),'methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json'),'utf8'));
const customerKeys=new Set(['titleMn','objectiveMn','actionMn','deliverableMn','kpiMn','ownerRoleMn','sponsorRoleMn','descriptionMn','conclusionMn','instructionMn','nameMn','labelMn','textMn','summaryMn','resultMn','measureMn','action','title','objective','deliverable','kpi','owner','measure','expectedResult']);
const hits=[];
function walk(x,p=''){
  if(Array.isArray(x)){x.forEach((v,i)=>walk(v,`${p}/${i}`));return;}
  if(!x||typeof x!=='object')return;
  for(const [k,v] of Object.entries(x)){
    const np=`${p}/${k}`;
    if(typeof v==='string'&&customerKeys.has(k)&&/[A-Za-z]/.test(v)) hits.push({path:np,text:v}); else walk(v,np);
  }
}
walk(bundle);
const unique=[...new Set(hits.map(x=>x.text))];
const report={schema:'mmri.step11.report_language.audit.v1',status:hits.length?'WARN_PREEXISTING_REPORT_LANGUAGE':'PASS',hitCount:hits.length,uniqueTextCount:unique.length,scope:'Marketing report/action-plan contract customer-facing text fields; question/answer/category language already passes Step 9.',examples:hits.slice(0,40)};
fs.writeFileSync(path.join(root,'STEP11_REPORT_LANGUAGE_AUDIT.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,hitCount:report.hitCount,uniqueTextCount:report.uniqueTextCount,examples:report.examples.slice(0,8)},null,2));
