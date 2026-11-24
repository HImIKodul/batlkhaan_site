import React,{useEffect,useState} from 'react';
import { Button } from './UI';
import { api } from '../api/client';

/** Opt-in for sending five general profile answers to the AI provider when a 12-month plan is prepared. Off by default; the owner may withdraw it at any time. */
export default function AiProfileConsentCard({companyId}:{companyId:string}){
 const [c,setC]=useState<{granted:boolean;version:string}|null>(null);const [hidden,setHidden]=useState(false);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 useEffect(()=>{let live=true;api.getAiProfileConsent(companyId).then(x=>{if(live)setC(x)}).catch(()=>{if(live)setHidden(true)/* members without access do not see the card */});return()=>{live=false}},[companyId]);
 if(hidden)return null;
 const granted=!!c?.granted;
 const change=async()=>{if(!c)return;setBusy(true);setErr('');try{setC(await api.setAiProfileConsent(companyId,!c.granted,c.version))}catch(e:any){setErr(e?.message||'Хадгалж чадсангүй. Дахин оролдоно уу.')}finally{setBusy(false)}};
 return <section className="account-data__card ai-consent lg lg--soft"><h2>Төлөвлөгөөнд суурь мэдээлэл ашиглах</h2>
  <p>12 сарын төлөвлөгөөг илүү тохируулахын тулд суурь мэдээллийн <b>таван ерөнхий хариултыг</b> (юу санал болгодог, хэнд, хэрхэн борлуулдаг, хөгжлийн үе шат, чиглэл) гадны хиймэл оюун ухааны үйлчилгээнд (OpenAI) илгээж болно. Зөвхөн сонгосон хариултын текст илгээгдэнэ. Хүний нэр, имэйл, утас, ажилтны тоо, төлбөрийн мэдээлэл илгээгдэхгүй.</p>
  <p>Зөвшөөрөхгүй байсан ч тайлан, төлөвлөгөө хэвийн гарна. Зөвшөөрлөө хэдийд ч цуцалж болно.</p>
  <div className="account-data__actions"><Button variant={granted?'secondary':'primary'} loading={busy} disabled={!c} onClick={()=>void change()}>{granted?'Зөвшөөрлөө цуцлах':'Зөвшөөрөх'}</Button></div>
  <small role="status">{!c?'\u00a0':granted?'Одоо: зөвшөөрсөн':'Одоо: зөвшөөрөөгүй'}</small>{err&&<small role="alert">{err}</small>}</section>;
}

