import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

let pass=0,fail=0;
const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` — ${detail}`:''}`);ok?pass++:fail++};
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const tsPath=path.join(root,'src/question-bank-overlay.ts');
const ts=await import(pathToFileURL(path.join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript/lib/typescript.js')).href);
const source=fs.readFileSync(tsPath,'utf8');
const js=ts.default.transpileModule(source,{compilerOptions:{target:ts.default.ScriptTarget.ES2022,module:ts.default.ModuleKind.ES2022}}).outputText;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mmri-qbank14-'));
const modulePath=path.join(temp,'question-bank-overlay.mjs');
fs.writeFileSync(modulePath,js);
const mod=await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);

const bundles=[
  ['marketing','methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json','3.0.4','3.1.4-HUMAN'],
  ['it','methodology/businessmri-v2.5-runtime-bundles/MMRI_ISMRI_Methodology_4.3.5_BUSINESSMRI_V2.json','4.3.5','BUSINESSMRI-v2.5-ISMRI-HUMAN'],
  ['finance','methodology/businessmri-v2.5-runtime-bundles/MMRI_FINMRI_Methodology_4.2.5_BUSINESSMRI_V2.json','4.2.5','BUSINESSMRI-v2.5-FINMRI-HUMAN'],
  ['people','methodology/businessmri-v2.5-runtime-bundles/MMRI_HRMRI_Methodology_4.1.5_BUSINESSMRI_V2.json','4.1.5','BUSINESSMRI-v2.5-HRMRI-HUMAN'],
  ['operations','methodology/businessmri-v2.5-runtime-bundles/MMRI_OPMRI_Methodology_4.4.5_BUSINESSMRI_V2.json','4.4.5','BUSINESSMRI-v2.5-OPMRI-HUMAN']
];

for(const [domain,rel,candidateVersion,qbankVersion] of bundles){
  const p=path.join(root,rel); const raw=fs.readFileSync(p,'utf8'); const base=JSON.parse(raw);
  const sha=createHash('sha256').update(raw).digest('hex');
  const overlay=mod.createQuestionBankOverlayTemplate(base,domain,sha,candidateVersion,qbankVersion);
  overlay.categories[0].nameMn=`${overlay.categories[0].nameMn} шинэчилсэн`;
  overlay.questions[0].textMn=`${overlay.questions[0].textMn} Шалгасан.`;
  overlay.questions[0].options[0].labelMn=`${overlay.questions[0].options[0].labelMn} Баталгаажсан.`;
  const vr=mod.validateQuestionBankOverlay(base,overlay,domain,sha,{strictMongolian:false});
  ck(`${domain}: valid overlay accepted`,vr.errors.length===0,vr.errors[0]?.code??'');
  const before=mod.structuralFingerprint(base); const candidate=mod.applyQuestionBankOverlay(base,overlay); const after=mod.structuralFingerprint(candidate);
  ck(`${domain}: protected structural fingerprint unchanged`,before===after);
  ck(`${domain}: wording fingerprint changes`,mod.wordingFingerprint(base)!==mod.wordingFingerprint(candidate));
  ck(`${domain}: all 64 categories preserved`,candidate.categories.length===64);
  ck(`${domain}: all 12288 questions preserved`,candidate.questions.length===12288);
  ck(`${domain}: option count preserved`,candidate.questions.reduce((n,q)=>n+q.optionsMn.length,0)===base.questions.reduce((n,q)=>n+q.optionsMn.length,0));
  const bq=base.questions[0],cq=candidate.questions[0];
  ck(`${domain}: question mapping preserved`,bq.questionId===cq.questionId&&bq.categoryId===cq.categoryId&&bq.cellId===cq.cellId&&bq.path===cq.path&&bq.sourceKind===cq.sourceKind);
  ck(`${domain}: explicit scoring/state preserved`,JSON.stringify(bq.explicitOptions?.map(x=>[x.optionIndex,x.score,x.state]))===JSON.stringify(cq.explicitOptions?.map(x=>[x.optionIndex,x.score,x.state])));
  ck(`${domain}: runtime policy preserved`,JSON.stringify(base.runtimePolicy)===JSON.stringify(candidate.runtimePolicy));
  ck(`${domain}: contracts preserved`,JSON.stringify(base.contracts)===JSON.stringify(candidate.contracts));
  ck(`${domain}: candidate uses new immutable versions`,candidate.methodologyVersion===candidateVersion&&candidate.questionBankVersion===qbankVersion);
  ck(`${domain}: overlay manifest source recorded`,Boolean(candidate.sourceManifest['MMRI_HUMAN_REVIEW_OVERLAY.json']));
}

// Negative tests on IT bundle.
{
  const [domain,rel,candidateVersion,qbankVersion]=bundles[1]; const p=path.join(root,rel); const raw=fs.readFileSync(p,'utf8'); const base=JSON.parse(raw); const sha=createHash('sha256').update(raw).digest('hex');
  const fresh=()=>mod.createQuestionBankOverlayTemplate(base,domain,sha,candidateVersion,qbankVersion);
  let o=fresh(); o.baseBundleSha256='0'.repeat(64); ck('reject wrong base SHA',mod.validateQuestionBankOverlay(base,o,domain,sha).errors.some(e=>e.code==='BASE_SHA'));
  o=fresh(); o.candidateMethodologyVersion=o.baseMethodologyVersion; ck('reject mutable same-version replacement',mod.validateQuestionBankOverlay(base,o,domain,sha).errors.some(e=>e.code==='IMMUTABLE_VERSION'));
  o=fresh(); o.questions.pop(); ck('reject missing question',mod.validateQuestionBankOverlay(base,o,domain,sha).errors.some(e=>e.code==='QUESTION_COUNT'||e.code==='QUESTION_MISSING'));
  o=fresh(); o.questions[1].questionId=o.questions[0].questionId; ck('reject duplicate question ID',mod.validateQuestionBankOverlay(base,o,domain,sha).errors.some(e=>e.code==='QUESTION_DUPLICATE'));
  o=fresh(); o.questions[0].options.pop(); ck('reject option-count change',mod.validateQuestionBankOverlay(base,o,domain,sha).errors.some(e=>e.code==='OPTION_COUNT'));
  o=fresh(); o.questions[0].options[0].optionIndex=2; ck('reject option reordering',mod.validateQuestionBankOverlay(base,o,domain,sha).errors.some(e=>e.code==='OPTION_INDEX'));
  o=fresh(); o.questions[0].textMn+=' — test'; ck('reject em dash',mod.validateQuestionBankOverlay(base,o,domain,sha).errors.some(e=>e.code==='QUESTION_EM_DASH'));
  o=fresh(); o.questions[0].textMn='TODO'; ck('reject placeholder question',mod.validateQuestionBankOverlay(base,o,domain,sha).errors.some(e=>e.code==='QUESTION_PLACEHOLDER'));
  o=fresh(); o.questions[0].textMn+=' EnglishWord'; ck('strict Mongolian rejects Latin token',mod.validateQuestionBankOverlay(base,o,domain,sha,{strictMongolian:true}).errors.some(e=>e.code==='QUESTION_LATIN'));
  o=fresh(); o.categories[0].categoryId='UNKNOWN-CATEGORY'; ck('reject unknown/missing category',mod.validateQuestionBankOverlay(base,o,domain,sha).errors.some(e=>e.code==='CATEGORY_UNKNOWN'||e.code==='CATEGORY_MISSING'));
}

console.log(`\nSTEP14 QBANK REGRESSION: ${pass}/${pass+fail} PASS`);
if(fail) process.exit(1);
