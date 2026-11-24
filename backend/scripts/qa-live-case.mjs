/* One coherent synthetic Marketing diagnosis (isolated QA database, real HTTP API, mock payment): every capability group has its own maturity, answers vary a little around it, the company consents to its characteristics being used.
   Used to prepare the owner's single real-model test. Prints the assessment id. */
import crypto from 'node:crypto';if(!/^mmri_qa_acc2_/.test(process.env.PGDATABASE||''))throw new Error('REFUSED');
const {customer,B,sql}=await import('./lib/admin-qa.mjs');const {http}=await import('./lib/qa-journey.mjs');
const rnd=s=>parseInt(crypto.createHash('md5').update(s).digest('hex').slice(0,8),16)/2**32;
const cu=await customer('livecase'),tok=cu.tok;const co=(await http(B,'POST','/companies',{tok,body:{name:'Туршилтын Худалдаа ХХК'}})).d.id;
const pq=(await http(B,'GET','/methodology/current/profile-questions',{tok})).d;const pa=pq.map((q,i)=>({questionId:q.id,optionIndexes:[Number(q.options[Math.min(1,q.options.length-1)].optionIndex)]}));
await http(B,'PUT',`/companies/${co}/profile-answers`,{tok,body:{profileAnswers:pa,basicInfoAnswers:Array.from({length:20},(_,i)=>({questionId:`B${String(i+1).padStart(2,'0')}`,optionIndexes:[1]}))}});
const g=await http(B,'GET',`/companies/${co}/ai-profile-consent`,{tok});const c=await http(B,'PUT',`/companies/${co}/ai-profile-consent`,{tok,body:{granted:true,version:g.d?.currentVersion??g.d?.version}});console.log('consent',c.s);
const inv=(await http(B,'POST',`/companies/${co}/billing/invoices`,{tok,body:{planCode:'DIAGNOSTIC',domainCode:'marketing'}})).d;await http(B,'POST',`/billing/invoices/${inv.id}/mock-pay`,{tok});
const a=(await http(B,'POST',`/companies/${co}/assessments`,{tok,body:{domainCode:'marketing'}})).d.id;const h={'x-mmri-writer-id':'lc-'+crypto.randomBytes(5).toString('hex')};
let route=(await http(B,'POST',`/assessments/${a}/start`,{tok,h,body:{mode:'QUICK',profileAnswers:pa}})).d,n=0;console.log('question keys',Object.keys(route.nextQuestion).join(','));
while(route?.nextQuestion&&n<320){const q=route.nextQuestion;const group=/C\d+/.exec(q.id)?.[0]??q.id;
  const level=[.12,.35,.55,.72,.9][Math.floor(rnd('grp5'+group)*5)],x=Math.max(0,Math.min(.999,level+(rnd('q'+q.id)-.5)*.22));
  const usable=q.options.filter(o=>!['N_A_CLAIM','DNK'].includes(o.state));const sc=usable.filter(o=>typeof o.score==='number').sort((p,r)=>p.score-r.score);const list=sc.length?sc:usable;const pick=list[Math.floor(x*list.length)]??list[0]??q.options[0];
  const r=await http(B,'POST',`/assessments/${a}/answers`,{tok,h,body:{questionId:q.id,optionIndex:pick.optionIndex,questionIssueId:route.questionIssueId,expectedAssessmentRevision:route.assessmentRevision,clientRequestId:crypto.randomUUID()}});if(r.s!==200)throw new Error('answer '+r.s+JSON.stringify(r.e));route=r.d.routing;n++;
  if(n%40===0)await http(B,'POST',`/assessments/${a}/writer-lease/heartbeat`,{tok,h,body:{}});
  const st=(await http(B,'GET',`/assessments/${a}/status`,{tok})).d;if(st.lifecycle?.isTerminal)break;if(st.lifecycle?.canRequestCompletion){await http(B,'POST',`/assessments/${a}/complete`,{tok,h,body:{expectedAssessmentRevision:st.assessmentRevision}});break}
  if(!route?.nextQuestion)route=(await http(B,'GET',`/assessments/${a}/next-question`,{tok,h})).d}
console.log('answered',n,'assessment',a);
for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,2000));if(sql(`select count(*) from report_snapshots where "assessmentId"='${a}' and payload is not null`)==='1')break}
console.log('score',sql(`select payload->'overall'->>'score' from report_snapshots where "assessmentId"='${a}'`));
