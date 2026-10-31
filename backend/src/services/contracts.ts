import type {
  AssessmentMode,
  CategorySnapshot,
  ModuleSnapshot,
  OverallSnapshot,
  ProfileAnswer,
  PurposeSnapshot,
  OutcomePrioritySnapshot,
  RoutingDecision
} from "../engine/types.js";
import type { RespondentAuthorityMetadata } from "../engine/authority.js";

export interface SubmitAnswerResult {
  accepted: true;
  answerId: string;
  routing: RoutingDecision;
  overall: OverallSnapshot;
  category: CategorySnapshot | undefined;
  modules: Record<string, ModuleSnapshot>;
  purposes: Record<string, PurposeSnapshot>;
  outcomePriorities: Record<string, OutcomePrioritySnapshot>;
}

export interface CompletionResult {
  completed: boolean;
  reason?: string;
  routingState: string;
  overall: OverallSnapshot;
}

/**
 * Public service-level contract implemented by PrismaAssessmentEngine.
 * Persistence model types are deliberately not exposed here.
 */
export interface AssessmentEngine {
  createAssessment(companyId: string, methodologyVersion?: string, createdByUserId?: string, entitlementId?: string | null, domainCode?: string): Promise<unknown>;
  addRespondent(assessmentId: string, roleExternalId: string, displayName?: string, authorityMetadata?: RespondentAuthorityMetadata): Promise<unknown>;
  startAssessment(assessmentId: string, mode: AssessmentMode, profileAnswers: ProfileAnswer[]): Promise<RoutingDecision>;
  selectNextQuestion(assessmentId: string): Promise<RoutingDecision>;
  issueNextQuestion(assessmentId: string): Promise<RoutingDecision>;
  submitAnswer(assessmentId: string, questionExternalId: string, optionIndex: number, respondentId?: string): Promise<SubmitAnswerResult>;
  getRuntimeSnapshot(assessmentId: string): Promise<unknown>;
  tryComplete(assessmentId: string): Promise<CompletionResult>;
  completeAssessment(assessmentId: string): Promise<{ completed:boolean; reason?:string; routingState:string; status:string }>;
}
