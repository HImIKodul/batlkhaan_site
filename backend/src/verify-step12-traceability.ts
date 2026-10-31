import { prisma } from "./db.js";
import { sha256Json } from "./lib/hash.js";

async function rows(sql:string){ return prisma.$queryRawUnsafe<any[]>(sql); }
function assert(ok:boolean,msg:string){ if(!ok)throw new Error(msg); }

async function main(){
  const columns=await rows(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('answer_events','assessment_state_snapshots','report_snapshots','trace_snapshots')`);
  const have=new Set(columns.map(r=>`${r.table_name}.${r.column_name}`));
  for(const key of [
    'answer_events.questionExternalId','answer_events.primaryCategoryExternalId','answer_events.primaryCellExternalId','answer_events.questionPath','answer_events.sourceKindSnapshot','answer_events.normalizedScore',
    'assessment_state_snapshots.versionBundleId','assessment_state_snapshots.versionBundleHash','assessment_state_snapshots.traceVersion',
    'report_snapshots.sourceSnapshotId','report_snapshots.sourceSnapshotHash','report_snapshots.versionBundleId','report_snapshots.versionBundleHash','report_snapshots.traceVersion','report_snapshots.traceGraphHash',
    'trace_snapshots.graphHash','trace_snapshots.graph','trace_snapshots.sourceSnapshotHash','trace_snapshots.versionBundleHash'
  ]) assert(have.has(key),`Missing Step-12 column ${key}`);

  const missingAnswerTrace=await rows(`SELECT COUNT(*)::int AS n FROM answer_events WHERE "questionExternalId" IS NULL OR "primaryCategoryExternalId" IS NULL OR "primaryCellExternalId" IS NULL OR "questionPath" IS NULL OR "sourceKindSnapshot" IS NULL`);
  assert(Number(missingAnswerTrace[0]?.n??0)===0,'AnswerEvent trace mapping backfill incomplete');
  const missingSnapshotPins=await rows(`SELECT COUNT(*)::int AS n FROM assessment_state_snapshots WHERE "versionBundleId" IS NULL OR "versionBundleHash" IS NULL OR "traceVersion"<>'MMRI-TRACE-1.0'`);
  assert(Number(missingSnapshotPins[0]?.n??0)===0,'State snapshot version pins incomplete');
  const published=await rows(`SELECT r."id",r."assessmentId",r."traceGraphHash",r."sourceSnapshotHash",r."versionBundleHash",t."graphHash",t."graph" FROM report_snapshots r LEFT JOIN trace_snapshots t ON t."reportSnapshotId"=r."id" WHERE r."publishedAt" IS NOT NULL`);
  for(const r of published){
    assert(Boolean(r.traceGraphHash),'Published report missing traceGraphHash');
    assert(r.traceGraphHash===r.graphHash,'Published report traceGraphHash mismatch');
    assert(Boolean(r.sourceSnapshotHash&&r.versionBundleHash),'Published report missing snapshot/version hash');
    assert(sha256Json(r.graph)===r.graphHash,'Frozen trace graph JSON hash mismatch');
  }
  console.log(JSON.stringify({status:'PASS',traceVersion:'MMRI-TRACE-1.0',publishedReportsChecked:published.length},null,2));
}
main().finally(()=>prisma.$disconnect());
