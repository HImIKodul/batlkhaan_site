CREATE TYPE "PilotStudyStatus" AS ENUM ('DRAFT','RECRUITING','ACTIVE','ANALYSIS','READY_FOR_REVIEW','CLOSED');
CREATE TYPE "PilotConsentStatus" AS ENUM ('PENDING','CONSENTED','DECLINED','WITHDRAWN');
CREATE TYPE "PilotAssessmentRole" AS ENUM ('COGNITIVE','BASELINE','SECOND_RATER','RETEST');
CREATE TYPE "PilotFeedbackDimension" AS ENUM ('CLARITY','BURDEN','DIAGNOSIS_USEFULNESS','RECOMMENDATION_USEFULNESS');
CREATE TYPE "PilotGateDecisionStatus" AS ENUM ('APPROVE','REVISE','HOLD');

CREATE TABLE "pilot_studies" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "methodologyVersionId" TEXT NOT NULL REFERENCES "methodology_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "PilotStudyStatus" NOT NULL DEFAULT 'DRAFT',
  "targetCompanies" INTEGER NOT NULL DEFAULT 30,
  "cognitiveTarget" INTEGER NOT NULL DEFAULT 8,
  "fieldTarget" INTEGER NOT NULL DEFAULT 20,
  "retestTarget" INTEGER NOT NULL DEFAULT 8,
  "retestMinDays" INTEGER NOT NULL DEFAULT 7,
  "retestMaxDays" INTEGER NOT NULL DEFAULT 14,
  "createdByUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3)
);
CREATE INDEX "pilot_studies_status_createdAt_idx" ON "pilot_studies"("status","createdAt");
CREATE INDEX "pilot_studies_methodologyVersionId_idx" ON "pilot_studies"("methodologyVersionId");

CREATE TABLE "pilot_enrollments" (
  "id" TEXT PRIMARY KEY,
  "studyId" TEXT NOT NULL REFERENCES "pilot_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "companyId" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "deidentifiedCode" TEXT NOT NULL,
  "consentStatus" "PilotConsentStatus" NOT NULL DEFAULT 'PENDING',
  "consentedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pilot_enrollments_studyId_companyId_key" UNIQUE ("studyId","companyId"),
  CONSTRAINT "pilot_enrollments_studyId_deidentifiedCode_key" UNIQUE ("studyId","deidentifiedCode")
);
CREATE INDEX "pilot_enrollments_studyId_consentStatus_idx" ON "pilot_enrollments"("studyId","consentStatus");

CREATE TABLE "pilot_assessment_links" (
  "id" TEXT PRIMARY KEY,
  "enrollmentId" TEXT NOT NULL REFERENCES "pilot_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "assessmentId" TEXT NOT NULL UNIQUE REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "role" "PilotAssessmentRole" NOT NULL,
  "pairKey" TEXT,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pilot_assessment_links_enrollmentId_role_key" UNIQUE ("enrollmentId","role")
);
CREATE INDEX "pilot_assessment_links_enrollmentId_role_idx" ON "pilot_assessment_links"("enrollmentId","role");
CREATE INDEX "pilot_assessment_links_pairKey_idx" ON "pilot_assessment_links"("pairKey");

CREATE TABLE "pilot_feedback" (
  "id" TEXT PRIMARY KEY,
  "enrollmentId" TEXT NOT NULL REFERENCES "pilot_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "assessmentId" TEXT REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "questionExternalId" TEXT,
  "dimension" "PilotFeedbackDimension" NOT NULL,
  "rating" INTEGER NOT NULL,
  "commentText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pilot_feedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);
CREATE INDEX "pilot_feedback_enrollmentId_dimension_idx" ON "pilot_feedback"("enrollmentId","dimension");
CREATE INDEX "pilot_feedback_assessmentId_dimension_idx" ON "pilot_feedback"("assessmentId","dimension");

CREATE TABLE "pilot_outcome_baselines" (
  "id" TEXT PRIMARY KEY,
  "enrollmentId" TEXT NOT NULL UNIQUE REFERENCES "pilot_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "revenueBand" TEXT,
  "profitBand" TEXT,
  "customerBand" TEXT,
  "marketShareBand" TEXT,
  "brandIndexBand" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "pilot_analysis_runs" (
  "id" TEXT PRIMARY KEY,
  "studyId" TEXT NOT NULL REFERENCES "pilot_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "inputSha256" TEXT NOT NULL,
  "metrics" JSONB NOT NULL,
  "gates" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "pilot_analysis_runs_studyId_createdAt_idx" ON "pilot_analysis_runs"("studyId","createdAt");
CREATE INDEX "pilot_analysis_runs_inputSha256_idx" ON "pilot_analysis_runs"("inputSha256");

CREATE TABLE "pilot_gate_decisions" (
  "id" TEXT PRIMARY KEY,
  "studyId" TEXT NOT NULL REFERENCES "pilot_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "analysisRunId" TEXT NOT NULL REFERENCES "pilot_analysis_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reviewerUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "PilotGateDecisionStatus" NOT NULL,
  "rationale" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "pilot_gate_decisions_studyId_createdAt_idx" ON "pilot_gate_decisions"("studyId","createdAt");
CREATE INDEX "pilot_gate_decisions_analysisRunId_idx" ON "pilot_gate_decisions"("analysisRunId");
