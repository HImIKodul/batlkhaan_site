import {DOMAIN_NAME_MN} from '../data/domainOrder';
/* Downloaded report file name: <company>_<category>_тайлан_<YYYY-MM-DD>.pdf. Company, category and date only; no product prefix, version, internal code or English identifier. */
/** Customer-facing Mongolian category names (web report title and switcher, and the PDF file name). */
export const AREA_NAME_MN:Record<string,string>=DOMAIN_NAME_MN;
const pdfFilePart=(v:string)=>v.normalize('NFC').replace(/[\u0000-\u001f\u007f\/:*?"<>|\\,;]+/g,' ').replace(/\s+/g,' ').trim().replace(/^\.+|\.+$/g,'').slice(0,60).trim().replace(/ /g,'_');
const pdfDateIso=(raw:string)=>{const d=new Date(raw);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ulaanbaatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)};
export function pdfDownloadName(m:{company:string;area:{id:string};rawDate:string},_fallback?:string){const company=pdfFilePart(m.company),area=pdfFilePart(AREA_NAME_MN[m.area.id]||''),date=pdfDateIso(m.rawDate);return company&&area&&date?`${company}_${area}_тайлан_${date}.pdf`:`Оношилгооны_тайлан${date?`_${date}`:''}.pdf`}
