import fs from 'node:fs';
const files={
  binding:fs.readFileSync('src/report/binding.ts','utf8'),
  service:fs.readFileSync('src/services/prisma-strategy-report-service.ts','utf8'),
  result:fs.readFileSync('src/diagnosis/result.ts','utf8'),
  types:fs.readFileSync('src/report/types.ts','utf8'),
  payload:fs.readFileSync('src/report/payload.ts','utf8'),
  prompt:fs.readFileSync('src/report/ai-prompt.ts','utf8'),
  validator:fs.readFileSync('src/report/validator.ts','utf8'),
  fallback:fs.readFileSync('src/report/fallback-renderer.ts','utf8')
};
const checks=[];const check=(name,pass)=>checks.push({name,pass:Boolean(pass)});
check('diagnosis exposes category weaknesses',files.result.includes('weaknesses:{totalCount:weaknessesAll.length'));
check('weakness selection uses category score threshold',files.result.includes('c.score<weakThreshold'));
check('weaknesses exclude N/A and unresolved/review categories',files.result.includes('!c.confirmedNotApplicable')&&files.result.includes('c.reviewRequiredCellCount===0')&&files.result.includes('c.unresolvedCellCount===0'));
check('report payload has dedicated weakness type',files.types.includes('export interface WeaknessFinding'));
check('report payload carries weaknesses separately from root findings',files.types.includes('weaknesses: WeaknessFinding[];')&&files.types.includes('rootFindings: RootFinding[];'));
check('report payload v1.3',files.payload.includes('payloadVersion:"MMRI-REPORT-PAYLOAD-1.3"'));
check('findings policy participates in frozen report binding',files.binding.includes('findingsPolicyVersion')&&files.service.includes('findingsPolicyVersion:MMRI_REPORT_FINDINGS_POLICY_VERSION'));
check('report uses five-category findings policy',files.payload.includes('REPORT_CATEGORY_FINDING_LIMIT=5')&&files.payload.includes('MMRI_REPORT_FINDINGS_POLICY_VERSION'));
check('both strengths and weaknesses use five-category policy',files.payload.match(/slice\(0, REPORT_CATEGORY_FINDING_LIMIT\)/g)?.length>=2);
check('weaknesses retain canonical category name',files.payload.includes('nameMn:c.nameMn'));
check('weakness trace marker is frozen',files.payload.includes('`weakness:WEAK-${c.id}`'));
check('AI receives dedicated weakness list',files.prompt.includes('weaknesses:payload.weaknesses'));
check('AI explicitly forbids substituting root findings for weaknesses',files.prompt.includes('Do not substitute cell-level root-cause findings for the five category-level weaknesses'));
check('validator requires canonical ordered five-category findings',files.validator.includes('Strength section must contain exactly')&&files.validator.includes('Weakness section must contain exactly'));
check('validator binds strength and weakness traces',files.validator.includes('`strength:${expected.id}`')&&files.validator.includes('`weakness:${expected.id}`'));
check('fallback renders five strengths',files.fallback.includes('payload.strengths.slice(0,5)'));
check('fallback renders five weaknesses',files.fallback.includes('payload.weaknesses.slice(0,5)'));
check('fallback S05 is category weakness section',files.fallback.includes('titleMn:"Гол сул тал"')&&files.fallback.includes('claim("WEAKNESS"'));
const failed=checks.filter(x=>!x.pass);
console.log(JSON.stringify({status:failed.length?'FAIL':'PASS',checksPassed:checks.length-failed.length,checksTotal:checks.length,failures:failed},null,2));
if(failed.length)process.exit(1);
