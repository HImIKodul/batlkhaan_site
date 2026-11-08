import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const backend = process.cwd();
const bundleRel = 'methodology/MMRI_v3.0.0_QBANK_v3.1.0_SCORING_STEP04.json';
const step1Rel = 'methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json';
const bundlePath = path.resolve(backend, bundleRel);
const step1Path = path.resolve(backend, step1Rel);
const bundleRaw = fs.readFileSync(bundlePath,'utf8');
const bundle = JSON.parse(bundleRaw);
const step1 = JSON.parse(fs.readFileSync(step1Path,'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.resolve(backend,'package.json'),'utf8'));
const target = fs.readFileSync(path.resolve(backend,'src/methodology-target.ts'),'utf8');
const routing = fs.readFileSync(path.resolve(backend,'src/engine/routing.ts'),'utf8');
const scoring = fs.readFileSync(path.resolve(backend,'src/engine/scoring.ts'),'utf8');
const cellState = fs.readFileSync(path.resolve(backend,'src/engine/adaptive-cell-state.ts'),'utf8');
const startLocal = fs.readFileSync(path.resolve(backend,'../START_LOCAL.sh'),'utf8');
const envExample = fs.readFileSync(path.resolve(backend,'.env.example'),'utf8');
const postgresGate = fs.readFileSync(path.resolve(backend,'scripts/run-postgres-gate.sh'),'utf8');
const connectedGate = fs.readFileSync(path.resolve(backend,'scripts/step11-connected-release-gate.sh'),'utf8');
const sha = crypto.createHash('sha256').update(bundleRaw).digest('hex');
const expectedSha = '67cd3b2b0ad1e2f510a13c721fd332b587b105c196cd614a9dfb6991e295b1d3';
const frozenArraySha = '264186715faffcbcc1cfe63529907c4b70c9eb0cdf06e1771fb57f9210ec3a26';

const checks=[];
function check(name, pass, detail='') { checks.push({name,pass:Boolean(pass),detail}); }
check('bundle_exists', fs.existsSync(bundlePath), bundleRel);
check('bundle_sha_exact', sha===expectedSha, sha);
check('methodology_version', bundle.methodologyVersion==='3.0.0', bundle.methodologyVersion);
check('question_bank_version', bundle.questionBankVersion==='3.1.0', bundle.questionBankVersion);
check('question_count_12288', bundle.questions.length===12288, bundle.questions.length);
check('cell_count_3072', bundle.cellInstances.length===3072, bundle.cellInstances.length);
check('frozen_question_content_unchanged_from_step1', JSON.stringify(bundle.questions)===JSON.stringify(step1.questions));
check('frozen_question_array_hash_metadata', bundle.integrationMetadata?.frozenQuestionArraySha256===frozenArraySha, bundle.integrationMetadata?.frozenQuestionArraySha256);
check('integration_step_at_least_2', Number(String(bundle.integrationMetadata?.step ?? '0').split('/')[0])>=2, bundle.integrationMetadata?.step);

const qpol=bundle.runtimePolicy.questionPolicies;
const cpol=bundle.runtimePolicy.cellPolicies;
const inferQ=qpol.filter(x=>x.routingState==='INFER_ONLY');
const directInfer=inferQ.filter(x=>x.directAskAllowed);
const d45InferCells=cpol.filter(x=>x.stableCellId.endsWith('-D45') && x.applicabilityMode==='INFER_ONLY');
const d45InferBad=d45InferCells.filter(x=>x.directAskableQuestions!==0 || x.maxDirectQuestions!==0);
const d42q=qpol.filter(x=>/-D42-Q[1-4]$/.test(x.questionId));
const d44q4=qpol.filter(x=>/-D44-Q4$/.test(x.questionId));
const d42cells=cpol.filter(x=>x.stableCellId.endsWith('-D42'));
const d44cells=cpol.filter(x=>x.stableCellId.endsWith('-D44'));
check('infer_only_questions_132', inferQ.length===132, inferQ.length);
check('infer_only_never_direct', directInfer.length===0, directInfer.length);
check('d45_infer_only_cells_33', d45InferCells.length===33, d45InferCells.length);
check('d45_infer_cells_direct_limits_zero', d45InferBad.length===0, d45InferBad.length);
check('d42_context_questions_256', d42q.length===256, d42q.length);
check('d42_all_non_scoring_direct', d42q.every(x=>x.scoreEligible===false && x.directAskAllowed===true));
check('d42_cell_paths_available', d42cells.length===64 && d42cells.every(x=>x.maxDirectQuestions===4 && x.directAskableQuestions===4));
check('d44_q4_context_64', d44q4.length===64, d44q4.length);
check('d44_q4_direct_non_scoring', d44q4.every(x=>x.scoreEligible===false && x.directAskAllowed===true));
check('d44_cell_paths_available', d44cells.length===64 && d44cells.every(x=>x.maxDirectQuestions===4 && x.directAskableQuestions===4));

check('mode_split_present', routing.includes('input.mode === "FULL"') && routing.includes('routeAdaptiveV13Quick') && routing.includes('routeAdaptiveV13Full'));
check('quick_reference_target_logic_present', routing.includes('ADAPTIVE_V3_REFERENCE_TARGET'));
check('full_no_arbitrary_cap_comment_and_logic', routing.includes('FULL has no arbitrary question cap') && routing.includes('FULL_COMPLETE'));
check('one_outstanding_question_guard', routing.includes('AWAITING_CURRENT_QUESTION'));
check('same_question_repeat_guard', routing.includes('input.askedQuestionIds.has(questionPolicy.questionId)'));
check('context_only_quick_full_split', routing.includes('if (contextOnly)') && routing.includes('input.mode === "QUICK"'));
check('low_authority_repair_present', routing.includes('lowAuthorityRepair'));
check('dynamic_routing_screen_safety', routing.includes('maximumRoutingScreenAnswers'));
check('scope_terminal_states_present', ['NO_APPLICABLE_SCOPE','FULL_EVIDENCE_INCOMPLETE'].every(x=>routing.includes(x)));
check('d01_not_applicable_state_alignment', cellState.includes('routingNotApplicable') && cellState.includes('NOT_APPLICABLE'));
check('context_only_excluded_from_maturity_denominator', scoring.includes('isMaturityScoredCell') && scoring.includes('filter(c => c.id !== "C01" && isMaturityScoredCell'));

check('target_file_updated', target.includes(bundleRel));
check('target_sha_updated', target.includes(expectedSha));
for (const script of ['db:import','db:verify','validate:bundle']) check(`package_${script}_updated`, pkg.scripts[script]?.includes('SCORING_STEP04'));
check('start_local_target_updated', startLocal.includes(bundleRel));
check('env_example_target_updated', envExample.includes(bundleRel));
check('postgres_gate_target_updated', postgresGate.includes(bundleRel));
check('connected_gate_target_updated', connectedGate.includes(bundleRel));
check('step2_verify_scripts_registered', Boolean(pkg.scripts['step2:adaptive-routing:verify']));

const failures=checks.filter(x=>!x.pass);
const report={
  schema:'mmri.step02_of15.adaptive_routing.static.v1',
  status:failures.length?'FAIL':'PASS',
  checksPassed:checks.length-failures.length,
  checksTotal:checks.length,
  failures,
  bundleSha256:sha,
  frozenQuestionArraySha256:frozenArraySha,
  counts:{questions:bundle.questions.length,cells:bundle.cellInstances.length,inferOnlyQuestions:inferQ.length,d45InferOnlyCells:d45InferCells.length,d42ContextQuestions:d42q.length,d44Q4ContextQuestions:d44q4.length},
  checks
};
fs.writeFileSync(path.resolve(backend,'../STEP02_ADAPTIVE_ROUTING_STATIC_VALIDATION.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(failures.length) process.exit(1);
