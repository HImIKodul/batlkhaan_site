-- Step 9/11: bind strategic priorities and immutable 365-day plan definition
-- to the canonical DiagnosisResultV13 resultHash while leaving milestone progress mutable.

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'STRATEGY_FROZEN';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ACTION_PLAN_FROZEN';

ALTER TABLE "strategy_runs"
  ADD COLUMN IF NOT EXISTS "diagnosisResultHash" TEXT,
  ADD COLUMN IF NOT EXISTS "strategyHash" TEXT;

ALTER TABLE "action_plans"
  ADD COLUMN IF NOT EXISTS "diagnosisResultHash" TEXT,
  ADD COLUMN IF NOT EXISTS "planHash" TEXT;

CREATE TABLE IF NOT EXISTS "strategy_plan_snapshots" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "methodologyVersion" TEXT NOT NULL,
  "methodologyBundleSha256" TEXT NOT NULL,
  "runtimeSnapshotHash" TEXT NOT NULL,
  "diagnosisResultHash" TEXT NOT NULL,
  "strategyHash" TEXT NOT NULL,
  "planHash" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strategy_plan_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "strategy_plan_snapshots_assessmentId_key" ON "strategy_plan_snapshots"("assessmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "strategy_plan_snapshots_diagnosisResultHash_key" ON "strategy_plan_snapshots"("diagnosisResultHash");
CREATE UNIQUE INDEX IF NOT EXISTS "strategy_plan_snapshots_strategyHash_key" ON "strategy_plan_snapshots"("strategyHash");
CREATE UNIQUE INDEX IF NOT EXISTS "strategy_plan_snapshots_planHash_key" ON "strategy_plan_snapshots"("planHash");
CREATE INDEX IF NOT EXISTS "strategy_plan_snapshots_methodologyVersion_generatedAt_idx" ON "strategy_plan_snapshots"("methodologyVersion","generatedAt");
CREATE INDEX IF NOT EXISTS "strategy_runs_diagnosisResultHash_idx" ON "strategy_runs"("diagnosisResultHash");
CREATE INDEX IF NOT EXISTS "action_plans_diagnosisResultHash_idx" ON "action_plans"("diagnosisResultHash");

ALTER TABLE "strategy_plan_snapshots"
  ADD CONSTRAINT "strategy_plan_snapshots_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
