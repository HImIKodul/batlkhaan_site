/**
 * Compatibility module for callers that historically imported adaptive-v13
 * routing from runtime-policy.ts. The active implementation now lives only in
 * routing.ts so fixes cannot diverge between two parallel routers.
 */
export {
  hasAdaptiveV13Policy,
  questionBudgetTarget,
  softQuestionCap,
  routeAdaptiveV13,
  rankAdaptiveV13Questions
} from "./routing.js";
