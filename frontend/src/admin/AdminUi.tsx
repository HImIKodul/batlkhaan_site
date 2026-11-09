import React,{useEffect,useRef,useState} from 'react';

/* Shared building blocks for the simple SUPER_ADMIN screens. */
export const ROLE_MN:Record<string,string>={OWNER:'Эзэмшигч',ADMIN:'Админ',ASSESSOR:'Үнэлэгч',CONSULTANT:'Зөвлөх',VIEWER:'Харагч'};
export const USER_STATUS_MN:Record<string,string>={ACTIVE:'Идэвхтэй',DISABLED:'Идэвхгүй'};
export const SIGNIN_MN:Record<string,string>={LOGIN_SUCCESS:'Нэвтэрсэн',LOGIN_FAILURE:'Нэвтрэх оролдлого амжилтгүй',REGISTER:'Бүртгүүлсэн',LOGOUT:'Гарсан',PASSWORD_RESET:'Нууц үг сэргээсэн',PASSWORD_RESET_REQUESTED:'Нууц үг сэргээх хүсэлт'};
export const Badge=({tone,children}:{tone:'ok'|'bad'|'warn'|'mute';children:React.ReactNode})=><span className={`adm-badge adm-badge--${tone}`}>{children}</span>;

/** Short confirmation: says what will happen, asks for a written reason (kept in the audit trail), and only then calls the server. */
export function ConfirmDialog({title,children,confirmLabel,danger,extra,canSubmit=true,onConfirm,onCancel}:{title:string;children:React.ReactNode;confirmLabel:string;danger?:boolean;extra?:React.ReactNode;canSubmit?:boolean;onConfirm:(reason:string)=>Promise<void>;onCancel:()=>void}){
 const [reason,setReason]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);const box=useRef<HTMLFormElement>(null);const opener=useRef<HTMLElement|null>(null);
 useEffect(()=>{opener.current=document.activeElement as HTMLElement|null;(box.current?.querySelector('input,textarea') as HTMLElement|null)?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onCancel()}
   if(e.key==='Tab'&&box.current){const f=[...box.current.querySelectorAll<HTMLElement>('input,textarea,button:not(:disabled)')];if(!f.length)return;const first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);opener.current?.focus?.()}},[onCancel]);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setErr('');try{await onConfirm(reason.trim())}catch(x){setErr((x as Error).message);setBusy(false)}};
 return <div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby="cf-title"><form ref={box} className="adm-modal__box adm-confirm" onSubmit={submit}>
  <h2 id="cf-title">{title}</h2><div className="adm-confirm__what">{children}</div>{extra}
  <label>Шалтгаан (хадгалагдана)<textarea rows={2} value={reason} onChange={e=>setReason(e.target.value)} minLength={8} maxLength={300} required placeholder="Яагаад хийж байгаагаа товч бичнэ үү"/></label>
  {err&&<div className="adm-error" role="alert">{err}</div>}
  <div className="adm-modal__row"><button type="button" className="adm-btn" onClick={onCancel} disabled={busy}>Болих</button><button type="submit" className={`adm-btn ${danger?'adm-btn--danger':'adm-btn--primary'}`} disabled={busy||!canSubmit||reason.trim().length<8}>{busy?'Түр хүлээнэ үү':confirmLabel}</button></div>
 </form></div>;
}
