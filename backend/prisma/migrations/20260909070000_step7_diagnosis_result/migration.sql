CREATE TABLE "diagnosis_snapshots" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "methodologyVersion" TEXT NOT NULL,
  "methodologyBundleSha256" TEXT NOT NULL,
  "runtimeSnapshotHash" TEXT NOT NULL,
  "resultHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "diagnosis_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "diagnosis_snapshots_assessmentId_key" ON "diagnosis_snapshots"("assessmentId");
CREATE UNIQUE INDEX "diagnosis_snapshots_resultHash_key" ON "diagnosis_snapshots"("resultHash");
CREATE INDEX "diagnosis_snapshots_methodologyVersion_generatedAt_idx" ON "diagnosis_snapshots"("methodologyVersion", "generatedAt");
ALTER TABLE "diagnosis_snapshots" ADD CONSTRAINT "diagnosis_snapshots_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_snapshots" ADD COLUMN "diagnosisResultHash" TEXT;
CREATE INDEX "report_snapshots_diagnosisResultHash_idx" ON "report_snapshots"("diagnosisResultHash");
