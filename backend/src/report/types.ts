import type { HorizonId, Recommendation, RootFinding } from "../strategy/types.js";

export type MetricType = "QUICK_ESTIMATE" | "OFFICIAL_OVERALL_SCORE" | "REVIEW_REQUIRED_SCORE" | "NONE";

export interface ReportMetric {
  score: number | null;
  confidence: number | null;
  coverage: number | null;
  band: string | null;
}

export interface ReportPurpose extends ReportMetric {
  id: string;
  nameMn: string;
}

export interface StrengthFinding {
  id: string;
  categoryId: string;
  nameMn: string;
  score: number;
  confidence: number;
  coverage: number;
  sourceTraceIds: string[];
  basis?: "VALIDATED" | "RELATIVE_RANK";
}

export interface WeaknessFinding {
  id: string;
  categoryId: string;
  nameMn: string;
  score: number;
  confidence: number;
  coverage: number;
  severity: number;
  sourceTraceIds: string[];
  basis?: "VALIDATED" | "RELATIVE_RANK";
}

export interface ReportRisk {
  id: string;
  type: "CONTRADICTION" | "EVIDENCE_GAP" | "REVIEW_REQUIRED" | "QUICK_LIMIT" | "INCOMPLETE_SCOPE";
  messageMn: string;
  sourceTraceIds: string[];
}

export interface RoadmapRow {
  horizon: HorizonId;
  nameMn: string;
  dayStart: number;
  dayEnd: number;
  milestones: Array<{
    milestoneId: string;
    recommendationId: string;
    titleMn: string;
    milestoneMn: string;
    deliverableMn: string;
    ownerRoleId: string;
    ownerRoleLabelMn: string;
    kpiMn: string;
    sourceTraceIds: string[];
  }>;
}

export interface FrozenReportPayload {
  payloadVersion: "MMRI-REPORT-PAYLOAD-1.1" | "MMRI-REPORT-PAYLOAD-1.2" | "MMRI-REPORT-PAYLOAD-1.3";
  payloadHash: string;
  diagnosisResultHash: string;
  strategyHash: string;
  planHash: string;
  bindingHash: string;
  reportId: string;
  reportContractVersion: string;
  findingsPolicyVersion: "MMRI-REPORT-FINDINGS-1.0-FIVE-CATEGORY";
  traceVersion: "MMRI-TRACE-1.0";
  versionBundleId: string;
  versionBundleHash: string;
  sourceSnapshotId: string;
  sourceSnapshotHash: string;
  assessmentId: string;
  assessmentMode: "QUICK" | "FULL";
  assessmentStatus: string;
  routingState: string | null;
  generatedAt: string;
  companyName: string;
  methodologyVersion: string;
  metricType: MetricType;
  overall: ReportMetric;
  purposes: ReportPurpose[];
  strengths: StrengthFinding[];
  weaknesses: WeaknessFinding[];
  rootFindings: RootFinding[];
  priorityActions: Recommendation[];
  evidenceActions: Recommendation[];
  roadmap: RoadmapRow[];
  risks: ReportRisk[];
  remeasurement: { horizon: HorizonId; labelMn: string };
  requiredWarnings: string[];
  displayDictionary: Record<string,string>;
  traceIndex: Record<string,{kind:string; ref:string}>;
  versions: {
    methodology: string;
    scoring: string;
    confidence: string;
    rootCause: string;
    recommendation: string;
    actionPlan: string;
    report: string;
    aiGeneration: string;
  };
}

export type ClaimType =
  | "DESCRIPTIVE_SCORE"
  | "CONFIDENCE_STATEMENT"
  | "STRENGTH"
  | "WEAKNESS"
  | "PRIMARY_CAUSE"
  | "CONTRIBUTING_CAUSE"
  | "POSSIBLE_CAUSE"
  | "RECOMMENDATION"
  | "ROADMAP"
  | "RISK";

export interface NarrativeClaim {
  reportClaimId?: string;
  claimType: ClaimType;
  textMn: string;
  sourceTraceIds: string[];
  rootFindingId?: string;
  recommendationId?: string;
  milestoneId?: string;
}

export interface NarrativeSection {
  id: "S01"|"S02"|"S03"|"S04"|"S05"|"S06"|"S07"|"S08"|"S09"|"S10";
  titleMn: string;
  claims: NarrativeClaim[];
}

export interface NarrativeDraft {
  schemaVersion: "MMRI-NARRATIVE-DRAFT-1.0";
  payloadHash: string;
  sections: NarrativeSection[];
}


export interface NarrativeProviderMetadata {
  provider: "OPENAI_RESPONSES" | "CUSTOM" | "NONE";
  modelIdentifier: string;
  modelConfig: Record<string, unknown>;
  promptVersion: string;
}

export interface NarrativeProviderTelemetry {
  httpAttempts: number;
  retryCount: number;
  requestIds: string[];
  finalHttpStatus: number | null;
  durationMs: number;
}

/** MMRI-43: a failing provider call still reports what it did. Providers attach this to the error they throw. */
export class NarrativeProviderError extends Error {
  readonly telemetry: NarrativeProviderTelemetry;
  constructor(message: string, telemetry: NarrativeProviderTelemetry) { super(message); this.name = "NarrativeProviderError"; this.telemetry = telemetry; }
}

export interface NarrativeProviderResult {
  draft: NarrativeDraft;
  telemetry?: NarrativeProviderTelemetry;
}

export interface ReportBinding {
  diagnosisResultHash: string;
  strategyHash: string;
  planHash: string;
  bindingHash: string;
}

export interface NarrativeValidationIssue {
  checkId: string;
  severity: "BLOCK" | "REPAIR";
  message: string;
}

export interface NarrativeValidationResult {
  state: "PASS" | "REPAIR_REQUIRED" | "GENERATION_BLOCKED";
  issues: NarrativeValidationIssue[];
  wordCount: number;
}
