-- Backend completion Step 11/20: production AI generation reliability.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'REPORT_GENERATION_STARTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'REPORT_GENERATION_FAILED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'REPORT_GENERATION_FALLBACK';

ALTER TABLE "report_snapshots"
  ADD COLUMN IF NOT EXISTS "providerHttpAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "providerRetryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "providerRequestIds" JSONB,
  ADD COLUMN IF NOT EXISTS "nextAiRetryAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "generationLeaseId" TEXT,
  ADD COLUMN IF NOT EXISTS "generationLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "generationStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "generationCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "generationFailureCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "report_snapshots_generationLeaseExpiresAt_idx" ON "report_snapshots"("generationLeaseExpiresAt");
CREATE INDEX IF NOT EXISTS "report_snapshots_nextAiRetryAt_idx" ON "report_snapshots"("nextAiRetryAt");

ALTER TABLE "report_snapshots"
  ADD CONSTRAINT "report_snapshots_provider_attempts_nonnegative_ck"
  CHECK ("generationAttemptCount" >= 0 AND "providerHttpAttemptCount" >= 0 AND "providerRetryCount" >= 0 AND "generationFailureCount" >= 0);

ALTER TABLE "report_snapshots"
  ADD CONSTRAINT "report_snapshots_retry_not_gt_attempts_ck"
  CHECK ("providerRetryCount" <= "providerHttpAttemptCount");

ALTER TABLE "report_snapshots"
  ADD CONSTRAINT "report_snapshots_lease_pair_ck"
  CHECK (("generationLeaseId" IS NULL) = ("generationLeaseExpiresAt" IS NULL));

