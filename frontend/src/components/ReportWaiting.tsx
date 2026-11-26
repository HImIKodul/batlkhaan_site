import React,{useEffect,useState} from 'react';
import DomainBadge from './DomainBadge';
import { Button } from './UI';
import { domainNameMn } from '../data/domainOrder';
import { go } from './AppShell';
import { api } from '../api/client';

/** Mongolia local time (Asia/Ulaanbaatar), "2026.11.26, 20:30". The instant comes from the server (persisted completion time and its 24 hour deadline), never from this device's clock or zone. */
export function formatUlaanbaatar(iso:string|null|undefined){
 if(!iso)return '';const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ulaanbaatar',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));
 return `${p.year}.${p.month}.${p.day}, ${p.hour}:${p.minute}`;
}
const STAGE_MN:Record<string,string>={PREPARING:'Тайлан боловсруулж байна',IN_REVIEW:'Хяналтад байна',READY:'Тайлан бэлэн'};

/** What a customer sees between sending the last answer and the approved report: the confirmation, the real submission time and deadline, and a plain status. No scores, draft or internal workflow state. */
export default function ReportWaiting({areaId,assessmentId}:{areaId?:string;assessmentId?:string}){
 const [st,setSt]=useState<Awaited<ReturnType<typeof api.getReviewStatus>>|null>(null);
 useEffect(()=>{if(!assessmentId)return;let live=true;const load=()=>api.getReviewStatus(assessmentId).then(x=>{if(live)setSt(x)}).catch(()=>undefined);void load();const t=window.setInterval(load,60_000);return()=>{live=false;window.clearInterval(t)}},[assessmentId]);
 const started=formatUlaanbaatar(st?.submittedAt),due=formatUlaanbaatar(st?.deadlineAt||st?.estimatedAvailableAt);
 const stage=st?.stage&&st.stage!=='READY'?st.stage:'PREPARING';
 return <section className="report-waiting" role="status" aria-live="polite" style={areaId?{'--c':`var(--mmri-domain-${areaId})`} as React.CSSProperties:undefined}>
  {areaId&&<p className="report-waiting__area"><DomainBadge id={areaId}/><span>{domainNameMn(areaId)}</span></p>}
  <i className="report-waiting__mark" aria-hidden="true"/>
  <h1 data-route-heading tabIndex={-1}>Таны оношилгоо амжилттай дууслаа.</h1>
  <p>Таны хариултад үндэслэн тайланг боловсруулж, хянан баталгаажуулсны дараа 24 цагийн дотор бэлэн болгоно.</p>
  {(started||due)&&<dl className="report-waiting__dates">{started&&<div><dt>Оношилгоо дууссан</dt><dd>{started}</dd></div>}{due&&<div><dt>Тайлан бэлэн болох хугацаа</dt><dd>{due}</dd></div>}</dl>}
  <p className="report-waiting__stage">Төлөв <b>{STAGE_MN[stage]}</b></p>
  <p className="report-waiting__note">Бэлэн болмогц танд мэдэгдэнэ. Та энэ хуудсыг хааж болно.</p>
  <Button variant="secondary" onClick={()=>go('analysis')}>Оношилгоо руу буцах</Button>
 </section>;
}
