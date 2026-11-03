export type SourceKind = "SELF_REPORT" | "RECENT_CASE" | "RECORD_CHECK" | "ADDITIONAL_CHECK" | "RESERVE" | "RESOLVER";
export type SignalState = "SCORED" | "DNK" | "N_A_CLAIM" | "UNAVAILABLE" | "PARTIAL_APPLICABILITY" | "MOSTLY_APPLICABLE" | "APPLICABLE" | string;
export type CellStatus = "UNASSESSED" | "GATHERING" | "DIRECT_PROVISIONAL" | "DERIVED_PROVISIONAL" | "REVIEW_REQUIRED" | "DIRECT_FINAL" | "NOT_APPLICABLE" | "UNRESOLVED";
export type CellConfidenceState = "UNASSESSED" | "UNKNOWN" | "ESTIMATED" | "VALIDATED" | "LOCKED" | "NOT_APPLICABLE";
export type AssessmentMode = "QUICK" | "FULL";

export type AdaptiveAskStage = "PROFILE_SCREEN" | "ANCHOR" | "PRIMARY_GAP_FILL" | "CONFIRM" | "CONFLICT" | "FALLBACK" | "NEVER_DIRECT";
export type AdaptiveApplicabilityStatus = "TRUE" | "FALSE" | "UNKNOWN";

export interface QuestionRuntimePolicyDef {
  questionId: string;
  questionRole: string;
  scoreEligible: boolean;
  scoringMethod: string;
  scoredOptionCount: number;
  scorePatternCode: string;
  directAskAllowed: boolean;
  routingState: string;
  askStage: AdaptiveAskStage;
  selectionPriority: number;
  isAnchor: boolean;
  applicabilityGateKey: string;
  triggerRuleId: string;
  confidenceRuleId: string;
  defaultAsk: boolean;
  stopRuleId: string;
}

export interface CellRuntimePolicyDef {
  categoryId: string;
  cellId: string;
  applicabilityMode: "STANDARD" | "CONDITIONAL" | "INFER_ONLY" | string;
  applicabilityGateKey: string;
  isAnchorCell: boolean;
  directAskableQuestions: number;
  maxDirectQuestions: number;
  indirectConfidenceCap: number;
  primaryConfidenceFloor: number;
  lockThreshold: number;
  conflictGapThreshold: number;
  stateModelId: string;
  valueRuleId: string;
}

export interface RuntimeRuleDef {
  ruleId: string;
  ruleType: string;
  definition: unknown;
}

export interface RuntimeScorePatternDef {
  code: string;
  scoreEligible: boolean;
  scoredOptionCount: number;
  optionScores: Array<number | null>;
}

export interface AdaptiveRuntimePolicyDefinition {
  enabled: true;
  questionById: Map<string, QuestionRuntimePolicyDef>;
  cellByCategoryCell: Map<string, CellRuntimePolicyDef>;
  ruleById: Map<string, RuntimeRuleDef>;
  scorePatternByCode: Map<string, RuntimeScorePatternDef>;
}

export interface EngineContracts {
  confidence: any;
  scoring: any;
  authority: any;
  naDnk: any;
  manyToMany: any;
  contradiction: any;
  routing: any;
  profileRelevance: any;
  companyProfile: any;
  purposes: any;
  rootCause: any;
  recommendation: any;
  actionPlan: any;
  report: any;
  aiGeneration: any;
}

export interface ModuleDef {
  id: string;
  code: string;
  nameMn: string;
  weightPct: number;
  orderIndex: number;
}

export interface CategoryDef {
  id: string;
  nameMn: string;
  weightPct: number;
  module: string;
  orderIndex: number;
  baseProfileRelevance: number;
}

export interface CellDef {
  id: string;
  nameMn: string;
  weightPct: number;
  naPolicy: "CATEGORY_GATE" | "CONDITIONAL" | "DISALLOWED";
  orderIndex: number;
}

export interface OptionDef {
  optionIndex: number;
  labelMn: string;
  score: number | null;
  state: SignalState;
}

export interface QuestionDef {
  id: string;
  categoryId: string;
  cellId: string;
  path: number;
  sourceKind: SourceKind;
  sourceRow: number;
  textMn: string;
  scoringProfileCode: string;
  options: OptionDef[];
  secondaryTargets: Array<{ targetCellId: string; coefficient: number; relation: string }>;
}

export interface SecondaryEdge {
  sourceCellId: string;
  targetCellId: string;
  coefficient: number;
  relation: string;
}

export interface MethodologyDefinition {
  version: string;
  /** SHA-256 of the exact bundle imported as this methodology version (methodology_versions.bundleSha256). */
  bundleSha256?: string;
  /** Question-bank version of this methodology version (see methodology-provenance.ts). */
  questionBankVersion?: string;
  domainCode?: "marketing" | "it" | "finance" | "people" | "operations";
  engineKind?: "MARKETING_V3" | "BUSINESSMRI_V2";
  cellWeightByCategoryCell?: Map<string, number>;
  modules: ModuleDef[];
  categories: CategoryDef[];
  cells: CellDef[];
  questions: QuestionDef[];
  questionById: Map<string, QuestionDef>;
  questionByCategoryCellPath: Map<string, QuestionDef>;
  secondaryEdges: SecondaryEdge[];
  incomingEdgesByTarget: Map<string, SecondaryEdge[]>;
  contracts: EngineContracts;
  runtimePolicy?: AdaptiveRuntimePolicyDefinition;
  maxCategoryWeight: number;
  maxScoredCellWeight: number;
}

