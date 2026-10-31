import { prisma } from "./db.js";

const assessmentId=process.argv[2];
const targetVersion=process.env.MMRI_EXPECT_METHODOLOGY_VERSION ?? "3.0.0";
const assessment=assessmentId
  ? await prisma.assessment.findUnique({where:{id:assessmentId},include:{methodologyVersion:true}})
  : await prisma.assessment.findFirst({where:{methodologyVersion:{version:targetVersion}},orderBy:{updatedAt:"desc"},include:{methodologyVersion:true}});
if(!assessment)throw new Error(`No ${targetVersion} assessment found for outcome-priority verification`);

const [purposes,purposeResults,priorityRows,categories]=await Promise.all([
  prisma.purposeDefinition.findMany({where:{methodologyVersionId:assessment.methodologyVersionId},orderBy:{orderIndex:"asc"}}),
  prisma.purposeResult.findMany({where:{assessmentId:assessment.id}}),
  prisma.categoryOutcomePriorityResult.findMany({where:{assessmentId:assessment.id},orderBy:[{purposeId:"asc"},{rank:"asc"}]}),
  prisma.category.findMany({where:{methodologyVersionId:assessment.methodologyVersionId}})
]);
const close=(a:number,b:number,t=.01)=>Math.abs(a-b)<=t;
const req=(v:boolean,m:string)=>{if(!v)throw new Error(m)};
const num=(x:any)=>x===null||x===undefined?null:Number(x);
req(purposes.length===5,`Expected five purpose definitions, got ${purposes.length}`);
req(purposeResults.length===5,`Expected five purpose results, got ${purposeResults.length}`);
req(priorityRows.length<=320,`Priority rows exceed 320: ${priorityRows.length}`);
for(const result of purposeResults){
  req(result.calculationVersion==="OUTCOME_PRIORITY_V13",`Purpose ${result.purposeId} has ${result.calculationVersion}`);
  const gap=num(result.knownGap),score=num(result.partialScore),confirmed=num(result.confidenceAdjustedKnownGap),uncertain=num(result.uncertaintyKnownGap);
  if(gap!==null&&score!==null)req(close(gap,100-score),`Purpose ${result.purposeId} gap does not equal 100-score`);
  if(gap!==null&&confirmed!==null&&uncertain!==null)req(close(confirmed+uncertain,gap),`Purpose ${result.purposeId} confirmed+uncertain gap mismatch`);
  req(result.rankedCategoryCount>=0&&result.rankedCategoryCount<=64,`Purpose ${result.purposeId} invalid rankedCategoryCount`);
}
for(const purpose of purposes){
  const rows=priorityRows.filter(r=>r.purposeId===purpose.id);
  if(!rows.length)continue;
  const weightTotal=rows.reduce((s,r)=>s+Number(r.effectivePurposeWeightPct),0);
  req(close(weightTotal,100),`Purpose ${purpose.externalId} effective weights total ${weightTotal}`);
  const result=purposeResults.find(r=>r.purposeId===purpose.id)!;
  const gap=num(result.knownGap);
  if(gap!==null)req(close(rows.reduce((s,r)=>s+Number(r.gapContribution),0),gap),`Purpose ${purpose.externalId} priority gap contributions mismatch`);
  req(rows[0].rank===1,`Purpose ${purpose.externalId} does not start at rank 1`);
  req(close(Number(rows[0].relativePriority),1,.0001)||Number(rows[0].gapContribution)===0,`Purpose ${purpose.externalId} top relative priority not 1`);
}
req(new Set(priorityRows.map(r=>r.categoryId)).size<=categories.length,"Priority rows reference too many categories");
console.log(JSON.stringify({status:"PASS",assessmentId:assessment.id,purposeResults:purposeResults.length,categoryOutcomePriorityRows:priorityRows.length,calculationVersion:"OUTCOME_PRIORITY_V13"},null,2));
await prisma.$disconnect();
