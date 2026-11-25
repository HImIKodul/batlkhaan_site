import React,{useEffect,useMemo,useState} from 'react';
import { PageOne,PageTwo,PageThree,PrintReport,buildReportModel } from '../pages/Report';
import sample from '../data/sampleReport.json';
import { businessAreas,businessAreaById } from '../data/businessEvaluation';
import { domainFullName,domainWithAbbr } from '../data/domainOrder';
import { areaReportPalette } from '../data/reportExperience';
import { GlassStage } from './GlassStage';
import { setDomainTheme } from '../design/domainTheme';

const COMPANY=sample.payload.companyName;
const BASE=import.meta.env.BASE_URL;

/* Guide 3 example: the REAL report. Same page components, same container classes and accent, the same category stage (GlassStage + html[data-domain]) and one synthetic report made by the current generator (data/sampleReport.json),
   shown read-only. The PDF view shows the pages of the PDF rendered from the same data. Synthetic data only; no account, no entitlement, no request. */
export default function GuideReportExample(){
 const [view,setView]=useState<'web'|'pdf'>('web');
 const m=useMemo(()=>buildReportModel(businessAreaById('marketing'),COMPANY,undefined,undefined,sample.payload as never,{payload:sample.payload,narrative:sample.narrative} as never),[]);
 const palette=areaReportPalette.marketing;
 useEffect(()=>{setDomainTheme('marketing');return()=>setDomainTheme(null)},[]);
 return <section className="mmri-gex" aria-labelledby="mmri-gex-title">
  <div className="mmri-gex__stage" aria-hidden="true"><GlassStage route="report"/></div>
  <div className="mmri-gex__body">
   <header className="mmri-gex__head">
    <h3 id="mmri-gex-title">Маркетинг (MMRI) · Тайлангийн жишээ</h3>
    <p className="mmri-gex__demo" role="note"><b>ЖИШЭЭ ӨГӨГДӨЛ</b> Энэ тайлан нь бодит компани биш, зөвхөн тайланг ойлгуулах зорилготой зохиомол жишээ.</p>
    <div className="mmri-gex__tabs" role="tablist" aria-label="Тайлангийн харагдац">
     <button type="button" role="tab" aria-selected={view==='web'} className={view==='web'?'is-active':''} onClick={()=>setView('web')}>Вэб тайлан</button>
     <button type="button" role="tab" aria-selected={view==='pdf'} className={view==='pdf'?'is-active':''} onClick={()=>setView('pdf')}>PDF тайлан үзэх</button>
    </div>
   </header>
   {view==='web'
    ?<div className="page-container report-v3 report-v20 mmri-gex__report" style={{'--report-accent':palette.accent,'--domain-primary':palette.accent,'--domain-secondary':(palette as {secondary?:string}).secondary} as React.CSSProperties}>
      <header className="report-v3__top lg report-v20__top"><div className="report-company"><span>Бизнесийн оношилгооны тайлан</span><h1 className="report-category-title">{domainWithAbbr('marketing')}</h1><p className="report-company__name">{COMPANY}</p></div></header>
      <div className="report-toolbar" aria-hidden="true">
       <nav className="report-domain-switcher report-domain-switcher--v20">{businessAreas.map(a=>{const p=areaReportPalette[a.id];const act=a.id==='marketing';return <button type="button" tabIndex={-1} key={a.id} className={`${act?'is-active ':''}is-report`} style={{'--domain-accent':p.accent,'--domain-ink':p.ink,'--domain-primary':p.accent,'--domain-secondary':(p as {secondary?:string}).secondary} as React.CSSProperties}><span className="report-domain-switcher__icon" data-initial={({marketing:'M',it:'IT',finance:'F',people:'HR',operations:'OP'} as Record<string,string>)[a.id]}/><span className="report-domain-switcher__active-copy"><strong>{domainFullName(a.id)}</strong></span></button>})}</nav>
       <div className="report-version-strip report-version-strip--v3"><button type="button" tabIndex={-1} className="is-active">{m.date}</button></div>
      </div>
      <main className="report-three-pages report-screen-only"><PageOne m={m}/><PageTwo m={m}/><PageThree m={m}/></main>
     </div>
    :<div className="mmri-gex__pdf">
      <p className="mmri-gex__pdf-note">Дээрх вэб тайлантай ижил жишээ оношилгооны 3 хуудас PDF.</p>
      <ol>{[1,2,3].map(n=><li key={n}><img src={`${BASE}guide-shots/sample-report-${n}.jpg`} alt={`PDF тайлангийн ${n}-р хуудас (жишээ)`} width={794} height={1123} loading="lazy"/></li>)}</ol>
      <a className="mmri-gex__pdf-open" href={`${BASE}guide-shots/sample-report-marketing-demo.pdf`} target="_blank" rel="noopener noreferrer">PDF файлыг нээх</a>
     </div>}
  </div>
  <div className="report-print-only" aria-hidden="true"><PrintReport m={m}/></div>
 </section>;
}
