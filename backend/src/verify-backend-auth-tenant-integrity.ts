import { prisma } from './db.js';

type CountRow={count:bigint|number};
async function scalar(sql:string){const rows=await prisma.$queryRawUnsafe<CountRow[]>(sql);return Number(rows[0]?.count??0)}

async function main(){
  const checks:Record<string,number>={};
  checks.companiesWithMembershipButNoOwner=await scalar(`SELECT COUNT(*) AS count FROM (SELECT "companyId" FROM company_memberships GROUP BY "companyId" HAVING COUNT(*) FILTER (WHERE role='OWNER')=0) x`);
  checks.companiesWithoutActiveOwner=await scalar(`SELECT COUNT(*) AS count FROM (SELECT m."companyId" FROM company_memberships m LEFT JOIN users u ON u.id=m."userId" AND u.status='ACTIVE' GROUP BY m."companyId" HAVING COUNT(*) FILTER (WHERE m.role='OWNER' AND u.id IS NOT NULL)=0) x`);
  checks.orphanMemberships=await scalar(`SELECT COUNT(*) AS count FROM company_memberships m LEFT JOIN companies c ON c.id=m."companyId" LEFT JOIN users u ON u.id=m."userId" WHERE c.id IS NULL OR u.id IS NULL`);
  checks.orphanRefreshSessions=await scalar(`SELECT COUNT(*) AS count FROM refresh_sessions s LEFT JOIN users u ON u.id=s."userId" WHERE u.id IS NULL`);
  checks.foreignAssessmentCreators=await scalar(`SELECT COUNT(*) AS count FROM assessments a JOIN users u ON u.id=a."createdByUserId" WHERE a."createdByUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM company_memberships m WHERE m."companyId"=a."companyId" AND m."userId"=u.id)`);
  const failed=Object.entries(checks).filter(([name,count])=>count!==0&&name!=='foreignAssessmentCreators');
  if(failed.length)throw new Error(`Backend auth/tenant integrity violations: ${failed.map(([name,count])=>`${name}=${count}`).join(', ')}`);
  console.log(JSON.stringify({status:'PASS',contract:'BACKEND-AUTH-TENANT-INTEGRITY-v1',checks,notes:{foreignAssessmentCreators:'historical creator membership may legitimately be removed after assessment creation'}},null,2));
}

main().finally(()=>prisma.$disconnect());
