import fs from 'node:fs';
const rec=fs.readFileSync(new URL('../src/strategy/recommendations.ts',import.meta.url),'utf8');
const plan=fs.readFileSync(new URL('../src/strategy/action-plan.ts',import.meta.url),'utf8');
const payload=fs.readFileSync(new URL('../src/report/payload.ts',import.meta.url),'utf8');
const checks=[
  ['recommendations do not capacity-truncate visible critical actions', rec.includes('const visibleExecutionLimit = Math.max(1, contractExecutionLimit)') && !rec.includes('Math.min(contractExecutionLimit, capacityLimit)')],
  ['recommendations retain evidence to fill five-action contract', rec.includes('const evidenceFillNeeded = Math.max(0, contractExecutionLimit - execution.length)')],
  ['single authoritative recommendation selector exists', rec.includes('export function selectRecommendationActions(') && rec.includes('const planActions = uniqueRecommendations([...criticalActions, ...evidenceActions])')],
  ['action plan uses authoritative recommendation selector', plan.includes('const selection = selectRecommendationActions(recommendations, contractExecCap, contractEvidenceCap)') && plan.includes('const selected = selection.planActions')],
  ['report uses authoritative recommendation selector', payload.includes('const recommendationSelection = selectRecommendationActions(') && payload.includes('const priorityActions = recommendationSelection.criticalActions') && payload.includes('const evidenceActions = recommendationSelection.evidenceActions')],
  ['report fails closed when an action is absent from plan', payload.includes('Report recommendation ${action.id} is missing from the 365-day plan')]
];
for(const [name,ok] of checks){if(!ok) throw new Error(`FAIL ${name}`); console.log(`PASS ${name}`)}
console.log(JSON.stringify({status:'PASS',checksPassed:checks.length,checksTotal:checks.length,criticalActionContract:5},null,2));
