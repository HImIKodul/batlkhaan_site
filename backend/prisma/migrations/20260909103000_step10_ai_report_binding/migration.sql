ALTER TABLE "report_snapshots"
  ADD COLUMN "strategyHash" TEXT,
  ADD COLUMN "planHash" TEXT,
  ADD COLUMN "bindingHash" TEXT,
  ADD COLUMN "narrativeHash" TEXT,
  ADD COLUMN "modelIdentifier" TEXT,
  ADD COLUMN "modelConfig" JSONB,
  ADD COLUMN "promptVersion" TEXT,
  ADD COLUMN "validatorVersion" TEXT,
  ADD COLUMN "generationAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "providerError" TEXT;
CREATE UNIQUE INDEX "report_snapshots_narrativeHash_key" ON "report_snapshots"("narrativeHash");
CREATE INDEX "report_snapshots_strategyHash_idx" ON "report_snapshots"("strategyHash");
CREATE INDEX "report_snapshots_planHash_idx" ON "report_snapshots"("planHash");
CREATE INDEX "report_snapshots_bindingHash_idx" ON "report_snapshots"("bindingHash");
