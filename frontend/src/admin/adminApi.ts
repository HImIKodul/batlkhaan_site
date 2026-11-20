import { DOMAIN_ORDER,DOMAIN_NAME_MN } from '../data/domainOrder';
/* Admin API client. The token lives in sessionStorage (this tab only, gone when the tab closes) and is sent as a Bearer header. It is never sent to customer endpoints.
   All permission decisions are made by the server; the role shown in the UI is only used to hide controls that would be refused anyway. */
const BASE=(import.meta.env.VITE_API_BASE_URL??'/api/v1').replace(/\/$/,'')+'/admin';
const KEY='mmri.adminToken.v1';
export type AdminMe={id:string;email:string;role:'SUPER_ADMIN'|'REPORT_REVIEWER'|'BILLING_REVIEWER';permissions:string[];unreadNotifications:number;reauthValid:boolean};
export class AdminApiError extends Error{status:number;code?:string;details?:any;constructor(status:number,message:string,code?:string,details?:any){super(message);this.status=status;this.code=code;this.details=details}}
export const adminSession={get token(){try{return sessionStorage.getItem(KEY)}catch{return null}},set token(v:string|null){try{v?sessionStorage.setItem(KEY,v):sessionStorage.removeItem(KEY)}catch{/* ignore */}}};
let reauthHandler:(()=>Promise<boolean>)|null=null;
export const setReauthHandler=(fn:(()=>Promise<boolean>)|null)=>{reauthHandler=fn};
let unauthorizedHandler:(()=>void)|null=null;
export const setUnauthorizedHandler=(fn:(()=>void)|null)=>{unauthorizedHandler=fn};
const safe=(m:unknown)=>{const t=String(m??'');return t&&t.length<300&&!/[\n`{}]|=>|invocation|prisma|\/home\//i.test(t)?t:'Үйлдлийг гүйцэтгэж чадсангүй. Дахин оролдоно уу.'};
async function request<T>(method:string,path:string,body?:unknown,retried=false):Promise<T>{
 const r=await fetch(BASE+path,{method,headers:{'Content-Type':'application/json',...(adminSession.token?{Authorization:`Bearer ${adminSession.token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),credentials:'omit'});
 const text=await r.text();let j:any=null;try{j=text?JSON.parse(text):null}catch{/* non-json */}
 if(r.ok)return (j?.data??j) as T;
 const code=j?.error?.code;
 if(r.status===401&&code==='ADMIN_REAUTH_REQUIRED'&&!retried&&reauthHandler){if(await reauthHandler())return request<T>(method,path,body,true)}
 if(r.status===401&&code!=='ADMIN_LOGIN_FAILED'&&code!=='ADMIN_REAUTH_REQUIRED'){adminSession.token=null;unauthorizedHandler?.()}
 throw new AdminApiError(r.status,safe(j?.error?.message),code,j?.error?.details);
}
export const adminApi={
 login:(email:string,password:string,totpCode:string)=>request<{token:string;expiresAt:string;admin:{id:string;email:string;role:AdminMe['role']}}>('POST','/auth/login',{email,password,totpCode}),
 logout:()=>request('POST','/auth/logout',{}),me:()=>request<AdminMe>('GET','/auth/me'),reauth:(password:string,totpCode:string)=>request('POST','/auth/reauth',{password,totpCode}),
 get:<T=any>(path:string)=>request<T>('GET',path),post:<T=any>(path:string,body:unknown={})=>request<T>('POST',path,body),put:<T=any>(path:string,body:unknown)=>request<T>('PUT',path,body)
};
export const fmt=(v?:string|Date|null)=>{if(!v)return '-';const d=new Date(v);if(Number.isNaN(d.getTime()))return '-';const z=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}.${z(d.getMonth()+1)}.${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`}
export const hoursLeft=(deadline:string)=>Math.round((new Date(deadline).getTime()-Date.now())/360000)/10;
export const STATUS_MN:Record<string,string>={SUBMITTED:'Илгээгдсэн',GENERATING_DRAFT:'Төсөл үүсгэж байна',AWAITING_REVIEW:'Хянах хүлээгдэж буй',IN_REVIEW:'Хянаж байна',PUBLISHING:'Нийтэлж байна',READY_FOR_APPROVAL:'Батлахад бэлэн',APPROVED:'Батлагдсан',PUBLISHED:'Нийтлэгдсэн',GENERATION_FAILED:'Төсөл үүсгэхэд алдаа'};
export const DOMAIN_MN:Record<string,string>=Object.fromEntries(DOMAIN_ORDER.map(d=>[d,DOMAIN_NAME_MN[d]]));
/* Audit trail wording: ONE map of action and object codes to short Mongolian labels (unknown codes fall back to a readable form, never an error). */
export const ACTION_MN:Record<string,string>={
 ADMIN_LOGIN:'Админ нэвтэрсэн',ADMIN_REAUTH:'Админ дахин баталгаажсан',ADMIN_REAUTH_REQUIRED:'Дахин баталгаажуулалт шаардсан',ADMIN_CREATED:'Админ нэмсэн',ADMIN_DISABLED:'Админ хаасан',
 ADMIN_MUTATION_AUTHORIZED:'Үйлдэл зөвшөөрөгдсөн',ADMIN_MUTATION_COMPLETED:'Үйлдэл дууссан',ADMIN_MUTATION_FAILED:'Үйлдэл амжилтгүй',PERMISSION_DENIED:'Эрх хүрээгүй оролдлого',
 REPORT_REVIEW_VIEWED:'Тайлан үзсэн',EVIDENCE_VIEWED:'Нотолгоо үзсэн',COMPANY_VIEWED:'Компани үзсэн',REVIEW_CLAIMED:'Тайлан хянаж эхэлсэн',REVIEW_MARKED_READY:'Батлахад бэлэн болгосон',
 REVIEW_RETURNED:'Засварт буцаасан',REPORT_EDITED:'Тайлан засварласан',REPORT_ANNOTATED:'Тайланд тэмдэглэл хийсэн',REPORT_APPROVED:'Тайлан батласан',REPORT_PUBLISHED:'Тайлан нийтэлсэн',
 AI_SUGGESTIONS_REQUESTED:'AI шалгалт ажиллуулсан',AI_SUGGESTION_APPLIED:'AI санал хэрэглэсэн',ADMIN_ENTITLEMENT_GRANTED:'Оношилгооны эрх олгосон',ADMIN_ENTITLEMENT_REVOKED:'Оношилгооны эрх цуцалсан',
 ADMIN_USER_DEACTIVATED:'Хэрэглэгчийг идэвхгүй болгосон',ADMIN_USER_ACTIVATED:'Хэрэглэгчийг идэвхжүүлсэн',ADMIN_USER_EMAIL_CHANGED:'Хэрэглэгчийн имэйл солисон',ADMIN_COMPANY_UPDATED:'Компанийн мэдээлэл засварласан',
 SUPPORT_MAIL_SYNC:'Дэмжлэгийн имэйл шинэчилсэн',SUPPORT_MAIL_REPLY:'Дэмжлэгийн имэйлд хариулсан',SUPPORT_MAIL_HANDLED:'Дэмжлэгийн имэйлийг шийдсэн',MAINTENANCE_RUN:'Тогтмол шалгалт ажилласан'};
export const TARGET_MN:Record<string,string>={ROUTE:'Хуудас',REVIEW:'Тайлан',SYSTEM:'Систем',ADMIN:'Админ',USER:'Хэрэглэгч',COMPANY:'Компани',SUPPORT_MAIL:'Дэмжлэгийн имэйл',ENTITLEMENT:'Оношилгооны эрх'};
export const actionMn=(code?:string|null)=>code?(ACTION_MN[code]??code.replace(/_/g,' ').toLowerCase()):'-';
export const targetMn=(code?:string|null)=>code?(TARGET_MN[code]??code):'-';
