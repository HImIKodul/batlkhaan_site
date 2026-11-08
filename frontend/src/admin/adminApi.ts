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
export const fmt=(v?:string|Date|null)=>v?new Date(v).toLocaleString('mn-MN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(/\./g,'.'):'-';
export const hoursLeft=(deadline:string)=>Math.round((new Date(deadline).getTime()-Date.now())/360000)/10;
export const STATUS_MN:Record<string,string>={SUBMITTED:'Илгээгдсэн',GENERATING_DRAFT:'Төсөл үүсгэж байна',AWAITING_REVIEW:'Хянах хүлээгдэж буй',IN_REVIEW:'Хянаж байна',PUBLISHING:'Нийтэлж байна',READY_FOR_APPROVAL:'Батлахад бэлэн',APPROVED:'Батлагдсан',PUBLISHED:'Нийтлэгдсэн',GENERATION_FAILED:'Төсөл үүсгэхэд алдаа'};
export const DOMAIN_MN:Record<string,string>={marketing:'Маркетинг',it:'Мэдээллийн технологи',finance:'Санхүү',people:'Хүний нөөц',operations:'Үйлдвэрлэл ба үйл ажиллагаа'};
