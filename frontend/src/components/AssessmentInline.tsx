import React,{useEffect,useMemo,useRef,useState} from 'react';
import { Button,ProgressBar,RadioGroup,SaveStatus,StatusBadge } from './UI';
import { SkeletonScreen } from './ApiState';
import { go } from './AppShell';
import { api,session } from '../api/client';
import type { AssessmentProgress,PublicQuestion,RoutingPayload } from '../api/types';
import { buildAnswerLayout,answerToneAtQuality } from '../data/answerTone';

const terminalRouting=new Set(['QUICK_COMPLETE','QUICK_LIMIT_REACHED','FULL_COMPLETE','FULL_COMPLETE_WITH_REVIEW','FULL_EVIDENCE_INCOMPLETE','NO_APPLICABLE_SCOPE','ADAPTIVE_V13_COMPLETE','ADAPTIVE_V13_LIMIT_REACHED']);
function displaySentence(value:string){const t=value.trim();return t?t[0].toLocaleUpperCase('mn-MN')+t.slice(1):t}
type DraftState='idle'|'dirty'|'saving'|'saved'|'error';
type Props={onCompleted:()=>void|Promise<void>;onAnswerAccepted?:()=>void|Promise<void>};

export function AssessmentInline({onCompleted,onAnswerAccepted}:Props){
 const [question,setQuestion]=useState<PublicQuestion|null>(null);
 const [progress,setProgress]=useState<AssessmentProgress|null>(null);
 const [answer,setAnswer]=useState<number|null>(null);
 const [routingMeta,setRoutingMeta]=useState<RoutingPayload|null>(null);
 const [draftState,setDraftState]=useState<DraftState>('idle');
 const [draftError,setDraftError]=useState('');
 const [actionError,setActionError]=useState('');
 const [loading,setLoading]=useState(true);
 const [submitting,setSubmitting]=useState(false);
 const [pausing,setPausing]=useState(false);
 const [rewinding,setRewinding]=useState(false);
 const [resumed,setResumed]=useState(false);
 const [domainCode,setDomainCode]=useState<string>(()=>sessionStorage.getItem('business:reportArea')||'marketing');
 const [online,setOnline]=useState(()=>typeof navigator==='undefined'?true:navigator.onLine!==false);
 const draftTimer=useRef<number|null>(null);
 /** Monotonic request counter: a save that finishes after a newer choice was made is ignored, so an older answer can never overwrite or mislabel a newer one. */
 const draftSeq=useRef(0);
 /** MMRI-04: advances on EVERY selection or clearing (not when a save starts). An acknowledgement only settles the UI/local record when no newer selection exists. */
 const selectionGen=useRef(0);
 const [showSaved,setShowSaved]=useState(false);
 const submitRequestRef=useRef<{questionIssueId:string;optionIndex:number;clientRequestId:string}|null>(null);
 const questionTitleRef=useRef<HTMLHeadingElement|null>(null);
 const localDraftKey=(assessmentId:string)=>`mmri.assessmentDraft.${assessmentId}`;
 const readLocalDraft=(assessmentId:string,questionIssueId:string|null|undefined,questionId:string)=>{
  try{const raw=localStorage.getItem(localDraftKey(assessmentId));if(!raw)return null;const row=JSON.parse(raw);if(row?.questionIssueId!==questionIssueId||row?.questionId!==questionId||!(Number.isInteger(row?.optionIndex)||row?.optionIndex===null)){localStorage.removeItem(localDraftKey(assessmentId));return null}return row as {optionIndex:number|null;updatedAt:string}}catch{return null}
 };
 const writeLocalDraft=(assessmentId:string,questionIssueId:string,questionId:string,optionIndex:number|null)=>{
  try{/* null is stored as an explicit "cleared" marker so an offline clearing survives a reload until the server acknowledges it */localStorage.setItem(localDraftKey(assessmentId),JSON.stringify({questionIssueId,questionId,optionIndex,updatedAt:new Date().toISOString()}))}catch{/* local fallback is best-effort; server persistence remains authoritative */}
 };
 const clearLocalDraft=(assessmentId:string)=>{try{localStorage.removeItem(localDraftKey(assessmentId))}catch{}};
 const submissionRequestId=(questionIssueId:string,optionIndex:number)=>{
  const current=submitRequestRef.current;if(current?.questionIssueId===questionIssueId&&current.optionIndex===optionIndex)return current.clientRequestId;
  const clientRequestId=globalThis.crypto?.randomUUID?.()??`answer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  submitRequestRef.current={questionIssueId,optionIndex,clientRequestId};return clientRequestId;
 };

 const handleRouting=(r:RoutingPayload)=>{
  setRoutingMeta(r);
  setDraftError('');
  if(r.nextQuestion){
   const assessmentId=session.assessmentId;
   const serverDraftAnswer=(r.draft?.draft as any)?.optionIndex;
   let localDraft=assessmentId?readLocalDraft(assessmentId,r.questionIssueId,r.nextQuestion.id):null;
   if(assessmentId&&localDraft&&localDraft.optionIndex===null&&!Number.isInteger(serverDraftAnswer)){clearLocalDraft(assessmentId);localDraft=null}   // clearing already reflected on the server
   const serverAckAt=r.draft?.serverAckAt?Date.parse(r.draft.serverAckAt):0;
   const localUpdatedAt=localDraft?.updatedAt?Date.parse(localDraft.updatedAt):0;
   const useLocal=!!localDraft&&(!Number.isInteger(serverDraftAnswer)||localUpdatedAt>serverAckAt);
   const draftAnswer=useLocal?localDraft?.optionIndex:serverDraftAnswer;
   if(assessmentId&&localDraft&&!useLocal)clearLocalDraft(assessmentId);
   if(submitRequestRef.current&&submitRequestRef.current.questionIssueId!==r.questionIssueId)submitRequestRef.current=null;
   setQuestion(r.nextQuestion);
   setAnswer(Number.isInteger(draftAnswer)?Number(draftAnswer):null);
   setDraftState(useLocal?'dirty':r.draft?'saved':'idle');
   return false;
  }
  if(session.assessmentId)clearLocalDraft(session.assessmentId);
  submitRequestRef.current=null;
  setQuestion(null);
  setAnswer(null);
  setDraftState('idle');
  return terminalRouting.has(r.state);
 };

 const load=async()=>{
  setLoading(true);setActionError('');setDraftError('');
  try{
   const id=session.assessmentId;
   if(!id){setQuestion(null);setProgress(null);setActionError('Идэвхтэй оношилгоо олдсонгүй.');return}
   const a=await api.getAssessment(id);
   setDomainCode(a.domainCode);
   try{localStorage.setItem(`mmri.assessmentArea.${id}`,a.domainCode);sessionStorage.setItem('business:reportArea',a.domainCode)}catch{/* browser storage is advisory; assessment record is authoritative */}
   const currentProgress=await api.getProgress(id);
   setProgress(currentProgress);
   if(['COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED'].includes(a.status)){setQuestion(null);setRoutingMeta(null);setResumed(false);await onCompleted();return}
   if(!['IN_PROGRESS','PAUSED'].includes(a.status)){setQuestion(null);setActionError(`Оношилгоог энэ төлвөөс үргэлжлүүлэх боломжгүй байна: ${a.status}`);return}
   let routing=await api.resumeAssessment(id,a.assessmentRevision);
   if(!routing.nextQuestion&&!terminalRouting.has(routing.state))routing=await api.nextQuestion(id);
   setResumed(a.status==='PAUSED'||(a.answeredQuestions??0)>0);
   const ended=handleRouting(routing);
   if(ended)await onCompleted();
  }catch(e:any){setActionError(e?.message||'Өмнөх явцыг сэргээж чадсангүй.')}
  finally{setLoading(false)}
 };

 const saveDraftNow=async(value:number|null,attempt=0,gen=selectionGen.current):Promise<boolean>=>{
  const id=session.assessmentId;
  if(!id||!question||!routingMeta?.questionIssueId||!online)return false;
  const seq=++draftSeq.current;
  setDraftState('saving');setDraftError('');
  try{
   await api.saveDraft(id,{questionIssueId:routingMeta.questionIssueId,questionId:question.id,draft:value===null?{}:{optionIndex:value},expectedAssessmentRevision:routingMeta.assessmentRevision});
   if(seq!==draftSeq.current)return true;           // a newer choice is already being saved; it decides the final state
   if(gen!==selectionGen.current)return true;       // a newer choice exists but is not saved yet: keep its local record and its pending save
   clearLocalDraft(id);
   setDraftState('saved');
   return true;
  }catch(e:any){
   if(seq!==draftSeq.current||gen!==selectionGen.current)return false;
   if(attempt<2&&navigator.onLine!==false){          // safe automatic retry (the server draft endpoint is idempotent for the same value)
    await new Promise(r=>window.setTimeout(r,attempt===0?1000:3000));
    if(seq!==draftSeq.current||gen!==selectionGen.current)return false;
    return saveDraftNow(value,attempt+1,gen);
   }
   setDraftState('error');                           // the selection stays visible and is kept locally; it is NOT marked as saved
   setDraftError(e?.message||'Сонголтыг автоматаар хадгалж чадсангүй.');
   return false;
  }
 };
 useEffect(()=>{
  if(draftState!=='saved'){setShowSaved(false);return}
  setShowSaved(true);const t=window.setTimeout(()=>setShowSaved(false),2200);return()=>window.clearTimeout(t);
 },[draftState]);

 useEffect(()=>{void load()},[]);
 useEffect(()=>{
  const handleOnline=()=>{setOnline(true);setDraftState(state=>state==='error'?'dirty':state)};
  const handleOffline=()=>setOnline(false);
  window.addEventListener('online',handleOnline);window.addEventListener('offline',handleOffline);
  return()=>{window.removeEventListener('online',handleOnline);window.removeEventListener('offline',handleOffline)};
 },[]);
 useEffect(()=>{
  if(!question?.id)return;
  const frame=requestAnimationFrame(()=>questionTitleRef.current?.focus({preventScroll:true}));
  return()=>cancelAnimationFrame(frame);
 },[question?.id]);
 useEffect(()=>{
  const id=session.assessmentId;if(!id)return;
  const timer=window.setInterval(()=>{if(navigator.onLine!==false)void api.heartbeatWriterLease(id).catch(()=>{})},30_000);
  return()=>window.clearInterval(timer);
 },[]);
 useEffect(()=>{
  if(draftTimer.current)window.clearTimeout(draftTimer.current);
  if(draftState!=='dirty'||!online||!question||!routingMeta?.questionIssueId)return;
  draftTimer.current=window.setTimeout(()=>{void saveDraftNow(answer)},650);
  return()=>{if(draftTimer.current)window.clearTimeout(draftTimer.current)};
 },[answer,draftState,online,question?.id,routingMeta?.questionIssueId,routingMeta?.assessmentRevision]);

 const options=question?.options??[];
 const layout=useMemo(()=>buildAnswerLayout(options),[options]);
 const main=layout.main.map(x=>x.option);
 const special=layout.special.map(x=>x.option);
 const answered=progress?.answeredQuestions??0;
 const questionNo=answered+1;
 const questionUpper=progress?.quick?.hardMaximum??null;
 const area=domainCode; const modeText=progress?.mode==='FULL'?'Бүрэн оношилгоо':area==='it'?'Мэдээллийн технологийн менежментийн оношилгоо':area==='finance'?'Санхүүгийн менежментийн оношилгоо':area==='people'?'Хүний нөөцийн менежментийн оношилгоо':area==='operations'?'Үйлдвэрлэл ба үйл ажиллагааны менежментийн оношилгоо':'Маркетингийн менежментийн оношилгоо';
 const expectedByArea:Record<string,number>={it:280,marketing:280,finance:280,people:280,operations:280};
 const expectedTotal=Math.max(1,questionUpper??expectedByArea[area]??280);
 const countProgress=Math.max(0,Math.min(99,Math.round((answered/expectedTotal)*100)));
 const sessionProgress=progress?.status&&terminalRouting.has(progress.status as any)?100:countProgress;
 const busy=submitting||pausing||rewinding||draftState==='saving';

 const choose=(value:string|number)=>{
  const next=Number(value);
  selectionGen.current++;
  setAnswer(next);
  if(session.assessmentId&&question&&routingMeta?.questionIssueId)writeLocalDraft(session.assessmentId,routingMeta.questionIssueId,question.id,next);
  setDraftState('dirty');
  setDraftError('');setActionError('');
 };
 const clearChoice=()=>{
  if(answer===null)return;
  if(draftTimer.current)window.clearTimeout(draftTimer.current);
  selectionGen.current++;
  setAnswer(null);setDraftError('');setActionError('');
  if(session.assessmentId&&question&&routingMeta?.questionIssueId)writeLocalDraft(session.assessmentId,routingMeta.questionIssueId,question.id,null);
  setDraftState('dirty');                          // the debounced effect (or the reconnect) sends the explicit empty draft; the marker is dropped on acknowledgement
  if(online)void saveDraftNow(null);
 };
 const goBack=async()=>{
  if(!session.assessmentId||!routingMeta||busy||answered<=0||!online)return;
  if(draftTimer.current)window.clearTimeout(draftTimer.current);
  setRewinding(true);setActionError('');setDraftError('');
  try{
   const r=await api.previousAnswer(session.assessmentId,routingMeta.assessmentRevision);
   setResumed(false);
   handleRouting(r);
   setProgress(await api.getProgress(session.assessmentId));
  }catch(e:any){setActionError(e?.message||'Өмнөх хариултыг засахаар нээж чадсангүй.')}
  finally{setRewinding(false)}
 };
 const submit=async()=>{
  if(answer===null||!question||!session.assessmentId||!online||draftState==='saving')return;
  if(draftTimer.current)window.clearTimeout(draftTimer.current);
  setSubmitting(true);setActionError('');setDraftError('');
  const assessmentId=session.assessmentId;
  try{
   if(!routingMeta?.questionIssueId)throw new Error('Одоогийн асуултын мэдээлэл бүрэн бус байна. Дахин ачаална уу.');
   const clientRequestId=submissionRequestId(routingMeta.questionIssueId,answer);
   let out:any;
   try{
    out=await api.submitAnswer(assessmentId,{questionId:question.id,optionIndex:answer,questionIssueId:routingMeta.questionIssueId,expectedAssessmentRevision:routingMeta.assessmentRevision,clientRequestId});
   }catch(e:any){setActionError(e?.message||'Хариултыг серверт хадгалж чадсангүй.');return}
   submitRequestRef.current=null;
   clearLocalDraft(assessmentId);
   setResumed(false);
   const ended=handleRouting(out.routing);
   try{setProgress(await api.getProgress(assessmentId))}catch{/* accepted answer is already durable; a later load refreshes progress */}
   if(ended){try{await onCompleted()}catch(e:any){setActionError(e?.message||'Хариулт хадгалагдсан боловч үр дүнгийн хуудсыг шинэчилж чадсангүй. Дахин ачаална уу.')}}
   else{try{await onAnswerAccepted?.()}catch{/* answer persistence must not be reported as failed because a secondary refresh failed */}}
  }finally{setSubmitting(false)}
 };
 const pause=async()=>{
  if(!session.assessmentId||!routingMeta||busy||!online)return;
  if(draftTimer.current)window.clearTimeout(draftTimer.current);
  setPausing(true);setActionError('');
  try{
   if((draftState==='dirty'||draftState==='error')&&question){
    const saved=await saveDraftNow(answer);
    if(!saved)throw new Error('Гарахын өмнө одоогийн сонголтыг хадгалж чадсангүй.');
   }
   await api.pauseAssessment(session.assessmentId,routingMeta.assessmentRevision);
   go('analysis');
  }catch(e:any){setActionError(e?.message||'Оношилгоог түр хадгалж чадсангүй.')}
  finally{setPausing(false)}
 };

 if(loading)return <section className="mmri-questionnaire mmri-questionnaire--loading" aria-label={modeText}><SkeletonScreen variant="questionnaire" label="Дараагийн асуултыг бэлтгэж байна" description="Таны өмнөх хариулт болон оношилгооны явцыг сэргээж байна."/></section>;

 if(!question)return <section className="mmri-questionnaire" aria-label={modeText}><div className="mmri-questionnaire__empty"><StatusBadge tone={actionError?'danger':'neutral'}>{actionError?'Ачаалж чадсангүй':'Асуулт хүлээгдэж байна'}</StatusBadge><h2>{actionError||'Одоогоор нээлттэй асуулт алга.'}</h2><p>Оношилгооны төлөвийг дахин шалгаж үргэлжлүүлнэ үү.</p><Button variant="secondary" onClick={load}>Дахин шалгах</Button></div></section>;

 return <section className="mmri-questionnaire" aria-label={modeText}>
  <header className="mmri-questionnaire__top">
   <div className="mmri-questionnaire__top-row">
    <strong className="mmri-questionnaire__count">Асуулт {questionNo}<span> / {expectedTotal}</span></strong>
    <div className="mmri-questionnaire__session-actions">
     {!online?<StatusBadge tone="warning">Интернетгүй</StatusBadge>:draftState==='saving'?<SaveStatus state="saving"/>:draftState==='saved'&&showSaved?<SaveStatus state="saved"/>:draftState==='error'?<SaveStatus state="error"/>:null}
     <Button variant="ghost" size="compact" disabled={busy||!online} loading={pausing} onClick={()=>void pause()}>Түр гарах</Button>
    </div>
   </div>
   <ProgressBar value={sessionProgress} label={`Оношилгооны явц ${sessionProgress} хувь`}/>
  </header>

  {resumed&&<div className="mmri-questionnaire__resume" role="status"><span aria-hidden="true">✓</span><div><strong>Өмнөх явцаас үргэлжлүүллээ</strong><p>Өмнө хадгалсан хариултууд хэвээр байна.</p></div></div>}
  {!online&&<div className="mmri-questionnaire__network" role="alert"><strong>Интернет холболт тасарсан байна.</strong><span>Одоогийн сонголтыг серверт илгээх боломжгүй. Холболт сэргэх хүртэл энэ хуудсыг хаахгүй байгаарай.</span></div>}

  <form className="mmri-questionnaire__form" key={question.id} onSubmit={(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();void submit()}}>
   <div className="mmri-questionnaire__question-head">
    {question.contextMn&&<span className="mmri-questionnaire__context">{question.contextMn}</span>}
    <span className="mmri-questionnaire__eyebrow">Хамгийн ойр хариултыг сонгоно уу.</span>
    <h1 ref={questionTitleRef} tabIndex={-1}>{displaySentence(question.textMn)}</h1>
   </div>

   <div className="mmri-questionnaire__answers">
    <RadioGroup name={`answer-${question.id}`} value={answer} onValueChange={choose} label="Хариултын үндсэн сонголтууд" className="is-ordered-scale" onDeselect={clearChoice} options={layout.main.map((x,i)=>{const o=x.option;const neutralMain=x.role==='neutral-main';const t=x.quality===null?null:answerToneAtQuality(x.quality);return {value:o.optionIndex,label:displaySentence(o.labelMn),className:neutralMain?'is-neutral-tone':'has-score-tone',style:t?({'--answer-color':t.color,'--answer-soft':t.soft,'--answer-mix':t.mix,'--answer-deep':t.deep} as React.CSSProperties):undefined}})}/>
    {special.length>0&&<div className="mmri-questionnaire__special">{main.length>0&&<span>Хэрэв дээрх сонголтуудаас тодорхой хариулах боломжгүй бол доорхоос сонгоно уу:</span>}<RadioGroup name={`answer-${question.id}`} value={answer} onValueChange={choose} label="Нэмэлт хариултын сонголтууд" onDeselect={clearChoice} options={special.map(o=>({value:o.optionIndex,label:displaySentence(o.labelMn),className:'is-neutral-tone'}))}/></div>}
   </div>

   <div className="mmri-questionnaire__save-line" role="status" aria-live="polite" aria-atomic="true">
    {!online?<span>Интернет холболт алга. Сонголт энэ төхөөрөмж дээр хадгалагдаж, холболт сэргэмэгц автоматаар илгээгдэнэ.</span>:draftState==='error'?<><span>Хадгалахад алдаа гарлаа. Таны сонголт энэ хуудсан дээр хэвээр байна.</span><button type="button" className="mmri-questionnaire__retry" onClick={()=>void saveDraftNow(answer)}>Дахин оролдох</button></>:draftState==='saving'?<span>Хадгалж байна</span>:<span className="mmri-visually-hidden">{answer===null?'Хариулт сонгоогүй байна.':'Сонголт автоматаар хадгалагдана.'}</span>}
    <button type="button" className="mmri-questionnaire__clear" disabled={answer===null||busy} onClick={clearChoice}>Сонголтыг буцаах</button>
   </div>

   {actionError&&<div className="mmri-questionnaire__error" role="alert"><strong>Үйлдлийг гүйцэтгэж чадсангүй.</strong><span>{actionError}</span></div>}

   <footer className="mmri-questionnaire__actions">
    <Button type="button" variant="ghost" className="is-back" disabled={busy||answered<=0||!online} loading={rewinding} onClick={()=>void goBack()}>‹ Буцах</Button>
    <Button type="submit" size="touch" className="is-next" disabled={answer===null||busy||!online} loading={submitting}>Үргэлжлүүлэх ›</Button>
   </footer>
  </form>
 </section>
}
