import type { FrozenReportPayload, NarrativeDraft, NarrativeProviderMetadata, NarrativeProviderResult, NarrativeProviderTelemetry, NarrativeValidationResult } from "./types.js";
import { NarrativeProviderError } from "./types.js";
import type { NarrativeProvider } from "./coordinator.js";
import { aiGenerationInput, aiRepairInput, aiSystemInstructions, MMRI_AI_REPORT_PROMPT_VERSION, narrativeJsonSchema } from "./ai-prompt.js";
import { assertFrozenReportIntegrity, MMRI_AI_BOUNDARY_VERSION } from "./integrity.js";

export interface OpenAiNarrativeProviderOptions{
  apiKey:string;model:string;endpoint?:string;timeoutMs?:number;maxOutputTokens?:number;
  maxRetries?:number;retryBaseDelayMs?:number;retryMaxDelayMs?:number;totalTimeoutMs?:number;
}

function normalizeDraft(raw:any):NarrativeDraft{
  if(!raw||typeof raw!=="object")throw new Error("AI narrative provider returned non-object JSON");
  const sections=Array.isArray(raw.sections)?raw.sections.map((s:any)=>({...s,claims:Array.isArray(s.claims)?s.claims.map((c:any)=>({
    claimType:c.claimType,textMn:c.textMn,sourceTraceIds:c.sourceTraceIds,
    ...(c.rootFindingId?{rootFindingId:c.rootFindingId}:{}),...(c.recommendationId?{recommendationId:c.recommendationId}:{}),...(c.milestoneId?{milestoneId:c.milestoneId}:{})
  })):[]})):[];
  return {schemaVersion:raw.schemaVersion,payloadHash:raw.payloadHash,sections};
}

function extractResponseText(body:any):string{
  if(typeof body?.output_text==="string"&&body.output_text.trim())return body.output_text;
  for(const item of body?.output??[]){
    if(item?.type!=="message")continue;
    for(const content of item?.content??[]){if(content?.type==="output_text"&&typeof content.text==="string")return content.text;}
  }
  throw new Error("AI response contained no structured output text");
}

const NON_RETRYABLE_429_CODES=new Set([
  "credit_balance_exhausted","organization_spend_limit_exceeded","project_spend_limit_exceeded",
  "organization_usage_limit_exceeded","insufficient_quota"
]);
function errorCode(body:any):string{return String(body?.error?.code??"").trim().toLowerCase()}
function retryableHttp(status:number,body:any):boolean{
  if([408,409,500,502,503,504].includes(status))return true;
  if(status!==429)return false;
  const code=errorCode(body); if(NON_RETRYABLE_429_CODES.has(code))return false;
  const type=String(body?.error?.type??"").toLowerCase();
  return code==="slow_down"||code==="rate_limit_exceeded"||type==="rate_limit_error"||!code;
}
function retryAfterMs(headers:Headers):number|null{
  const raw=headers.get("retry-after"); if(!raw)return null;
  const seconds=Number(raw); if(Number.isFinite(seconds)&&seconds>=0)return Math.ceil(seconds*1000);
  const date=Date.parse(raw); if(Number.isFinite(date))return Math.max(0,date-Date.now());
  return null;
}
function sleep(ms:number){return new Promise<void>(resolve=>setTimeout(resolve,ms))}
function jitteredBackoff(base:number,attemptIndex:number,max:number){
  const exp=Math.min(max,base*(2**Math.max(0,attemptIndex)));
  return Math.min(max,Math.max(0,Math.round(exp*(0.8+Math.random()*0.4))));
}
function requestId(headers:Headers):string|null{return headers.get("x-request-id")||headers.get("request-id")||headers.get("openai-request-id")}
function safeProviderMessage(body:any,status:number){
  const code=errorCode(body); // Provider errors are stored and returned to the client in aiAudit: never carry credentials or their echo.
  const msg=String(body?.error?.message??"request failed").replace(/\s+/g," ").replace(/incorrect api key provided:[^.]*\.?/ig,"API key rejected.").replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_*\-]{3,}/g,"[redacted]").replace(/bearer\s+[A-Za-z0-9._\-]+/ig,"bearer [redacted]").slice(0,260);
  return `AI report provider HTTP ${status}${code?` [${code}]`:""}: ${msg}`;
}

