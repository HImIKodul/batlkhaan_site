import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
const terminal=['COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED'];
const assert=(x,m)=>{if(!x)throw new Error(m)};
try{
  const rows=await prisma.assessment.findMany({where:{status:{in:terminal}},orderBy:[{companyId:'asc'},{domainCode:'asc'},{completedAt:'asc'},{createdAt:'asc'}],include:{entitlement:{select:{planCode:true}}}});
  const groups=new Map();
  for(const a of rows){const k=`${a.companyId}:${a.domainCode}`;const g=groups.get(k)||[];g.push(a);groups.set(k,g)}
  let chains=0,retakes=0;
  for(const [key,g] of groups){
    if(g.length<2)continue;
    chains++;
    const root=g[0];
    for(let i=1;i<g.length;i++){
      const a=g[i],prev=g[i-1];retakes++;
      assert(a.previousAssessmentId===prev.id,`${key}: ${a.id} previousAssessmentId mismatch`);
      assert(a.parentAssessmentId===root.id,`${key}: ${a.id} parentAssessmentId mismatch`);
      if(a.entitlement)assert(a.entitlement.planCode==='RETAKE',`${key}: ${a.id} terminal retake is not bound to RETAKE entitlement`);
    }
  }
  console.log(JSON.stringify({status:'PASS',terminalAssessments:rows.length,retakeChains:chains,retakesChecked:retakes,note:retakes===0?'No existing real retake chain yet; disposable Task10 regression remains the behavior gate.':'Existing retake lineage verified.'},null,2));
  console.log('TASK 10/12 EXISTING RETAKE LINEAGE VERIFY: PASS');
}finally{await prisma.$disconnect()}
