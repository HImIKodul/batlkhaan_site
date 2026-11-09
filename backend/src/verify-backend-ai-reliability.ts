import { prisma } from "./db.js";

function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message)}

async function main(){
  const columns=await prisma.$queryRawUnsafe<Array<{column_name:string}>>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='report_snapshots'
  `);
  const names=new Set(columns.map(x=>x.column_name));
  for(const name of ["providerHttpAttemptCount","providerRetryCount","providerRequestIds","nextAiRetryAt","generationLeaseId","generationLeaseExpiresAt","generationStartedAt","generationCompletedAt","generationFailureCount"]){
    assert(names.has(name),`Missing report_snapshots.${name}`);
  }
  const constraints=await prisma.$queryRawUnsafe<Array<{conname:string}>>(`
    SELECT conname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    WHERE t.relname='report_snapshots'
  `);
  const constraintNames=new Set(constraints.map(x=>x.conname));
  for(const name of ["report_snapshots_provider_attempts_nonnegative_ck","report_snapshots_retry_not_gt_attempts_ck","report_snapshots_lease_pair_ck"]){
    assert(constraintNames.has(name),`Missing DB constraint ${name}`);
  }
  const invalid=await prisma.$queryRawUnsafe<Array<{id:string;reason:string}>>(`
    SELECT id,
      CASE
        WHEN "generationAttemptCount" < 0 OR "providerHttpAttemptCount" < 0 OR "providerRetryCount" < 0 OR "generationFailureCount" < 0 THEN 'negative_attempt_count'
        WHEN "providerRetryCount" > "providerHttpAttemptCount" THEN 'retry_gt_attempts'
        WHEN (("generationLeaseId" IS NULL) <> ("generationLeaseExpiresAt" IS NULL)) THEN 'lease_pair_mismatch'
        WHEN "providerRequestIds" IS NOT NULL AND jsonb_typeof("providerRequestIds") <> 'array' THEN 'request_ids_not_array'
        ELSE 'unknown'
      END AS reason
    FROM report_snapshots
    WHERE "generationAttemptCount" < 0 OR "providerHttpAttemptCount" < 0 OR "providerRetryCount" < 0 OR "generationFailureCount" < 0
       OR "providerRetryCount" > "providerHttpAttemptCount"
       OR (("generationLeaseId" IS NULL) <> ("generationLeaseExpiresAt" IS NULL))
       OR ("providerRequestIds" IS NOT NULL AND jsonb_typeof("providerRequestIds") <> 'array')
  `);
  assert(invalid.length===0,`Invalid AI generation persistence rows: ${JSON.stringify(invalid.slice(0,10))}`);
  const expired=await prisma.$queryRawUnsafe<Array<{id:string;assessmentId:string}>>(`
    SELECT id, "assessmentId" FROM report_snapshots
    WHERE "generationLeaseId" IS NOT NULL AND "generationLeaseExpiresAt" < NOW()
  `);
  console.log(JSON.stringify({status:"PASS",columnsVerified:9,constraintsVerified:3,invalidRows:0,expiredRecoverableLeases:expired.length,expiredLeaseSample:expired.slice(0,5)},null,2));
}
main().catch(e=>{console.error("BACKEND STEP 11 AI RELIABILITY DB VERIFY FAILED");console.error(e);process.exitCode=1}).finally(async()=>{await prisma.$disconnect()});
