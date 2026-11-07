ALTER TABLE "assessments"
  ADD COLUMN "aggregationVersion" TEXT NOT NULL DEFAULT 'LEGACY';

ALTER TABLE "category_results"
  ADD COLUMN "effectiveModuleWeightPct" DECIMAL(8,4),
  ADD COLUMN "partialContributionToModule" DECIMAL(8,4),
  ADD COLUMN "officialContributionToModule" DECIMAL(8,4),
  ADD COLUMN "aggregationVersion" TEXT NOT NULL DEFAULT 'LEGACY';

CREATE TABLE "module_results" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "partialScore" DECIMAL(8,4),
  "officialScore" DECIMAL(8,4),
  "confidence" DECIMAL(8,6),
  "coverage" DECIMAL(8,6),
  "applicableCategories" INTEGER NOT NULL,
  "finalizedCategories" INTEGER NOT NULL,
  "unresolvedCategories" INTEGER NOT NULL,
  "reviewRequiredCategories" INTEGER NOT NULL,
  "baseWeightPct" DECIMAL(8,4) NOT NULL,
  "effectiveOverallWeightPct" DECIMAL(8,4),
  "partialContribution" DECIMAL(8,4),
  "officialContribution" DECIMAL(8,4),
  "aggregationVersion" TEXT NOT NULL DEFAULT 'LEGACY',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "module_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "module_results_assessmentId_moduleId_key"
  ON "module_results"("assessmentId", "moduleId");
CREATE INDEX "module_results_assessmentId_aggregationVersion_idx"
  ON "module_results"("assessmentId", "aggregationVersion");

ALTER TABLE "module_results"
  ADD CONSTRAINT "module_results_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "module_results"
  ADD CONSTRAINT "module_results_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
