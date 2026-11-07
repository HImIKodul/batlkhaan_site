-- MMRI recovery initial migration
-- Purpose: reconstruct the pre-Step-23 schema so the preserved historical migrations can run from an empty PostgreSQL database.
-- Source: current Prisma schema minus database objects/columns/enum values introduced by subsequent migrations.
-- Methodology activation/data import is intentionally NOT performed by this migration.

CREATE TYPE "MethodologyStatus" AS ENUM ('DRAFT', 'VALIDATING', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "NaPolicy" AS ENUM ('CATEGORY_GATE', 'CONDITIONAL', 'DISALLOWED');
CREATE TYPE "SourceKind" AS ENUM ('SELF_REPORT', 'RECENT_CASE', 'RECORD_CHECK', 'ADDITIONAL_CHECK', 'RESERVE', 'RESOLVER');
CREATE TYPE "AssessmentMode" AS ENUM ('QUICK', 'FULL');
CREATE TYPE "AssessmentStatus" AS ENUM ('PROFILE_PENDING', 'IN_PROGRESS', 'PAUSED', 'READY_FOR_COMPLETION', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_REVIEW', 'EXHAUSTED', 'CANCELLED');
CREATE TYPE "AnswerStatus" AS ENUM ('ANSWERED', 'DNK', 'N_A_CLAIM', 'UNAVAILABLE');
CREATE TYPE "EvidenceSignalKind" AS ENUM ('PRIMARY', 'SECONDARY');
CREATE TYPE "CellStateStatus" AS ENUM ('UNASSESSED', 'GATHERING', 'DIRECT_PROVISIONAL', 'DERIVED_PROVISIONAL', 'REVIEW_REQUIRED', 'DIRECT_FINAL', 'NOT_APPLICABLE', 'UNRESOLVED');
CREATE TYPE "ContradictionStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "CompanyRole" AS ENUM ('OWNER', 'ADMIN', 'ASSESSOR', 'CONSULTANT', 'VIEWER');
CREATE TYPE "AuditEventType" AS ENUM ('ASSESSMENT_CREATED', 'PROFILE_UPDATED', 'QUESTION_ASKED', 'ANSWER_CREATED', 'ANSWER_UPDATED', 'EVIDENCE_CREATED', 'EVIDENCE_RETRACTED', 'CELL_UPDATED', 'CELL_FINALIZED', 'CELL_REOPENED', 'CONTRADICTION_FOUND', 'CONTRADICTION_RESOLVED', 'ASSESSMENT_COMPLETED', 'REPORT_GENERATED', 'STRATEGY_GENERATED', 'ACTION_PLAN_GENERATED', 'REPORT_VALIDATED');
CREATE TYPE "RecommendationType" AS ENUM ('EXECUTION', 'LOCAL_IMPROVEMENT', 'VALIDATE_CAUSE', 'COLLECT_EVIDENCE', 'RESOLVE_EVIDENCE');
CREATE TYPE "PriorityBand" AS ENUM ('P1', 'P2', 'P3', 'P4');
CREATE TYPE "PlanMilestoneStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'SKIPPED');
CREATE TYPE "ReportGenerationState" AS ENUM ('PAYLOAD_FROZEN', 'PASS', 'REPAIR_REQUIRED', 'GENERATION_BLOCKED', 'AI_FALLBACK_USED');
CREATE TYPE "BillingPlanCode" AS ENUM ('DIAGNOSTIC', 'CONTINUOUS');
CREATE TYPE "PaymentProvider" AS ENUM ('QPAY', 'MOCK');
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('CREATED', 'PENDING', 'PAID', 'CANCELLED', 'FAILED');
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED');

CREATE TABLE "methodology_versions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "version" TEXT NOT NULL,
  "bundleVersion" TEXT NOT NULL,
  "sourceMethodology" TEXT NOT NULL,
  "bundleSha256" TEXT NOT NULL,
  "status" "MethodologyStatus" NOT NULL DEFAULT 'DRAFT',
  "validation" JSONB NOT NULL,
  "generatedAtUtc" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3)
);

CREATE TABLE "modules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "nameMn" TEXT NOT NULL,
  "weightPct" DECIMAL(8,4) NOT NULL,
  "orderIndex" INTEGER NOT NULL
);

