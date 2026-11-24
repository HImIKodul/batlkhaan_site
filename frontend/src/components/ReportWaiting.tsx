import React from 'react';
import DomainBadge from './DomainBadge';
import { Button } from './UI';
import { domainNameMn } from '../data/domainOrder';
import { go } from './AppShell';

/** The only thing a customer sees between sending the questionnaire and the approved report. No scores, draft or workflow state. */
export default function ReportWaiting({areaId}:{areaId?:string}){
 return <section className="report-waiting" role="status" aria-live="polite" style={areaId?{'--c':`var(--mmri-domain-${areaId})`} as React.CSSProperties:undefined}>
  {areaId&&<p className="report-waiting__area"><DomainBadge id={areaId}/><span>{domainNameMn(areaId)}</span></p>}
  <i className="report-waiting__mark" aria-hidden="true"/>
  <h1 data-route-heading tabIndex={-1}>Таны тайланг бэлтгэж байна.</h1>
  <p>Тайланг 24 цагийн дотор хүргэнэ.</p>
  <p className="report-waiting__note">Бэлэн болмогц имэйлээр мэдэгдэнэ. Та энэ хуудсыг хааж болно.</p>
  <Button variant="secondary" onClick={()=>go('analysis')}>Оношилгоо руу буцах</Button>
 </section>;
}
