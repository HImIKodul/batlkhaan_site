/* Shared QA journey helper: drives the REAL HTTP API of an isolated stack through payment (mock provider), a QUICK assessment answered
   with the strongest scored option, and completion. Used by the notification and visual-editor regressions. Never used against :4000. */
import crypto from 'node:crypto';
export async function http(base,m,p,{tok,body,h={}}={}){const r=await fetch(base+p,{method:m,headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{}),...h},body:body===undefined?undefined:JSON.stringify(body)});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{}return {s:r.status,d:j?.data,e:j?.error}}
const on=(m,p,tok,body)=>http(B,m,p,{tok,body,h:{'x-mmri-writer-id':W}});
const list=async(tok,q='',base=B)=>(await http(base,'GET','/notifications'+q,{tok}));
const types=r=>(r.d?.items??[]).map(x=>x.type).sort();
const rndPw=()=>crypto.randomBytes(12).toString('base64url')+'Aa1!xyz';

export async function journey(base,tok,companyId,domain,planCode='DIAGNOSTIC',opts={}){
  const pq=(await http(base,'GET','/methodology/current/profile-questions',{tok})).d;
  await http(base,'PUT',`/companies/${companyId}/profile-answers`,{tok,body:{profileAnswers:pq.map(q=>({questionId:q.id,optionIndexes:[Number(q.options?.[0]?.optionIndex??1)]})),basicInfoAnswers:Array.from({length:20},(_,i)=>({questionId:`B${String(i+1).padStart(2,'0')}`,optionIndexes:[1]}))}});
  /* opts.grant: production-like stacks have no mock payment; access then comes from an audited administrator grant made by this callback. */
  let inv,pay,pay2;if(opts.grant){await opts.grant(domain)}else{
  inv=(await http(base,'POST',`/companies/${companyId}/billing/invoices`,{tok,body:{planCode,domainCode:domain}})).d;
  pay=await http(base,'POST',`/billing/invoices/${inv.id}/mock-pay`,{tok});
  pay2=await http(base,'POST',`/billing/invoices/${inv.id}/mock-pay`,{tok});}
  const a=(await http(base,'POST',`/companies/${companyId}/assessments`,{tok,body:{domainCode:domain}})).d.id;const wr='nt-'+crypto.randomBytes(5).toString('hex');
  const hdr={'x-mmri-writer-id':wr};
  let route=(await http(base,'POST',`/assessments/${a}/start`,{tok,h:hdr,body:{mode:'QUICK',profileAnswers:pq.map(q=>({questionId:q.id,optionIndexes:[Number(q.options?.[0]?.optionIndex??1)]}))}})).d;let n=0;
  while(route?.nextQuestion&&n<300){const q=route.nextQuestion,o=q.options,sc=o.filter(x=>typeof x.score==='number').sort((x,y)=>x.score-y.score);
    const pos=o.find(x=>['APPLICABLE','MOSTLY_APPLICABLE','PARTIAL_APPLICABILITY'].includes(x.state))||o.find(x=>x.optionIndex===1&&!['N_A_CLAIM','DNK'].includes(x.state))||o.find(x=>!['N_A_CLAIM','DNK'].includes(x.state))||o[0];
    const c=sc.length?sc[sc.length-1]:pos;
    const r=await http(base,'POST',`/assessments/${a}/answers`,{tok,h:hdr,body:{questionId:q.id,optionIndex:c.optionIndex,questionIssueId:route.questionIssueId,expectedAssessmentRevision:route.assessmentRevision,clientRequestId:crypto.randomUUID()}});
    if(r.s!==200)throw new Error('answer failed '+r.s+' '+JSON.stringify(r.e));route=r.d.routing;n++;
    if(n%40===0)await http(base,'POST',`/assessments/${a}/writer-lease/heartbeat`,{tok,h:hdr,body:{}});
    let st=(await http(base,'GET',`/assessments/${a}/status`,{tok})).d;if(st.lifecycle?.isTerminal)break;
    if(st.lifecycle?.canRequestCompletion){await http(base,'POST',`/assessments/${a}/complete`,{tok,h:hdr,body:{expectedAssessmentRevision:st.assessmentRevision}});break}
    if(!route?.nextQuestion)route=(await http(base,'GET',`/assessments/${a}/next-question`,{tok,h:hdr})).d}
  let st=(await http(base,'GET',`/assessments/${a}/status`,{tok})).d;
  if(!st.lifecycle?.isTerminal&&st.lifecycle?.canRequestCompletion)await http(base,'POST',`/assessments/${a}/complete`,{tok,h:hdr,body:{expectedAssessmentRevision:st.assessmentRevision}});
  const again=await http(base,'POST',`/assessments/${a}/complete`,{tok,h:hdr,body:{expectedAssessmentRevision:st.assessmentRevision}}); // duplicate completion must not duplicate events
  return {a,inv,pay,pay2,answered:n,again};
}
