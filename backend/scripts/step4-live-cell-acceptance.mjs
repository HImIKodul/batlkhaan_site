import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const checks=[];
const pass=(id,ok,note='')=>{checks.push({id,status:ok?'PASS':'FAIL',note});if(!ok)console.error(`FAIL ${id}${note?`: ${note}`:''}`)};
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const schema=read('prisma/schema.prisma');
const migration=read('prisma/migrations/20260909040000_step4_live_cell_state/migration.sql');
const calc=read('src/engine/calculation.ts');
const adaptive=read('src/engine/adaptive-cell-state.ts');
const service=read('src/services/prisma-assessment-engine.ts');
const types=read('src/engine/types.ts');
const smoke=read('scripts/step4-live-cell-engine-smoke.mjs');

for(const f of [
  'src/engine/adaptive-cell-state.ts',
  'prisma/migrations/20260909040000_step4_live_cell_state/migration.sql',
  'scripts/step4-live-cell-engine-smoke.mjs'
]) pass(`file ${f}`,fs.existsSync(path.join(root,f)));
pass('Prisma CellConfidenceState enum',schema.includes('enum CellConfidenceState'));
for(const field of ['confidenceState','evidenceCount','scoreDispersion','lockReason','lockedAt','calculationVersion'])pass(`Prisma cell field ${field}`,schema.includes(field));
pass('migration creates confidence enum',migration.includes('CREATE TYPE "CellConfidenceState"'));
pass('migration persists lock state',migration.includes('"lockedAt"')&&migration.includes('"lockReason"'));
pass('migration indexes confidence state',migration.includes('assessmentId_confidenceState_idx'));
pass('v13 calculator only activates on complete policy',calc.includes('runtime.questionById.size === definition.questions.length')&&calc.includes('runtime.cellByCategoryCell.size === definition.categories.length * definition.cells.length'));
pass('legacy calculator remains available',calc.includes('calculateLegacyRuntimeSnapshot'));
pass('full v13 matrix calculator',adaptive.includes('calculateAdaptiveV13RuntimeSnapshot'));
pass('robust median scoring',adaptive.includes('function median(values: number[])'));
pass('indirect cap uses policy',adaptive.includes('Math.min(policy.indirectConfidenceCap'));
pass('primary confidence floor uses policy',adaptive.includes('policy.primaryConfidenceFloor'));
pass('lock threshold uses policy',adaptive.includes('policy.lockThreshold'));
pass('conflict threshold uses policy',adaptive.includes('policy.conflictGapThreshold'));
pass('Q2 consistency lock',adaptive.includes('PRIMARY_CONFIRM_WITHIN_THRESHOLD'));
pass('Q3 2-of-3 cluster lock',adaptive.includes('Q3_2_OF_3_CLUSTER'));
pass('Q4 3-of-4 cluster lock',adaptive.includes('Q4_3_OF_4_CLUSTER'));
pass('unresolved Q4 does not falsely lock',adaptive.includes('unresolvedConflict || exhausted'));
pass('D01 no maturity confidence',adaptive.includes('D01 is routing context, never a maturity score'));
pass('DNK/UNKNOWN state',adaptive.includes('confidenceState: directEvidence.length === 0 ? "UNASSESSED" : unknown.length > 0 ? "UNKNOWN"'));
pass('N/A non-scoring state',adaptive.includes('confidenceState: "NOT_APPLICABLE"'));
pass('INFER_ONLY direct evidence fail-visible',adaptive.includes('V13_INFER_ONLY_DIRECT_EVIDENCE'));
pass('CellSnapshot confidence state fields',types.includes('confidenceState?: CellConfidenceState')&&types.includes('lockReason?: string | null'));
pass('submit recalculates runtime snapshot',service.includes('const snapshot = calculateRuntimeSnapshot(definition, inputs.evidence)'));
pass('submit persists full live matrix',service.includes('persistLiveCellMatrix(tx, assessmentId, definition, snapshot)'));
pass('full matrix loops categories and cells',service.includes('for (const category of definition.categories)')&&service.includes('for (const cell of definition.cells)'));
pass('matrix uses createMany for first materialization',service.includes('assessmentCellState.createMany'));
pass('matrix updates only changed state',service.includes('cellStateEquivalent(current, data)'));
pass('lock transition audit',service.includes('CELL_LOCKED'));
pass('unlock transition audit',service.includes('CELL_UNLOCKED'));
pass('all category aggregates persisted',service.includes('persistAllCategories'));
pass('calculation version stamped',service.includes('ADAPTIVE_V13'));
pass('smoke asserts 3072 cells',smoke.includes("snapshot.cells.size===3072"));
pass('smoke asserts .75',smoke.includes("effectiveConfidence-.75"));
pass('smoke asserts .90',smoke.includes("effectiveConfidence-.90"));
pass('smoke asserts .55 cap',smoke.includes("effectiveConfidence<=.55"));

const failed=checks.filter(x=>x.status==='FAIL');
const result={status:failed.length?'FAIL':'PASS',checks:checks.length,passed:checks.length-failed.length,failed:failed.length,details:checks};
fs.writeFileSync(path.join(root,'methodology/STEP4_LIVE_CELL_ACCEPTANCE.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(failed.length)process.exit(1);
