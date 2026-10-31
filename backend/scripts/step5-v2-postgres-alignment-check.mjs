import fs from 'node:fs';
import crypto from 'node:crypto';

const checks=[];
const pass=(name,detail)=>checks.push({name,status:'PASS',detail});
const assert=(ok,name,detail)=>{if(!ok){console.error(JSON.stringify({status:'FAIL',name,detail},null,2));process.exit(1)};pass(name,detail)};
const txt=p=>fs.readFileSync(p,'utf8');
const json=p=>JSON.parse(txt(p));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const bundlePath='methodology/MMRI_v2.0.0_RECOVERY_CANDIDATE.json';
const manifestPath='methodology/MMRI_Methodology_v2.0.0_VERSION_MANIFEST.json';
const bundle=json(bundlePath), manifest=json(manifestPath), pkg=json('package.json');
assert(bundle.methodologyVersion==='2.0.0','bundle_methodology_version',bundle.methodologyVersion);
assert(bundle.validation?.status==='PASS','bundle_validation_status',bundle.validation?.status);
assert(sha(bundlePath)===manifest.bundleFileSha256,'bundle_sha_matches_step3_manifest',sha(bundlePath));
assert(bundle.questions.length===12288,'question_count',bundle.questions.length);
assert(new Set(bundle.questions.map(q=>q.questionId)).size===12288,'unique_question_ids',12288);
assert(bundle.categories.length===64 && bundle.cellTemplates.length===48 && bundle.cellInstances.length===3072,'matrix_shape','64 x 48 = 3072');
assert(bundle.questions.reduce((n,q)=>n+q.secondaryTargets.length,0)===42240,'secondary_target_rows',42240);
assert(bundle.runtimePolicy?.questionPolicies?.length===12288 && bundle.runtimePolicy?.cellPolicies?.length===3072,'runtime_policy_counts','12288 / 3072');

for(const key of ['db:import','db:verify','validate:bundle']) assert(pkg.scripts[key]?.includes('v2.0.0')||pkg.scripts[key]?.includes('2.0.0'),`package_${key}_targets_v2`,pkg.scripts[key]);
assert(pkg.scripts['db:verify']?.includes('verify-methodology-import.ts'),'bundle_derived_verifier_is_default',pkg.scripts['db:verify']);

const target=txt('src/methodology-target.ts');
assert(target.includes('"2.0.0"') && target.includes('MMRI_v2.0.0_RECOVERY_CANDIDATE.json'),'target_constants_v2','version + bundle');
const importer=txt('src/import-methodology.ts');
for(const token of ['MMRI_EXPECT_METHODOLOGY_VERSION','MMRI_IMPORT_TARGET_ONLY','MMRI_INTEGRATION_ACTIVATE_CANDIDATE','MMRI_INTEGRATION_RESET_OK','MMRI_ENVIRONMENT','NODE_ENV']) assert(importer.includes(token),`import_guard_${token}`,token);
assert(importer.includes('bundle.methodologyVersion?.trim()'),'import_prefers_declared_semver','methodologyVersion field');

const gate=txt('src/integration/postgres-gate.ts');
assert(gate.includes('TARGET_METHODOLOGY_VERSION')&&gate.includes('TARGET_METHODOLOGY_BUNDLE'),'runtime_gate_uses_target_constants','v2 target indirection');
assert(!/"1\.0\.1"|"1\.1\.0"/.test(gate),'runtime_gate_no_v1_hardcode','none');

const disposable=txt('scripts/run-postgres-gate.sh');
assert(disposable.includes('MMRI_ENVIRONMENT=integration')||disposable.includes('MMRI_ENVIRONMENT:-') ,'disposable_gate_integration_guard','present');
assert(disposable.includes('MMRI_INTEGRATION_ACTIVATE_CANDIDATE=YES'),'disposable_gate_activation_explicit','YES only inside disposable gate');
assert(disposable.includes('MMRI_v2.0.0_RECOVERY_CANDIDATE.json'),'disposable_gate_v2_bundle','present');

const connected=txt('scripts/step11-connected-release-gate.sh');
assert(connected.includes('MMRI_v2.0.0_RECOVERY_CANDIDATE.json'),'connected_gate_v2_bundle','present');
assert(connected.includes('MMRI_EXPECT_METHODOLOGY_STATUS=VALIDATING'),'connected_gate_preserves_candidate_status','VALIDATING');
assert(!connected.includes('MMRI_INTEGRATION_ACTIVATE_CANDIDATE=YES'),'connected_gate_does_not_activate_candidate','safe');

const verifier=txt('src/verify-methodology-import.ts');
assert(verifier.includes('bundle.questions.reduce((n,q)=>n+q.secondaryTargets.length,0)'),'verifier_derives_secondary_target_count','bundle-derived');
assert(verifier.includes('sha256Text(raw)'),'verifier_checks_frozen_bundle_sha','present');
assert(verifier.includes('importRun.findFirst'),'verifier_requires_pass_import_run','present');

const env=txt('.env.example');
assert(env.includes('MMRI_TARGET_METHODOLOGY_VERSION="2.0.0"'),'env_target_v2','present');
assert(env.includes('MMRI_INTEGRATION_ACTIVATE_CANDIDATE="NO"'),'env_activation_safe_default','NO');

const result={status:'PASS',version:'MMRI-STEP5-POSTGRES-ALIGNMENT-2.0.0',checks,summary:{checkCount:checks.length,bundleSha256:sha(bundlePath),secondaryTargets:42240,productionActivation:'NOT_PERFORMED',disposableIntegrationActivation:'GUARDED'}};
fs.writeFileSync('methodology/MMRI_STEP5_OF_7_POSTGRES_ALIGNMENT_STATIC.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
