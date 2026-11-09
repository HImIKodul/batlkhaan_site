import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const bundleRel='methodology/MMRI_v3.0.0_QBANK_v3.1.0_SCORING_STEP04.json';
const prevRel='methodology/MMRI_v3.0.0_QBANK_v3.1.0_CONFIDENCE_STEP03.json';
const bundleRaw=fs.readFileSync(path.resolve(root,bundleRel),'utf8');
const bundle=JSON.parse(bundleRaw);
const prev=JSON.parse(fs.readFileSync(path.resolve(root,prevRel),'utf8'));
const scoring=fs.readFileSync(path.resolve(root,'src/engine/scoring.ts'),'utf8');
const cellState=fs.readFileSync(path.resolve(root,'src/engine/adaptive-cell-state.ts'),'utf8');
const target=fs.readFileSync(path.resolve(root,'src/methodology-target.ts'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.resolve(root,'package.json'),'utf8'));
const startLocal=fs.readFileSync(path.resolve(root,'../START_LOCAL.sh'),'utf8');
const checks=[];
const check=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
const sha=crypto.createHash('sha256').update(bundleRaw).digest('hex');
const frozenArraySha='264186715faffcbcc1cfe63529907c4b70c9eb0cdf06e1771fb57f9210ec3a26';

check('bundle_exists',fs.existsSync(path.resolve(root,bundleRel)),bundleRel);
check('bundle_sha_targeted',target.includes(sha),sha);
check('methodology_version',bundle.methodologyVersion==='3.0.0',bundle.methodologyVersion);
check('qbank_version',bundle.questionBankVersion==='3.1.0',bundle.questionBankVersion);
check('integration_step_4',bundle.integrationMetadata?.step==='4/15',bundle.integrationMetadata?.step);
check('frozen_question_array_sha',bundle.integrationMetadata?.frozenQuestionArraySha256===frozenArraySha,bundle.integrationMetadata?.frozenQuestionArraySha256);
check('frozen_question_records_unchanged',JSON.stringify(bundle.questions)===JSON.stringify(prev.questions));
check('question_count',bundle.questions.length===12288,bundle.questions.length);
check('cell_instances',bundle.cellInstances.length===3072,bundle.cellInstances.length);

const sc=bundle.contracts['MMRI_FINAL_Scoring_Contract.json'];
check('scoring_contract_step04',sc.version==='MMRI-SCORING-STEP04-OF15-RUNTIME-ALIGNED',sc.version);
check('scale_0_100',Number(sc.scale?.min)===0&&Number(sc.scale?.max)===100,JSON.stringify(sc.scale));
check('internal_precision_4',Number(sc.scale?.internalPrecisionDecimals)===4,sc.scale?.internalPrecisionDecimals);
check('display_precision_1',Number(sc.scale?.displayDecimals)===1,sc.scale?.displayDecimals);
check('direct_value_arithmetic_mean',String(sc.cell?.directValue).includes('arithmetic_mean'),String(sc.cell?.directValue));
check('cluster_resolution_rule',String(sc.cell?.conflictResolvedValue).includes('Q3-verified'),String(sc.cell?.conflictResolvedValue));
check('median_detection_only',String(sc.cell?.clusterCenterForConflictDetection).includes('never as the ordinary maturity score'),String(sc.cell?.clusterCenterForConflictDetection));
check('unresolved_not_zero',sc.category?.unresolvedIsZero===false,String(sc.category?.unresolvedIsZero));
check('context_excluded_denominator',String(sc.category?.contextOnlyWeightTreatment).includes('exclude'),String(sc.category?.contextOnlyWeightTreatment));
check('infer_only_included_maturity',String(sc.category?.inferOnlyScoreTreatment).includes('remain in the maturity denominator'),String(sc.category?.inferOnlyScoreTreatment));

