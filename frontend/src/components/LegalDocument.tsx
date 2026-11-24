import React from 'react';
import { AppShell,PageContainer,routeHref } from './AppShell';
import { Icon } from './Icon';
import { usePrismPage } from '../design/prismPage';
import { LEGAL_DRAFT_DATE,LEGAL_STATUS_LABEL,type LegalDoc } from '../content/legal';

/** Shared layout for the Privacy Policy and Terms drafts. The version line never claims legal approval. */
export function LegalDocument({doc,route}:{doc:LegalDoc;route:'privacy'|'terms'}){
 usePrismPage();
 const other=route==='privacy'?{route:'terms' as const,label:'Үйлчилгээний нөхцөл'}:{route:'privacy' as const,label:'Нууцлалын бодлого'};
 return <AppShell route={route}><PageContainer className="legal-doc">
  <header className="legal-doc__head">
   <span className="legal-doc__icon" aria-hidden="true"><Icon name="file" size={30}/></span>
   <div><b>ХУУЛИЙН БАРИМТ</b><h1 data-route-heading tabIndex={-1}>{doc.title}</h1><p>{LEGAL_STATUS_LABEL} · {LEGAL_DRAFT_DATE}</p></div>
  </header>
  <section className="legal-doc__body lg lg--soft">
   <p className="legal-doc__intro">{doc.intro}</p>
   {doc.blocks.map(b=><article key={b.title} className="legal-doc__block">
    <h2>{b.title}</h2>
    {b.paragraphs?.map((p,i)=><p key={i}>{p}</p>)}
    {b.items&&<ul>{b.items.map((x,i)=><li key={i}>{x}</li>)}</ul>}
    {b.pending&&<p className="legal-doc__pending"><b>Тодруулж буй:</b> {b.pending.join(' · ')}.</p>}
   </article>)}
  </section>
  <nav className="legal-doc__links" aria-label="Холбоотой баримт">
   <a href={routeHref(other.route)}>{other.label}</a><a href="#/settings?section=data">Бүртгэлийн удирдлага</a>
  </nav>
 </PageContainer></AppShell>;
}
