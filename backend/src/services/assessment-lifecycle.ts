export const ACTIVE_ASSESSMENT_STATUSES = [
  "PROFILE_PENDING",
  "IN_PROGRESS",
  "PAUSED",
  "READY_FOR_COMPLETION",
  "PROCESSING"
] as const;

export const RESULT_TERMINAL_ASSESSMENT_STATUSES = [
  "COMPLETED",
  "COMPLETED_WITH_REVIEW",
  "EXHAUSTED"
] as const;

export const TERMINAL_ASSESSMENT_STATUSES = [
  ...RESULT_TERMINAL_ASSESSMENT_STATUSES,
  "CANCELLED"
] as const;

export const RESPONDENT_MUTABLE_ASSESSMENT_STATUSES = [
  "PROFILE_PENDING",
  "IN_PROGRESS",
  "PAUSED"
] as const;

const activeSet = new Set<string>(ACTIVE_ASSESSMENT_STATUSES);
const resultTerminalSet = new Set<string>(RESULT_TERMINAL_ASSESSMENT_STATUSES);
const terminalSet = new Set<string>(TERMINAL_ASSESSMENT_STATUSES);
const respondentMutableSet = new Set<string>(RESPONDENT_MUTABLE_ASSESSMENT_STATUSES);

export function isActiveAssessmentStatus(status: string): boolean {
  return activeSet.has(status);
}

export function isResultTerminalAssessmentStatus(status: string): boolean {
  return resultTerminalSet.has(status);
}

export function isTerminalAssessmentStatus(status: string): boolean {
  return terminalSet.has(status);
}

export function canMutateRespondents(status: string): boolean {
  return respondentMutableSet.has(status);
}

export function lifecyclePhase(input: {
  status: string;
  hasTerminalSnapshot: boolean;
  hasPublishedReport: boolean;
}): string {
  const { status, hasTerminalSnapshot, hasPublishedReport } = input;
  if (status === "CANCELLED") return "CANCELLED";
  if (isResultTerminalAssessmentStatus(status)) {
    if (!hasTerminalSnapshot) return "COMPLETED_PENDING_SNAPSHOT";
    return hasPublishedReport ? "REPORT_GENERATED" : "REPORT_READY";
  }
  if (status === "PROFILE_PENDING") return "AVAILABLE";
  if (status === "PAUSED") return "PAUSED";
  if (status === "READY_FOR_COMPLETION") return "READY_FOR_COMPLETION";
  if (status === "PROCESSING") return "PROCESSING";
  return "IN_PROGRESS";
}