const moduleNames=[...new Set(bundle.categories.map(c=>c.Module))];
const moduleWeights=new Map(moduleNames.map(name=>[name,Number(bundle.categories.find(c=>c.Module===name)['Module weight %'])]));
const moduleTotal=[...moduleWeights.values()].reduce((a,b)=>a+b,0);
const categoryTotal=bundle.categories.reduce((a,c)=>a+Number(c['Category weight %']),0);
const structuralCellTotal=bundle.cellTemplates.filter(c=>c.ID!=='C01').reduce((a,c)=>a+Number(c['Weight %']),0);
const maturityTemplateTotal=bundle.cellTemplates.filter(c=>!['C01','C42'].includes(c.ID)).reduce((a,c)=>a+Number(c['Weight %']),0);
check('modules_8',moduleNames.length===8,moduleNames.length);
check('categories_64',bundle.categories.length===64,bundle.categories.length);
check('cells_48',bundle.cellTemplates.length===48,bundle.cellTemplates.length);
check('module_weights_100',Math.abs(moduleTotal-100)<1e-9,moduleTotal);
check('category_weights_100',Math.abs(categoryTotal-100)<1e-9,categoryTotal);
check('structural_cell_weights_100',Math.abs(structuralCellTotal-100)<1e-9,structuralCellTotal);
check('maturity_weight_excluding_d42_97_5',Math.abs(maturityTemplateTotal-97.5)<1e-9,maturityTemplateTotal);
check('expected_module_weights',JSON.stringify([...moduleWeights.values()])===JSON.stringify([20,15,10,10,15,15,5,10]),JSON.stringify([...moduleWeights.values()]));
const purposeContract=bundle.contracts['MMRI_FINAL_Five_Purpose_Mapping.json'];
check('five_purposes',purposeContract.purposes?.length===5,purposeContract.purposes?.length);
let badPurposeRelevance=0;
for(const row of purposeContract.mapping??[]){for(const v of Object.values(row.relevance??{})){const n=Number(v);if(!Number.isFinite(n)||n<0||n>1)badPurposeRelevance++;}}
check('purpose_relevance_in_0_1',badPurposeRelevance===0,badPurposeRelevance);
for(const purpose of purposeContract.purposes??[]){
  const positive=(purposeContract.mapping??[]).filter(row=>Number(row.relevance?.[purpose.id]??0)>0).length;
  check(`purpose_${purpose.id}_has_positive_categories`,positive>0,positive);
}
for(const name of moduleNames){
  const actual=bundle.categories.filter(c=>c.Module===name).reduce((a,c)=>a+Number(c['Category weight %']),0);
  check(`module_category_weights_${name}`,Math.abs(actual-moduleWeights.get(name))<1e-9,`${actual}/${moduleWeights.get(name)}`);
}

const qpolicy=new Map(bundle.runtimePolicy.questionPolicies.map(x=>[x.questionId,x]));
const cpolicy=bundle.runtimePolicy.cellPolicies;
const profile=sc.profiles;
let profileMismatch=0, badNumeric=0, badNullState=0, directContextNumeric=0, scoreEligibleNoNumeric=0;
for(const q of bundle.questions){
  const p=qpolicy.get(q.questionId);
  const actual=q.explicitOptions.map(o=>o.score);
  const states=q.explicitOptions.map(o=>o.state);
  const expected=profile[q.scoringProfileCode]?.map(o=>o.score);
  const expectedStates=profile[q.scoringProfileCode]?.map(o=>o.state);
  if(!expected || JSON.stringify(actual)!==JSON.stringify(expected) || JSON.stringify(states)!==JSON.stringify(expectedStates)) profileMismatch++;
  for(const o of q.explicitOptions){
    if(o.score!==null && (!Number.isFinite(Number(o.score)) || Number(o.score)<0 || Number(o.score)>100)) badNumeric++;
    if(['DNK','N_A_CLAIM','UNAVAILABLE','TREND_DECLINING','TREND_STABLE','TREND_IMPROVING','BENCHMARK_FAR_BELOW','BENCHMARK_SLIGHTLY_BELOW','BENCHMARK_NEAR','BENCHMARK_SLIGHTLY_ABOVE','BENCHMARK_FAR_ABOVE'].includes(o.state) && o.score!==null) badNullState++;
  }
  const numeric=actual.filter(x=>x!==null).length;
  if(p.directAskAllowed && !p.scoreEligible && numeric>0) directContextNumeric++;
  if(p.scoreEligible && numeric===0) scoreEligibleNoNumeric++;
}
check('question_profile_score_state_vectors_match_contract',profileMismatch===0,profileMismatch);
check('numeric_scores_in_range',badNumeric===0,badNumeric);
check('non_scoring_states_are_null',badNullState===0,badNullState);
check('direct_context_has_no_numeric_score',directContextNumeric===0,directContextNumeric);
check('score_eligible_has_numeric_score',scoreEligibleNoNumeric===0,scoreEligibleNoNumeric);

