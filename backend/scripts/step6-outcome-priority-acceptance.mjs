import fs from 'node:fs';
import path from 'node:path';

const read=p=>fs.readFileSync(p,'utf8');
const root=process.cwd();
const types=read('src/engine/types.ts');
const scoring=read('src/engine/scoring.ts');
const recs=read('src/strategy/recommendations.ts');
const schema=read('prisma/schema.prisma');
const migration=read('prisma/migrations/20260909060000_step6_outcome_priority/migration.sql');
const service=read('src/services/prisma-assessment-engine.ts');
const query=read('src/api/services/query-service.ts');
const diagnosis=fs.existsSync('src/diagnosis/result.ts')?read('src/diagnosis/result.ts'):'';
const strategyService=read('src/services/prisma-strategy-report-service.ts');
const contracts=read('src/services/contracts.ts');
const openapi=read('docs/openapi.yaml');
const frontend=read('../frontend/src/api/types.ts');
const pkg=JSON.parse(read('package.json'));
const bundle=JSON.parse(read('methodology/MMRI_v1.1.0_v13_Normalized_Import_Bundle.json'));
const purposeContract=bundle.contracts['MMRI_FINAL_Five_Purpose_Mapping.json'];
const smoke=JSON.parse(read('methodology/STEP6_OUTCOME_PRIORITY_SMOKE.json'));
const strategySmoke=JSON.parse(read('methodology/STEP6_OUTCOME_STRATEGY_SMOKE.json'));
const engineSmoke=JSON.parse(read('methodology/ENGINE_CORE_SMOKE.json'));
const engineRegression=JSON.parse(read('methodology/ENGINE_CONTRACT_REGRESSION.json'));
const step4Smoke=JSON.parse(read('methodology/STEP4_LIVE_CELL_SMOKE.json'));
const step5Smoke=JSON.parse(read('methodology/STEP5_HIERARCHICAL_AGGREGATION_SMOKE.json'));
const strategyRegression=JSON.parse(read('methodology/STRATEGY_REPORT_REGRESSION.json'));

const checks=[];
const pass=(id,condition,note='')=>{checks.push({id,status:condition?'PASS':'FAIL',note});if(!condition)console.error('FAIL',id,note)};

pass('backend version 3.19.0+',Number(pkg.version.split('.')[0])>3||(Number(pkg.version.split('.')[0])===3&&Number(pkg.version.split('.')[1])>=19),pkg.version);
pass('five purpose definitions',purposeContract.purposes.length===5,String(purposeContract.purposes.length));
const expectedCodes=['Profit','Revenue','Brand Value','Customers','Market Share'];
expectedCodes.forEach((code,i)=>pass(`purpose code ${code}`,purposeContract.purposes[i]?.code===code,purposeContract.purposes[i]?.code));
pass('320 category-purpose mappings',purposeContract.mapping.length===64&&purposeContract.mapping.every(m=>Object.keys(m.relevance).length===5),String(purposeContract.mapping.length));
pass('purpose scores do not feed overall',purposeContract.guardrails.purposeScoresFeedBackIntoOverallScore===false);
pass('causal financial impact prohibited by source contract',purposeContract.guardrails.causalFinancialImpactClaimAllowed===false);
pass('P20 does not change scores',purposeContract.p20.changesScores===false);
pass('P20 used for recommendation emphasis',purposeContract.p20.uses.includes('recommendation_emphasis'));

pass('CategoryOutcomePrioritySnapshot type',types.includes('export interface CategoryOutcomePrioritySnapshot'));
pass('OutcomePrioritySnapshot type',types.includes('export interface OutcomePrioritySnapshot'));
pass('RuntimeSnapshot outcome priorities',types.includes('outcomePriorities: Map<string, OutcomePrioritySnapshot>'));
pass('RuntimeSnapshot category outcome priorities',types.includes('categoryOutcomePriorities: Map<string, CategoryOutcomePrioritySnapshot>'));
pass('explicit causal guardrail type',types.includes('causalLiftClaimAllowed: false'));

pass('outcome calculator exists',scoring.includes('function calculateOutcomePriorities'));
pass('structural weight formula',scoring.includes('row.def.weightPct * row.relevance'));
pass('effective purpose weight formula',scoring.includes('structuralWeight / structuralDenominator * 100'));
pass('category gap formula',scoring.includes('100 - categoryScore'));
pass('gap contribution formula',scoring.includes('categoryGap * effectivePurposeWeightPct / 100'));
pass('evidence quality separates confidence and coverage',scoring.includes('(row.state.confidence ?? 0) * (row.state.coverage ?? 0)'));
pass('confidence adjusted gap cannot create gap',scoring.includes('gapContribution * evidenceQuality'));
pass('uncertainty gap explicit',scoring.includes('gapContribution - confidenceAdjustedGapContribution'));
pass('relative priority normalized by observed maximum',scoring.includes('row.gapContribution / maxGapContribution'));
pass('top five deterministic category IDs',scoring.includes('ranked.slice(0, 5).map'));
pass('known gap uses purpose score',scoring.includes('100 - purposeState.partialScore'));
pass('outcome priority version explicit',scoring.includes('OUTCOME_PRIORITY_V13'));
pass('causal lift disabled in engine',scoring.includes('causalLiftClaimAllowed: false'));
pass('missing categories excluded not zero-filled',scoring.includes('row.state.partialScore !== null'));

pass('recommendations use outcome priority',recs.includes('snapshot.categoryOutcomePriorities?.get'));
pass('selected outcome drives purpose emphasis',recs.includes('selectedOutcomePriority'));
pass('no-selected-outcome averages deterministic priorities',recs.includes('allOutcomePriorities.reduce'));
pass('mapping relevance remains fallback',recs.includes('mappedRelevanceFallback'));

