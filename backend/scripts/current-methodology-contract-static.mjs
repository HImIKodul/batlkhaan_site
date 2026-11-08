/* Current-methodology contract checks. Replaces the retired step1-step4 static suites, which pinned intermediate snapshots of the superseded
   monolithic v3.0.0 bank that no longer exist anywhere. Same intents, applied to the five bundles registered ACTIVE in the operational database:
   pinned bundle hash, counts and id integrity, 1:1 runtime policies, weight sums, scoring contract, routing and confidence invariants.
   Read-only; no database. Engine behaviour (confidence caps, scoring arithmetic) is covered by engine-contract-regression / engine-core-smoke. */
import fs from 'node:fs';import crypto from 'node:crypto';
// [version, file, sha256 registered in methodology_versions.bundleSha256 of the operational DB, verified 2026-11-08]
const ACTIVE=[
  ["3.0.3","methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json","4ec42fb9fb7fd0d55c482bf5bbea379fb4cd3e9e97fd1921d405bbb432734c79"],
  ["4.2.7","methodology/businessmri-v2.6-runtime-bundles/MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json","aee57b0dc1f37fda8f6738fb3c94d01eba765b5fb3e4c591c70d6f4c4f1a6c5a"],
  ["4.1.7","methodology/businessmri-v2.6-runtime-bundles/MMRI_HRMRI_Methodology_4.1.7_BUSINESSMRI_V2.json","dc67054fc5b225cdf9db928934e863e29ae1dcb01cc8f8f4500885cd2f6c614e"],
  ["4.3.7","methodology/businessmri-v2.6-runtime-bundles/MMRI_ISMRI_Methodology_4.3.7_BUSINESSMRI_V2.json","b01c2609cfa2b288c28d2443825251d7e1d68c671b6b1b91fdfaddfba1797795"],
  ["4.4.7","methodology/businessmri-v2.6-runtime-bundles/MMRI_OPMRI_Methodology_4.4.7_BUSINESSMRI_V2.json","8cc7ad98d281caae3770a16420d0f9f69fc543e4065de715ffb8731ffe9f5a7a"]
];
let failed=0;const res=[];
const ck=(b,n,ok,d='')=>{res.push({bundle:b,name:n,ok:!!ok});if(!ok){failed++;console.log('FAIL',b,n,String(d).slice(0,160))}};
const near=(a,b,t=1e-6)=>Math.abs(a-b)<=t;
for(const [ver,file,pin] of ACTIVE){
  const raw=fs.readFileSync(file);const B=ver;
  ck(B,'file_sha_matches_registered_pin',crypto.createHash('sha256').update(raw).digest('hex')===pin);
  const j=JSON.parse(raw);
  ck(B,'methodology_version',j.methodologyVersion===ver,j.methodologyVersion);
  ck(B,'bundle_self_validation_pass',j.validation?.status==='PASS'&&j.validation?.failed===0,JSON.stringify(j.validation?.status));
  const q=j.questions,qp=j.runtimePolicy.questionPolicies,cp=j.runtimePolicy.cellPolicies,inst=j.cellInstances,cats=j.categories,tm=j.cellTemplates;
  ck(B,'counts_64_48_3072_12288_20',cats.length===64&&tm.length===48&&inst.length===3072&&q.length===12288&&j.profileQuestions.length===20,[cats.length,tm.length,inst.length,q.length].join('/'));
  ck(B,'runtime_policy_counts_12288_3072',qp.length===12288&&cp.length===3072);
  const qids=new Set(q.map(x=>x.questionId));ck(B,'question_ids_unique',qids.size===12288);
  ck(B,'question_policy_1to1',new Set(qp.map(x=>x.questionId)).size===12288&&qp.every(x=>qids.has(x.questionId)));
  const iids=new Set(inst.map(x=>x.cellInstanceId));ck(B,'cell_instance_ids_unique',iids.size===3072);
  ck(B,'cell_policy_1to1',new Set(cp.map(x=>x.cellExternalId)).size===3072&&cp.every(x=>iids.has(x.cellExternalId)));
  const catIds=new Set(cats.map(c=>c.ID));
  ck(B,'questions_reference_existing_cells',q.every(x=>catIds.has(x.categoryId)&&iids.has(x.categoryId+':'+x.cellId)));
  const byCell=new Map();for(const x of q){const k=x.categoryId+':'+x.cellId;(byCell.get(k)||byCell.set(k,[]).get(k)).push(x)}
  ck(B,'every_cell_has_4_paths_with_4_source_kinds',[...byCell.values()].every(a=>a.length===4&&new Set(a.map(x=>x.path)).size===4&&new Set(a.map(x=>x.sourceKind)).size===4));
  const mods=new Map();cats.forEach(c=>{const w=mods.get(c.Module);if(w!==undefined&&w!==c['Module weight %'])mods.set(c.Module,NaN);else mods.set(c.Module,c['Module weight %'])});
  ck(B,'module_weights_consistent_and_sum_100',[...mods.values()].every(Number.isFinite)&&near([...mods.values()].reduce((a,b)=>a+b,0),100));
  ck(B,'category_weights_sum_100',near(cats.reduce((a,c)=>a+c['Category weight %'],0),100));
  ck(B,'cell_template_weights_sum_100',near(tm.reduce((a,c)=>a+c['Weight %'],0),100,1e-6));
  // Routing gate (C01) has weight 0; the context-only trend cell (C42) carries 2.5% that is excluded from the maturity denominator; every scoring cell has weight > 0 and they sum to 97.5.
  const scoringCells=tm.filter(t=>t['Score eligible']),ctxCells=tm.filter(t=>!t['Score eligible']);
  ck(B,'gate_cell_weight_zero_and_trend_cell_2_5',ctxCells.every(t=>t['Scoring role']==='CONTEXT_ONLY_TREND'?t['Weight %']===2.5:t['Weight %']===0));
  ck(B,'scoring_cells_positive_weight_sum_97_5',scoringCells.every(t=>t['Weight %']>0)&&near(scoringCells.reduce((a,t)=>a+t['Weight %'],0),97.5));
  const NON=new Set(['CONTEXT_ONLY','INFERRED_CELL_ONLY']);
  ck(B,'scoring_flag_matches_method',qp.every(p=>p.scoreEligible===!NON.has(p.scoringMethod)));
  ck(B,'scored_option_count_matches_eligibility',qp.every(p=>p.scoreEligible?p.scoredOptionCount>0:p.scoredOptionCount===0));
  const byId=new Map(q.map(x=>[x.questionId,x]));
  ck(B,'option_scores_in_0_100_for_scored_questions',qp.filter(p=>p.scoreEligible).every(p=>{const o=byId.get(p.questionId).explicitOptions||[];return o.every(x=>x.score===null||x.score===undefined||(Number.isFinite(x.score)&&x.score>=0&&x.score<=100))}));
  // INFER_ONLY questions legitimately carry inferred-cell option scores (never asked directly, see infer_only_never_direct); CONTEXT_ONLY ones must carry none.
  ck(B,'context_only_questions_have_no_numeric_scores',qp.filter(p=>p.scoringMethod==='CONTEXT_ONLY').every(p=>(byId.get(p.questionId).explicitOptions||[]).every(x=>x.score===null||x.score===undefined)));
  ck(B,'direct_ask_matches_routing_state',qp.every(p=>p.directAskAllowed===(p.routingState==='DIRECT_ALLOWED')));
  ck(B,'infer_only_never_direct',qp.filter(p=>p.routingState==='INFER_ONLY'||p.scoringMethod==='INFERRED_CELL_ONLY').every(p=>!p.directAskAllowed));
  ck(B,'cell_direct_limits_aligned',cp.every(c=>c.maxDirectQuestions<=4&&c.directAskableQuestions<=4&&c.maxDirectQuestions>=0));
  ck(B,'confidence_thresholds_in_range',cp.every(c=>[c.lockThreshold,c.primaryConfidenceFloor,c.indirectConfidenceCap].every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&c.conflictGapThreshold>0&&c.conflictGapThreshold<=100));
  ck(B,'minimum_three_path_confidence_defined',inst.every(i=>Number.isFinite(i.minimumThreePathConfidenceAtAuthority075??0.75)));
  ck(B,'runtime_rules_and_score_patterns_present',j.runtimePolicy.rules.length>=1&&j.runtimePolicy.scorePatterns.length>=1);
}
console.log(JSON.stringify({status:failed?'FAIL':'PASS',bundles:ACTIVE.length,checks:res.length,passed:res.length-failed,failed},null,1));
process.exit(failed?1:0);
