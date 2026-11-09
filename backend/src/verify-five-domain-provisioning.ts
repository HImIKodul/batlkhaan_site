import { prisma } from "./db.js";
import { allDomainMethodologyTargets } from "./domain-methodology.js";

// Read-only. MMRI_EXPECT_DOMAIN_STATUS: ACTIVE (default, production-ready) | VALIDATING (imported, not yet promoted) | ANY.
const expect=(process.env.MMRI_EXPECT_DOMAIN_STATUS??"ACTIVE").toUpperCase();
if(!["ACTIVE","VALIDATING","ANY"].includes(expect)) throw new Error("MMRI_EXPECT_DOMAIN_STATUS must be ACTIVE, VALIDATING or ANY");
const failures:string[]=[]; const rows:Record<string,unknown>[]=[]; let totalQuestions=0;
try {
  for(const t of allDomainMethodologyTargets()){
    const r=await prisma.methodologyVersion.findUnique({where:{version:t.methodologyVersion}});
    if(!r){failures.push(`${t.domainCode}: methodology ${t.methodologyVersion} not installed`); continue;}
    const [m,c,dc,q,qp,cp,run,activeCount]=await Promise.all([
      prisma.module.count({where:{methodologyVersionId:r.id}}),
      prisma.category.count({where:{methodologyVersionId:r.id}}),
      prisma.diagnosticCell.count({where:{methodologyVersionId:r.id}}),
      prisma.question.count({where:{methodologyVersionId:r.id}}),
      prisma.questionRuntimePolicy.count({where:{methodologyVersionId:r.id}}),
      prisma.cellRuntimePolicy.count({where:{methodologyVersionId:r.id}}),
      prisma.importRun.findFirst({where:{methodologyVersionId:r.id,status:"PASS",bundleSha256:r.bundleSha256}}),
      prisma.methodologyVersion.count({where:{domainCode:t.domainCode,status:"ACTIVE"}})
    ]);
    totalQuestions+=q;
    const expectedModules=t.domainCode==="marketing"?8:5;
    if(r.domainCode!==t.domainCode) failures.push(`${t.domainCode}: stored domainCode is ${r.domainCode}`);
    if(r.bundleSha256!==t.bundleSha256) failures.push(`${t.domainCode}: bundle SHA-256 does not match the pinned target`);
    if(!run) failures.push(`${t.domainCode}: no PASS import run bound to the bundle SHA-256`);
    if(`${m},${c},${dc},${q},${qp},${cp}`!==`${expectedModules},64,3072,12288,12288,3072`) failures.push(`${t.domainCode}: structure ${m} modules/${c} capabilities/${dc} cells/${q} questions/${qp} question policies/${cp} cell policies (expected ${expectedModules}/64/3072/12288/12288/3072)`);
    if(expect!=="ANY"&&r.status!==expect) failures.push(`${t.domainCode}: status ${r.status}, expected ${expect}`);
    if(r.status==="ACTIVE"&&activeCount!==1) failures.push(`${t.domainCode}: ${activeCount} ACTIVE methodologies (expected exactly 1)`);
    if(r.status!=="ACTIVE"&&expect==="ACTIVE") failures.push(`${t.domainCode}: not ACTIVE`);
    rows.push({domain:t.domainCode,version:t.methodologyVersion,status:r.status,modules:m,capabilities:c,cells:dc,questions:q});
  }
  if(totalQuestions!==61440) failures.push(`total questions across the five target bundles is ${totalQuestions}, expected 61440`);
  const out={status:failures.length?"FAIL":"PASS",expectedStatus:expect,totalQuestions,domains:rows,failures};
  console.log(JSON.stringify(out,null,2));
  if(failures.length) process.exitCode=1;
} finally { await prisma.$disconnect(); }
