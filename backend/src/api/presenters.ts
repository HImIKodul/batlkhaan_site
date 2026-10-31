import type { RankedQuestion, RoutingDecision } from "../engine/types.js";

export function publicQuestion(ranked: RankedQuestion | null | undefined) {
  if (!ranked) return null;
  const q=ranked.question;
  return { id:q.id, textMn:q.textMn, options:q.options.map(o=>({ optionIndex:o.optionIndex,labelMn:o.labelMn,score:o.score==null?null:Number(o.score),state:o.state??null })) };
}
export function publicRouting(decision: RoutingDecision) {
  return { state:decision.state, stopReason:decision.stopReason, nextQuestion:publicQuestion(decision.nextQuestion) };
}
export function numberOrNull(v:any):number|null { return v===null||v===undefined ? null : Number(v); }
