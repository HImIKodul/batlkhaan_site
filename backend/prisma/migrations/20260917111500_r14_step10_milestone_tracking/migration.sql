-- R14 Step 10: mutable implementation tracking lives beside the frozen action-plan definition.
-- Diagnostic/scoring methodology is not changed by this migration.

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ACTION_PLAN_MILESTONE_TRACKING_UPDATED';

ALTER TABLE "action_plan_milestones"
  ADD COLUMN "progressPercent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "plannedStartDate" TIMESTAMP(3),
  ADD COLUMN "plannedEndDate" TIMESTAMP(3),
  ADD COLUMN "actualStartDate" TIMESTAMP(3),
  ADD COLUMN "actualCompletedDate" TIMESTAMP(3),
  ADD COLUMN "noteMn" TEXT,
  ADD COLUMN "delayReasonMn" TEXT,
  ADD COLUMN "metricCurrentValue" DOUBLE PRECISION,
  ADD COLUMN "metricTargetValue" DOUBLE PRECISION,
  ADD COLUMN "metricUnitMn" TEXT;

ALTER TABLE "action_plan_milestones"
  ADD CONSTRAINT "action_plan_milestones_progressPercent_check"
  CHECK ("progressPercent" >= 0 AND "progressPercent" <= 100);

-- Preserve old completed work as 100% progress.
UPDATE "action_plan_milestones"
SET "progressPercent" = 100,
    "actualCompletedDate" = COALESCE("actualCompletedDate", "updatedAt")
WHERE "status" = 'DONE';

-- Give existing plans real calendar windows from their frozen plan start date.
UPDATE "action_plan_milestones" AS m
SET "plannedStartDate" = p."generatedAt" +
      CASE m."horizon"
        WHEN 'H0' THEN INTERVAL '0 day'
        WHEN 'H1' THEN INTERVAL '15 day'
        WHEN 'H2' THEN INTERVAL '31 day'
        WHEN 'H3' THEN INTERVAL '91 day'
        WHEN 'H4' THEN INTERVAL '181 day'
        ELSE INTERVAL '0 day'
      END,
    "plannedEndDate" = p."generatedAt" +
      CASE m."horizon"
        WHEN 'H0' THEN INTERVAL '14 day'
        WHEN 'H1' THEN INTERVAL '30 day'
        WHEN 'H2' THEN INTERVAL '90 day'
        WHEN 'H3' THEN INTERVAL '180 day'
        WHEN 'H4' THEN INTERVAL '365 day'
        ELSE INTERVAL '0 day'
      END
FROM "action_plans" AS p
WHERE m."actionPlanId" = p."id"
  AND m."horizon" IN ('H0','H1','H2','H3','H4')
  AND m."plannedStartDate" IS NULL
  AND m."plannedEndDate" IS NULL;

CREATE INDEX "action_plan_milestones_actionPlanId_plannedEndDate_status_idx"
  ON "action_plan_milestones"("actionPlanId", "plannedEndDate", "status");
