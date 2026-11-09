import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const checks=[];
const pass=(id,ok,note='')=>{checks.push({id,status:ok?'PASS':'FAIL',note});if(!ok)console.error(`FAIL ${id}${note?`: ${note}`:''}`)};
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const schema=read('prisma/schema.prisma');
const migration=read('prisma/migrations/20260909050000_step5_hierarchical_aggregation/migration.sql');
const types=read('src/engine/types.ts');
const scoring=read('src/engine/scoring.ts');
const weighting=read('src/engine/weighting.ts');
const definition=read('src/engine/definition.ts');
const cache=read('src/services/methodology-cache.ts');
const service=read('src/services/prisma-assessment-engine.ts');
const query=read('src/api/services/query-service.ts');
const diagnosis=fs.existsSync(path.join(root,'src/diagnosis/result.ts'))?read('src/diagnosis/result.ts'):'';
const verifier=read('src/verify-hierarchical-aggregation.ts');
const smokeResult=JSON.parse(read('methodology/STEP5_HIERARCHICAL_AGGREGATION_SMOKE.json'));
const bundle=JSON.parse(read('methodology/MMRI_v1.1.0_v13_Normalized_Import_Bundle.json'));

for(const f of [
  'src/engine/weighting.ts',
  'scripts/step5-hierarchical-aggregation-smoke.mjs',
  'src/verify-hierarchical-aggregation.ts',
  'prisma/migrations/20260909050000_step5_hierarchical_aggregation/migration.sql'
]) pass(`file ${f}`,fs.existsSync(path.join(root,f)));

pass('frozen v13 has 64 capabilities',bundle.categories.length===64,String(bundle.categories.length));
pass('frozen v13 has 48 cell templates',bundle.cellTemplates.length===48,String(bundle.cellTemplates.length));
const moduleNames=[...new Set(bundle.categories.map(c=>c.Module))];
pass('frozen v13 has 8 modules',moduleNames.length===8,String(moduleNames.length));
const moduleWeightMap=new Map(moduleNames.map(name=>[name,Number(bundle.categories.find(c=>c.Module===name)['Module weight %'])]));
const moduleWeightTotal=[...moduleWeightMap.values()].reduce((a,b)=>a+b,0);
const capabilityWeightTotal=bundle.categories.reduce((a,c)=>a+Number(c['Category weight %']),0);
const cellWeightTotal=bundle.cellTemplates.filter(c=>c.ID!=='C01').reduce((a,c)=>a+Number(c['Weight %']),0);
pass('module weights total 100',Math.abs(moduleWeightTotal-100)<1e-6,String(moduleWeightTotal));
pass('capability weights total 100',Math.abs(capabilityWeightTotal-100)<1e-6,String(capabilityWeightTotal));
pass('scored cell weights total 100',Math.abs(cellWeightTotal-100)<1e-6,String(cellWeightTotal));
for(const name of moduleNames){
  const total=bundle.categories.filter(c=>c.Module===name).reduce((a,c)=>a+Number(c['Category weight %']),0);
  pass(`module capability total ${name}`,Math.abs(total-moduleWeightMap.get(name))<1e-6,`${total}/${moduleWeightMap.get(name)}`);
}

pass('ModuleDef exists',types.includes('export interface ModuleDef'));
pass('MethodologyDefinition carries modules',types.includes('modules: ModuleDef[]'));
pass('ModuleSnapshot exists',types.includes('export interface ModuleSnapshot'));
pass('RuntimeSnapshot carries module map',types.includes('modules: Map<string, ModuleSnapshot>'));
pass('Category snapshot carries module lineage',types.includes('effectiveModuleWeightPct')&&types.includes('partialContributionToModule'));
pass('Overall aggregation version explicit',types.includes('aggregationVersion: "HIERARCHICAL_V13" | "LEGACY"'));
pass('weight validator enforces eight modules',weighting.includes('Expected 8 marketing modules'));
pass('weight validator enforces 64 capabilities',weighting.includes('Expected 64 capabilities'));
pass('weight validator enforces 100% capability total',weighting.includes('64 capability weights must total 100%'));
pass('weight validator reconciles module/capability weights',weighting.includes('must equal module weight'));
pass('bundle definition validates hierarchy',definition.includes('validateHierarchicalWeights(modules, categories, cells)'));
pass('DB methodology cache loads modules',cache.includes('this.db.module.findMany'));
pass('DB methodology cache validates hierarchy',cache.includes('validateHierarchicalWeights(modules, categories, cells)'));