export interface ProfileAnswer {
  questionId: string;
  optionIndexes: number[];
}

export interface DirectEvidence {
  questionId: string;
  categoryId: string;
  cellId: string;
  path: number;
  sourceKind: SourceKind;
  score: number | null;
  state: SignalState;
  optionIndex: number;
  optionLabel: string;
  scoringProfileCode: string;
  authority: number;
  reliability: number;
  respondentRoleId?: string;
}

export interface DerivedContribution {
  sourceCellId: string;
  targetCellId: string;
  sourceValue: number;
  sourceDirectConfidence: number;
  coefficient: number;
  weightedStrength: number;
}

export interface CellSnapshot {
  categoryId: string;
  cellId: string;
  status: CellStatus;
  directScore: number | null;
  directConfidence: number;
  derivedScore: number | null;
  derivedConfidence: number;
  effectiveScore: number | null;
  effectiveConfidence: number;
  directAnswerCount: number;
  independentSourceKinds: number;
  maxAcceptedAuthority: number;
  naClaimCount: number;
  naClaimConfidence: number;
  applicabilityRelevance: number | null;
  hasHardContradiction: boolean;
  hasSameCellVariance: boolean;
  hasSecondaryTension: boolean;
  hardContradictionRuleIds: string[];
  tensionRuleIds: string[];
  directEvidence: DirectEvidence[];
  derivedContributions: DerivedContribution[];
  exhausted: boolean;
  /** v13 policy-aware confidence state; omitted by legacy snapshots. */
  confidenceState?: CellConfidenceState;
  locked?: boolean;
  lockReason?: string | null;
  scoreDispersion?: number | null;
  clusterSize?: number;
  evidenceCount?: number;
}

export interface ContradictionFinding {
  ruleId: string;
  type: "HARD" | "TENSION" | "SECONDARY_TENSION";
  flag: string;
  categoryId: string;
  affectedCellIds: string[];
  reason: string;
}

export interface CategorySnapshot {
  categoryId: string;
  moduleId: string;
  confirmedNotApplicable: boolean;
  partialScore: number | null;
  officialScore: number | null;
  confidence: number | null;
  coverage: number | null;
  applicableCellCount: number;
  finalizedCellCount: number;
  unresolvedCellCount: number;
  reviewRequiredCellCount: number;
  baseWeightPct: number;
  effectiveModuleWeightPct: number | null;
  partialContributionToModule: number | null;
  officialContributionToModule: number | null;
}

export interface ModuleSnapshot {
  moduleId: string;
  partialScore: number | null;
  officialScore: number | null;
  confidence: number | null;
  coverage: number | null;
  applicableCategoryCount: number;
  finalizedCategoryCount: number;
  unresolvedCategoryCount: number;
  reviewRequiredCategoryCount: number;
  baseWeightPct: number;
  effectiveOverallWeightPct: number | null;
  partialContribution: number | null;
  officialContribution: number | null;
}

export interface PurposeSnapshot {
  purposeId: string;
  partialScore: number | null;
  officialScore: number | null;
  confidence: number | null;
  coverage: number | null;
}

export interface CategoryOutcomePrioritySnapshot {
  purposeId: string;
  categoryId: string;
  relevance: number;
  baseCategoryWeightPct: number;
  structuralWeight: number;
  effectivePurposeWeightPct: number;
  categoryScore: number;
  categoryGap: number;
  confidence: number | null;
  coverage: number | null;
  gapContribution: number;
  confidenceAdjustedGapContribution: number;
  uncertaintyGapContribution: number;
  relativePriority: number;
  rank: number;
}

export interface OutcomePrioritySnapshot {
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
}

export interface OverallSnapshot {
  partialScore: number | null;
  officialScore: number | null;
  confidence: number | null;
  coverage: number | null;
  applicableCategoryCount: number;
  completeCategoryCount: number;
  applicableModuleCount: number;
  completeModuleCount: number;
  aggregationVersion: "HIERARCHICAL_V13" | "LEGACY";
}

export interface RuntimeSnapshot {
  cells: Map<string, CellSnapshot>;
  categories: Map<string, CategorySnapshot>;
  modules: Map<string, ModuleSnapshot>;
  contradictions: ContradictionFinding[];
  overall: OverallSnapshot;
  purposes: Map<string, PurposeSnapshot>;
  outcomePriorities: Map<string, OutcomePrioritySnapshot>;
  categoryOutcomePriorities: Map<string, CategoryOutcomePrioritySnapshot>;
}

export interface QuestionPriorityReason {
  categoryImportance: number;
  cellImportance: number;
  profileRelevance: number;
  uncertainty: number;
  finalizationProximity: number;
  coverageGap: number;
  eventBoost: number;
  eventFlags: string[];
}

export interface RankedQuestion {
  question: QuestionDef;
  priority: number;
  reason: QuestionPriorityReason;
}

export interface RoutingInput {
  mode: AssessmentMode;
  snapshot: RuntimeSnapshot;
  evidence: DirectEvidence[];
  askedQuestionIds: Set<string>;
  profileAnswers?: ProfileAnswer[];
  diagnosticQuestionCount: number;
  applicabilityByGate?: Map<string, AdaptiveApplicabilityStatus>;
  relevantCapabilityCount?: number;
}

export interface RoutingDecision {
  state: string;
  nextQuestion: RankedQuestion | null;
  stopReason?: string;
}
