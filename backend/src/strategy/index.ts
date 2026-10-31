import type { StrategyInput, StrategyResult } from "./types.js";
import { analyzeRootCauses } from "./root-cause.js";
import { buildRecommendations } from "./recommendations.js";
import { buildActionPlan } from "./action-plan.js";

export * from "./types.js";
export * from "./root-cause.js";
export * from "./recommendations.js";
export * from "./action-plan.js";
export * from "./frozen-plan.js";

export function runStrategyPipeline(input: StrategyInput): StrategyResult {
  const rootCause = analyzeRootCauses(input.methodology, input.snapshot);
  const recommendations = buildRecommendations(input.methodology, input.snapshot, rootCause, input.profileAnswers);
  const actionPlan = buildActionPlan(input.methodology, recommendations, input.profileAnswers);
  return { rootCause, recommendations, actionPlan };
}