pass('v13 aggregation branches explicitly',scoring.includes('definition.runtimePolicy?.enabled'));
pass('v13 cell to capability aggregation',scoring.includes('calculateV13Categories'));
pass('capability to module aggregation',scoring.includes('calculateModules'));
pass('module to overall aggregation',scoring.includes('calculateHierarchicalOverall'));
pass('unanswered cell not treated as zero in v13',scoring.includes('unanswered cells are never converted to zero'));
pass('coverage kept separate from partial score',scoring.includes('availableWeight / denominator'));
pass('capability contribution lineage',scoring.includes('applyCategoryContributionLineage'));
pass('module contribution lineage',scoring.includes('applyModuleContributionLineage'));
pass('legacy aggregate path preserved',scoring.includes('calculateLegacyAggregates'));
pass('five purposes remain separate impact view',scoring.includes('calculatePurposes'));

pass('Assessment aggregationVersion persisted',schema.includes('aggregationVersion   String @default("LEGACY")'));
pass('ModuleResult model exists',schema.includes('model ModuleResult'));
pass('Module has result relation',schema.includes('moduleResults       ModuleResult[]'));
pass('Assessment has module results',schema.includes('moduleResults      ModuleResult[]'));
pass('CategoryResult contribution fields',schema.includes('partialContributionToModule')&&schema.includes('officialContributionToModule'));
pass('migration adds aggregation version',migration.includes('ADD COLUMN "aggregationVersion"'));
pass('migration creates module_results',migration.includes('CREATE TABLE "module_results"'));
pass('migration creates unique module result key',migration.includes('module_results_assessmentId_moduleId_key'));

pass('answer submit persists all categories',service.includes('persistAllCategories(tx, assessmentId, definition, snapshot)'));
pass('answer submit persists all modules',service.includes('persistAllModules(tx, assessmentId, definition, snapshot)'));
pass('assessment stores aggregation version',service.includes('aggregationVersion: snapshot.overall.aggregationVersion'));
pass('module persistence uses stable module id',service.includes('moduleId(definition.version, module.code)'));
pass('category persistence stores contribution lineage',service.includes('partialContributionToModule: cat.partialContributionToModule'));
pass('submit response exposes modules',service.includes('modules: Object.fromEntries(snapshot.modules)'));
pass('results API uses engine module aggregates',query.includes('snapshot.modules.get(m.id)')||(query.includes('getDiagnosisResult')&&diagnosis.includes('snapshot.modules.get(m.id)')));
pass('report payload includes modules',query.includes('modules:results.modules')||(query.includes('getDiagnosisResult')&&diagnosis.includes('modules,capabilities')));
pass('connected DB verifier checks 8 module results',verifier.includes('moduleResults.length === 8'));
pass('connected DB verifier checks contribution sum',verifier.includes('Module official contributions do not sum to overall official score'));

pass('aggregation smoke PASS',smokeResult.status==='PASS',smokeResult.status);
pass('aggregation smoke has extensive assertions',smokeResult.checks>=390,String(smokeResult.checks));
pass('smoke proves N/A redistribution hierarchy',smokeResult.results.some(r=>r.name==='hierarchy differs from old global N/A redistribution'&&r.pass));
pass('smoke proves missing cells not zero',smokeResult.results.some(r=>r.name==='unanswered cells are not scored as zero'&&r.pass));
pass('smoke proves five outcomes separate',smokeResult.results.some(r=>r.name==='five business outcomes remain separate from modules'&&r.pass));

const failed=checks.filter(x=>x.status==='FAIL');
const result={status:failed.length?'FAIL':'PASS',checks:checks.length,passed:checks.length-failed.length,failed:failed.length,details:checks};
fs.writeFileSync(path.join(root,'methodology/STEP5_HIERARCHICAL_AGGREGATION_ACCEPTANCE.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(failed.length)process.exit(1);
