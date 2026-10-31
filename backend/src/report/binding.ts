import type { FrozenReportPayload, ReportBinding } from "./types.js";

export function reportBindingMaterial(input:{diagnosisResultHash:string;strategyHash:string;planHash:string;reportContractVersion:string;aiContractVersion:string;findingsPolicyVersion?:string}){
  return {
    diagnosisResultHash:input.diagnosisResultHash,
    strategyHash:input.strategyHash,
    planHash:input.planHash,
    reportContractVersion:input.reportContractVersion,
    aiContractVersion:input.aiContractVersion,
    ...(input.findingsPolicyVersion?{findingsPolicyVersion:input.findingsPolicyVersion}:{})
  };
}

export function assertFrozenReportBinding(payload:FrozenReportPayload):ReportBinding{
  if(!payload.diagnosisResultHash||!payload.strategyHash||!payload.planHash||!payload.bindingHash)throw new Error("Frozen report is missing diagnosis/strategy/plan hash binding");
  return {diagnosisResultHash:payload.diagnosisResultHash,strategyHash:payload.strategyHash,planHash:payload.planHash,bindingHash:payload.bindingHash};
}