const d41=bundle.questions.filter(q=>q.cellId==='C41');
const d42=bundle.questions.filter(q=>q.cellId==='C42');
const d44q4=bundle.questions.filter(q=>q.cellId==='C44'&&q.path===4);
const d45Infer=cpolicy.filter(x=>x.cellExternalId.endsWith(':C45')&&x.applicabilityMode==='INFER_ONLY');
check('d41_count_256',d41.length===256,d41.length);
check('d41_q1_q3_hard_endpoints',d41.filter(q=>[1,3].includes(q.path)).every(q=>q.scoringProfileCode==='AT-TARGET6-HARD-ENDPOINTS'));
check('d41_q2_observed_pct',d41.filter(q=>q.path===2).every(q=>q.scoringProfileCode==='AT-PCT6-OBSERVED'));
check('d41_q4_frequency',d41.filter(q=>q.path===4).every(q=>q.scoringProfileCode==='AT-RESULT-FREQ5'));
check('d42_context_256',d42.length===256,d42.length);
check('d42_all_scores_null',d42.every(q=>q.explicitOptions.every(o=>o.score===null)));
check('d42_runtime_non_scoring',d42.every(q=>qpolicy.get(q.questionId)?.scoreEligible===false));
check('d44_q4_context_64',d44q4.length===64,d44q4.length);
check('d44_q4_all_scores_null',d44q4.every(q=>q.explicitOptions.every(o=>o.score===null)));
check('d44_q4_runtime_non_scoring',d44q4.every(q=>qpolicy.get(q.questionId)?.scoreEligible===false));
check('d45_infer_only_cells_33',d45Infer.length===33,d45Infer.length);
check('d45_infer_only_direct_disabled',d45Infer.every(c=>c.directAskableQuestions===0&&c.maxDirectQuestions===0));
check('d45_infer_only_questions_keep_numeric_semantics',d45Infer.every(c=>{
  const [categoryId,cellId]=c.cellExternalId.split(':');
  return bundle.questions.filter(q=>q.categoryId===categoryId&&q.cellId===cellId).some(q=>q.explicitOptions.some(o=>o.score!==null));
}));

check('runtime_uses_arithmetic_mean_score',cellState.includes('const directScore = scoreOut(arithmeticMean('));
check('runtime_median_is_cluster_center_only',cellState.includes('const clusterCenter = median(values)')&&cellState.includes('Math.abs((item.score as number) - clusterCenter)'));
check('runtime_verified_cluster_score',cellState.includes('const scoreEvidence = localConflictResolved ? clusterEvidence : scored'));
check('runtime_cell_score_clamp_round',cellState.includes('function scoreOut(value: number)'));
check('aggregation_membership_uses_numeric_semantics',scoring.includes('question.options.some(option => option.score !== null)'));
check('aggregation_does_not_use_runtime_scoreeligible_for_membership',!scoring.includes('runtime.questionById.get(question.id)?.scoreEligible'));
check('aggregate_score_clamp_round',scoring.includes('function scoreOut(value: number | null)'));
check('aggregate_unit_clamp_round',scoring.includes('function unitOut(value: number | null)'));
check('contribution_full_precision',scoring.includes('partialContributionToModule = row.state.partialScore * row.state.effectiveModuleWeightPct / 100'));

check('target_bundle_current',target.includes(bundleRel),bundleRel);
check('target_hash_current',target.includes(sha),sha);
check('start_local_current',startLocal.includes(bundleRel),String(startLocal.includes(bundleRel)));
for(const k of ['db:import','db:verify','validate:bundle']) check(`package_${k}_current`,pkg.scripts[k]?.includes('SCORING_STEP04'),pkg.scripts[k]);
check('package_step4_verify_registered',Boolean(pkg.scripts['step4:scoring:verify']),pkg.scripts['step4:scoring:verify']);

const failures=checks.filter(x=>!x.pass);
const report={schema:'mmri.step04_of15.scoring.static.v1',status:failures.length?'FAIL':'PASS',checksPassed:checks.length-failures.length,checksTotal:checks.length,bundleSha256:sha,frozenQuestionArraySha256:frozenArraySha,counts:{questions:bundle.questions.length,cells:bundle.cellInstances.length,d45InferOnlyCells:d45Infer.length,d42ContextQuestions:d42.length,d44Q4ContextQuestions:d44q4.length},failures,checks};
fs.writeFileSync(path.resolve(root,'../STEP04_SCORING_STATIC_VALIDATION.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checksPassed:report.checksPassed,checksTotal:report.checksTotal,bundleSha256:sha,failures},null,2));
if(failures.length)process.exit(1);
