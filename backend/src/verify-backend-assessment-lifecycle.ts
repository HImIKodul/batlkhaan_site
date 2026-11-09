import { prisma } from './db.js';

type CountRow={count:bigint|number};
async function scalar(sql:string){const rows=await prisma.$queryRawUnsafe<CountRow[]>(sql);return Number(rows[0]?.count??0)}

async function main(){
  const checks:Record<string,number>={};
  checks.multipleIssuedQuestions=await scalar(`SELECT COUNT(*) AS count FROM (SELECT "assessmentId" FROM assessment_asked_questions WHERE status='ISSUED' GROUP BY "assessmentId" HAVING COUNT(*)>1) x`);
  checks.invalidCurrentQuestionPointer=await scalar(`SELECT COUNT(*) AS count FROM assessments a LEFT JOIN assessment_asked_questions q ON q.id=a."currentQuestionIssueId" WHERE a."currentQuestionIssueId" IS NOT NULL AND (q.id IS NULL OR q."assessmentId"<>a.id OR q.status<>'ISSUED')`);
  checks.profilePendingWithRuntimeState=await scalar(`SELECT COUNT(*) AS count FROM assessments WHERE status='PROFILE_PENDING' AND ("startedAt" IS NOT NULL OR "completedAt" IS NOT NULL OR "pausedAt" IS NOT NULL OR "currentQuestionIssueId" IS NOT NULL OR "activeWriterLeaseId" IS NOT NULL OR "writerLeaseExpiresAt" IS NOT NULL)`);
  checks.inProgressWithoutStartedAt=await scalar(`SELECT COUNT(*) AS count FROM assessments WHERE status='IN_PROGRESS' AND "startedAt" IS NULL`);
  checks.inProgressWithTerminalTimestamp=await scalar(`SELECT COUNT(*) AS count FROM assessments WHERE status='IN_PROGRESS' AND ("completedAt" IS NOT NULL OR "pausedAt" IS NOT NULL)`);
  checks.pausedInvalidState=await scalar(`SELECT COUNT(*) AS count FROM assessments WHERE status='PAUSED' AND ("startedAt" IS NULL OR "pausedAt" IS NULL OR "completedAt" IS NOT NULL OR "activeWriterLeaseId" IS NOT NULL OR "writerLeaseExpiresAt" IS NOT NULL)`);
  checks.resultTerminalMissingCompletedAt=await scalar(`SELECT COUNT(*) AS count FROM assessments WHERE status IN ('COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED') AND "completedAt" IS NULL`);
  checks.resultTerminalWithWriterState=await scalar(`SELECT COUNT(*) AS count FROM assessments WHERE status IN ('COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED') AND ("currentQuestionIssueId" IS NOT NULL OR "activeWriterLeaseId" IS NOT NULL OR "writerLeaseExpiresAt" IS NOT NULL OR "pausedAt" IS NOT NULL OR "resumeState" IS NOT NULL)`);
  checks.resultTerminalWithIssuedQuestion=await scalar(`SELECT COUNT(*) AS count FROM assessments a WHERE a.status IN ('COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED') AND EXISTS (SELECT 1 FROM assessment_asked_questions q WHERE q."assessmentId"=a.id AND q.status='ISSUED')`);
  checks.resultTerminalWithDraft=await scalar(`SELECT COUNT(*) AS count FROM assessments a JOIN response_drafts d ON d."assessmentId"=a.id WHERE a.status IN ('COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED')`);
  checks.resultTerminalMissingSnapshot=await scalar(`SELECT COUNT(*) AS count FROM assessments a WHERE a.status IN ('COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED') AND NOT EXISTS (SELECT 1 FROM assessment_state_snapshots s WHERE s."assessmentId"=a.id)`);
  checks.cancelledWithActiveWriterState=await scalar(`SELECT COUNT(*) AS count FROM assessments WHERE status='CANCELLED' AND ("currentQuestionIssueId" IS NOT NULL OR "activeWriterLeaseId" IS NOT NULL OR "writerLeaseExpiresAt" IS NOT NULL)`);
  const failed=Object.entries(checks).filter(([,count])=>count!==0);
  if(failed.length)throw new Error(`Assessment lifecycle integrity violations: ${failed.map(([name,count])=>`${name}=${count}`).join(', ')}`);
  console.log(JSON.stringify({status:'PASS',contract:'BACKEND-ASSESSMENT-LIFECYCLE-v1',checks},null,2));
}

main().finally(()=>prisma.$disconnect());
