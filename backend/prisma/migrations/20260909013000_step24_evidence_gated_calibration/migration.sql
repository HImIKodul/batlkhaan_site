CREATE TYPE "CalibrationProposalStatus" AS ENUM ('DRAFT','SUBMITTED','REVISE_REQUIRED','APPROVED','REJECTED','ACTIVATED','WITHDRAWN');
CREATE TYPE "CalibrationChangeKind" AS ENUM ('CONTRIBUTION_STRENGTH','CONFIDENCE_EVIDENCE_UNIT','ADAPTIVE_ROUTING_COEFFICIENT','STOP_THRESHOLD','INFORMATION_VALUE_PRIOR','PROFILE_FIT_MULTIPLIER','UNCERTAINTY_BAND','QUESTION_WORDING','QUESTION_MAPPING','CATEGORY_WEIGHT','CELL_WEIGHT','SCORING_RULE','OTHER_SEMANTIC');
CREATE TYPE "CalibrationReviewDecision" AS ENUM ('APPROVE','REVISE','REJECT');

CREATE TABLE "calibration_proposals" (
  "id" TEXT PRIMARY KEY,
  "studyId" TEXT NOT NULL,
  "analysisRunId" TEXT NOT NULL,
  "pilotDecisionId" TEXT NOT NULL,
  "sourceMethodologyVersionId" TEXT NOT NULL,
  "candidateMethodologyVersionId" TEXT,
  "proposedVersion" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "evidenceSha256" TEXT NOT NULL,
  "candidateBundleSha256" TEXT,
  "status" "CalibrationProposalStatus" NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" TEXT NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "calibration_proposals_candidateMethodologyVersionId_key" ON "calibration_proposals"("candidateMethodologyVersionId");
CREATE UNIQUE INDEX "calibration_proposals_proposedVersion_key" ON "calibration_proposals"("proposedVersion");
CREATE UNIQUE INDEX "calibration_proposals_evidenceSha256_key" ON "calibration_proposals"("evidenceSha256");
CREATE UNIQUE INDEX "calibration_proposals_candidateBundleSha256_key" ON "calibration_proposals"("candidateBundleSha256");
CREATE INDEX "calibration_proposals_studyId_createdAt_idx" ON "calibration_proposals"("studyId","createdAt");
CREATE INDEX "calibration_proposals_sourceMethodologyVersionId_status_idx" ON "calibration_proposals"("sourceMethodologyVersionId","status");
CREATE INDEX "calibration_proposals_reviewerUserId_status_idx" ON "calibration_proposals"("reviewerUserId","status");

CREATE TABLE "calibration_changes" (
  "id" TEXT PRIMARY KEY,
  "proposalId" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "kind" "CalibrationChangeKind" NOT NULL,
  "sourcePath" TEXT NOT NULL,
  "beforeValue" JSONB NOT NULL,
  "proposedValue" JSONB NOT NULL,
  "rationale" TEXT NOT NULL,
  "evidenceGateIds" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "calibration_changes_proposalId_orderIndex_key" ON "calibration_changes"("proposalId","orderIndex");
CREATE INDEX "calibration_changes_proposalId_kind_idx" ON "calibration_changes"("proposalId","kind");

CREATE TABLE "calibration_reviews" (
  "id" TEXT PRIMARY KEY,
  "proposalId" TEXT NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "decision" "CalibrationReviewDecision" NOT NULL,
  "rationale" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "calibration_reviews_proposalId_createdAt_idx" ON "calibration_reviews"("proposalId","createdAt");
CREATE INDEX "calibration_reviews_reviewerUserId_createdAt_idx" ON "calibration_reviews"("reviewerUserId","createdAt");

CREATE TABLE "calibration_releases" (
  "id" TEXT PRIMARY KEY,
  "proposalId" TEXT NOT NULL,
  "sourceMethodologyVersionId" TEXT NOT NULL,
  "candidateMethodologyVersionId" TEXT NOT NULL,
  "activatedByUserId" TEXT NOT NULL,
  "releaseSha256" TEXT NOT NULL,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "calibration_releases_proposalId_key" ON "calibration_releases"("proposalId");
CREATE UNIQUE INDEX "calibration_releases_candidateMethodologyVersionId_key" ON "calibration_releases"("candidateMethodologyVersionId");
CREATE UNIQUE INDEX "calibration_releases_releaseSha256_key" ON "calibration_releases"("releaseSha256");
CREATE INDEX "calibration_releases_activatedAt_idx" ON "calibration_releases"("activatedAt");

ALTER TABLE "calibration_proposals" ADD CONSTRAINT "calibration_proposals_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "pilot_studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calibration_proposals" ADD CONSTRAINT "calibration_proposals_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "pilot_analysis_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calibration_proposals" ADD CONSTRAINT "calibration_proposals_pilotDecisionId_fkey" FOREIGN KEY ("pilotDecisionId") REFERENCES "pilot_gate_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calibration_proposals" ADD CONSTRAINT "calibration_proposals_sourceMethodologyVersionId_fkey" FOREIGN KEY ("sourceMethodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calibration_proposals" ADD CONSTRAINT "calibration_proposals_candidateMethodologyVersionId_fkey" FOREIGN KEY ("candidateMethodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calibration_proposals" ADD CONSTRAINT "calibration_proposals_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calibration_proposals" ADD CONSTRAINT "calibration_proposals_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calibration_changes" ADD CONSTRAINT "calibration_changes_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "calibration_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calibration_reviews" ADD CONSTRAINT "calibration_reviews_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "calibration_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calibration_reviews" ADD CONSTRAINT "calibration_reviews_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calibration_releases" ADD CONSTRAINT "calibration_releases_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "calibration_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calibration_releases" ADD CONSTRAINT "calibration_releases_sourceMethodologyVersionId_fkey" FOREIGN KEY ("sourceMethodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calibration_releases" ADD CONSTRAINT "calibration_releases_candidateMethodologyVersionId_fkey" FOREIGN KEY ("candidateMethodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calibration_releases" ADD CONSTRAINT "calibration_releases_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
