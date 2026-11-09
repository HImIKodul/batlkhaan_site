import { deterministicFallbackNarrative } from "./fallback-renderer.js";
import type { FrozenReportPayload, NarrativeDraft, NarrativeProviderMetadata, NarrativeProviderResult, NarrativeProviderTelemetry, NarrativeValidationResult } from "./types.js";
import { validateNarrativeDraft } from "./validator.js";
import { verifiedFrozenReportPayloadForAi } from "./integrity.js";
import { MMRI_AI_REPORT_PROMPT_VERSION } from "./ai-prompt.js";

export interface NarrativeProvider {
  readonly metadata: NarrativeProviderMetadata;
  generate(payload: FrozenReportPayload): Promise<NarrativeDraft | NarrativeProviderResult>;
  repair?(payload: FrozenReportPayload, draft: NarrativeDraft, validation: NarrativeValidationResult): Promise<NarrativeDraft | NarrativeProviderResult>;
}

export function withDeterministicClaimIds(draft: NarrativeDraft): NarrativeDraft {
  return {
    ...draft,
    sections: draft.sections.map(section => ({
      ...section,
      claims: section.claims.map((claim, index) => ({ ...claim, reportClaimId: `RCLM-${section.id}-${String(index + 1).padStart(3,"0")}` }))
    }))
  };
}

export interface CoordinatedReportResult {
  narrative: NarrativeDraft;
  validation: NarrativeValidationResult;
  state: "PASS" | "AI_FALLBACK_USED";
  providerAttempts: number;
  providerHttpAttempts: number;
  providerRetryCount: number;
  providerRequestIds: string[];
  providerMetadata: NarrativeProviderMetadata;
  providerError: string | null;
}

function unwrapProviderResult(value:NarrativeDraft|NarrativeProviderResult):{draft:NarrativeDraft;telemetry?:NarrativeProviderTelemetry}{
  if(value&&typeof value==="object"&&"draft" in value){
    const result=value as NarrativeProviderResult;
    return {draft:result.draft,telemetry:result.telemetry};
  }
  return {draft:value as NarrativeDraft};
}

/** Contract-controlled AI boundary. Provider output can only render/explain the frozen facts. */
export async function generateValidatedNarrative(payload: FrozenReportPayload, provider?: NarrativeProvider): Promise<CoordinatedReportResult> {
  const verifiedPayload=verifiedFrozenReportPayloadForAi(payload);
  let attempts=0; let providerError:string|null=null;
  let providerHttpAttempts=0; let providerRetryCount=0; const providerRequestIds:string[]=[];
  const absorb=(telemetry?:NarrativeProviderTelemetry)=>{
    if(!telemetry)return;
    providerHttpAttempts+=Math.max(0,telemetry.httpAttempts||0);
    providerRetryCount+=Math.max(0,telemetry.retryCount||0);
    for(const id of telemetry.requestIds??[])if(id&&!providerRequestIds.includes(id))providerRequestIds.push(id);
  };
  if (provider) {
    try {
      attempts=1;
      const generated=unwrapProviderResult(await provider.generate(verifiedPayload)); absorb(generated.telemetry);
      let draft = withDeterministicClaimIds(generated.draft);
      let validation = validateNarrativeDraft(verifiedPayload, draft);
      if (validation.state === "PASS") return { narrative:draft, validation, state:"PASS", providerAttempts:attempts, providerHttpAttempts, providerRetryCount, providerRequestIds, providerMetadata:provider.metadata, providerError:null };
      if (validation.state === "REPAIR_REQUIRED" && provider.repair) {
        attempts=2;
        const repaired=unwrapProviderResult(await provider.repair(verifiedPayload,draft,validation)); absorb(repaired.telemetry);
        draft = withDeterministicClaimIds(repaired.draft);
        validation = validateNarrativeDraft(verifiedPayload,draft);
        if (validation.state === "PASS") return { narrative:draft, validation, state:"PASS", providerAttempts:attempts, providerHttpAttempts, providerRetryCount, providerRequestIds, providerMetadata:provider.metadata, providerError:null };
      }
      providerError=`AI narrative validation did not pass after controlled generation${attempts>1?" and repair":""}: ${validation.issues.slice(0,5).map(x=>x.checkId).join(",")||validation.state}`.slice(0,500);
    } catch (error) {
      absorb((error as {telemetry?:NarrativeProviderTelemetry}|null)?.telemetry); // MMRI-43: failed calls keep their attempt telemetry
      providerError=error instanceof Error ? error.message.slice(0,500) : "AI narrative provider failure";
    }
  }
  const fallback = withDeterministicClaimIds(deterministicFallbackNarrative(verifiedPayload));
  const validation = validateNarrativeDraft(verifiedPayload,fallback);
  if (validation.state !== "PASS") throw new Error(`Deterministic report fallback failed validation: ${JSON.stringify(validation.issues)}`);
  return { narrative:fallback, validation, state:"AI_FALLBACK_USED", providerAttempts:attempts, providerHttpAttempts, providerRetryCount, providerRequestIds, providerMetadata:provider?.metadata ?? {provider:"NONE",modelIdentifier:"deterministic-fallback",modelConfig:{},promptVersion:MMRI_AI_REPORT_PROMPT_VERSION}, providerError };
}
