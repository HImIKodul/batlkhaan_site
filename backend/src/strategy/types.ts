import type { ProfileAnswer, RuntimeSnapshot } from "../engine/types.js";
import type { MethodologyDefinition } from "../engine/types.js";

export type RootClassification =
  | "PRIMARY_ROOT_CAUSE"
  | "CONTRIBUTING_CAUSE"
  | "POSSIBLE_CAUSE"
  | "WEAKNESS_ONLY"
  | "LIKELY_SYMPTOM"
  | "ISOLATED_WEAKNESS"
  | "EVIDENCE_GAP";

export type FindingRole = "ROOT" | "INTERMEDIATE" | "SYMPTOM" | "ISOLATED" | "EVIDENCE_GAP";

export interface RootFinding {
  id: string;
  categoryId: string;
  cellId: string;
  categoryValue: number | null;
  cellValue: number | null;
  categorySeverity: number;
  cellSeverity: number;
  categoryEvidenceFactor: number;
  cellEvidenceFactor: number;
  categoryRootScore: number;
  cellRootScore: number;
  rootStrength: number;
  incomingCauseSupport: number;
  classification: RootClassification;
  role: FindingRole;
  classificationBasis: "CATEGORY" | "CELL" | "EVIDENCE" | "POSITION";
  downstreamCategoryIds: string[];
  downstreamCellIds: string[];
  sourceTraceIds: string[];
}

export interface RootCauseResult {
  version: string;
  weaknessThreshold: number;
  findings: RootFinding[];
  selectedFindings: RootFinding[];
}

export type RecommendationType =
  | "EXECUTION"
  | "LOCAL_IMPROVEMENT"
  | "VALIDATE_CAUSE"
  | "COLLECT_EVIDENCE"
  | "RESOLVE_EVIDENCE";

export type PriorityBand = "P1" | "P2" | "P3" | "P4";

export interface PriorityComponents {
  rootStrength: number;
  severity: number;
  categoryImportance: number;
  purposeEmphasis: number;
  evidence: number;
  feasibility: number;
}

export interface Recommendation {
  id: string;
  findingId: string;
  type: RecommendationType;
  categoryId: string;
  cellId: string;
  interventionCode: string;
  titleMn: string;
  objectiveMn: string;
  actionMn: string;
  deliverableMn: string;
  kpiMn: string;
  ownerRoleId: string;
  sponsorRoleId: string;
  currentCellScore: number | null;
  targetCellScore: number | null;
  targetIsPrediction: false;
  effortLevel: number;
  priority: number;
  priorityBand: PriorityBand;
  components: PriorityComponents;
  sourceTraceIds: string[];
  affectedScopes: Array<{ findingId: string; categoryId: string; cellId: string }>;
  causalInterpretation: "DIAGNOSTIC_HYPOTHESIS_NOT_CAUSAL";
  suppressedReason?: string;
}

export interface RecommendationResult {
  version: string;
  capacityLevel: number;
  selectedPurposeId: string | null;
  candidates: Recommendation[];
  executionActions: Recommendation[];
  evidenceActions: Recommendation[];
  suppressed: Recommendation[];
}

export type HorizonId = "H0" | "H1" | "H2" | "H3" | "H4";
export type MilestoneRequirement = "Required" | "Monitor";
export type MilestoneStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "BLOCKED" | "SKIPPED";
export type PlanDependencyKind = "ROOT_CAUSE_GRAPH" | "SAME_FINDING_EVIDENCE";

export interface PlanDependency {
  id: string;
  kind: PlanDependencyKind;
  upstreamRecommendationId: string;
  downstreamRecommendationId: string;
  sourceTraceIds: string[];
}

export interface PlanMilestone {
  id: string;
  recommendationId: string;
  findingId: string;
  horizon: HorizonId | "DEFERRED_BEYOND_V1";
  phaseIndex: number;
  requirement: MilestoneRequirement;
  titleMn: string;
  milestoneMn: string;
  deliverableMn: string;
  kpiMn: string;
  ownerRoleId: string;
  priorityBand: PriorityBand;
  recommendationPriority: number;
  scheduleScore: number;
  sourceTraceIds: string[];
  status: MilestoneStatus;
}

export interface ActionPlan {
  version: string;
  capacityLevel: number;
  windowDays: 365;
  horizons: Array<{ id: HorizonId; name: string; dayStart: number; dayEnd: number }>;
  includedRecommendationIds: string[];
  dependencies: PlanDependency[];
  milestones: PlanMilestone[];
  remeasurementHorizons: HorizonId[];
}

export interface PlanProgress {
  actionProgress: Record<string, number>;
  planProgress: number;
  health: "ON_TRACK" | "AT_RISK" | "OFF_TRACK";
  overdueCriticalMilestones: string[];
  blockedCriticalMilestones: string[];
  skippedCriticalMilestones: string[];
}

export interface StrategyInput {
  methodology: MethodologyDefinition;
  snapshot: RuntimeSnapshot;
  profileAnswers?: ProfileAnswer[];
}

export interface StrategyResult {
  rootCause: RootCauseResult;
  recommendations: RecommendationResult;
  actionPlan: ActionPlan;
}