CREATE TABLE "categories" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "nameMn" TEXT NOT NULL,
  "moduleWeightPct" DECIMAL(8,4) NOT NULL,
  "categoryWeightPct" DECIMAL(8,4) NOT NULL,
  "orderIndex" INTEGER NOT NULL
);

CREATE TABLE "cell_templates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "nameMn" TEXT NOT NULL,
  "groupMn" TEXT NOT NULL,
  "roleMn" TEXT NOT NULL,
  "weightPct" DECIMAL(8,4) NOT NULL,
  "naPolicy" "NaPolicy" NOT NULL,
  "sourceNaEligibility" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL
);

CREATE TABLE "diagnostic_cells" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "cellTemplateId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "directQuestionCount" INTEGER NOT NULL,
  "independentSourceKinds" INTEGER NOT NULL,
  "minThreePathConfidenceAtAuthority075" DECIMAL(8,6) NOT NULL,
  "preferredRoleCode" TEXT NOT NULL,
  "preferredAuthority" DECIMAL(6,4) NOT NULL,
  "coverageStatus" TEXT NOT NULL
);

CREATE TABLE "questions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "primaryCellId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "sourceRow" INTEGER NOT NULL,
  "path" INTEGER NOT NULL,
  "sourceKind" "SourceKind" NOT NULL,
  "textMn" TEXT NOT NULL,
  "primaryCoefficient" DECIMAL(6,4) NOT NULL,
  "scoringProfileCode" TEXT,
  "optionSetHash" TEXT NOT NULL
);

CREATE TABLE "question_options" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "questionId" TEXT NOT NULL,
  "optionIndex" INTEGER NOT NULL,
  "labelMn" TEXT NOT NULL,
  "score" DECIMAL(8,4),
  "state" TEXT NOT NULL
);

CREATE TABLE "question_secondary_targets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "questionId" TEXT NOT NULL,
  "targetCellId" TEXT NOT NULL,
  "coefficient" DECIMAL(6,4) NOT NULL,
  "relationCode" TEXT NOT NULL
);

CREATE TABLE "profile_questions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "textMn" TEXT NOT NULL,
  "questionType" TEXT,
  "orderIndex" INTEGER NOT NULL
);

CREATE TABLE "profile_question_options" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "profileQuestionId" TEXT NOT NULL,
  "optionIndex" INTEGER NOT NULL,
  "labelMn" TEXT NOT NULL
);

CREATE TABLE "scoring_profiles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "definition" JSONB NOT NULL
);

CREATE TABLE "methodology_contracts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "contractVersion" TEXT NOT NULL,
  "sha256" TEXT,
  "definition" JSONB NOT NULL
);

CREATE TABLE "source_manifest_entries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "chunkCount" INTEGER NOT NULL,
  "sizeValue" INTEGER NOT NULL,
  "role" TEXT NOT NULL
);

CREATE TABLE "respondent_roles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "labelMn" TEXT NOT NULL,
  "scopeMn" TEXT NOT NULL
);

CREATE TABLE "authority_routing" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "diagnosticCellId" TEXT NOT NULL,
  "preferredRoleId" TEXT NOT NULL,
  "preferredAuthority" DECIMAL(6,4) NOT NULL,
  "backupRoles" JSONB NOT NULL
);

CREATE TABLE "purpose_definitions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "labelMn" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL
);

CREATE TABLE "category_purpose_mappings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "categoryId" TEXT NOT NULL,
  "purposeId" TEXT NOT NULL,
  "coefficient" DECIMAL(6,4) NOT NULL,
  "rationale" TEXT
);

CREATE TABLE "category_dependencies" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "prerequisiteCategoryId" TEXT NOT NULL,
  "dependentCategoryId" TEXT NOT NULL,
  "strength" DECIMAL(6,4) NOT NULL,
  "dependencyType" TEXT NOT NULL,
  "rationale" TEXT NOT NULL
);

CREATE TABLE "cell_dependencies" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "prerequisiteCellId" TEXT NOT NULL,
  "dependentCellId" TEXT NOT NULL,
  "strength" DECIMAL(6,4) NOT NULL,
  "dependencyType" TEXT NOT NULL,
  "rationale" TEXT NOT NULL
);

