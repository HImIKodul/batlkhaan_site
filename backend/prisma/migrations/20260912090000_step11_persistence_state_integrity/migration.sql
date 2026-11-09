-- MMRI Step 11/15 — persistence/state integrity
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ASSESSMENT_PAUSED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ASSESSMENT_RESUMED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'WRITER_LEASE_ACQUIRED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'WRITER_LEASE_RENEWED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DRAFT_SAVED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ANSWER_EVENT_APPENDED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'STATE_SNAPSHOT_FROZEN';

CREATE TYPE "QuestionIssueStatus" AS ENUM ('ISSUED','ANSWERED','CANCELLED');
CREATE TYPE "AssessmentSnapshotKind" AS ENUM ('QUICK_RESULT','FULL_RESULT');

ALTER TABLE "assessments"
  ADD COLUMN "assessmentRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "routingRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "eventSequence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "profileRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "currentQuestionIssueId" TEXT,
  ADD COLUMN "resumeState" JSONB,
  ADD COLUMN "pausedAt" TIMESTAMP(3),
  ADD COLUMN "activeWriterLeaseId" TEXT,
  ADD COLUMN "writerLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "lastMaterializedAnswerEventSequence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "parentAssessmentId" TEXT,
  ADD COLUMN "previousAssessmentId" TEXT;

ALTER TABLE "assessment_asked_questions"
  ADD COLUMN "status" "QuestionIssueStatus" NOT NULL DEFAULT 'ISSUED',
  ADD COLUMN "answeredAt" TIMESTAMP(3);

-- Backfill historical issue state from accepted active answers before enforcing new runtime semantics.
UPDATE "assessment_asked_questions" aq
SET "status"='ANSWERED', "answeredAt"=COALESCE(a."createdAt", aq."askedAt")
FROM "answers" a
WHERE a."assessmentId"=aq."assessmentId" AND a."questionId"=aq."questionId" AND a."active"=TRUE;

-- Preserve the exact pre-migration unanswered question as the current issue pointer.
UPDATE "assessments" a
SET "currentQuestionIssueId"=x."id"
FROM (
  SELECT DISTINCT ON ("assessmentId") "assessmentId", "id"
  FROM "assessment_asked_questions"
  WHERE "status"='ISSUED'
  ORDER BY "assessmentId", "askedOrder" ASC
) x
WHERE a."id"=x."assessmentId";

CREATE TABLE "answer_events" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "questionIssueId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "answerId" TEXT NOT NULL,
  "respondentId" TEXT,
  "clientRequestId" TEXT NOT NULL,
  "eventSequence" INTEGER NOT NULL,
  "optionIndex" INTEGER,
  "answerState" TEXT NOT NULL,
  "rawValue" JSONB,
  "authority" DECIMAL(6,4),
  "effectiveReliability" DECIMAL(8,6),
  "methodologyVersion" TEXT NOT NULL,
  "questionBankVersion" TEXT NOT NULL,
  "acknowledgement" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "answer_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "response_drafts" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "questionIssueId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "draft" JSONB NOT NULL,
  "draftRevision" INTEGER NOT NULL DEFAULT 1,
  "serverAckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "response_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_state_snapshots" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "kind" "AssessmentSnapshotKind" NOT NULL,
  "assessmentRevision" INTEGER NOT NULL,
  "eventSequence" INTEGER NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_state_snapshots_pkey" PRIMARY KEY ("id")
);

-- Canonicalize active pre-Step11 answers into immutable legacy AnswerEvents so
-- resumed assessments never lose earlier evidence when the new event source becomes active.
WITH ranked AS (
  SELECT a."id" AS "answerId", a."assessmentId", a."respondentId", a."questionId", a."optionIndex", a."status", a."rawValue", a."authority", a."createdAt",
         aq."id" AS "questionIssueId", mv."version" AS "methodologyVersion",
         ROW_NUMBER() OVER (PARTITION BY a."assessmentId" ORDER BY a."createdAt", a."id")::INTEGER AS seq
  FROM "answers" a
  JOIN "assessment_asked_questions" aq ON aq."assessmentId"=a."assessmentId" AND aq."questionId"=a."questionId"
  JOIN "assessments" ass ON ass."id"=a."assessmentId"
  JOIN "methodology_versions" mv ON mv."id"=ass."methodologyVersionId"
  WHERE a."active"=TRUE
)
INSERT INTO "answer_events" ("id","assessmentId","questionIssueId","questionId","answerId","respondentId","clientRequestId","eventSequence","optionIndex","answerState","rawValue","authority","effectiveReliability","methodologyVersion","questionBankVersion","createdAt")
SELECT 'legacy-ae-'||"answerId", "assessmentId", "questionIssueId", "questionId", "answerId", "respondentId", 'legacy:'||"answerId", seq, "optionIndex", "status"::TEXT, "rawValue", "authority", NULL, "methodologyVersion", 'LEGACY_PRE_STEP11', "createdAt"
FROM ranked;

UPDATE "assessments" a
SET "eventSequence"=x.max_seq, "lastMaterializedAnswerEventSequence"=x.max_seq
FROM (SELECT "assessmentId", MAX("eventSequence") AS max_seq FROM "answer_events" GROUP BY "assessmentId") x
WHERE a."id"=x."assessmentId";

CREATE INDEX "assessments_status_updatedAt_idx" ON "assessments"("status","updatedAt");
CREATE INDEX "assessments_currentQuestionIssueId_idx" ON "assessments"("currentQuestionIssueId");
CREATE INDEX "assessment_asked_questions_assessmentId_status_askedOrder_idx" ON "assessment_asked_questions"("assessmentId","status","askedOrder");
CREATE UNIQUE INDEX "assessment_asked_questions_one_open_per_assessment_key" ON "assessment_asked_questions"("assessmentId") WHERE "status"='ISSUED';
CREATE UNIQUE INDEX "answer_events_assessmentId_clientRequestId_key" ON "answer_events"("assessmentId","clientRequestId");
CREATE UNIQUE INDEX "answer_events_assessmentId_questionId_key" ON "answer_events"("assessmentId","questionId");
CREATE UNIQUE INDEX "answer_events_assessmentId_eventSequence_key" ON "answer_events"("assessmentId","eventSequence");
CREATE INDEX "answer_events_assessmentId_createdAt_idx" ON "answer_events"("assessmentId","createdAt");
CREATE UNIQUE INDEX "response_drafts_assessmentId_key" ON "response_drafts"("assessmentId");
CREATE INDEX "response_drafts_questionIssueId_idx" ON "response_drafts"("questionIssueId");
CREATE UNIQUE INDEX "assessment_state_snapshots_payloadHash_key" ON "assessment_state_snapshots"("payloadHash");
CREATE UNIQUE INDEX "assessment_state_snapshots_assessmentId_kind_assessmentRevision_key" ON "assessment_state_snapshots"("assessmentId","kind","assessmentRevision");
CREATE INDEX "assessment_state_snapshots_assessmentId_createdAt_idx" ON "assessment_state_snapshots"("assessmentId","createdAt");
ALTER TABLE "answer_events" ADD CONSTRAINT "answer_events_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "response_drafts" ADD CONSTRAINT "response_drafts_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_state_snapshots" ADD CONSTRAINT "assessment_state_snapshots_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
