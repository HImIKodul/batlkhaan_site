ALTER TABLE "purpose_results"
  ADD COLUMN "knownGap" DECIMAL(8,4),
  ADD COLUMN "confidenceAdjustedKnownGap" DECIMAL(8,4),
  ADD COLUMN "uncertaintyKnownGap" DECIMAL(8,4),
  ADD COLUMN "rankedCategoryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "topPriorityCategoryIds" JSONB,
  ADD COLUMN "calculationVersion" TEXT NOT NULL DEFAULT 'LEGACY';

CREATE INDEX "purpose_results_assessmentId_calculationVersion_idx"
  ON "purpose_results"("assessmentId", "calculationVersion");

CREATE TABLE "category_outcome_priority_results" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "purposeId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "relevance" DECIMAL(6,4) NOT NULL,
  "structuralWeight" DECIMAL(10,6) NOT NULL,
  "effectivePurposeWeightPct" DECIMAL(8,4) NOT NULL,
  "categoryScore" DECIMAL(8,4) NOT NULL,
  "categoryGap" DECIMAL(8,4) NOT NULL,
  "confidence" DECIMAL(8,6),
  "coverage" DECIMAL(8,6),
  "gapContribution" DECIMAL(8,4) NOT NULL,
  "confidenceAdjustedGapContribution" DECIMAL(8,4) NOT NULL,
  "uncertaintyGapContribution" DECIMAL(8,4) NOT NULL,
  "relativePriority" DECIMAL(8,6) NOT NULL,
  "rank" INTEGER NOT NULL,
  "calculationVersion" TEXT NOT NULL DEFAULT 'OUTCOME_PRIORITY_V13',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "category_outcome_priority_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "category_outcome_priority_results_assessmentId_purposeId_categoryId_key"
  ON "category_outcome_priority_results"("assessmentId", "purposeId", "categoryId");
CREATE INDEX "category_outcome_priority_results_assessmentId_purposeId_rank_idx"
  ON "category_outcome_priority_results"("assessmentId", "purposeId", "rank");
CREATE INDEX "category_outcome_priority_results_assessmentId_categoryId_idx"
  ON "category_outcome_priority_results"("assessmentId", "categoryId");

ALTER TABLE "category_outcome_priority_results"
  ADD CONSTRAINT "category_outcome_priority_results_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_outcome_priority_results"
  ADD CONSTRAINT "category_outcome_priority_results_purposeId_fkey"
  FOREIGN KEY ("purposeId") REFERENCES "purpose_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "category_outcome_priority_results"
  ADD CONSTRAINT "category_outcome_priority_results_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
