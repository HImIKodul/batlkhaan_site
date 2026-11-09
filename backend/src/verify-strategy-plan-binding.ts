import { prisma } from "./db.js";
import { sha256Json } from "./lib/hash.js";
import type { FrozenStrategyPlanSnapshot } from "./strategy/index.js";

async function main(){
  const rows=await prisma.strategyPlanSnapshot.findMany({orderBy:{generatedAt:"asc"}});
  if(!rows.length)throw new Error("No strategy_plan_snapshots found");
  let checked=0;
  for(const row of rows){
    const frozen=row.snapshot as unknown as FrozenStrategyPlanSnapshot;
    if(row.schemaVersion!=="MMRI-STRATEGY-PLAN-1.0"||frozen.schemaVersion!==row.schemaVersion)throw new Error(`Schema mismatch ${row.assessmentId}`);
    if(frozen.assessmentId!==row.assessmentId||frozen.diagnosisResultHash!==row.diagnosisResultHash)throw new Error(`Identity/hash binding mismatch ${row.assessmentId}`);
    if(frozen.strategyHash!==row.strategyHash||frozen.planHash!==row.planHash)throw new Error(`Snapshot hash metadata mismatch ${row.assessmentId}`);
    const diagnosis=await prisma.diagnosisSnapshot.findUnique({where:{assessmentId:row.assessmentId}});
    if(!diagnosis||diagnosis.resultHash!==row.diagnosisResultHash)throw new Error(`Canonical diagnosis missing/mismatch ${row.assessmentId}`);
    if(diagnosis.runtimeSnapshotHash!==row.runtimeSnapshotHash||diagnosis.methodologyBundleSha256!==row.methodologyBundleSha256)throw new Error(`Diagnosis lineage mismatch ${row.assessmentId}`);
    const run=await prisma.strategyRun.findUnique({where:{assessmentId:row.assessmentId}});
    if(!run||run.diagnosisResultHash!==row.diagnosisResultHash||run.strategyHash!==row.strategyHash)throw new Error(`StrategyRun binding mismatch ${row.assessmentId}`);
    const plan=await prisma.actionPlanRecord.findUnique({where:{strategyRunId:run.id}});
    if(!plan||plan.diagnosisResultHash!==row.diagnosisResultHash||plan.planHash!==row.planHash)throw new Error(`ActionPlan binding mismatch ${row.assessmentId}`);
    const expectedStrategyHash=sha256Json({diagnosisResultHash:row.diagnosisResultHash,rootCause:frozen.rootCause,recommendations:frozen.recommendations,actionPlan:frozen.actionPlan});
    const expectedPlanHash=sha256Json({diagnosisResultHash:row.diagnosisResultHash,actionPlan:frozen.actionPlan});
    if(expectedStrategyHash!==row.strategyHash)throw new Error(`strategyHash verification failed ${row.assessmentId}`);
    if(expectedPlanHash!==row.planHash)throw new Error(`planHash verification failed ${row.assessmentId}`);
    checked++;
  }
  console.log(JSON.stringify({checked,status:"PASS",schemaVersion:"MMRI-STRATEGY-PLAN-1.0"},null,2));
}
main().finally(()=>prisma.$disconnect());