CREATE TABLE "import_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "bundleSha256" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "counts" JSONB,
  "errorMessage" TEXT
);

CREATE TABLE "users" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "displayName" TEXT,
  "passwordHash" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "tokenVersion" INTEGER NOT NULL DEFAULT 1,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "company_memberships" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "CompanyRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "refresh_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "rotatedAt" TIMESTAMP(3),
  "ipHash" TEXT,
  "userAgentHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "auth_audit_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "eventType" TEXT NOT NULL,
  "ipHash" TEXT,
  "userAgentHash" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "companies" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "industry" TEXT,
  "businessModel" TEXT,
  "employeeCount" INTEGER,
  "companyAgeYears" DECIMAL(8,2),
  "marketType" TEXT,
  "country" TEXT,
  "profile" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "billing_invoices" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "planCode" "BillingPlanCode" NOT NULL,
  "amountMnt" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'MNT',
  "provider" "PaymentProvider" NOT NULL,
  "providerInvoiceId" TEXT,
  "providerPaymentId" TEXT,
  "senderInvoiceNo" TEXT NOT NULL,
  "callbackTokenHash" TEXT NOT NULL,
  "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'CREATED',
  "qrText" TEXT,
  "qrImage" TEXT,
  "shortUrl" TEXT,
  "deeplinks" JSONB,
  "providerMetadata" JSONB,
  "callbackReceivedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "company_entitlements" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "sourceInvoiceId" TEXT NOT NULL,
  "planCode" "BillingPlanCode" NOT NULL,
  "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "assessmentLimit" INTEGER,
  "assessmentsUsed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "assessments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "methodologyVersionId" TEXT NOT NULL,
  "mode" "AssessmentMode" NOT NULL,
  "status" "AssessmentStatus" NOT NULL DEFAULT 'PROFILE_PENDING',
  "routingState" TEXT,
  "profile" JSONB,
  "overallPartialScore" DECIMAL(8,4),
  "overallOfficialScore" DECIMAL(8,4),
  "overallConfidence" DECIMAL(8,6),
  "coverage" DECIMAL(8,6),
  "createdByUserId" TEXT,
  "entitlementId" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "assessment_respondents" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "displayName" TEXT,
  "authorityMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "assessment_asked_questions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "askedOrder" INTEGER NOT NULL,
  "priority" DECIMAL(12,8),
  "reason" JSONB,
  "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "answers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentId" TEXT NOT NULL,
  "respondentId" TEXT,
  "questionId" TEXT NOT NULL,
  "optionIndex" INTEGER,
  "rawValue" JSONB,
  "status" "AnswerStatus" NOT NULL,
  "authority" DECIMAL(6,4),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "evidence_signals" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentId" TEXT NOT NULL,
  "answerId" TEXT NOT NULL,
  "cellId" TEXT NOT NULL,
  "signalKind" "EvidenceSignalKind" NOT NULL,
  "sourceKind" "SourceKind" NOT NULL,
  "coefficient" DECIMAL(6,4) NOT NULL,
  "score" DECIMAL(8,4),
  "reliability" DECIMAL(8,6),
  "state" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "assessment_cell_states" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentId" TEXT NOT NULL,
  "cellId" TEXT NOT NULL,
  "value" JSONB,
  "normalizedScore" DECIMAL(8,4),
  "confidence" DECIMAL(8,6) NOT NULL DEFAULT 0,
  "directAnswerCount" INTEGER NOT NULL DEFAULT 0,
  "independentSourceKinds" INTEGER NOT NULL DEFAULT 0,
  "contradictionIndex" DECIMAL(8,6) NOT NULL DEFAULT 0,
  "status" "CellStateStatus" NOT NULL DEFAULT 'UNASSESSED',
  "finalizedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "category_results" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "partialScore" DECIMAL(8,4),
  "officialScore" DECIMAL(8,4),
  "confidence" DECIMAL(8,6),
  "coverage" DECIMAL(8,6),
  "applicableCells" INTEGER NOT NULL,
  "finalizedCells" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "purpose_results" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentId" TEXT NOT NULL,
  "purposeId" TEXT NOT NULL,
  "partialScore" DECIMAL(8,4),
  "officialScore" DECIMAL(8,4),
  "confidence" DECIMAL(8,6),
  "coverage" DECIMAL(8,6),
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "contradictions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentId" TEXT NOT NULL,
  "cellId" TEXT NOT NULL,
  "status" "ContradictionStatus" NOT NULL DEFAULT 'OPEN',
  "severity" TEXT NOT NULL,
  "ruleCode" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3)
);