export class OpenAiNarrativeProvider implements NarrativeProvider{
  readonly metadata:NarrativeProviderMetadata;
  private readonly endpoint:string;private readonly timeoutMs:number;private readonly maxOutputTokens:number;
  private readonly maxRetries:number;private readonly retryBaseDelayMs:number;private readonly retryMaxDelayMs:number;private readonly totalTimeoutMs:number;
  constructor(private readonly options:OpenAiNarrativeProviderOptions){
    this.endpoint=(options.endpoint??"https://api.openai.com/v1/responses").replace(/\/+$/,'');
    this.timeoutMs=options.timeoutMs??45_000;this.maxOutputTokens=options.maxOutputTokens??8_000;
    this.maxRetries=options.maxRetries??2;this.retryBaseDelayMs=options.retryBaseDelayMs??500;this.retryMaxDelayMs=options.retryMaxDelayMs??10_000;this.totalTimeoutMs=options.totalTimeoutMs??75_000;
    this.metadata={provider:"OPENAI_RESPONSES",modelIdentifier:options.model,modelConfig:{maxOutputTokens:this.maxOutputTokens,structuredOutput:true,aiBoundaryVersion:MMRI_AI_BOUNDARY_VERSION,responseStorage:false,timeoutMs:this.timeoutMs,maxRetries:this.maxRetries,retryBaseDelayMs:this.retryBaseDelayMs,retryMaxDelayMs:this.retryMaxDelayMs,totalTimeoutMs:this.totalTimeoutMs},promptVersion:MMRI_AI_REPORT_PROMPT_VERSION};
  }
  async generate(payload:FrozenReportPayload):Promise<NarrativeProviderResult>{return this.call(payload,aiGenerationInput(payload));}
  async repair(payload:FrozenReportPayload,draft:NarrativeDraft,validation:NarrativeValidationResult):Promise<NarrativeProviderResult>{return this.call(payload,aiRepairInput(payload,draft,validation));}
  private async call(payload:FrozenReportPayload,input:string):Promise<NarrativeProviderResult>{
    assertFrozenReportIntegrity(payload);
    const started=Date.now(); const requestIds:string[]=[]; let attempts=0; let retries=0; let finalStatus:number|null=null;
    let lastError:Error|undefined;
    try{
    while(attempts<=this.maxRetries){
      const elapsed=Date.now()-started; const remaining=this.totalTimeoutMs-elapsed;
      if(remaining<=0)break;
      attempts++;
      const attemptTimeout=Math.max(1,Math.min(this.timeoutMs,remaining));
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),attemptTimeout);
      try{
        const r=await fetch(this.endpoint,{method:"POST",signal:controller.signal,headers:{"content-type":"application/json","authorization":`Bearer ${this.options.apiKey}`},body:JSON.stringify({
          model:this.options.model,instructions:aiSystemInstructions(),input,store:false,max_output_tokens:this.maxOutputTokens,
          text:{format:{type:"json_schema",name:"mmri_narrative_draft",strict:true,schema:narrativeJsonSchema()}}
        })});
        finalStatus=r.status; const rid=requestId(r.headers); if(rid&&!requestIds.includes(rid))requestIds.push(rid);
        const body=await r.json().catch(()=>null);
        if(r.ok){
          if(body?.status==="incomplete")throw new Error(`AI response incomplete: ${String(body?.incomplete_details?.reason??"unknown").slice(0,60)}`);
          const parsed=JSON.parse(extractResponseText(body)); const draft=normalizeDraft(parsed);
          const telemetry:NarrativeProviderTelemetry={httpAttempts:attempts,retryCount:retries,requestIds,finalHttpStatus:r.status,durationMs:Date.now()-started};
          return {draft:{...draft,schemaVersion:"MMRI-NARRATIVE-DRAFT-1.0",payloadHash:payload.payloadHash},telemetry};
        }
        lastError=new Error(safeProviderMessage(body,r.status));
        if(!retryableHttp(r.status,body)||attempts>this.maxRetries)throw lastError;
        const hinted=retryAfterMs(r.headers);
        if(hinted!==null&&hinted>this.retryMaxDelayMs)throw lastError;
        const delay=hinted??jitteredBackoff(this.retryBaseDelayMs,retries,this.retryMaxDelayMs);
        const bounded=Math.max(0,delay);
        if(Date.now()-started+bounded>=this.totalTimeoutMs)throw lastError;
        retries++; await sleep(bounded);
      }catch(error:any){
        const aborted=error?.name==="AbortError";
        const network=error instanceof TypeError;
        lastError=aborted?new Error(`AI report provider attempt timed out after ${attemptTimeout}ms`):error instanceof Error?error:new Error("AI narrative provider failure");
        if(!(aborted||network)||attempts>this.maxRetries)throw lastError;
        const delay=jitteredBackoff(this.retryBaseDelayMs,retries,this.retryMaxDelayMs);
        if(Date.now()-started+delay>=this.totalTimeoutMs)throw lastError;
        retries++; await sleep(delay);
      }finally{clearTimeout(timer);}
    }
    throw lastError??new Error(`AI report provider total timeout exceeded after ${this.totalTimeoutMs}ms`);
    }catch(error:any){
      // MMRI-43: carry the attempts, retries, final status, duration and request ids of the failed call to the coordinator.
      if(error instanceof NarrativeProviderError)throw error;
      throw new NarrativeProviderError(error instanceof Error?error.message:"AI narrative provider failure",{httpAttempts:attempts,retryCount:retries,requestIds,finalHttpStatus:finalStatus,durationMs:Date.now()-started});
    }
  }
}
