import { prisma } from "./db.js";
import { sha256Json } from "./lib/hash.js";
import { reportBindingMaterial } from "./report/binding.js";
import type { FrozenReportPayload, NarrativeDraft } from "./report/types.js";
import { assertFrozenReportIntegrity } from "./report/integrity.js";

async function main(){
  const rows=await prisma.reportSnapshot.findMany({where:{externalId:{endsWith:"-V4"}},orderBy:{generatedAt:"asc"}});
  let checked=0;
  for(const row of rows){
    const p=row.payload as unknown as FrozenReportPayload;
    assertFrozenReportIntegrity(p);
    const binding=sha256Json(reportBindingMaterial({diagnosisResultHash:p.diagnosisResultHash,strategyHash:p.strategyHash,planHash:p.planHash,reportContractVersion:p.reportContractVersion,aiContractVersion:p.versions.aiGeneration,findingsPolicyVersion:p.findingsPolicyVersion}));
    if(binding!==p.bindingHash||row.bindingHash!==p.bindingHash)throw new Error(`Report ${row.id}: binding hash mismatch`);
    if(row.diagnosisResultHash!==p.diagnosisResultHash||row.strategyHash!==p.strategyHash||row.planHash!==p.planHash)throw new Error(`Report ${row.id}: persisted source hashes mismatch`);
    if(sha256Json({...p,payloadHash:""})!==p.payloadHash||row.payloadHash!==p.payloadHash)throw new Error(`Report ${row.id}: payload hash mismatch`);
    if(row.publishedAt){
      if(!row.narrative||!row.narrativeHash)throw new Error(`Report ${row.id}: published narrative/hash missing`);
      if(sha256Json(row.narrative as unknown as NarrativeDraft)!==row.narrativeHash)throw new Error(`Report ${row.id}: narrative hash mismatch`);
      if(!["PASS","AI_FALLBACK_USED"].includes(row.generationState))throw new Error(`Report ${row.id}: invalid published generation state ${row.generationState}`);
      if(!row.promptVersion||!row.validatorVersion||!row.modelIdentifier)throw new Error(`Report ${row.id}: AI audit metadata incomplete`);
    }
    checked++;
  }
  console.log(JSON.stringify({status:"PASS",checked,contract:"MMRI-REPORT-PAYLOAD-1.3"},null,2));
}
main().finally(()=>prisma.$disconnect());
