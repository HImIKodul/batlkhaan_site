import { prisma } from './db.js';

type CountRow={count:bigint|number};
async function scalar(sql:string){const rows=await prisma.$queryRawUnsafe<CountRow[]>(sql);return Number(rows[0]?.count??0)}
async function main(){
  const requiredColumns=['assessmentRevision','routingRevision','eventSequence','profileRevision','currentQuestionIssueId','resumeState','activeWriterLeaseId','writerLeaseExpiresAt','lastMaterializedAnswerEventSequence'];
  for(const c of requiredColumns){const n=await scalar(`SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='assessments' AND column_name='${c}'`);if(n!==1)throw new Error(`Missing assessments.${c}`)}
  for(const table of ['answer_events','response_drafts','assessment_state_snapshots']){const n=await scalar(`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}'`);if(n!==1)throw new Error(`Missing ${table}`)}
  const duplicateOpen=await scalar(`SELECT COUNT(*) AS count FROM (SELECT "assessmentId" FROM assessment_asked_questions WHERE status='ISSUED' GROUP BY "assessmentId" HAVING COUNT(*)>1) x`);
  if(duplicateOpen)throw new Error(`Multiple open question issues: ${duplicateOpen}`);
  const pointerMismatch=await scalar(`SELECT COUNT(*) AS count FROM assessments a JOIN assessment_asked_questions q ON q.id=a."currentQuestionIssueId" WHERE q."assessmentId"<>a.id OR q.status<>'ISSUED'`);
  if(pointerMismatch)throw new Error(`Invalid currentQuestionIssueId pointers: ${pointerMismatch}`);
  const unpointedOpen=await scalar(`SELECT COUNT(*) AS count FROM assessment_asked_questions q JOIN assessments a ON a.id=q."assessmentId" WHERE q.status='ISSUED' AND a."currentQuestionIssueId" IS DISTINCT FROM q.id`);
  if(unpointedOpen)throw new Error(`Open issue not pointed by assessment: ${unpointedOpen}`);
  const badDraft=await scalar(`SELECT COUNT(*) AS count FROM response_drafts d LEFT JOIN assessment_asked_questions q ON q.id=d."questionIssueId" WHERE q.id IS NULL OR q.status<>'ISSUED' OR q."assessmentId"<>d."assessmentId"`);
  if(badDraft)throw new Error(`Drafts detached from an issued question: ${badDraft}`);
  const missingCanonical=await scalar(`SELECT COUNT(*) AS count FROM answers a LEFT JOIN answer_events e ON e."assessmentId"=a."assessmentId" AND e."questionId"=a."questionId" WHERE a.active=TRUE AND e.id IS NULL`);
  if(missingCanonical)throw new Error(`Accepted answers missing canonical AnswerEvent: ${missingCanonical}`);
  const duplicateRequests=await scalar(`SELECT COUNT(*) AS count FROM (SELECT "assessmentId","clientRequestId" FROM answer_events GROUP BY "assessmentId","clientRequestId" HAVING COUNT(*)>1) x`);
  // Multiple immutable events for one question are valid after R2 corrections/retractions.
  const multiEventQuestionChains=await scalar(`SELECT COUNT(*) AS count FROM (SELECT "assessmentId","questionId" FROM answer_events GROUP BY "assessmentId","questionId" HAVING COUNT(*)>1) x`);
  const duplicateSeq=await scalar(`SELECT COUNT(*) AS count FROM (SELECT "assessmentId","eventSequence" FROM answer_events GROUP BY "assessmentId","eventSequence" HAVING COUNT(*)>1) x`);
  const badActiveEventMultiplicity=await scalar(`SELECT COUNT(*) AS count FROM (SELECT a.id FROM answers a LEFT JOIN answer_events e ON e."answerId"=a.id AND e."optionIndex" IS NOT NULL WHERE a.active=TRUE GROUP BY a.id HAVING COUNT(e.id)<>1) x`);
  if(duplicateRequests||duplicateSeq||badActiveEventMultiplicity)throw new Error('AnswerEvent event-chain integrity violated');
  const badSnapshots=await scalar(`SELECT COUNT(*) AS count FROM assessment_state_snapshots WHERE "payloadHash" IS NULL OR length("payloadHash")<>64`);
  if(badSnapshots)throw new Error(`Invalid state snapshot hashes: ${badSnapshots}`);
  console.log(JSON.stringify({status:'PASS',contract:'PERSIST-v1.0-STEP11',duplicateOpen,pointerMismatch,unpointedOpen,badDraft,missingCanonical,duplicateRequests,multiEventQuestionChains,duplicateSeq,badActiveEventMultiplicity,badSnapshots},null,2));
}
main().finally(()=>prisma.$disconnect());
