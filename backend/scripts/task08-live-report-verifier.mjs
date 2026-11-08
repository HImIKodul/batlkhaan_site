import "dotenv/config";
import { prisma } from "../dist/db.js";
import { PrismaAssessmentEngine } from "../dist/services/prisma-assessment-engine.js";
import { PrismaStrategyReportService } from "../dist/services/prisma-strategy-report-service.js";

const terminalStatuses=["COMPLETED","COMPLETED_WITH_REVIEW","EXHAUSTED"];
const words=(text)=>String(text??"").trim().split(/\s+/u).filter(Boolean).length;
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

async function main(){
  const assessments=await prisma.assessment.findMany({
    where:{status:{in:terminalStatuses},methodologyVersion:{status:"ACTIVE"}},
    orderBy:[{completedAt:"desc"},{createdAt:"desc"}],
    take:5,
    select:{id:true,domainCode:true,methodologyVersionId:true,status:true}
  });

  if(!assessments.length){
    console.log(JSON.stringify({status:"PASS",checked:0,note:"No terminal assessment exists yet; static Task08 contract remains the release gate."},null,2));
    return;
  }

  const reports=new PrismaStrategyReportService(new PrismaAssessmentEngine());
  const checked=[];

  for(const assessment of assessments){
    const report=await reports.generateReport(assessment.id);
    const {payload,narrative,validation}=report;

    assert(payload.assessmentId===assessment.id,`${assessment.id}: report/assessment binding mismatch`);
    assert(payload.reportId===`RPT-${assessment.id}-V3`,`${assessment.id}: expected V3 report id, got ${payload.reportId}`);
    assert(payload.payloadVersion==="MMRI-REPORT-PAYLOAD-1.2",`${assessment.id}: expected payload v1.2`);
    assert(validation?.state==="PASS",`${assessment.id}: narrative validation is ${validation?.state??"missing"}`);

    const purposeCount=await prisma.purposeDefinition.count({where:{methodologyVersionId:assessment.methodologyVersionId}});
    assert(payload.purposes.length===purposeCount,`${assessment.id}: payload purposes ${payload.purposes.length} != methodology ${purposeCount}`);

    const run=await prisma.strategyRun.findUnique({where:{assessmentId:assessment.id},select:{id:true}});
    assert(run,`${assessment.id}: strategy run missing`);
    const plan=await prisma.actionPlanRecord.findUnique({
      where:{strategyRunId:run.id},
      include:{milestones:{orderBy:[{horizon:"asc"},{phaseIndex:"asc"},{externalId:"asc"}]}}
    });
    assert(plan,`${assessment.id}: action plan missing`);

    const payloadMilestones=payload.roadmap.flatMap((row)=>row.milestones);
    const reportableDbMilestones=plan.milestones.filter((m)=>m.horizon!=="DEFERRED_BEYOND_V1");
    assert(payloadMilestones.length===reportableDbMilestones.length,`${assessment.id}: roadmap milestone count ${payloadMilestones.length} != DB ${reportableDbMilestones.length}`);
    for(const milestone of payloadMilestones){
      assert(String(milestone.deliverableMn??"").trim().length>0,`${assessment.id}: ${milestone.milestoneId} deliverable missing`);
      assert(String(milestone.ownerRoleLabelMn??"").trim().length>0,`${assessment.id}: ${milestone.milestoneId} owner label missing`);
      assert(String(milestone.kpiMn??"").trim().length>0,`${assessment.id}: ${milestone.milestoneId} KPI missing`);
    }

    const conclusion=narrative?.sections?.find((section)=>section.id==="S10");
    assert(conclusion,`${assessment.id}: S10 conclusion missing`);
    const conclusionWords=words(conclusion.claims?.map((claim)=>claim.textMn).join(" "));
    assert(conclusionWords>=80&&conclusionWords<=160,`${assessment.id}: S10 must be 80-160 words (validator V27), got ${conclusionWords}`);

    checked.push({
      assessmentId:assessment.id,
      domainCode:assessment.domainCode,
      purposes:payload.purposes.length,
      roadmapMilestones:payloadMilestones.length,
      conclusionWords,
      validation:validation.state,
      generationState:report.generationState
    });
    console.log(`PASS ${assessment.domainCode} ${assessment.id} — purposes=${payload.purposes.length}, milestones=${payloadMilestones.length}, S10=${conclusionWords} words`);
  }

  console.log(JSON.stringify({status:"PASS",checked:checked.length,reports:checked},null,2));
}

main().catch((error)=>{
  console.error("TASK 8 LIVE REPORT VERIFICATION FAILED");
  console.error(error);
  process.exitCode=1;
}).finally(async()=>{
  await prisma.$disconnect();
});
