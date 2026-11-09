import { prisma } from "./db.js";
import { allDomainMethodologyTargets } from "./domain-methodology.js";

if(process.env.MMRI_FIVE_DOMAIN_PROMOTION_OK!=="YES") throw new Error("Set MMRI_FIVE_DOMAIN_PROMOTION_OK=YES after verification.");
const env=(process.env.MMRI_ENVIRONMENT??"").toLowerCase();
if(!env) throw new Error("MMRI_ENVIRONMENT required");
if(env==="production"&&process.env.MMRI_PRODUCTION_PROMOTION_OK!=="YES") throw new Error("Production promotion requires MMRI_PRODUCTION_PROMOTION_OK=YES");
const targets=allDomainMethodologyTargets();
try {
  const rows=await prisma.methodologyVersion.findMany({where:{version:{in:targets.map(t=>t.methodologyVersion)}}});
  if(rows.length!==5) throw new Error(`Expected 5 candidate methodologies, found ${rows.length}`);
  for(const t of targets){
    const r=rows.find(x=>x.version===t.methodologyVersion);
    if(!r||r.domainCode!==t.domainCode||r.bundleSha256!==t.bundleSha256) throw new Error(`${t.domainCode}: version/domain/SHA mismatch`);
    if(!["VALIDATING","ACTIVE"].includes(r.status)) throw new Error(`${t.domainCode}: unexpected status ${r.status}`);
    const [m,c,dc,q,qp,cp,run]=await Promise.all([
      prisma.module.count({where:{methodologyVersionId:r.id}}),
      prisma.category.count({where:{methodologyVersionId:r.id}}),
      prisma.diagnosticCell.count({where:{methodologyVersionId:r.id}}),
      prisma.question.count({where:{methodologyVersionId:r.id}}),
      prisma.questionRuntimePolicy.count({where:{methodologyVersionId:r.id}}),
      prisma.cellRuntimePolicy.count({where:{methodologyVersionId:r.id}}),
      prisma.importRun.findFirst({where:{methodologyVersionId:r.id,status:"PASS",bundleSha256:r.bundleSha256}})
    ]);
    const expectedModules=t.domainCode==="marketing"?8:5;
    if(`${m},${c},${dc},${q},${qp},${cp}`!==`${expectedModules},64,3072,12288,12288,3072`||!run) throw new Error(`${t.domainCode}: imported structure incomplete`);
  }
  await prisma.$transaction(async tx=>{
    for(const t of targets){
      const r=rows.find(x=>x.version===t.methodologyVersion)!;
      await tx.methodologyVersion.updateMany({where:{domainCode:t.domainCode,status:"ACTIVE",id:{not:r.id}},data:{status:"ARCHIVED"}});
      if(r.status!=="ACTIVE") await tx.methodologyVersion.update({where:{id:r.id},data:{status:"ACTIVE",activatedAt:new Date()}});
    }
  });
  console.log(JSON.stringify({status:"PASS",rollback:"PREVIOUS_ACTIVE_VERSIONS_ARCHIVED",active:targets.map(t=>`${t.domainCode}:${t.methodologyVersion}`)},null,2));
} finally { await prisma.$disconnect(); }
