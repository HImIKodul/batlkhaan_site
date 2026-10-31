import type { CategoryOutcomePrioritySnapshot, CellConfidenceState, CellStatus } from "../engine/types.js";
import type { RootFinding } from "../strategy/types.js";

export type DiagnosisMetricType = "QUICK_ESTIMATE" | "OFFICIAL_OVERALL_SCORE" | "REVIEW_REQUIRED_SCORE" | "PARTIAL_TERMINAL";
export type DiagnosisResultStatus = "QUICK_ESTIMATE" | "OFFICIAL" | "REVIEW_REQUIRED" | "PARTIAL_TERMINAL";

export interface DiagnosisMetricSlice {
  score: number | null;
  partialScore: number | null;
  officialScore: number | null;
  confidence: number | null;
  coverage: number | null;
  band: string | null;
  isOfficial: boolean;
}

export interface DiagnosisModuleResult extends DiagnosisMetricSlice {
  id: string;
  nameMn: string;
  weightPct: number;
  effectiveOverallWeightPct: number | null;
  contribution: number | null;
  applicableCategoryCount: number;
  finalizedCategoryCount: number;
  unresolvedCategoryCount: number;
  reviewRequiredCategoryCount: number;
  categoryIds: string[];
}

export interface DiagnosisCapabilityResult extends DiagnosisMetricSlice {
  id: string;
  nameMn: string;
  moduleId: string;
  moduleCode: string;
  moduleNameMn: string;
  weightPct: number;
  effectiveModuleWeightPct: number | null;
  contributionToModule: number | null;
  confirmedNotApplicable: boolean;
  applicableCellCount: number;
  finalizedCellCount: number;
  unresolvedCellCount: number;
  reviewRequiredCellCount: number;
}

export interface DiagnosisWeakCell {
  capabilityId: string;
  capabilityNameMn: string;
  moduleId: string;
  moduleCode: string;
  moduleNameMn: string;
  cellId: string;
  cellNameMn: string;
  score: number;
  confidence: number;
  confidenceState: CellConfidenceState | null;
  status: CellStatus;
  severity: number;
  rootClassification: string | null;
  rootStrength: number | null;
  sourceTraceIds: string[];
}

export interface DiagnosisStrength {
  capabilityId: string;
  capabilityNameMn: string;
  moduleId: string;
  moduleCode: string;
  moduleNameMn: string;
  score: number;
  confidence: number;
  coverage: number;
  sourceTraceIds: string[];
  /** VALIDATED = met the evidence thresholds; RELATIVE_RANK = ranked from actual capability scores when too few validated findings exist (quick estimates). */
  basis?: "VALIDATED" | "RELATIVE_RANK";
}

export interface DiagnosisWeakness {
  capabilityId: string;
  capabilityNameMn: string;
  moduleId: string;
  moduleCode: string;
  moduleNameMn: string;
  score: number;
  confidence: number;
  coverage: number;
  severity: number;
  sourceTraceIds: string[];
  /** VALIDATED = met the evidence thresholds; RELATIVE_RANK = ranked from actual capability scores when too few validated findings exist (quick estimates). */
  basis?: "VALIDATED" | "RELATIVE_RANK";
}

export interface DiagnosisEvidenceSummary {
  totalCells: number;
  applicableCells: number;
  knownCells: number;
  unknownCells: number;
  notApplicableCells: number;
  lockedCells: number;
  validatedCells: number;
  estimatedCells: number;
  reviewRequiredCells: number;
  contradictionCells: number;
  confidenceStateCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  weakCellCount: number;
  validatedWeakCellCount: number;
  provisionalWeakCellCount: number;
  weakCells: DiagnosisWeakCell[];
  provisionalWeakCells: DiagnosisWeakCell[];
}

export interface DiagnosisPurposeResult extends DiagnosisMetricSlice {
  id: string;
  nameMn: string;
}

export interface DiagnosisOutcomePriorityResult {
  id: string;
  nameMn: string;
  purposeId: string;
  score: number | null;
  officialScore: number | null;
  confidence: number | null;
  coverage: number | null;
  knownGap: number | null;
  confidenceAdjustedKnownGap: number | null;
  uncertaintyKnownGap: number | null;
  rankedCategoryCount: number;
  topPriorityCategoryIds: string[];
  calculationVersion: "OUTCOME_PRIORITY_V13";
  causalLiftClaimAllowed: false;
  topCategories: Array<CategoryOutcomePrioritySnapshot & { nameMn: string }>;
  interpretation: "DIAGNOSTIC_PRIORITY_NOT_CAUSAL_LIFT";
}

export interface DiagnosisQuality {
  openContradictions: number;
  hardContradictions: number;
  reviewRequiredCells: number;
  incompleteCoverage: boolean;
  quickLimitReached: boolean;
  requiresReview: boolean;
  officialResultAvailable: boolean;
  quickEstimate: boolean;
  warnings: string[];
}

export interface DiagnosisTrace {
  methodologyVersion: string;
  methodologyBundleSha256: string;
  runtimeSnapshotHash: string;
  generatedAt: string;
  versions: {
    scoring: string;
    confidence: string;
    aggregation: string;
    outcomePriority: "OUTCOME_PRIORITY_V13";
    rootCause: string;
    recommendation: string;
    actionPlan: string;
    report: string;
    aiGeneration: string;
  };
}

export interface DiagnosisResultV13 {
  schemaVersion: "MMRI-DIAGNOSIS-RESULT-1.0";
  resultHash: string;
  assessmentId: string;
  companyId: string;
  companyName: string;
  methodologyVersion: string;
  methodologyBundleSha256: string;
  mode: "QUICK" | "FULL";
  status: string;
  routingState: string | null;
  resultStatus: DiagnosisResultStatus;
  metricType: DiagnosisMetricType;
  generatedAt: string;
  overall: DiagnosisMetricSlice & {
    applicableCategoryCount: number;
    completeCategoryCount: number;
    applicableModuleCount: number;
    completeModuleCount: number;
    aggregationVersion: string;
  };
  modules: DiagnosisModuleResult[];
  capabilities: DiagnosisCapabilityResult[];
  evidence: DiagnosisEvidenceSummary;
  strengths: { totalCount: number; items: DiagnosisStrength[] };
  weaknesses: { totalCount: number; items: DiagnosisWeakness[] };
  rootCauses: { weaknessThreshold: number; totalCount: number; selected: RootFinding[]; isProvisional: boolean; interpretation: "DIAGNOSTIC_HYPOTHESIS_NOT_CAUSAL" };
  businessOutcomes: DiagnosisPurposeResult[];
  businessOutcomePriorities: DiagnosisOutcomePriorityResult[];
  outcomeGuardrail: {
    causalFinancialLiftClaimAllowed: false;
    roiPredictionAllowed: false;
    meaning: string;
  };
  quality: DiagnosisQuality;
  trace: DiagnosisTrace;

  // Backward-compatible aliases for existing Results / Comparison clients.
  categories: DiagnosisCapabilityResult[];
  purposes: DiagnosisPurposeResult[];
  outcomePriorities: DiagnosisOutcomePriorityResult[];
  openContradictions: number;
}