CREATE TABLE "audit_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentId" TEXT NOT NULL,
  "eventType" "AuditEventType" NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "strategy_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentId" TEXT NOT NULL,
  "rootContractVersion" TEXT NOT NULL,
  "recommendationVersion" TEXT NOT NULL,
  "actionPlanVersion" TEXT NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "root_findings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "strategyRunId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "cellId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "classification" TEXT NOT NULL,
  "findingRole" TEXT NOT NULL,
  "classificationBasis" TEXT NOT NULL,
  "categoryValue" DECIMAL(8,4),
  "cellValue" DECIMAL(8,4),
  "categorySeverity" DECIMAL(8,6) NOT NULL,
  "cellSeverity" DECIMAL(8,6) NOT NULL,
  "categoryEvidence" DECIMAL(8,6) NOT NULL,
  "cellEvidence" DECIMAL(8,6) NOT NULL,
  "categoryRootScore" DECIMAL(8,4) NOT NULL,
  "cellRootScore" DECIMAL(8,4) NOT NULL,
  "rootStrength" DECIMAL(8,6) NOT NULL,
  "incomingCauseSupport" DECIMAL(8,6) NOT NULL,
  "selected" BOOLEAN NOT NULL DEFAULT FALSE,
  "downstream" JSONB NOT NULL,
  "sourceTrace" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "recommendations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "strategyRunId" TEXT NOT NULL,
  "rootFindingId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "cellId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "type" "RecommendationType" NOT NULL,
  "interventionCode" TEXT NOT NULL,
  "titleMn" TEXT NOT NULL,
  "objectiveMn" TEXT NOT NULL,
  "actionMn" TEXT NOT NULL,
  "deliverableMn" TEXT NOT NULL,
  "kpiMn" TEXT NOT NULL,
  "ownerRoleId" TEXT NOT NULL,
  "sponsorRoleId" TEXT NOT NULL,
  "currentCellScore" DECIMAL(8,4),
  "targetCellScore" DECIMAL(8,4),
  "effortLevel" INTEGER NOT NULL,
  "priority" DECIMAL(8,4) NOT NULL,
  "priorityBand" "PriorityBand" NOT NULL,
  "components" JSONB NOT NULL,
  "sourceTrace" JSONB NOT NULL,
  "selectedGroup" TEXT,
  "suppressedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "action_plans" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "strategyRunId" TEXT NOT NULL,
  "contractVersion" TEXT NOT NULL,
  "capacityLevel" INTEGER NOT NULL,
  "windowDays" INTEGER NOT NULL,
  "remeasurement" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "action_plan_milestones" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actionPlanId" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "findingExternalId" TEXT NOT NULL,
  "horizon" TEXT NOT NULL,
  "phaseIndex" INTEGER NOT NULL,
  "requirement" TEXT NOT NULL,
  "titleMn" TEXT NOT NULL,
  "milestoneMn" TEXT NOT NULL,
  "deliverableMn" TEXT NOT NULL,
  "kpiMn" TEXT NOT NULL,
  "ownerRoleId" TEXT NOT NULL,
  "priorityBand" "PriorityBand" NOT NULL,
  "recommendationPriority" DECIMAL(8,4) NOT NULL,
  "scheduleScore" DECIMAL(8,4) NOT NULL,
  "status" "PlanMilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "sourceTrace" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "report_snapshots" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "reportContractVersion" TEXT NOT NULL,
  "aiContractVersion" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "narrative" JSONB,
  "validation" JSONB,
  "generationState" "ReportGenerationState" NOT NULL DEFAULT 'PAYLOAD_FROZEN',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX "methodology_versions_version_key" ON "methodology_versions"("version");
