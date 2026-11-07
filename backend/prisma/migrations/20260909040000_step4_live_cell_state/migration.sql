-- Step 4/11: persist policy-aware live cell confidence/locking state.
CREATE TYPE "CellConfidenceState" AS ENUM (
  'UNASSESSED',
  'UNKNOWN',
  'ESTIMATED',
  'VALIDATED',
  'LOCKED',
  'NOT_APPLICABLE'
);

ALTER TABLE "assessment_cell_states"
  ADD COLUMN "confidenceState" "CellConfidenceState" NOT NULL DEFAULT 'UNASSESSED',
  ADD COLUMN "evidenceCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scoreDispersion" DECIMAL(8,4),
  ADD COLUMN "lockReason" TEXT,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "calculationVersion" TEXT NOT NULL DEFAULT 'LEGACY';

CREATE INDEX "assessment_cell_states_assessmentId_confidenceState_idx"
  ON "assessment_cell_states"("assessmentId", "confidenceState");

CREATE INDEX "assessment_cell_states_assessmentId_lockedAt_idx"
  ON "assessment_cell_states"("assessmentId", "lockedAt");
