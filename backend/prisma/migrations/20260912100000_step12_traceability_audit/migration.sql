-- MMRI Step 12/15 — end-to-end traceability and publication audit
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'TRACE_GRAPH_FROZEN';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'TRACE_GRAPH_VERIFIED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'REPORT_PUBLICATION_BLOCKED';

ALTER TABLE "answer_events"
  ADD COLUMN "questionExternalId" TEXT,
  ADD COLUMN "primaryCategoryExternalId" TEXT,
  ADD COLUMN "primaryCellExternalId" TEXT,
  ADD COLUMN "questionPath" INTEGER,
  ADD COLUMN "sourceKindSnapshot" TEXT,
  ADD COLUMN "normalizedScore" DECIMAL(8,4);

WITH answer_event_backfill AS (
  SELECT
    ae."id" AS "answerEventId",
    q."externalId" AS "questionExternalId",
    c."externalId" AS "primaryCategoryExternalId",
    ct."externalId" AS "primaryCellExternalId",
    q."path" AS "questionPath",
    q."sourceKind"::TEXT AS "sourceKindSnapshot",
    COALESCE((ae."rawValue"->>'score')::DECIMAL(8,4), qo."score") AS "normalizedScore"
  FROM "answer_events" ae
  JOIN "questions" q ON q."id"=ae."questionId"
  JOIN "categories" c ON c."id"=q."categoryId"
  JOIN "diagnostic_cells" dc ON dc."id"=q."primaryCellId"
  JOIN "cell_templates" ct ON ct."id"=dc."cellTemplateId"
  LEFT JOIN "question_options" qo
    ON qo."questionId"=q."id" AND qo."optionIndex"=ae."optionIndex"
)
UPDATE "answer_events" ae
SET "questionExternalId"=b."questionExternalId",
    "primaryCategoryExternalId"=b."primaryCategoryExternalId",
    "primaryCellExternalId"=b."primaryCellExternalId",
    "questionPath"=b."questionPath",
    "sourceKindSnapshot"=b."sourceKindSnapshot",
    "normalizedScore"=b."normalizedScore"
FROM answer_event_backfill b
WHERE ae."id"=b."answerEventId";

ALTER TABLE "assessment_state_snapshots"
  ADD COLUMN "versionBundleId" TEXT,
  ADD COLUMN "versionBundleHash" TEXT,
  ADD COLUMN "traceVersion" TEXT NOT NULL DEFAULT 'MMRI-TRACE-1.0';

UPDATE "assessment_state_snapshots" s
SET "versionBundleId"=a."methodologyVersionId",
    "versionBundleHash"=mv."bundleSha256"
FROM "assessments" a
JOIN "methodology_versions" mv ON mv."id"=a."methodologyVersionId"
WHERE s."assessmentId"=a."id";

ALTER TABLE "report_snapshots"
  ADD COLUMN "sourceSnapshotId" TEXT,
  ADD COLUMN "sourceSnapshotHash" TEXT,
  ADD COLUMN "versionBundleId" TEXT,
  ADD COLUMN "versionBundleHash" TEXT,
  ADD COLUMN "traceVersion" TEXT,
  ADD COLUMN "traceGraphHash" TEXT;

UPDATE "report_snapshots" r
SET "versionBundleId"=a."methodologyVersionId",
    "versionBundleHash"=mv."bundleSha256",
    "traceVersion"='MMRI-TRACE-1.0',
    "sourceSnapshotId"=(SELECT s."id" FROM "assessment_state_snapshots" s WHERE s."assessmentId"=r."assessmentId" ORDER BY s."eventSequence" DESC, s."createdAt" DESC LIMIT 1),
    "sourceSnapshotHash"=(SELECT s."payloadHash" FROM "assessment_state_snapshots" s WHERE s."assessmentId"=r."assessmentId" ORDER BY s."eventSequence" DESC, s."createdAt" DESC LIMIT 1)
FROM "assessments" a
JOIN "methodology_versions" mv ON mv."id"=a."methodologyVersionId"
WHERE r."assessmentId"=a."id";

CREATE TABLE "trace_snapshots" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "traceVersion" TEXT NOT NULL,
  "sourceSnapshotId" TEXT NOT NULL,
  "sourceSnapshotHash" TEXT NOT NULL,
  "versionBundleId" TEXT NOT NULL,
  "versionBundleHash" TEXT NOT NULL,
  "graphHash" TEXT NOT NULL,
  "graph" JSONB NOT NULL,
  "publicationStatus" TEXT NOT NULL,
  "reportSnapshotId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trace_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "trace_snapshots_graphHash_key" ON "trace_snapshots"("graphHash");
CREATE UNIQUE INDEX "trace_snapshots_assessmentId_externalId_key" ON "trace_snapshots"("assessmentId","externalId");
CREATE INDEX "trace_snapshots_assessmentId_createdAt_idx" ON "trace_snapshots"("assessmentId","createdAt");
CREATE INDEX "trace_snapshots_sourceSnapshotHash_idx" ON "trace_snapshots"("sourceSnapshotHash");
ALTER TABLE "trace_snapshots" ADD CONSTRAINT "trace_snapshots_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "report_snapshots_traceGraphHash_idx" ON "report_snapshots"("traceGraphHash");
CREATE INDEX "report_snapshots_sourceSnapshotHash_idx" ON "report_snapshots"("sourceSnapshotHash");