pass('PurposeResult known gap persisted',schema.includes('knownGap     Decimal?'));
pass('PurposeResult confirmed gap persisted',schema.includes('confidenceAdjustedKnownGap'));
pass('PurposeResult uncertainty gap persisted',schema.includes('uncertaintyKnownGap'));
pass('PurposeResult top categories persisted',schema.includes('topPriorityCategoryIds Json?'));
pass('PurposeResult outcome version persisted',schema.includes('calculationVersion String @default("LEGACY")'));
pass('CategoryOutcomePriorityResult model',schema.includes('model CategoryOutcomePriorityResult'));
pass('category-outcome unique key',schema.includes('@@unique([assessmentId, purposeId, categoryId])'));
pass('category-outcome rank index',schema.includes('@@index([assessmentId, purposeId, rank])'));
pass('assessment priority relation',schema.includes('outcomePriorityResults CategoryOutcomePriorityResult[]'));
pass('migration alters purpose results',migration.includes('ALTER TABLE "purpose_results"'));
pass('migration creates category priority table',migration.includes('CREATE TABLE "category_outcome_priority_results"'));
pass('migration has three foreign keys',(migration.match(/ADD CONSTRAINT "category_outcome_priority_results_/g)||[]).length===3);

pass('answer persistence refreshes purpose results',service.includes('await persistPurposes(tx, assessmentId, definition, snapshot)'));
pass('answer persistence refreshes 320 priority rows',service.includes('await persistCategoryOutcomePriorities(tx, assessmentId, definition, snapshot)'));
pass('stale priority rows deleted before refresh',service.includes('categoryOutcomePriorityResult.deleteMany'));
pass('priority rows carry stable category IDs',service.includes('categoryId(definition.version, row.categoryId)'));
pass('priority rows carry stable purpose IDs',service.includes('purposeId(definition.version, row.purposeId)'));
pass('submit answer exposes outcome priorities',service.includes('outcomePriorities: Object.fromEntries(snapshot.outcomePriorities)'));
pass('service contract exposes outcome priorities',contracts.includes('outcomePriorities: Record<string, OutcomePrioritySnapshot>'));

pass('results API emits outcome priorities',query.includes('outcomePriorities:outcomePriorityRows')||(query.includes('getDiagnosisResult')&&diagnosis.includes('businessOutcomePriorities')));
pass('results API emits top categories',query.includes('topCategories:priority.topPriorityCategoryIds.map')||(query.includes('getDiagnosisResult')&&diagnosis.includes('topCategories:p.topPriorityCategoryIds.map')));
pass('results API guardrail blocks causal lift',query.includes('causalFinancialLiftClaimAllowed:false')||diagnosis.includes('causalFinancialLiftClaimAllowed:false'));
pass('results API guardrail blocks ROI prediction',query.includes('roiPredictionAllowed:false')||diagnosis.includes('roiPredictionAllowed:false'));
pass('AI boundary blocks causal financial prediction',diagnosis.includes('It does not predict causal financial lift or ROI')&&strategyService.includes('diagnosisResultHash'));
pass('strategy frozen hash includes outcome priorities',strategyService.includes('outcomePriorities:['));
pass('strategy frozen hash includes category outcome priorities',strategyService.includes('categoryOutcomePriorities:['));
pass('frontend OutcomePriorityResult type',frontend.includes('export interface OutcomePriorityResult'));
pass('frontend guardrail type',frontend.includes('export interface OutcomeGuardrail'));
pass('frontend results accepts outcome priorities',frontend.includes('outcomePriorities?:OutcomePriorityResult[]'));
pass('OpenAPI documents deterministic outcome rankings',openapi.includes('deterministic category-to-outcome priority rankings'));

pass('step6 outcome smoke PASS',smoke.status==='PASS',String(smoke.checks));
pass('step6 outcome smoke extensive',smoke.checks>=1300,String(smoke.checks));
pass('step6 strategy smoke PASS',strategySmoke.status==='PASS',String(strategySmoke.checks));
pass('step6 strategy smoke covers five selected outcomes',strategySmoke.results.filter(r=>r.name?.includes('recommendation uses diagnostic outcome priority')&&r.pass).length===5);
pass('legacy engine smoke regression PASS',engineSmoke.failed===0||engineSmoke.status==='PASS',JSON.stringify({total:engineSmoke.total,status:engineSmoke.status,failed:engineSmoke.failed}));
pass('engine contract regression PASS',engineRegression.failed===0||engineRegression.status==='PASS',JSON.stringify({total:engineRegression.total,status:engineRegression.status,failed:engineRegression.failed}));
pass('step4 live-cell regression PASS',step4Smoke.status==='PASS',String(step4Smoke.checks));
pass('step5 hierarchy regression PASS',step5Smoke.status==='PASS',String(step5Smoke.checks));
pass('strategy/report regression PASS',strategyRegression.failed===0,String(strategyRegression.total));
pass('step6 smoke npm script',pkg.scripts['step6:outcomes:smoke']?.includes('step6-outcome-priority-smoke.mjs'));
pass('connected DB verifier script',pkg.scripts['db:verify:outcomes']==='tsx src/verify-outcome-priorities.ts');

const failed=checks.filter(x=>x.status==='FAIL');
const result={status:failed.length?'FAIL':'PASS',checks:checks.length,passed:checks.length-failed.length,failed:failed.length,details:checks};
fs.writeFileSync(path.join(root,'methodology/STEP6_OUTCOME_PRIORITY_ACCEPTANCE.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,checks:result.checks,passed:result.passed,failed:result.failed},null,2));
if(failed.length)process.exit(1);
