export interface BundleCategory {
  ID: string;
  Category: string;
  Module: string;
  "Module weight %": number;
  "Category weight %": number;
}

export interface BundleCellTemplate {
  ID: string;
  "Diagnostic cell": string;
  Group: string;
  Role: string;
  "Weight %": number;
  "N/A eligible": string;
}

export interface BundleCellInstance {
  cellInstanceId: string;
  weightPctOverride?: number | null;
  categoryId: string;
  cellId: string;
  naPolicy: "CATEGORY_GATE" | "CONDITIONAL" | "DISALLOWED";
  directQuestionCount: number;
  independentSourceKinds: number;
  minimumThreePathConfidenceAtAuthority075: number;
  preferredRole: string;
  preferredAuthority: number;
  coverageStatus: string;
}

export interface BundleQuestion {
  questionId: string;
  sourceRow: number;
  categoryId: string;
  cellId: string;
  path: number;
  sourceKind: "SELF_REPORT" | "RECENT_CASE" | "RECORD_CHECK" | "ADDITIONAL_CHECK";
  textMn: string;
  optionsMn: string[];
  explicitOptions?: Array<{
    optionIndex: number;
    labelMn: string;
    score: number | null;
    state: string;
  }>;
  scoringProfileCode?: string;
  primaryCoefficient: number;
  secondaryTargets: Array<{ targetCell: string; coefficient: number; relation: string }>;
}

export interface BundleQuestionRuntimePolicy {
  questionId: string;
  questionRole: string;
  scoreEligible: boolean;
  scoringMethod: string;
  scoredOptionCount: number;
  scorePatternCode: string;
  directAskAllowed: boolean;
  routingState: string;
  askStage: string;
  selectionPriority: number;
  isAnchor: boolean;
  applicabilityGateKey: string;
  triggerRuleId: string;
  confidenceRuleId: string;
  defaultAsk: boolean;
  stopRuleId: string;
}

export interface BundleCellRuntimePolicy {
  cellExternalId: string;
  stableCellId: string;
  applicabilityMode: string;
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

export interface BundleRuntimeRule {
  ruleId: string;
  ruleType: string;
  definition: unknown;
}

export interface BundleRuntimeScorePattern {
  code: string;
  scoreEligible: boolean;
  scoredOptionCount: number;
  optionScores: Array<number | null>;
}

export interface BundleRuntimePolicy {
  version: string;
  baseStructuralMethodologyVersion: string;
  questionPolicies: BundleQuestionRuntimePolicy[];
  cellPolicies: BundleCellRuntimePolicy[];
  rules: BundleRuntimeRule[];
  scorePatterns: BundleRuntimeScorePattern[];
}

export interface MethodologyBundle {
  domainCode?: "marketing" | "it" | "finance" | "people" | "operations";
  engineKind?: "MARKETING_V3" | "BUSINESSMRI_V2";
  methodologyVersion?: string;
  questionBankVersion?: string;
  releaseStatus?: string;
  semanticVersionClass?: string;
  bundleVersion: string;
  sourceMethodology: string;
  generatedAtUtc?: string;
  validation: Record<string, unknown>;
  categories: BundleCategory[];
  cellTemplates: BundleCellTemplate[];
  cellInstances: BundleCellInstance[];
  questions: BundleQuestion[];
  profileQuestions: Array<{ id: string; questionMn: string; type?: string | null; optionsMn: string[] }>;
  contracts: Record<string, any>;
  sourceManifest: Record<string, { version: string; sha256: string; chunks: number; size: number; role: string }>;
  runtimePolicy?: BundleRuntimePolicy;
}