CREATE UNIQUE INDEX "methodology_versions_bundleSha256_key" ON "methodology_versions"("bundleSha256");
CREATE UNIQUE INDEX "modules_methodologyVersionId_code_key" ON "modules"("methodologyVersionId", "code");
CREATE UNIQUE INDEX "modules_methodologyVersionId_nameMn_key" ON "modules"("methodologyVersionId", "nameMn");
CREATE INDEX "modules_methodologyVersionId_orderIndex_idx" ON "modules"("methodologyVersionId", "orderIndex");
CREATE UNIQUE INDEX "categories_methodologyVersionId_externalId_key" ON "categories"("methodologyVersionId", "externalId");
CREATE INDEX "categories_methodologyVersionId_moduleId_idx" ON "categories"("methodologyVersionId", "moduleId");
CREATE UNIQUE INDEX "cell_templates_methodologyVersionId_externalId_key" ON "cell_templates"("methodologyVersionId", "externalId");
CREATE INDEX "cell_templates_methodologyVersionId_orderIndex_idx" ON "cell_templates"("methodologyVersionId", "orderIndex");
CREATE UNIQUE INDEX "diagnostic_cells_methodologyVersionId_externalId_key" ON "diagnostic_cells"("methodologyVersionId", "externalId");
CREATE UNIQUE INDEX "diagnostic_cells_categoryId_cellTemplateId_key" ON "diagnostic_cells"("categoryId", "cellTemplateId");
CREATE INDEX "diagnostic_cells_methodologyVersionId_categoryId_idx" ON "diagnostic_cells"("methodologyVersionId", "categoryId");
CREATE INDEX "diagnostic_cells_cellTemplateId_idx" ON "diagnostic_cells"("cellTemplateId");
CREATE UNIQUE INDEX "questions_methodologyVersionId_externalId_key" ON "questions"("methodologyVersionId", "externalId");
CREATE UNIQUE INDEX "questions_methodologyVersionId_sourceRow_key" ON "questions"("methodologyVersionId", "sourceRow");
CREATE INDEX "questions_primaryCellId_path_idx" ON "questions"("primaryCellId", "path");
CREATE INDEX "questions_categoryId_idx" ON "questions"("categoryId");
CREATE UNIQUE INDEX "question_options_questionId_optionIndex_key" ON "question_options"("questionId", "optionIndex");
CREATE UNIQUE INDEX "question_secondary_targets_questionId_targetCellId_relationCode" ON "question_secondary_targets"("questionId", "targetCellId", "relationCode");
CREATE INDEX "question_secondary_targets_targetCellId_idx" ON "question_secondary_targets"("targetCellId");
CREATE UNIQUE INDEX "profile_questions_methodologyVersionId_externalId_key" ON "profile_questions"("methodologyVersionId", "externalId");
CREATE UNIQUE INDEX "profile_question_options_profileQuestionId_optionIndex_key" ON "profile_question_options"("profileQuestionId", "optionIndex");
CREATE UNIQUE INDEX "scoring_profiles_methodologyVersionId_code_key" ON "scoring_profiles"("methodologyVersionId", "code");
CREATE UNIQUE INDEX "methodology_contracts_methodologyVersionId_sourceName_key" ON "methodology_contracts"("methodologyVersionId", "sourceName");
CREATE UNIQUE INDEX "source_manifest_entries_methodologyVersionId_sourceName_key" ON "source_manifest_entries"("methodologyVersionId", "sourceName");
CREATE UNIQUE INDEX "respondent_roles_methodologyVersionId_externalId_key" ON "respondent_roles"("methodologyVersionId", "externalId");
CREATE UNIQUE INDEX "respondent_roles_methodologyVersionId_code_key" ON "respondent_roles"("methodologyVersionId", "code");
CREATE UNIQUE INDEX "authority_routing_diagnosticCellId_key" ON "authority_routing"("diagnosticCellId");
CREATE INDEX "authority_routing_preferredRoleId_idx" ON "authority_routing"("preferredRoleId");
CREATE UNIQUE INDEX "purpose_definitions_methodologyVersionId_externalId_key" ON "purpose_definitions"("methodologyVersionId", "externalId");
CREATE UNIQUE INDEX "purpose_definitions_methodologyVersionId_code_key" ON "purpose_definitions"("methodologyVersionId", "code");
CREATE UNIQUE INDEX "category_purpose_mappings_categoryId_purposeId_key" ON "category_purpose_mappings"("categoryId", "purposeId");
CREATE INDEX "category_purpose_mappings_purposeId_idx" ON "category_purpose_mappings"("purposeId");
CREATE UNIQUE INDEX "category_dependencies_methodologyVersionId_externalId_key" ON "category_dependencies"("methodologyVersionId", "externalId");
CREATE INDEX "category_dependencies_prerequisiteCategoryId_idx" ON "category_dependencies"("prerequisiteCategoryId");
CREATE INDEX "category_dependencies_dependentCategoryId_idx" ON "category_dependencies"("dependentCategoryId");
CREATE UNIQUE INDEX "cell_dependencies_methodologyVersionId_externalId_prerequisiteC" ON "cell_dependencies"("methodologyVersionId", "externalId", "prerequisiteCellId");
CREATE INDEX "cell_dependencies_prerequisiteCellId_idx" ON "cell_dependencies"("prerequisiteCellId");
CREATE INDEX "cell_dependencies_dependentCellId_idx" ON "cell_dependencies"("dependentCellId");
CREATE INDEX "import_runs_methodologyVersionId_startedAt_idx" ON "import_runs"("methodologyVersionId", "startedAt");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE UNIQUE INDEX "company_memberships_companyId_userId_key" ON "company_memberships"("companyId", "userId");
CREATE INDEX "company_memberships_userId_role_idx" ON "company_memberships"("userId", "role");
CREATE INDEX "company_memberships_companyId_role_idx" ON "company_memberships"("companyId", "role");
CREATE UNIQUE INDEX "refresh_sessions_tokenHash_key" ON "refresh_sessions"("tokenHash");
CREATE INDEX "refresh_sessions_userId_expiresAt_idx" ON "refresh_sessions"("userId", "expiresAt");
CREATE INDEX "refresh_sessions_familyId_idx" ON "refresh_sessions"("familyId");
CREATE INDEX "auth_audit_events_userId_createdAt_idx" ON "auth_audit_events"("userId", "createdAt");
CREATE INDEX "auth_audit_events_eventType_createdAt_idx" ON "auth_audit_events"("eventType", "createdAt");
CREATE UNIQUE INDEX "billing_invoices_providerInvoiceId_key" ON "billing_invoices"("providerInvoiceId");
CREATE UNIQUE INDEX "billing_invoices_senderInvoiceNo_key" ON "billing_invoices"("senderInvoiceNo");
CREATE INDEX "billing_invoices_companyId_createdAt_idx" ON "billing_invoices"("companyId", "createdAt");
CREATE INDEX "billing_invoices_status_createdAt_idx" ON "billing_invoices"("status", "createdAt");
CREATE UNIQUE INDEX "company_entitlements_sourceInvoiceId_key" ON "company_entitlements"("sourceInvoiceId");
CREATE INDEX "company_entitlements_companyId_status_startsAt_idx" ON "company_entitlements"("companyId", "status", "startsAt");
CREATE INDEX "assessments_companyId_createdAt_idx" ON "assessments"("companyId", "createdAt");
CREATE INDEX "assessments_methodologyVersionId_status_idx" ON "assessments"("methodologyVersionId", "status");
CREATE INDEX "assessments_createdByUserId_createdAt_idx" ON "assessments"("createdByUserId", "createdAt");
CREATE INDEX "assessments_entitlementId_idx" ON "assessments"("entitlementId");
CREATE INDEX "assessment_respondents_assessmentId_idx" ON "assessment_respondents"("assessmentId");
CREATE UNIQUE INDEX "assessment_asked_questions_assessmentId_questionId_key" ON "assessment_asked_questions"("assessmentId", "questionId");
CREATE UNIQUE INDEX "assessment_asked_questions_assessmentId_askedOrder_key" ON "assessment_asked_questions"("assessmentId", "askedOrder");
CREATE UNIQUE INDEX "answers_assessmentId_questionId_revision_key" ON "answers"("assessmentId", "questionId", "revision");
CREATE INDEX "answers_assessmentId_active_idx" ON "answers"("assessmentId", "active");
CREATE INDEX "evidence_signals_assessmentId_cellId_active_idx" ON "evidence_signals"("assessmentId", "cellId", "active");
CREATE INDEX "evidence_signals_answerId_active_idx" ON "evidence_signals"("answerId", "active");
CREATE UNIQUE INDEX "assessment_cell_states_assessmentId_cellId_key" ON "assessment_cell_states"("assessmentId", "cellId");
CREATE INDEX "assessment_cell_states_assessmentId_status_idx" ON "assessment_cell_states"("assessmentId", "status");
CREATE UNIQUE INDEX "category_results_assessmentId_categoryId_key" ON "category_results"("assessmentId", "categoryId");
CREATE UNIQUE INDEX "purpose_results_assessmentId_purposeId_key" ON "purpose_results"("assessmentId", "purposeId");
CREATE INDEX "contradictions_assessmentId_status_idx" ON "contradictions"("assessmentId", "status");
CREATE INDEX "audit_events_assessmentId_createdAt_idx" ON "audit_events"("assessmentId", "createdAt");
CREATE UNIQUE INDEX "strategy_runs_assessmentId_key" ON "strategy_runs"("assessmentId");
CREATE UNIQUE INDEX "root_findings_strategyRunId_externalId_key" ON "root_findings"("strategyRunId", "externalId");
CREATE INDEX "root_findings_strategyRunId_selected_idx" ON "root_findings"("strategyRunId", "selected");
CREATE INDEX "root_findings_categoryId_classification_idx" ON "root_findings"("categoryId", "classification");
CREATE UNIQUE INDEX "recommendations_strategyRunId_externalId_key" ON "recommendations"("strategyRunId", "externalId");
CREATE INDEX "recommendations_strategyRunId_selectedGroup_priority_idx" ON "recommendations"("strategyRunId", "selectedGroup", "priority");
CREATE UNIQUE INDEX "action_plans_strategyRunId_key" ON "action_plans"("strategyRunId");
CREATE UNIQUE INDEX "action_plan_milestones_actionPlanId_externalId_key" ON "action_plan_milestones"("actionPlanId", "externalId");
CREATE INDEX "action_plan_milestones_actionPlanId_horizon_status_idx" ON "action_plan_milestones"("actionPlanId", "horizon", "status");
CREATE UNIQUE INDEX "report_snapshots_payloadHash_key" ON "report_snapshots"("payloadHash");
CREATE UNIQUE INDEX "report_snapshots_assessmentId_externalId_key" ON "report_snapshots"("assessmentId", "externalId");
CREATE INDEX "report_snapshots_assessmentId_generatedAt_idx" ON "report_snapshots"("assessmentId", "generatedAt");

