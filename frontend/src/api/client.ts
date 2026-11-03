import { mnText } from '../content/mongolian';
import type { ActionPlanPayload, AssessmentLifecycleStatus, AssessmentMode, AssessmentProgress, AssessmentSummary, AuthResponse, BillingCatalogPlan, BillingInvoice, BillingPlanCode, BillingStatus, Company, DiagnosisPayload, FrozenReportPayload, ProfileAnswerInput, ProfileQuestion, RecommendationsPayload, ReportResponse, RespondentRole, ResultsPayload, RoutingPayload, User, MilestoneStatus, MilestoneTrackingPatch } from './types';

const API_BASE=(import.meta.env.VITE_API_BASE_URL??'/api/v1').replace(/\/$/,'');
export const TARGET_METHODOLOGY_VERSION=(import.meta.env.VITE_MMRI_METHODOLOGY_VERSION??'3.0.0').trim();
const K={user:'mmri.userId',company:'mmri.companyId',companyName:'mmri.companyName',legacyAssessment:'mmri.assessmentId'};
const LEGACY_ACCESS_KEY=['mmri','accessToken'].join('.');
const SENSITIVE_LOCAL_PREFIXES=['mmri.assessmentId.','mmri.assessmentDraft.','mmri.basicInfoDraft.v3.','mmri.invoiceArea.','mmri.assessmentArea.'];
const SENSITIVE_SESSION_PREFIXES=['business:'];
function assessmentKey(companyId:string|null){return companyId?`mmri.assessmentId.${companyId}`:null}
function clearPrefixedStorage(storage:Storage,prefixes:readonly string[]){try{for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key&&prefixes.some(prefix=>key.startsWith(prefix)))storage.removeItem(key)}}catch{/* storage may be unavailable */}}
function clearCompanyTransientState(){clearPrefixedStorage(sessionStorage,SENSITIVE_SESSION_PREFIXES)}
const PURCHASE_INTENT_KEYS=['business:billingArea','business:billingMode','mmri:selectedBillingPlan','mmri:autoStartDiagnostic'] as const;
function clearPrivateBrowserState(preservePurchaseIntent=false){const preserved:Record<string,string>={};if(preservePurchaseIntent){try{for(const key of PURCHASE_INTENT_KEYS){const value=sessionStorage.getItem(key);if(value!==null)preserved[key]=value}}catch{/* best effort */}}clearPrefixedStorage(localStorage,SENSITIVE_LOCAL_PREFIXES);clearCompanyTransientState();try{localStorage.removeItem('mmri.companyNameDraft');sessionStorage.removeItem('mmri:selectedBillingPlan');sessionStorage.removeItem('mmri:autoStartDiagnostic');for(const [key,value] of Object.entries(preserved))sessionStorage.setItem(key,value)}catch{/* best effort */}}
try{localStorage.removeItem(LEGACY_ACCESS_KEY);const legacy=localStorage.getItem(K.legacyAssessment);const companyId=localStorage.getItem(K.company);const scoped=assessmentKey(companyId);if(legacy&&scoped&&!localStorage.getItem(scoped))localStorage.setItem(scoped,legacy);localStorage.removeItem(K.legacyAssessment)}catch{/* storage may be unavailable; access tokens remain memory-only */}
let memoryAccessToken:string|null=null;
const WRITER_KEY='mmri.writerId';
function writerId(){let id=sessionStorage.getItem(WRITER_KEY);if(!id){id=globalThis.crypto?.randomUUID?.()??`writer-${Date.now()}-${Math.random().toString(36).slice(2)}`;sessionStorage.setItem(WRITER_KEY,id)}return id}
function requestId(){return globalThis.crypto?.randomUUID?.()??`req-${Date.now()}-${Math.random().toString(36).slice(2)}`}
const KNOWN_ERRORS:[RegExp,string][]=[
 [/invalid email or password/i,'Имэйл эсвэл нууц үг буруу байна.'],
 [/already exists/i,'Энэ имэйлээр бүртгэл аль хэдийн үүссэн байна.'],
 [/another active writer|writer lease/i,'Энэ оношилгоо өөр цонх эсвэл төхөөрөмж дээр нээлттэй байна. 2 минут орчим хүлээгээд дахин оролдоно уу.']
];
function knownErrorMn(message:string){return KNOWN_ERRORS.find(([re])=>re.test(message))?.[1]}
export class ApiError extends Error{status:number;code?:string;details?:unknown;requestId?:string;constructor(status:number,message:string,body?:any){const fallback='Үйлдлийг гүйцэтгэж чадсангүй. Дахин оролдоно уу.';super(knownErrorMn(message)??mnText(message,fallback));this.name='ApiError';this.status=status;this.code=body?.error?.code;this.details=body?.error?.details;this.requestId=body?.error?.requestId;}}
export const session={
 get accessToken(){return memoryAccessToken},set accessToken(v:string|null){memoryAccessToken=v},
 get userId(){return localStorage.getItem(K.user)},set userId(v:string|null){v?localStorage.setItem(K.user,v):localStorage.removeItem(K.user)},
 get companyId(){return localStorage.getItem(K.company)},set companyId(v:string|null){const previous=localStorage.getItem(K.company);if(v)localStorage.setItem(K.company,v);else localStorage.removeItem(K.company);if(previous!==v){localStorage.removeItem(K.companyName);clearCompanyTransientState()}},
 get companyName(){return localStorage.getItem(K.companyName)},set companyName(v:string|null){v?localStorage.setItem(K.companyName,v):localStorage.removeItem(K.companyName)},
 get assessmentId(){const key=assessmentKey(localStorage.getItem(K.company));return key?localStorage.getItem(key):null},set assessmentId(v:string|null){const key=assessmentKey(localStorage.getItem(K.company));if(!key)return;v?localStorage.setItem(key,v):localStorage.removeItem(key)},
 clear(preservePurchaseIntent=false){memoryAccessToken=null;clearPrivateBrowserState(preservePurchaseIntent);Object.values(K).forEach(k=>localStorage.removeItem(k));}
};
type RequestOptions=RequestInit&{retryAuth?:boolean};
async function parseBody(r:Response){if(r.status===204)return null;const t=await r.text();if(!t)return null;try{return JSON.parse(t)}catch{return t}}
let refreshInFlight:Promise<boolean>|null=null;
/** Single-flight: concurrent callers (StrictMode double effects, parallel 401 retries) share ONE refresh request. The backend rotates the refresh token, so a second concurrent call would be rejected as a replay and end the session. */
function refreshAccessToken(){if(!refreshInFlight)refreshInFlight=refreshAccessTokenOnce().finally(()=>{refreshInFlight=null});return refreshInFlight}
async function refreshAccessTokenOnce(){try{const r=await fetch(`${API_BASE}/auth/refresh`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'}});if(!r.ok){session.clear();return false}const b=await parseBody(r);const data=b?.data??b;const nextUserId=typeof data?.user?.id==='string'?data.user.id:null;if(nextUserId&&session.userId&&session.userId!==nextUserId)session.clear();if(nextUserId)session.userId=nextUserId;session.accessToken=data?.accessToken??null;return !!session.accessToken}catch{session.clear();return false}}
export async function restoreSession(){if(session.accessToken)return true;return refreshAccessToken()}
async function request<T>(path:string,init:RequestOptions={}):Promise<T>{const headers:Record<string,string>={'Content-Type':'application/json','X-MMRI-Writer-ID':writerId(),...(init.headers as Record<string,string>|undefined)};if(session.accessToken)headers.Authorization=`Bearer ${session.accessToken}`;const r=await fetch(`${API_BASE}${path}`,{...init,headers,credentials:'include'});if(r.status===401&&init.retryAuth!==false){if(await refreshAccessToken())return request<T>(path,{...init,retryAuth:false})}const body=await parseBody(r);if(!r.ok)throw new ApiError(r.status,body?.error?.message??`HTTP ${r.status}`,body);return (body?.data??body) as T}
async function requestBlob(path:string,fallbackFilename:string,retryAuth=true):Promise<{blob:Blob;filename:string}>{const headers:Record<string,string>={'X-MMRI-Writer-ID':writerId()};if(session.accessToken)headers.Authorization=`Bearer ${session.accessToken}`;const r=await fetch(`${API_BASE}${path}`,{method:'GET',headers,credentials:'include'});if(r.status===401&&retryAuth){if(await refreshAccessToken())return requestBlob(path,fallbackFilename,false)}if(!r.ok){const body=await parseBody(r);throw new ApiError(r.status,body?.error?.message??`HTTP ${r.status}`,body)}const cd=r.headers.get('content-disposition')||'';const utf=cd.match(/filename\*=UTF-8''([^;]+)/i);const basic=cd.match(/filename="([^"]+)"/i);let filename=fallbackFilename;try{if(utf?.[1])filename=decodeURIComponent(utf[1]);else if(basic?.[1])filename=basic[1]}catch{/* use safe fallback */}return {blob:await r.blob(),filename}}

export const api={
 async register(body:{email:string;password:string;displayName?:string}){const x=await request<AuthResponse>('/auth/register',{method:'POST',body:JSON.stringify(body),retryAuth:false});session.clear(true);session.userId=x.user.id;session.accessToken=x.accessToken;return x},
 async login(body:{email:string;password:string}){const x=await request<AuthResponse>('/auth/login',{method:'POST',body:JSON.stringify(body),retryAuth:false});session.clear(true);session.userId=x.user.id;session.accessToken=x.accessToken;return x},
 me:()=>request<User>('/auth/me'),
 async logout(){
  const assessmentId=session.assessmentId;
  try{
   if(assessmentId){
    try{
     const a=await request<AssessmentSummary>(`/assessments/${assessmentId}`);
     if(a.status==='IN_PROGRESS'){
      try{await request(`/assessments/${assessmentId}/pause`,{method:'POST',body:JSON.stringify({expectedAssessmentRevision:a.assessmentRevision})})}
      catch{
       try{
        const resumed=await request<RoutingPayload>(`/assessments/${assessmentId}/resume`,{method:'POST',body:JSON.stringify({expectedAssessmentRevision:a.assessmentRevision})});
        await request(`/assessments/${assessmentId}/pause`,{method:'POST',body:JSON.stringify({expectedAssessmentRevision:resumed.assessmentRevision})});
       }catch{/* another active writer may legitimately own the lease */}
      }
     }
    }catch{/* logout must still succeed even if assessment recovery is unavailable */}
   }
   await request('/auth/logout',{method:'POST'})
  }finally{session.clear()}
 },
 listCompanies:()=>request<Company[]>('/companies'),
 async createCompany(body:{name:string;industry?:string;businessModel?:string;employeeCount?:number;companyAgeYears?:number;marketType?:string;country?:string}){const x=await request<Company>('/companies',{method:'POST',body:JSON.stringify(body)});session.companyId=x.id;session.companyName=x.name;return x},
 getCompany:(id:string)=>request<Company>(`/companies/${id}`),
 updateCompany:(id:string,body:{name:string})=>request<Company>(`/companies/${id}`,{method:'PUT',body:JSON.stringify(body)}),
 saveCompanyProfileAnswers:(id:string,profileAnswers:ProfileAnswerInput[],basicInfoAnswers?:ProfileAnswerInput[])=>request<Company>(`/companies/${id}/profile-answers`,{method:'PUT',body:JSON.stringify({profileAnswers,basicInfoAnswers})}),
 getBillingPlans:()=>request<BillingCatalogPlan[]>('/billing/plans',{retryAuth:false}),
 getBillingStatus:(companyId:string)=>request<BillingStatus>(`/companies/${companyId}/billing/status`),
 createBillingInvoice:(companyId:string,planCode:BillingPlanCode,domainCode:string='marketing')=>request<BillingInvoice>(`/companies/${companyId}/billing/invoices`,{method:'POST',body:JSON.stringify({planCode,domainCode})}),
 getBillingInvoice:(invoiceId:string)=>request<BillingInvoice>(`/billing/invoices/${invoiceId}`),
 mockPayBillingInvoice:(invoiceId:string)=>request<BillingInvoice>(`/billing/invoices/${invoiceId}/mock-pay`,{method:'POST'}),
 cancelBillingInvoice:(invoiceId:string)=>request<BillingInvoice>(`/billing/invoices/${invoiceId}`,{method:'DELETE'}),
 listAssessments:(companyId:string)=>request<AssessmentSummary[]>(`/companies/${companyId}/assessments`),
 addCompanyMember:(companyId:string,body:{email:string;role:'OWNER'|'ADMIN'|'ASSESSOR'|'CONSULTANT'|'VIEWER'})=>request(`/companies/${companyId}/members`,{method:'POST',body:JSON.stringify(body)}),
 getProfileQuestions:()=>request<ProfileQuestion[]>('/methodology/current/profile-questions'),
 getRespondentRoles:()=>request<RespondentRole[]>('/methodology/current/respondent-roles'),
 async createAssessment(companyId:string,domainCode:string='marketing',methodologyVersion?:string){const body:Record<string,string>={domainCode};if(methodologyVersion)body.methodologyVersion=methodologyVersion;const x=await request<AssessmentSummary>(`/companies/${companyId}/assessments`,{method:'POST',body:JSON.stringify(body)});session.assessmentId=x.id;return x},
 getAssessment:(id:string)=>request<AssessmentSummary>(`/assessments/${id}`),
 getAssessmentStatus:(id:string)=>request<AssessmentLifecycleStatus>(`/assessments/${id}/status`),
 addRespondent:(id:string,body:{roleExternalId:string;displayName?:string})=>request(`/assessments/${id}/respondents`,{method:'POST',body:JSON.stringify(body)}),
 startAssessment:(id:string,mode:AssessmentMode,profileAnswers:ProfileAnswerInput[])=>request<RoutingPayload>(`/assessments/${id}/start`,{method:'POST',body:JSON.stringify({mode,profileAnswers})}),
 pauseAssessment:(id:string,expectedAssessmentRevision:number)=>request<{status:string;assessmentRevision:number}>(`/assessments/${id}/pause`,{method:'POST',body:JSON.stringify({expectedAssessmentRevision})}),resumeAssessment:(id:string,expectedAssessmentRevision:number)=>request<RoutingPayload>(`/assessments/${id}/resume`,{method:'POST',body:JSON.stringify({expectedAssessmentRevision})}),
 nextQuestion:(id:string)=>request<RoutingPayload>(`/assessments/${id}/next-question`),
 submitAnswer:(id:string,input:{questionId:string;optionIndex:number;questionIssueId:string;expectedAssessmentRevision:number;respondentId?:string;clientRequestId?:string})=>request<{accepted:true;answerId:string;assessmentRevision:number;routing:RoutingPayload}>(`/assessments/${id}/answers`,{method:'POST',body:JSON.stringify({...input,clientRequestId:input.clientRequestId??requestId()})}),
 previousAnswer:(id:string,expectedAssessmentRevision:number)=>request<RoutingPayload>(`/assessments/${id}/back`,{method:'POST',body:JSON.stringify({expectedAssessmentRevision})}),
 saveDraft:(id:string,input:{questionIssueId:string;questionId:string;draft:Record<string,unknown>;expectedAssessmentRevision:number})=>request<{saved:true;draftRevision:number;serverAckAt:string;assessmentRevision:number}>(`/assessments/${id}/draft`,{method:'PUT',body:JSON.stringify(input)}),
 heartbeatWriterLease:(id:string)=>request<{writerLeaseExpiresAt:string;assessmentRevision:number}>(`/assessments/${id}/writer-lease/heartbeat`,{method:'POST'}),
 completeAssessment:(id:string,expectedAssessmentRevision:number)=>request<any>(`/assessments/${id}/complete`,{method:'POST',body:JSON.stringify({expectedAssessmentRevision})}),getProgress:(id:string)=>request<AssessmentProgress>(`/assessments/${id}/progress`),getResults:(id:string)=>request<ResultsPayload>(`/assessments/${id}/results`),
 generateStrategy:(id:string)=>request<any>(`/assessments/${id}/strategy/generate`,{method:'POST'}),getDiagnosis:(id:string)=>request<DiagnosisPayload>(`/assessments/${id}/diagnosis`),getRecommendations:(id:string)=>request<RecommendationsPayload>(`/assessments/${id}/recommendations`),
 getActionPlan:(id:string)=>request<ActionPlanPayload>(`/assessments/${id}/action-plan`),
 updateMilestone:(id:string,milestoneId:string,patch:MilestoneTrackingPatch|MilestoneStatus)=>request<any>(`/assessments/${id}/action-plan/milestones/${milestoneId}`,{method:'PATCH',body:JSON.stringify(typeof patch==='string'?{status:patch}:patch)}),
 getReportPayload:(id:string)=>request<FrozenReportPayload>(`/assessments/${id}/report-payload`),getReport:(id:string)=>request<ReportResponse>(`/assessments/${id}/report`),downloadReportPdf:(id:string)=>requestBlob(`/assessments/${id}/report/pdf`,`MMRI-${id}.pdf`),getTraceability:(id:string)=>request<any>(`/assessments/${id}/trace`)
};

export async function resolveBoundAssessmentId(){
 const id=session.assessmentId;const companyId=session.companyId;
 if(!id||!companyId)return null;
 try{const assessment=await api.getAssessment(id);if(assessment.companyId!==companyId){session.assessmentId=null;return null}return id}
 catch(e){if(e instanceof ApiError&&(e.status===403||e.status===404)){session.assessmentId=null;return null}throw e}
}
