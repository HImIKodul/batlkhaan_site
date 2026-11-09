import { prisma } from './db.js';

type CountRow={count:bigint|number};
async function scalar(sql:string){const rows=await prisma.$queryRawUnsafe<CountRow[]>(sql);return Number(rows[0]?.count??0)}

async function main(){
  const checks:Record<string,number>={};
  checks.multipleActiveAnswers=await scalar(`SELECT COUNT(*) AS count FROM (SELECT "assessmentId","questionId" FROM answers WHERE active=TRUE GROUP BY "assessmentId","questionId" HAVING COUNT(*)>1) x`);
  checks.answerMethodologyMismatch=await scalar(`SELECT COUNT(*) AS count FROM answers ans JOIN assessments a ON a.id=ans."assessmentId" JOIN questions q ON q.id=ans."questionId" WHERE q."methodologyVersionId"<>a."methodologyVersionId"`);
  checks.answerRespondentMismatch=await scalar(`SELECT COUNT(*) AS count FROM answers ans JOIN assessment_respondents r ON r.id=ans."respondentId" WHERE ans."respondentId" IS NOT NULL AND r."assessmentId"<>ans."assessmentId"`);
  checks.activeEvidenceForInactiveAnswer=await scalar(`SELECT COUNT(*) AS count FROM evidence_signals e JOIN answers ans ON ans.id=e."answerId" WHERE e.active=TRUE AND ans.active=FALSE`);
  checks.evidenceAssessmentMismatch=await scalar(`SELECT COUNT(*) AS count FROM evidence_signals e JOIN answers ans ON ans.id=e."answerId" WHERE e."assessmentId"<>ans."assessmentId"`);
  checks.badDraftLineage=await scalar(`SELECT COUNT(*) AS count FROM response_drafts d LEFT JOIN assessment_asked_questions qi ON qi.id=d."questionIssueId" WHERE qi.id IS NULL OR qi."assessmentId"<>d."assessmentId" OR qi."questionId"<>d."questionId" OR qi.status<>'ISSUED'`);
  checks.badClientRequestId=await scalar(`SELECT COUNT(*) AS count FROM answer_events WHERE "clientRequestId"<>btrim("clientRequestId") OR length("clientRequestId")<1 OR length("clientRequestId")>160`);
  checks.badLatestEventState=await scalar(`WITH latest AS (SELECT DISTINCT ON (e."assessmentId",e."questionId") e."assessmentId",e."questionId",e."answerId",e."optionIndex" FROM answer_events e ORDER BY e."assessmentId",e."questionId",e."eventSequence" DESC) SELECT COUNT(*) AS count FROM latest l LEFT JOIN answers a ON a."assessmentId"=l."assessmentId" AND a."questionId"=l."questionId" AND a.active=TRUE WHERE (l."optionIndex" IS NULL AND a.id IS NOT NULL) OR (l."optionIndex" IS NOT NULL AND (a.id IS NULL OR a.id<>l."answerId"))`);
  checks.badAnswerEventLineage=await scalar(`SELECT COUNT(*) AS count FROM answer_events e JOIN assessment_asked_questions qi ON qi.id=e."questionIssueId" JOIN answers ans ON ans.id=e."answerId" LEFT JOIN assessment_respondents r ON r.id=e."respondentId" WHERE qi."assessmentId"<>e."assessmentId" OR qi."questionId"<>e."questionId" OR ans."assessmentId"<>e."assessmentId" OR ans."questionId"<>e."questionId" OR (e."respondentId" IS NOT NULL AND (r.id IS NULL OR r."assessmentId"<>e."assessmentId"))`);
  for(const [name,count] of Object.entries(checks)) if(count!==0) throw new Error(`${name}: ${count}`);
  console.log(JSON.stringify({status:'PASS',contract:'BACKEND-STEP05-ANSWER-PERSISTENCE-v1',checks},null,2));
}
main().finally(()=>prisma.$disconnect());