ALTER TABLE "modules" ADD CONSTRAINT "modules_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cell_templates" ADD CONSTRAINT "cell_templates_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagnostic_cells" ADD CONSTRAINT "diagnostic_cells_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagnostic_cells" ADD CONSTRAINT "diagnostic_cells_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagnostic_cells" ADD CONSTRAINT "diagnostic_cells_cellTemplateId_fkey" FOREIGN KEY ("cellTemplateId") REFERENCES "cell_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_primaryCellId_fkey" FOREIGN KEY ("primaryCellId") REFERENCES "diagnostic_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_secondary_targets" ADD CONSTRAINT "question_secondary_targets_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_secondary_targets" ADD CONSTRAINT "question_secondary_targets_targetCellId_fkey" FOREIGN KEY ("targetCellId") REFERENCES "diagnostic_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "profile_questions" ADD CONSTRAINT "profile_questions_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "profile_question_options" ADD CONSTRAINT "profile_question_options_profileQuestionId_fkey" FOREIGN KEY ("profileQuestionId") REFERENCES "profile_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scoring_profiles" ADD CONSTRAINT "scoring_profiles_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "methodology_contracts" ADD CONSTRAINT "methodology_contracts_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_manifest_entries" ADD CONSTRAINT "source_manifest_entries_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "respondent_roles" ADD CONSTRAINT "respondent_roles_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "authority_routing" ADD CONSTRAINT "authority_routing_diagnosticCellId_fkey" FOREIGN KEY ("diagnosticCellId") REFERENCES "diagnostic_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "authority_routing" ADD CONSTRAINT "authority_routing_preferredRoleId_fkey" FOREIGN KEY ("preferredRoleId") REFERENCES "respondent_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purpose_definitions" ADD CONSTRAINT "purpose_definitions_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_purpose_mappings" ADD CONSTRAINT "category_purpose_mappings_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_purpose_mappings" ADD CONSTRAINT "category_purpose_mappings_purposeId_fkey" FOREIGN KEY ("purposeId") REFERENCES "purpose_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_dependencies" ADD CONSTRAINT "category_dependencies_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_dependencies" ADD CONSTRAINT "category_dependencies_prerequisiteCategoryId_fkey" FOREIGN KEY ("prerequisiteCategoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_dependencies" ADD CONSTRAINT "category_dependencies_dependentCategoryId_fkey" FOREIGN KEY ("dependentCategoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cell_dependencies" ADD CONSTRAINT "cell_dependencies_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cell_dependencies" ADD CONSTRAINT "cell_dependencies_prerequisiteCellId_fkey" FOREIGN KEY ("prerequisiteCellId") REFERENCES "diagnostic_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cell_dependencies" ADD CONSTRAINT "cell_dependencies_dependentCellId_fkey" FOREIGN KEY ("dependentCellId") REFERENCES "diagnostic_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_audit_events" ADD CONSTRAINT "auth_audit_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_entitlements" ADD CONSTRAINT "company_entitlements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_entitlements" ADD CONSTRAINT "company_entitlements_sourceInvoiceId_fkey" FOREIGN KEY ("sourceInvoiceId") REFERENCES "billing_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "company_entitlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_respondents" ADD CONSTRAINT "assessment_respondents_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_respondents" ADD CONSTRAINT "assessment_respondents_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "respondent_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_asked_questions" ADD CONSTRAINT "assessment_asked_questions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_asked_questions" ADD CONSTRAINT "assessment_asked_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "answers" ADD CONSTRAINT "answers_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "answers" ADD CONSTRAINT "answers_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "assessment_respondents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "answers" ADD CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence_signals" ADD CONSTRAINT "evidence_signals_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_signals" ADD CONSTRAINT "evidence_signals_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_signals" ADD CONSTRAINT "evidence_signals_cellId_fkey" FOREIGN KEY ("cellId") REFERENCES "diagnostic_cells"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_cell_states" ADD CONSTRAINT "assessment_cell_states_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_cell_states" ADD CONSTRAINT "assessment_cell_states_cellId_fkey" FOREIGN KEY ("cellId") REFERENCES "diagnostic_cells"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "category_results" ADD CONSTRAINT "category_results_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_results" ADD CONSTRAINT "category_results_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purpose_results" ADD CONSTRAINT "purpose_results_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purpose_results" ADD CONSTRAINT "purpose_results_purposeId_fkey" FOREIGN KEY ("purposeId") REFERENCES "purpose_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contradictions" ADD CONSTRAINT "contradictions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contradictions" ADD CONSTRAINT "contradictions_cellId_fkey" FOREIGN KEY ("cellId") REFERENCES "diagnostic_cells"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strategy_runs" ADD CONSTRAINT "strategy_runs_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "root_findings" ADD CONSTRAINT "root_findings_strategyRunId_fkey" FOREIGN KEY ("strategyRunId") REFERENCES "strategy_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "root_findings" ADD CONSTRAINT "root_findings_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "root_findings" ADD CONSTRAINT "root_findings_cellId_fkey" FOREIGN KEY ("cellId") REFERENCES "diagnostic_cells"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_strategyRunId_fkey" FOREIGN KEY ("strategyRunId") REFERENCES "strategy_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_rootFindingId_fkey" FOREIGN KEY ("rootFindingId") REFERENCES "root_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_cellId_fkey" FOREIGN KEY ("cellId") REFERENCES "diagnostic_cells"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_strategyRunId_fkey" FOREIGN KEY ("strategyRunId") REFERENCES "strategy_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_plan_milestones" ADD CONSTRAINT "action_plan_milestones_actionPlanId_fkey" FOREIGN KEY ("actionPlanId") REFERENCES "action_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_plan_milestones" ADD CONSTRAINT "action_plan_milestones_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
