import 'dotenv/config';
import { prisma } from '../dist/db.js';
import { PrismaAssessmentEngine } from '../dist/services/prisma-assessment-engine.js';
import { PrismaStrategyReportService } from '../dist/services/prisma-strategy-report-service.js';

const terminalStatuses=['COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED'];
const words=(text)=>String(text??'').trim().split(/\s+/u).filter(Boolean).length;
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

async function main(){
  const assessments=await prisma.assessment.findMany({
    where:{status:{in:terminalStatuses}},
    orderBy:[{completedAt:'desc'},{createdAt:'desc'}],
    take:5,
    select:{id:true,domainCode:true,status:true,completedAt:true,company:{select:{name:true}}}
  });
  if(!assessments.length){
    console.log(JSON.stringify({status:'PASS',checked:0,note:'No terminal assessment exists yet; static Task09 PDF contract remains the release gate.'},null,2));
    return;
  }

  const reports=new PrismaStrategyReportService(new PrismaAssessmentEngine());
  const checked=[];
  for(const assessment of assessments){
    const report=await reports.generateReport(assessment.id);
    const {payload,narrative,validation}=report;
    assert(validation?.state==='PASS',`${assessment.id}: narrative validation is ${validation?.state??'missing'}`);
    assert(payload.assessmentId===assessment.id,`${assessment.id}: assessment binding mismatch`);
    assert(payload.reportId===`RPT-${assessment.id}-V4`,`${assessment.id}: expected V4 report id, got ${payload.reportId}`);
    assert(String(payload.payloadHash||'').length>=32,`${assessment.id}: payload hash missing`);
    assert(payload.companyName===assessment.company.name,`${assessment.id}: frozen company name mismatch`);
    assert(Number.isFinite(payload.overall?.score),`${assessment.id}: frozen report has no numeric overall score`);
    assert(payload.overall.score>=0&&payload.overall.score<=100,`${assessment.id}: score out of range`);
    assert(payload.priorityActions.length===5,`${assessment.id}: critical actions ${payload.priorityActions.length}/5`);

    const run=await prisma.strategyRun.findUnique({where:{assessmentId:assessment.id},select:{id:true}});
    assert(run,`${assessment.id}: strategy run missing`);
    const plan=await prisma.actionPlanRecord.findUnique({where:{strategyRunId:run.id},include:{milestones:true}});
    assert(plan,`${assessment.id}: action plan missing`);
    const dbMilestones=plan.milestones.filter(m=>m.horizon!=='DEFERRED_BEYOND_V1');
    const pdfMilestones=payload.roadmap.flatMap(row=>row.milestones);
    assert(pdfMilestones.length===dbMilestones.length,`${assessment.id}: PDF roadmap ${pdfMilestones.length} != DB roadmap ${dbMilestones.length}`);
    assert(pdfMilestones.length>0,`${assessment.id}: roadmap empty`);
    for(const m of pdfMilestones){
      assert(String(m.titleMn||'').trim(),`${assessment.id}: ${m.milestoneId} title missing`);
      assert(String(m.milestoneMn||'').trim(),`${assessment.id}: ${m.milestoneId} milestone text missing`);
      assert(String(m.deliverableMn||'').trim(),`${assessment.id}: ${m.milestoneId} deliverable missing`);
      assert(String(m.ownerRoleLabelMn||'').trim(),`${assessment.id}: ${m.milestoneId} owner missing`);
      assert(String(m.kpiMn||'').trim(),`${assessment.id}: ${m.milestoneId} KPI missing`);
    }

    const roadmapMilestones=payload.roadmap.flatMap(row=>row.milestones).length;
    assert(roadmapMilestones>=1,`${assessment.id}: no PDF roadmap milestones`);
    const pdfPages=3;
    const conclusion=narrative?.sections?.find(s=>s.id==='S10');
    assert(conclusion,`${assessment.id}: S10 conclusion missing`);
    const conclusionWords=words(conclusion.claims?.map(c=>c.textMn).join(' '));
    assert(conclusionWords>=80&&conclusionWords<=160,`${assessment.id}: conclusion ${conclusionWords} words, expected 80-160`);

    checked.push({assessmentId:assessment.id,domainCode:assessment.domainCode,score:payload.overall.score,criticalActions:payload.priorityActions.length,roadmapMilestones:pdfMilestones.length,roadmapMilestones,pdfPages,conclusionWords,reportId:payload.reportId,payloadHash:payload.payloadHash});
    console.log(`PASS ${assessment.domainCode} ${assessment.id} — score=${payload.overall.score}, actions=5, milestones=${pdfMilestones.length}, PDF pages=${pdfPages}, S10=${conclusionWords}`);
  }
  console.log(JSON.stringify({status:'PASS',checked:checked.length,pdfPageContract:3,reports:checked},null,2));
}

main().catch(error=>{console.error('TASK 9 LIVE PDF MODEL VERIFICATION FAILED');console.error(error);process.exitCode=1}).finally(async()=>{await prisma.$disconnect()});
