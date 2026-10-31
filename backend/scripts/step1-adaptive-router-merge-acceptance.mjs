import fs from 'node:fs';

const required = [
  'prisma/schema.prisma',
  'prisma/migrations/20260909030000_v13_adaptive_runtime_policy/migration.sql',
  'src/engine/runtime-policy.ts',
  'src/engine/routing.ts',
  'src/engine/types.ts',
  'src/services/methodology-cache.ts',
  'scripts/adaptive-v13-router-smoke.mjs'
];
const results=[];
function check(cond,name){results.push({name,pass:Boolean(cond)});if(!cond) throw new Error(`FAIL ${name}`);}
for(const file of required) check(fs.existsSync(file),`file ${file}`);
const schema=fs.readFileSync('prisma/schema.prisma','utf8');
for(const model of ['QuestionRuntimePolicy','CellRuntimePolicy','RuntimeRuleDefinition','RuntimeScorePattern']) check(schema.includes(`model ${model} {`),`Prisma model ${model}`);
const migration=fs.readFileSync('prisma/migrations/20260909030000_v13_adaptive_runtime_policy/migration.sql','utf8');
for(const table of ['question_runtime_policies','cell_runtime_policies','runtime_rule_definitions','runtime_score_patterns']) check(migration.includes(`"${table}"`),`migration table ${table}`);
const routing=fs.readFileSync('src/engine/routing.ts','utf8');
check(routing.includes('hasAdaptiveV13Policy(definition)'), 'central router activates v13 policy when loaded');
const cache=fs.readFileSync('src/services/methodology-cache.ts','utf8');
check(cache.includes('partial question runtime policy'), 'runtime loader fails closed on partial question metadata');
check(cache.includes('partial cell runtime policy'), 'runtime loader fails closed on partial cell metadata');
console.log(JSON.stringify({status:'PASS',checks:results.length,results},null,2));
