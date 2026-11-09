import 'dotenv/config';
import { prisma } from '../dist/db.js';
import { PrismaAssessmentEngine } from '../dist/services/prisma-assessment-engine.js';
import { PrismaStrategyReportService } from '../dist/services/prisma-strategy-report-service.js';
import { MethodologyDefinitionCache } from '../dist/services/methodology-cache.js';
import { runStrategyPipeline } from '../dist/strategy/index.js';

const TERMINAL=['COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED'];
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const profileAnswers=(profile)=>Array.isArray(profile?.answers)?profile.answers:[];
const actionCount=(payload)=>Array.isArray(payload?.priorityActions)?payload.priorityActions.length:0;

async function main(){
  const env=String(process.env.MMRI_ENVIRONMENT??'').toLowerCase();
  assert(['integration','development','test'].includes(env),`Refusing pre-pilot derived-artifact repair in MMRI_ENVIRONMENT=${env||'<unset>'}`);

  const rows=await prisma.assessment.findMany({
    where:{status:{in:TERMINAL}},
    orderBy:[{completedAt:'desc'},{createdAt:'desc'}],
    take:20,
    select:{id:true,domainCode:true,status:true,profile:true,pilotLink:{select:{id:true}},strategyRun:{select:{id:true,actionPlan:{select:{milestones:{select:{status:true,progressPercent:true,noteMn:true,delayReasonMn:true,actualStartDate:true,actualCompletedDate:true}}}}}},reportSnapshots:{where:{externalId:{endsWith:'-V3'}},orderBy:{generatedAt:'desc'},take:1,select:{id:true,externalId:true,payload:true,generationState:true,publishedAt:true}}}
  });

  const engine=new PrismaAssessmentEngine();
  const cache=new MethodologyDefinitionCache(prisma);
  const stale=[];

  for(const row of rows){
    const old=row.reportSnapshots[0];
    if(!old) continue;
    if(actionCount(old.payload)>=5) continue;

    assert(!row.pilotLink,`${row.id}: formal-pilot-linked assessment cannot be auto-repaired`);
    const tracked=row.strategyRun?.actionPlan?.milestones?.some(m=>m.progressPercent>0||m.status!=='NOT_STARTED'||m.noteMn||m.delayReasonMn||m.actualStartDate||m.actualCompletedDate);
    assert(!tracked,`${row.id}: action-plan tracking already exists; refusing destructive pre-pilot rebuild`);

    const assessment=await prisma.assessment.findUnique({where:{id:row.id},select:{methodologyVersionId:true}});
    assert(assessment,`${row.id}: assessment disappeared`);
    const methodology=await cache.get(assessment.methodologyVersionId);
    const snapshot=await engine.getRuntimeSnapshot(row.id);
    const strategy=runStrategyPipeline({methodology,snapshot,profileAnswers:profileAnswers(row.profile)});
    const freshActions=strategy.recommendations.executionActions.length;
    const freshMilestones=strategy.actionPlan.milestones.filter(m=>m.horizon!=='DEFERRED_BEYOND_V1').length;
    assert(freshActions>=5,`${row.id}: current engine still produces only ${freshActions} execution actions; refusing rebuild`);
    assert(freshMilestones>0,`${row.id}: current engine produces no reportable roadmap milestones; refusing rebuild`);
    stale.push({id:row.id,domainCode:row.domainCode,oldReportId:old.externalId,oldActions:actionCount(old.payload),freshActions,freshMilestones});
  }

  if(!stale.length){
    console.log(JSON.stringify({status:'PASS',repaired:0,note:'No stale pre-Task7 V3 derived artifacts found.'},null,2));
    return;
  }

  console.log('PRE-FLIGHT PASS — stale pre-pilot derived artifacts:');
  for(const x of stale) console.log(`  ${x.domainCode} ${x.id}: ${x.oldReportId} actions=${x.oldActions}; current engine actions=${x.freshActions}, milestones=${x.freshMilestones}`);

  const repaired=[];
  for(const x of stale){
    await prisma.$transaction(async tx=>{
      // Preserve V3 ReportSnapshot + TRACE-RPT-...-V3 for immutable audit history.
      // Rebuild only assessment-derived strategy/diagnosis artifacts that were frozen
      // before the Task7 recommendation adapter correction.
      await tx.strategyPlanSnapshot.deleteMany({where:{assessmentId:x.id}});
      await tx.diagnosisSnapshot.deleteMany({where:{assessmentId:x.id}});
      await tx.strategyRun.deleteMany({where:{assessmentId:x.id}}); // cascades roots/recommendations/plan/milestones
      await tx.auditEvent.create({data:{assessmentId:x.id,eventType:'PREPILOT_DERIVED_ARTIFACT_REBUILD',entityType:'Assessment',entityId:x.id,payload:{reason:'TASK09_STALE_PRE_TASK7_STRATEGY',preservedReportId:x.oldReportId,targetReportVersion:'V4'}}});
    },{maxWait:10000,timeout:30000});

    const reports=new PrismaStrategyReportService(new PrismaAssessmentEngine());
    const rebuilt=await reports.generateReport(x.id);
    assert(rebuilt.payload.reportId===`RPT-${x.id}-V4`,`${x.id}: rebuilt report is ${rebuilt.payload.reportId}, expected V4`);
    assert(rebuilt.payload.priorityActions.length===5,`${x.id}: rebuilt V4 actions ${rebuilt.payload.priorityActions.length}/5`);
    assert(rebuilt.validation?.state==='PASS',`${x.id}: rebuilt narrative validation ${rebuilt.validation?.state??'missing'}`);
    repaired.push({assessmentId:x.id,domainCode:x.domainCode,preservedV3:x.oldReportId,newV4:rebuilt.payload.reportId,actions:rebuilt.payload.priorityActions.length,roadmap:rebuilt.payload.roadmap.flatMap(r=>r.milestones).length});
    console.log(`REPAIRED ${x.domainCode} ${x.id} — preserved ${x.oldReportId}; created ${rebuilt.payload.reportId}; actions=5`);
  }

  console.log(JSON.stringify({status:'PASS',repaired:repaired.length,reports:repaired},null,2));
}

main().catch(error=>{console.error('TASK 9 STALE DERIVED-ARTIFACT REPAIR FAILED');console.error(error);process.exitCode=1}).finally(async()=>{await prisma.$disconnect()});
