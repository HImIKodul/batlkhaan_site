import React,{useEffect,useRef,useState} from 'react';
import { Button } from './UI';
import { api } from '../api/client';
import { CompanyLogoMark,notifyCompanyLogoChanged,useCompanyLogo } from './CompanyLogo';

const TYPES=['image/png','image/jpeg','image/webp','image/gif'];
const EXT=/\.(png|jpe?g|webp|gif)$/i;
const MAX_BYTES=5*1024*1024;
const toBase64=(file:File)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(new Error('read'));r.readAsDataURL(file)});

/** Optional company logo: preview, replace, remove, save. The browser only does a convenience pre-check; the server validates and re-encodes the image and enforces the OWNER/ADMIN role. */
export default function CompanyLogoEditor({companyId,canEdit,initials}:{companyId:string;canEdit:boolean;initials:string}){
 const current=useCompanyLogo(companyId);
 const input=useRef<HTMLInputElement>(null);
 const [pending,setPending]=useState<{b64:string;preview:string;name:string}|null>(null);
 const [busy,setBusy]=useState<''|'save'|'remove'>('');const [error,setError]=useState('');const [note,setNote]=useState('');const [confirmRemove,setConfirmRemove]=useState(false);
 useEffect(()=>()=>{if(pending)URL.revokeObjectURL(pending.preview)},[pending]);
 const choose=async(e:React.ChangeEvent<HTMLInputElement>)=>{
  const file=e.target.files?.[0];e.target.value='';setError('');setNote('');setConfirmRemove(false);if(!file)return;
  if(!(TYPES.includes(file.type)||(!file.type&&EXT.test(file.name)))){setError('Зөвхөн PNG, JPG, JPEG, WebP эсвэл GIF зураг оруулна уу.');return}
  if(file.size>MAX_BYTES){setError('Зургийн хэмжээ 5 МБ-аас хэтэрсэн байна. Жижиг файл сонгоно уу.');return}
  try{const b64=await toBase64(file);setPending({b64,preview:URL.createObjectURL(file),name:file.name})}catch{setError('Файлыг уншиж чадсангүй.')}
 };
 const save=async()=>{if(!pending||busy)return;setBusy('save');setError('');setNote('');try{await api.setCompanyLogo(companyId,pending.b64);notifyCompanyLogoChanged(companyId);setPending(null);setNote('Лого хадгалагдлаа. Шинээр гарах тайлан болон PDF-д харагдана; өмнө гарсан тайлан өөрчлөгдөхгүй.')}catch(e:any){setError(e?.message||'Логог хадгалж чадсангүй.')}finally{setBusy('')}};
 const remove=async()=>{if(busy)return;setBusy('remove');setError('');setNote('');try{await api.deleteCompanyLogo(companyId);notifyCompanyLogoChanged(companyId);setConfirmRemove(false);setNote('Лого устгагдлаа.')}catch(e:any){setError(e?.message||'Логог устгаж чадсангүй.')}finally{setBusy('')}};
 const shown=pending?.preview||current;
 return <section className="company-logo-editor lg lg--soft" aria-labelledby="company-logo-title">
  <div className="company-logo-editor__preview" aria-live="polite">
   {shown?<img src={shown} alt={pending?'Сонгосон логоны урьдчилсан харагдац':'Байгууллагын лого'}/>:<span className="company-logo-editor__initials" aria-hidden="true">{initials}</span>}
   {pending&&<small className="company-logo-editor__tag">Хадгалаагүй</small>}
  </div>
  <div className="company-logo-editor__body">
   <h2 id="company-logo-title">Байгууллагын лого</h2>
   <p>Лого оруулах нь заавал шаардлагагүй. PNG, JPG, JPEG, WebP эсвэл GIF зураг сонгоно уу. Файлын хэмжээ 5 МБ-аас ихгүй байна.</p>
   {canEdit?<div className="company-logo-editor__actions">
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif" className="mmri-visually-hidden" id="company-logo-file" onChange={choose} aria-label="Логоны файл сонгох"/>
    <Button type="button" variant="secondary" onClick={()=>input.current?.click()} disabled={!!busy}>{current||pending?'Лого солих':'Лого сонгох'}</Button>
    {pending&&<><Button type="button" loading={busy==='save'} disabled={!!busy} onClick={()=>void save()}>Хадгалах</Button><Button type="button" variant="secondary" disabled={!!busy} onClick={()=>{setPending(null);setError('')}}>Болих</Button></>}
    {current&&!pending&&(confirmRemove
     ?<><Button type="button" variant="danger" loading={busy==='remove'} disabled={!!busy} onClick={()=>void remove()}>Устгахыг баталгаажуулах</Button><Button type="button" variant="secondary" disabled={!!busy} onClick={()=>setConfirmRemove(false)}>Болих</Button></>
     :<Button type="button" variant="secondary" disabled={!!busy} onClick={()=>setConfirmRemove(true)}>Лого устгах</Button>)}
   </div>:<p className="company-logo-editor__readonly">Логог зөвхөн байгууллагын эзэмшигч эсвэл админ өөрчилнө.</p>}
   {error&&<p className="company-logo-editor__error" role="alert">{error}</p>}
   {note&&<p className="company-logo-editor__note" role="status">{note}</p>}
  </div>
 </section>;
}
export {CompanyLogoMark};
