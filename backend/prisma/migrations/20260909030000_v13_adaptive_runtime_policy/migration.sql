CREATE TABLE "question_runtime_policies" (
  "id" TEXT PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "questionRole" TEXT NOT NULL,
  "scoreEligible" BOOLEAN NOT NULL,
  "scoringMethod" TEXT NOT NULL,
  "scoredOptionCount" INTEGER NOT NULL,
  "scorePatternCode" TEXT NOT NULL,
  "directAskAllowed" BOOLEAN NOT NULL DEFAULT TRUE,
  "routingState" TEXT NOT NULL DEFAULT 'DIRECT_ALLOWED',
  "askStage" TEXT NOT NULL,
  "selectionPriority" INTEGER NOT NULL,
  "isAnchor" BOOLEAN NOT NULL DEFAULT FALSE,
  "applicabilityGateKey" TEXT NOT NULL,
  "triggerRuleId" TEXT NOT NULL,
  "confidenceRuleId" TEXT NOT NULL,
  "defaultAsk" BOOLEAN NOT NULL DEFAULT FALSE,
  "stopRuleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "question_runtime_policies_questionId_key" ON "question_runtime_policies"("questionId");
CREATE INDEX "question_runtime_policies_methodologyVersionId_askStage_selectionPriority_idx" ON "question_runtime_policies"("methodologyVersionId","askStage","selectionPriority");
CREATE INDEX "question_runtime_policies_methodologyVersionId_applicabilityGateKey_idx" ON "question_runtime_policies"("methodologyVersionId","applicabilityGateKey");

CREATE TABLE "cell_runtime_policies" (
  "id" TEXT PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "diagnosticCellId" TEXT NOT NULL,
  "applicabilityMode" TEXT NOT NULL,
  "applicabilityGateKey" TEXT NOT NULL,
  "isAnchorCell" BOOLEAN NOT NULL DEFAULT FALSE,
  "directAskableQuestions" INTEGER NOT NULL,
  "maxDirectQuestions" INTEGER NOT NULL,
  "indirectConfidenceCap" DECIMAL(8,6) NOT NULL,
  "primaryConfidenceFloor" DECIMAL(8,6) NOT NULL,
  "lockThreshold" DECIMAL(8,6) NOT NULL,
  "conflictGapThreshold" DECIMAL(8,4) NOT NULL,
  "stateModelId" TEXT NOT NULL,
  "valueRuleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "cell_runtime_policies_diagnosticCellId_key" ON "cell_runtime_policies"("diagnosticCellId");
CREATE INDEX "cell_runtime_policies_methodologyVersionId_applicabilityMode_idx" ON "cell_runtime_policies"("methodologyVersionId","applicabilityMode");
CREATE INDEX "cell_runtime_policies_methodologyVersionId_applicabilityGateKey_idx" ON "cell_runtime_policies"("methodologyVersionId","applicabilityGateKey");

CREATE TABLE "runtime_rule_definitions" (
  "id" TEXT PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "ruleType" TEXT NOT NULL,
  "definition" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "runtime_rule_definitions_methodologyVersionId_ruleId_key" ON "runtime_rule_definitions"("methodologyVersionId","ruleId");
CREATE INDEX "runtime_rule_definitions_methodologyVersionId_ruleType_idx" ON "runtime_rule_definitions"("methodologyVersionId","ruleType");

CREATE TABLE "runtime_score_patterns" (
  "id" TEXT PRIMARY KEY,
  "methodologyVersionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "scoreEligible" BOOLEAN NOT NULL,
  "scoredOptionCount" INTEGER NOT NULL,
  "optionScores" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "runtime_score_patterns_methodologyVersionId_code_key" ON "runtime_score_patterns"("methodologyVersionId","code");

ALTER TABLE "question_runtime_policies" ADD CONSTRAINT "question_runtime_policies_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_runtime_policies" ADD CONSTRAINT "question_runtime_policies_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cell_runtime_policies" ADD CONSTRAINT "cell_runtime_policies_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cell_runtime_policies" ADD CONSTRAINT "cell_runtime_policies_diagnosticCellId_fkey" FOREIGN KEY ("diagnosticCellId") REFERENCES "diagnostic_cells"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "runtime_rule_definitions" ADD CONSTRAINT "runtime_rule_definitions_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "runtime_score_patterns" ADD CONSTRAINT "runtime_score_patterns_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "methodology_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
