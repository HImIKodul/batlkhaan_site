import React,{forwardRef,useState} from 'react';

/* One shared password field: hidden by default, an eye button reveals/hides the same value (the text is never cleared). The button is a real <button type="button"> with aria-pressed, so keyboard and touch work. */
type Props=React.InputHTMLAttributes<HTMLInputElement>;
export const PasswordInput=forwardRef<HTMLInputElement,Props>(function PasswordInput({className='',...props},ref){
 const [shown,setShown]=useState(false);
 const label=shown?'Нууц үгийг нуух':'Нууц үгийг харуулах';
 return <span className="pw-field">
  <input ref={ref} {...props} type={shown?'text':'password'} className={`pw-field__input ${className}`.trim()} autoCapitalize="none" spellCheck={false}/>
  <button type="button" className="pw-field__toggle" aria-label={label} title={label} aria-pressed={shown} onClick={()=>setShown(v=>!v)}>
   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {shown
     ? <><path d="M3 3l18 18"/><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.8-1.3 2.1-2.7 3.3M6.6 7.6C4.5 9 3.1 10.9 2.5 12c1 1.8 4.5 6 9.5 6 1.5 0 2.8-.4 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>
     : <><path d="M2.5 12C3.5 10.2 7 6 12 6s8.5 4.2 9.5 6c-1 1.8-4.5 6-9.5 6s-8.5-4.2-9.5-6z"/><circle cx="12" cy="12" r="3"/></>}
   </svg>
  </button>
 </span>;
});
