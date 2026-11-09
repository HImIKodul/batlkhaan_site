import { prisma } from './db.js';

type CountRow={count:bigint|number};
async function scalar(sql:string){const rows=await prisma.$queryRawUnsafe<CountRow[]>(sql);return Number(rows[0]?.count??0)}

async function main(){
  const checks:Record<string,number>={};
  checks.multipleActiveAssessments=await scalar(`SELECT COUNT(*) AS count FROM (SELECT "companyId","domainCode" FROM assessments WHERE status IN ('PROFILE_PENDING','IN_PROGRESS','PAUSED','READY_FOR_COMPLETION','PROCESSING') GROUP BY "companyId","domainCode" HAVING COUNT(*)>1) x`);
  checks.duplicateProviderPaymentIds=await scalar(`SELECT COUNT(*) AS count FROM (SELECT "providerPaymentId" FROM billing_invoices WHERE "providerPaymentId" IS NOT NULL GROUP BY "providerPaymentId" HAVING COUNT(*)>1) x`);
  checks.invalidCurrentQuestionPointers=await scalar(`SELECT COUNT(*) AS count FROM assessments a LEFT JOIN assessment_asked_questions q ON q.id=a."currentQuestionIssueId" WHERE a."currentQuestionIssueId" IS NOT NULL AND (q.id IS NULL OR q."assessmentId"<>a.id)`);
  checks.invalidParentLineage=await scalar(`SELECT COUNT(*) AS count FROM assessments a LEFT JOIN assessments p ON p.id=a."parentAssessmentId" WHERE a."parentAssessmentId" IS NOT NULL AND (p.id IS NULL OR p.id=a.id OR p."companyId"<>a."companyId" OR p."domainCode"<>a."domainCode")`);
  checks.invalidPreviousLineage=await scalar(`SELECT COUNT(*) AS count FROM assessments a LEFT JOIN assessments p ON p.id=a."previousAssessmentId" WHERE a."previousAssessmentId" IS NOT NULL AND (p.id IS NULL OR p.id=a.id OR p."companyId"<>a."companyId" OR p."domainCode"<>a."domainCode")`);
  checks.entitlementCompanyDomainMismatch=await scalar(`SELECT COUNT(*) AS count FROM assessments a JOIN company_entitlements e ON e.id=a."entitlementId" WHERE a."entitlementId" IS NOT NULL AND (e."companyId"<>a."companyId" OR e."domainCode"<>a."domainCode")`);
  checks.entitlementLimitExceeded=await scalar(`SELECT COUNT(*) AS count FROM company_entitlements e JOIN (SELECT "entitlementId",COUNT(*)::INTEGER AS used_count FROM assessments WHERE "entitlementId" IS NOT NULL GROUP BY "entitlementId") x ON x."entitlementId"=e.id WHERE e."assessmentLimit" IS NOT NULL AND x.used_count>e."assessmentLimit"`);
  checks.detachedAnswerEvents=await scalar(`SELECT COUNT(*) AS count FROM answer_events e JOIN assessments a ON a.id=e."assessmentId" LEFT JOIN assessment_asked_questions qi ON qi.id=e."questionIssueId" LEFT JOIN answers ans ON ans.id=e."answerId" LEFT JOIN questions q ON q.id=e."questionId" LEFT JOIN assessment_respondents r ON r.id=e."respondentId" WHERE qi.id IS NULL OR ans.id IS NULL OR q.id IS NULL OR (e."respondentId" IS NOT NULL AND r.id IS NULL) OR qi."assessmentId"<>e."assessmentId" OR ans."assessmentId"<>e."assessmentId" OR (r.id IS NOT NULL AND r."assessmentId"<>e."assessmentId") OR qi."questionId"<>e."questionId" OR ans."questionId"<>e."questionId" OR q."methodologyVersionId"<>a."methodologyVersionId"`);
  checks.detachedDrafts=await scalar(`SELECT COUNT(*) AS count FROM response_drafts d JOIN assessments a ON a.id=d."assessmentId" LEFT JOIN assessment_asked_questions qi ON qi.id=d."questionIssueId" LEFT JOIN questions q ON q.id=d."questionId" WHERE qi.id IS NULL OR q.id IS NULL OR qi."assessmentId"<>d."assessmentId" OR qi."questionId"<>d."questionId" OR q."methodologyVersionId"<>a."methodologyVersionId"`);
  checks.answerRespondentMismatch=await scalar(`SELECT COUNT(*) AS count FROM answers a JOIN assessment_respondents r ON r.id=a."respondentId" WHERE a."respondentId" IS NOT NULL AND r."assessmentId"<>a."assessmentId"`);
  checks.evidenceAssessmentMismatch=await scalar(`SELECT COUNT(*) AS count FROM evidence_signals e JOIN answers a ON a.id=e."answerId" WHERE a."assessmentId"<>e."assessmentId"`);
  checks.reportSourceMismatch=await scalar(`SELECT COUNT(*) AS count FROM report_snapshots r LEFT JOIN assessment_state_snapshots s ON s.id=r."sourceSnapshotId" WHERE r."sourceSnapshotId" IS NOT NULL AND (s.id IS NULL OR s."assessmentId"<>r."assessmentId")`);
  checks.traceReportMismatch=await scalar(`SELECT COUNT(*) AS count FROM trace_snapshots t LEFT JOIN report_snapshots r ON r.id=t."reportSnapshotId" WHERE t."reportSnapshotId" IS NOT NULL AND (r.id IS NULL OR r."assessmentId"<>t."assessmentId")`);
  const failed=Object.entries(checks).filter(([,count])=>count!==0);
  if(failed.length)throw new Error(`Backend data integrity violations: ${failed.map(([name,count])=>`${name}=${count}`).join(', ')}`);
  console.log(JSON.stringify({status:'PASS',contract:'BACKEND-DATA-INTEGRITY-v1',checks},null,2));
}

main().finally(()=>prisma.$disconnect());
