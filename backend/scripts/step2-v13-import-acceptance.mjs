import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..');
const bundlePath = path.join(backend, 'methodology', 'MMRI_v1.1.0_v13_Normalized_Import_Bundle.json');
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const importer = fs.readFileSync(path.join(backend, 'src', 'import-methodology.ts'), 'utf8');
const validator = fs.readFileSync(path.join(backend, 'src', 'lib', 'validate-bundle-core.ts'), 'utf8');
const bundleTypes = fs.readFileSync(path.join(backend, 'src', 'lib', 'bundle-types.ts'), 'utf8');
const schema = fs.readFileSync(path.join(backend, 'prisma', 'schema.prisma'), 'utf8');

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  else console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
};

const runtime = bundle.runtimePolicy;
const questionIds = bundle.questions.map(q => q.questionId);
const cellIds = bundle.cellInstances.map(c => c.cellInstanceId);
const qPolicies = runtime?.questionPolicies ?? [];
const cellPolicies = runtime?.cellPolicies ?? [];
const rules = runtime?.rules ?? [];
const patterns = runtime?.scorePatterns ?? [];

check('candidate methodology version', /v1\.1\.0/.test(bundle.sourceMethodology), bundle.sourceMethodology);
check('bundle validation PASS', bundle.validation?.status === 'PASS');
check('64 capabilities', bundle.categories.length === 64, String(bundle.categories.length));
check('48 dimensions', bundle.cellTemplates.length === 48, String(bundle.cellTemplates.length));
check('3,072 diagnostic cells', bundle.cellInstances.length === 3072, String(bundle.cellInstances.length));
check('12,288 questions', bundle.questions.length === 12288, String(bundle.questions.length));
check('12,288 unique stable question IDs', new Set(questionIds).size === 12288);
check('stable question ID format', questionIds.every(id => /^MMRI-C\d{2}-D\d{2}-Q[1-4]$/.test(id)));
check('all questions have explicit options', bundle.questions.every(q => Array.isArray(q.explicitOptions) && q.explicitOptions.length === q.optionsMn.length));
check('unknown option is non-scoring', bundle.questions.every(q => q.explicitOptions.filter(o => o.labelMn === 'Мэдэхгүй.').every(o => o.score === null && o.state === 'DNK')));
check('N/A option is non-scoring', bundle.questions.every(q => q.explicitOptions.filter(o => o.labelMn === 'Манай бизнест хамаарахгүй.').every(o => o.score === null && o.state === 'N_A_CLAIM')));
check('12,288 question policies', qPolicies.length === 12288, String(qPolicies.length));
check('3,072 cell policies', cellPolicies.length === 3072, String(cellPolicies.length));
check('question policy ID coverage', qPolicies.length === new Set(qPolicies.map(p => p.questionId)).size && qPolicies.every(p => questionIds.includes(p.questionId)));
check('cell policy ID coverage', cellPolicies.length === new Set(cellPolicies.map(p => p.cellExternalId)).size && cellPolicies.every(p => cellIds.includes(p.cellExternalId)));
check('11,956 score-eligible', qPolicies.filter(p => p.scoreEligible).length === 11956, String(qPolicies.filter(p => p.scoreEligible).length));
check('332 non-scoring', qPolicies.filter(p => !p.scoreEligible).length === 332, String(qPolicies.filter(p => !p.scoreEligible).length));
check('76 never-direct questions', qPolicies.filter(p => !p.directAskAllowed && p.routingState === 'INFER_ONLY').length === 76, String(qPolicies.filter(p => !p.directAskAllowed && p.routingState === 'INFER_ONLY').length));
check('19 INFER_ONLY cells', cellPolicies.filter(p => p.applicabilityMode === 'INFER_ONLY').length === 19, String(cellPolicies.filter(p => p.applicabilityMode === 'INFER_ONLY').length));
check('256 anchors', qPolicies.filter(p => p.isAnchor).length === 256, String(qPolicies.filter(p => p.isAnchor).length));
check('D01 all non-scoring', qPolicies.filter(p => /-D01-Q/.test(p.questionId)).every(p => !p.scoreEligible));
check('C31 candidate is conditional', bundle.cellTemplates.find(c => c.ID === 'C31')?.['N/A eligible'] === 'Нөхцөлт');
check('runtime rule dictionary populated', rules.length >= 40, String(rules.length));
check('4 score patterns', patterns.length === 4 && new Set(patterns.map(p => p.code)).size === 4, patterns.map(p => p.code).join(','));
check('score patterns include NS/S3/S4/S5', ['NS','S3','S4','S5'].every(code => patterns.some(p => p.code === code)));
check('runtime rules satisfy question FKs', qPolicies.every(p => [p.triggerRuleId,p.confidenceRuleId,p.stopRuleId].every(id => rules.some(r => r.ruleId === id))));
check('runtime rules satisfy cell FKs', cellPolicies.every(p => [p.stateModelId,p.valueRuleId].every(id => rules.some(r => r.ruleId === id))));
check('Prisma runtime models present', ['model QuestionRuntimePolicy','model CellRuntimePolicy','model RuntimeRuleDefinition','model RuntimeScorePattern'].every(x => schema.includes(x)));
check('importer accepts explicit options', importer.includes('q.explicitOptions ?? scoringForQuestion'));
check('importer writes runtime score patterns', importer.includes('prisma.runtimeScorePattern.createMany'));
check('importer writes runtime rules', importer.includes('prisma.runtimeRuleDefinition.createMany'));
check('importer writes question policies', importer.includes('prisma.questionRuntimePolicy.createMany'));
check('importer writes cell policies', importer.includes('prisma.cellRuntimePolicy.createMany'));
check('validator fails partial runtime imports', validator.includes('RUNTIME_QUESTION_POLICY_COUNT') && validator.includes('RUNTIME_CELL_POLICY_COUNT') && validator.includes('RUNTIME_RULE_FK'));
check('bundle types include runtime policy', bundleTypes.includes('runtimePolicy?: BundleRuntimePolicy'));

const sourceDir = path.join(backend, 'methodology', 'v13', 'source');
for (const [name, manifest] of Object.entries(bundle.sourceManifest).filter(([name, m]) => m.role === 'FROZEN_V13_PRODUCTION_SOURCE')) {
  const sourcePath = path.join(sourceDir, name);
  const exists = fs.existsSync(sourcePath);
  const sha = exists ? crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex') : '';
  check(`frozen source ${name}`, exists && sha === manifest.sha256, exists ? sha.slice(0,12) : 'missing');
}

const failed = checks.filter(c => !c.ok);
const result = {
  status: failed.length ? 'FAIL' : 'PASS',
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  bundleSha256: crypto.createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex'),
  counts: bundle.validation?.automatedChecks ?? {},
  checks
};
fs.writeFileSync(path.join(backend, 'methodology', 'STEP2_V13_IMPORT_ACCEPTANCE.json'), JSON.stringify(result, null, 2));
console.log(`Step 2 v13 import acceptance: ${result.passed}/${result.total} PASS`);
if (failed.length) process.exit(1);
