import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const backend = process.cwd();
const packageRoot = path.resolve(backend, '../..');
const bundlePath = path.resolve(backend, 'methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json');
const canonicalPath = path.resolve(packageRoot, 'MMRI_QUESTION_BANK_v3.1.0_FROZEN_CANONICAL_REFERENCE.json');
const freezeManifestPath = path.resolve(backend, 'methodology/MMRI_QBANK_v3.1.0_FREEZE_MANIFEST.json');
const targetSourcePath = path.resolve(backend, 'src/methodology-target.ts');
const routerPath = path.resolve(backend, 'src/engine/routing.ts');
const engineServicePath = path.resolve(backend, 'src/services/prisma-assessment-engine.ts');
const importerPath = path.resolve(backend, 'src/import-methodology.ts');
const pkgPath = path.resolve(backend, 'package.json');
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const stable = obj => JSON.stringify(obj, Object.keys(obj).sort());
const checks=[];
function check(name, ok, detail=null){checks.push({name,status:ok?'PASS':'FAIL',detail});}

const bundleRaw=fs.readFileSync(bundlePath);
const bundle=JSON.parse(bundleRaw);
const canonical=JSON.parse(fs.readFileSync(canonicalPath,'utf8'));
const freeze=JSON.parse(fs.readFileSync(freezeManifestPath,'utf8'));
const targetSource=fs.readFileSync(targetSourcePath,'utf8');
const routerSource=fs.readFileSync(routerPath,'utf8');
const engineServiceSource=fs.readFileSync(engineServicePath,'utf8');
const importerSource=fs.readFileSync(importerPath,'utf8');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));

check('methodology_version_3_0_0', bundle.methodologyVersion==='3.0.0', bundle.methodologyVersion);
check('qbank_version_3_1_0', bundle.questionBankVersion==='3.1.0', bundle.questionBankVersion);
check('freeze_manifest_pass', freeze.status==='FROZEN_BASELINE' && freeze.validationStatus==='PASS', `${freeze.status}/${freeze.validationStatus}`);
check('category_count', bundle.categories.length===64, bundle.categories.length);
check('dimension_count', bundle.cellTemplates.length===48, bundle.cellTemplates.length);
check('cell_count', bundle.cellInstances.length===3072, bundle.cellInstances.length);
check('question_count', bundle.questions.length===12288, bundle.questions.length);
check('question_id_unique', new Set(bundle.questions.map(q=>q.questionId)).size===12288);
check('runtime_q_policy_count', bundle.runtimePolicy.questionPolicies.length===12288, bundle.runtimePolicy.questionPolicies.length);
check('runtime_cell_policy_count', bundle.runtimePolicy.cellPolicies.length===3072, bundle.runtimePolicy.cellPolicies.length);
check('target_bundle_sha_bound', targetSource.includes(sha256(bundleRaw)), sha256(bundleRaw));
check('target_qbank_version_bound', targetSource.includes('"3.1.0"'));
check('target_frozen_question_hash_bound', targetSource.includes(freeze.questionArrayStableSha256), freeze.questionArrayStableSha256);
check('package_import_targets_frozen', pkg.scripts['db:import']?.includes('QBANK_v3.1.0_RUNTIME_INTEGRATED_STEP01'));
check('package_verify_targets_frozen', pkg.scripts['db:verify']?.includes('QBANK_v3.1.0_RUNTIME_INTEGRATED_STEP01'));
check('package_validate_targets_frozen', pkg.scripts['validate:bundle']?.includes('QBANK_v3.1.0_RUNTIME_INTEGRATED_STEP01'));
check('importer_rejects_wrong_qbank', importerSource.includes('Refusing wrong question bank'));
check('importer_rejects_wrong_bundle_sha', importerSource.includes('Refusing target bundle SHA mismatch'));
check('new_assessment_hash_guard', engineServiceSource.includes('not bound to frozen Question Bank'));
check('routing_excludes_context_from_maturity_coverage', routerSource.includes('cellHasScoreEligibleQuestion') && routerSource.includes('!maturityScoredCell'));

