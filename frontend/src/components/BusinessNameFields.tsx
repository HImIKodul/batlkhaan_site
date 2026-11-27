import React,{useId,useMemo,useRef,useState} from 'react';
import { Field,Input } from './UI';
import { joinBusinessName,legalFormByCode,legalFormLabel,searchLegalForms,splitBusinessName,type LegalForm } from '../data/legalForms';

/* `form` is the stable internal code of the legal-entity form (e.g. "11"); it is never displayed. Both fields are full width and stacked (name first, form below).
   Every option and the selected value show the abbreviation with its full name in parentheses. Search accepts abbreviation, full name, note or an English alias. */
type Props={name:string;form:string;onNameChange:(v:string)=>void;onFormChange:(v:string)=>void;error?:string;formError?:string};

export function BusinessNameFields({name,form,onNameChange,onFormChange,error,formError}:Props){
 const [open,setOpen]=useState(false);const [active,setActive]=useState(0);const [query,setQuery]=useState<string|null>(null);
 const listId=useId();const root=useRef<HTMLDivElement|null>(null);
 const selected=legalFormByCode(form);
 const shown=query??(selected?legalFormLabel(selected):'');
 const matches=useMemo(()=>searchLegalForms(query??''),[query]);
 const pick=(f:LegalForm)=>{onFormChange(f.code);setQuery(null);setOpen(false)};
 const closeList=()=>{
  setOpen(false);
  if(query!==null){const exact=searchLegalForms(query).filter(f=>f.abbr.toLocaleLowerCase('mn-MN')===query.trim().toLocaleLowerCase('mn-MN'));if(exact.length===1)onFormChange(exact[0].code);setQuery(null)}
 };
 const onKey=(e:React.KeyboardEvent<HTMLInputElement>)=>{
  if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(i=>Math.min(matches.length-1,i+1))}
  else if(e.key==='ArrowUp'){e.preventDefault();setActive(i=>Math.max(0,i-1))}
  else if(e.key==='Enter'&&open&&matches[active]){e.preventDefault();pick(matches[active])}
  else if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();closeList()}
 };
 /* A suffix typed into the name ("... ХХК") moves into the selector instead of being duplicated later. */
 const onNameBlur=()=>{if(!selected){const s=splitBusinessName(name);if(s.form){onNameChange(s.name);onFormChange(s.form)}}};
 const preview=name.trim()&&selected?joinBusinessName(name,form):'';
 return <div className="business-name-fields">
  <Field label="Байгууллагын оноосон нэр" error={error}><Input value={name} onChange={e=>onNameChange(e.target.value)} onBlur={onNameBlur} autoComplete="organization" autoFocus/></Field>
  <div className="business-name-fields__form" ref={root} onBlur={e=>{if(!root.current?.contains(e.relatedTarget as Node))closeList()}}>
   <Field label="Хуулийн этгээдийн хэлбэр" error={formError}>
    <Input role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open&&matches[active]?`${listId}-${active}`:undefined} placeholder="Жагсаалтаас сонгох эсвэл хайх" value={shown} autoComplete="off" onChange={e=>{setQuery(e.target.value);if(!e.target.value)onFormChange('');setActive(0);setOpen(true)}} onFocus={e=>{setOpen(true);e.currentTarget.select()}} onKeyDown={onKey}/>
   </Field>
   {open&&<div id={listId} role="listbox" aria-label="Хуулийн этгээдийн хэлбэр" className="mmri-choice-select__menu business-name-fields__menu">
    {matches.length?matches.map((f,i)=>{return <button key={f.code} id={`${listId}-${i}`} type="button" role="option" aria-selected={f.code===form} title={legalFormLabel(f)} tabIndex={-1} className={`${i===active?'is-active':''}${f.code===form?' is-selected':''}`.trim()} onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(i)} onClick={()=>pick(f)}>
     <b>{legalFormLabel(f)}</b>
    </button>}):<p className="business-name-fields__empty">Олдсонгүй. Товчлол эсвэл бүтэн нэрээр хайна уу.</p>}
   </div>}
   {selected&&<p className="business-name-fields__selected">{legalFormLabel(selected)}</p>}
   {preview&&<p className="business-name-fields__preview" aria-live="polite">Бүртгэгдэх нэр: <strong>{preview}</strong></p>}
  </div>
 </div>;
}
