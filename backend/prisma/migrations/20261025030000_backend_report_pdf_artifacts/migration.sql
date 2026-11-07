-- Backend step 12: immutable report PDF artifact metadata.
-- PDF bytes remain in the configured report-storage directory; PostgreSQL stores
-- the source/content hashes and lineage needed to verify retrieval.

CREATE TABLE "report_artifacts" (
  "id" TEXT NOT NULL,
  "reportSnapshotId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'PDF',
  "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  "storageKey" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "generatorVersion" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  CONSTRAINT "report_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_artifacts_storageKey_key" ON "report_artifacts"("storageKey");
CREATE UNIQUE INDEX "report_artifacts_reportSnapshotId_kind_key" ON "report_artifacts"("reportSnapshotId","kind");
CREATE INDEX "report_artifacts_sourceHash_idx" ON "report_artifacts"("sourceHash");
CREATE INDEX "report_artifacts_contentHash_idx" ON "report_artifacts"("contentHash");

ALTER TABLE "report_artifacts"
  ADD CONSTRAINT "report_artifacts_reportSnapshotId_fkey"
  FOREIGN KEY ("reportSnapshotId") REFERENCES "report_snapshots"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_artifacts"
  ADD CONSTRAINT "report_artifacts_pdf_kind_ck"
  CHECK ("kind" = 'PDF');
ALTER TABLE "report_artifacts"
  ADD CONSTRAINT "report_artifacts_pdf_mime_ck"
  CHECK ("mimeType" = 'application/pdf');
ALTER TABLE "report_artifacts"
  ADD CONSTRAINT "report_artifacts_size_ck"
  CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 52428800);
ALTER TABLE "report_artifacts"
  ADD CONSTRAINT "report_artifacts_hash_ck"
  CHECK (char_length("sourceHash") = 64 AND char_length("contentHash") = 64);