const cq=new Map(canonical.questions.map(q=>[q.questionId,q]));
let mappingErrors=0, contentErrors=0, optionErrors=0, sourceErrors=0;
for(const rq of bundle.questions){
  const c=cq.get(rq.canonicalQuestionId);
  if(!c){mappingErrors++; continue;}
  if(c.legacyIds?.questionId !== rq.questionId) mappingErrors++;
  if(c.questionMn !== rq.textMn) contentErrors++;
  if(c.sourceKind !== rq.sourceKind || Number(c.variant)!==Number(rq.path)) sourceErrors++;
  const ro=rq.explicitOptions ?? [];
  if(c.options.length!==ro.length){optionErrors++; continue;}
  for(let i=0;i<c.options.length;i++){
    const a=c.options[i], b=ro[i];
    if(a.labelMn!==b.labelMn || a.state!==b.state || (a.score??null)!==(b.score??null)){optionErrors++;break;}
  }
}
check('canonical_runtime_id_mapping_12288', mappingErrors===0, mappingErrors);
check('canonical_runtime_question_text_match', contentErrors===0, contentErrors);
check('canonical_runtime_source_path_match', sourceErrors===0, sourceErrors);
check('canonical_runtime_option_state_score_match', optionErrors===0, optionErrors);

const qp=bundle.runtimePolicy.questionPolicies;
const cp=bundle.runtimePolicy.cellPolicies;
const infer=qp.filter(p=>p.routingState==='INFER_ONLY' || p.directAskAllowed===false);
check('infer_only_exact_132', infer.length===132, infer.length);
check('infer_only_only_d45', infer.every(p=>/-D45-Q[1-4]$/.test(p.questionId)));
const d42q=qp.filter(p=>/-D42-Q[1-4]$/.test(p.questionId));
check('d42_context_questions_256', d42q.length===256, d42q.length);
check('d42_direct_but_non_scoring', d42q.every(p=>p.directAskAllowed===true && p.scoreEligible===false && p.routingState==='DIRECT_ALLOWED'));
const d42c=cp.filter(p=>p.cellExternalId.endsWith(':C42'));
check('d42_cell_direct_limits_aligned', d42c.length===64 && d42c.every(p=>p.directAskableQuestions===4 && p.maxDirectQuestions===4), d42c.length);
const d44q4=qp.filter(p=>/-D44-Q4$/.test(p.questionId));
check('d44_q4_context_questions_64', d44q4.length===64, d44q4.length);
check('d44_q4_direct_non_scoring', d44q4.every(p=>p.directAskAllowed===true && p.scoreEligible===false));
const d44c=cp.filter(p=>p.cellExternalId.endsWith(':C44'));
check('d44_cell_direct_limits_aligned', d44c.length===64 && d44c.every(p=>p.directAskableQuestions===4 && p.maxDirectQuestions===4), d44c.length);
const direct=qp.filter(p=>p.directAskAllowed===true && p.routingState!=='INFER_ONLY');
check('direct_allowed_exact_12156', direct.length===12156, direct.length);

const qpolicyIds=new Set(qp.map(p=>p.questionId));
check('all_runtime_policies_reference_questions', qpolicyIds.size===12288 && bundle.questions.every(q=>qpolicyIds.has(q.questionId)));
const cellIds=new Set(bundle.cellInstances.map(c=>c.cellInstanceId));
check('all_cell_policies_reference_cells', cp.length===3072 && cp.every(p=>cellIds.has(p.cellExternalId)));

const failures=checks.filter(c=>c.status==='FAIL');
const report={status:failures.length?'FAIL':'PASS',checksPassed:checks.length-failures.length,checksTotal:checks.length,failures,checks,bundleSha256:sha256(bundleRaw),frozenQuestionArraySha256:freeze.questionArrayStableSha256};
console.log(JSON.stringify(report,null,2));
fs.writeFileSync(path.resolve(packageRoot,'STEP01_QBANK_ENGINE_INTEGRATION_STATIC_VALIDATION.json'),JSON.stringify(report,null,2)+'\n');
if(failures.length) process.exit(1);
