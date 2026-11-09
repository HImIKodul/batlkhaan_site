import React from 'react';
import { AppShell,PageContainer,routeHref } from './AppShell';
import { Icon } from './Icon';
import { usePrismPage } from '../design/prismPage';
import { LEGAL_DRAFT_DATE,LEGAL_STATUS_LABEL,LEGAL_STATUS_NOTE,type LegalDoc } from '../content/legal';

/** Shared layout for the Privacy Policy and Terms drafts. The draft status is always visible: these texts are not legal advice and are not approved. */
export function LegalDocument({doc,route}:{doc:LegalDoc;route:'privacy'|'terms'}){
 usePrismPage();
 const other=route==='privacy'?{route:'terms' as const,label:'Үйлчилгээний нөхцөл'}:{route:'privacy' as const,label:'Нууцлалын бодлого'};
 return <AppShell route={route}><PageContainer className="legal-doc">
  <header className="legal-doc__head">
   <span className="legal-doc__icon" aria-hidden="true"><Icon name="file" size={30}/></span>
   <div><b>ХУУЛИЙН БАРИМТ</b><h1 data-route-heading tabIndex={-1}>{doc.title}</h1><p>Төслийн огноо: {LEGAL_DRAFT_DATE}</p></div>
  </header>
  <div className="legal-doc__banner" role="note"><strong>{LEGAL_STATUS_LABEL}</strong><span>{LEGAL_STATUS_NOTE}</span></div>
  <section className="legal-doc__body lg lg--soft">
   <p className="legal-doc__intro">{doc.intro}</p>
   {doc.blocks.map(b=><article key={b.title} className="legal-doc__block">
    <h2>{b.title}</h2>
    {b.paragraphs?.map((p,i)=><p key={i}>{p}</p>)}
    {b.items&&<ul>{b.items.map((x,i)=><li key={i}>{x}</li>)}</ul>}
    {b.pending&&<p className="legal-doc__pending"><b>Батлагдаагүй:</b> {b.pending.join('; ')}.</p>}
   </article>)}
   <article className="legal-doc__block legal-doc__decisions">
    <h2>Эзэмшигч болон хуульчийн батлах шаардлагатай асуудлууд</h2>
    <ul>{doc.decisions.map((x,i)=><li key={i}>{x}</li>)}</ul>
   </article>
  </section>
  <nav className="legal-doc__links" aria-label="Холбоотой баримт">
   <a href={routeHref(other.route)}>{other.label}</a><a href="#/settings?section=data">Өгөгдөл ба нууцлал</a>
  </nav>
 </PageContainer></AppShell>;
}
