import { OpenAiNarrativeProvider } from "../report/openai-narrative-provider.js";
import type { NarrativeProvider } from "../report/coordinator.js";

function positiveInt(name:string,fallback:number,min:number,max:number){const raw=process.env[name];const n=raw?Number(raw):fallback;if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(`${name} must be ${min}..${max}`);return n;}
export function createNarrativeProviderFromEnv(environment:string):NarrativeProvider|undefined{
  const mode=(process.env.MMRI_AI_REPORT_PROVIDER??"disabled").trim().toLowerCase();
  const required=(process.env.MMRI_AI_REPORT_REQUIRED??"false").toLowerCase()==="true";
  if(mode==="disabled"||mode==="none"){if(required)throw new Error("AI report provider is required but disabled");return undefined;}
  if(mode!=="openai")throw new Error("MMRI_AI_REPORT_PROVIDER must be disabled or openai");
  const apiKey=(process.env.OPENAI_API_KEY??"").trim(), model=(process.env.MMRI_AI_REPORT_MODEL??"").trim();
  if(!apiKey||!model){if(required)throw new Error("OPENAI_API_KEY and MMRI_AI_REPORT_MODEL are required for AI reports");return undefined;}
  if(environment==="production"&&(/replace|change[-_ ]?me|example|your[-_ ]?|development[-_ ]/i.test(apiKey)||/replace|example|your[-_ ]?/i.test(model)))throw new Error("OpenAI production configuration contains a placeholder");
  const endpoint=(process.env.MMRI_AI_REPORT_ENDPOINT??"https://api.openai.com/v1/responses").trim();
  let u:URL;try{u=new URL(endpoint)}catch{throw new Error("MMRI_AI_REPORT_ENDPOINT must be a valid URL")}
  if(environment==="production"&&u.protocol!=="https:")throw new Error("MMRI_AI_REPORT_ENDPOINT must use HTTPS in production");
  if(environment==="production"&&(u.hostname!=="api.openai.com"||u.pathname.replace(/\/+$/,"")!=="/v1/responses"))throw new Error("MMRI_AI_REPORT_ENDPOINT must be https://api.openai.com/v1/responses in production");
  return new OpenAiNarrativeProvider({
    apiKey,model,endpoint,
    timeoutMs:positiveInt("MMRI_AI_REPORT_TIMEOUT_MS",45_000,5_000,120_000),
    maxOutputTokens:positiveInt("MMRI_AI_REPORT_MAX_OUTPUT_TOKENS",8_000,1_000,20_000),
    maxRetries:positiveInt("MMRI_AI_REPORT_MAX_RETRIES",2,0,5),
    retryBaseDelayMs:positiveInt("MMRI_AI_REPORT_RETRY_BASE_DELAY_MS",500,100,10_000),
    retryMaxDelayMs:positiveInt("MMRI_AI_REPORT_RETRY_MAX_DELAY_MS",10_000,500,60_000),
    totalTimeoutMs:positiveInt("MMRI_AI_REPORT_TOTAL_TIMEOUT_MS",75_000,10_000,240_000)
  });
}
