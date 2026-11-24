/* Demonstration states on the ISOLATED demo database, through the real HTTP API only: operations = not purchased, it = purchased, finance = in progress, people = waiting for review, marketing = approved and open.
   Existing customer + existing administrator; mock payment, local model double. usage: PGDATABASE=mmri_qa_acc2_demo API=... node scripts/qa-demo-states.mjs <customer-password-file> */
import fs from 'node:fs';import crypto from 'node:crypto';const R=new URL('./lib/',import.meta.url).pathname;
if(process.env.PGDATABASE!=='mmri_qa_acc2_demo'&&!/^mmri_qa_acc2_/.test(process.env.PGDATABASE||''))throw new Error('REFUSED: demo database only');
const {B,sql,adminLogin,totp}=await import(R+'admin-qa.mjs');const {http}=await import(R+'qa-journey.mjs');
const EMAIL='batkhaan91+customer@gmail.com',PW=fs.readFileSync(process.argv[2],'utf8').trim();let tok='';const login=async()=>{const r=await http(B,'POST','/auth/login',{body:{email:EMAIL,password:PW}});if(!r.d?.accessToken)throw new Error('login '+r.s);tok=r.d.accessToken};await login();
const ok=(n,c,x='')=>{console.log(`${c?'PASS':'FAIL'} ${n} ${x}`);if(!c)process.exitCode=1};
const co=(await http(B,'GET','/companies',{tok})).d?.[0]?.id??(await http(B,'POST','/companies',{tok,body:{name:'Жишээ Үйлчилгээ ХХК'}})).d.id;
const pq=(await http(B,'GET','/methodology/current/profile-questions',{tok})).d;const pa=pq.map((q,i)=>({questionId:q.id,optionIndexes:[Number(q.options[Math.min(i%3,q.options.length-1)].optionIndex)]}));
await http(B,'PUT',`/companies/${co}/profile-answers`,{tok,body:{profileAnswers:pa,basicInfoAnswers:Array.from({length:20},(_,i)=>({questionId:`B${String(i+1).padStart(2,'0')}`,optionIndexes:[1]}))}});
const rnd=s=>parseInt(crypto.createHash('md5').update(s).digest('hex').slice(0,8),16)/2**32;
const buy=async d=>{const i=await http(B,'POST',`/companies/${co}/billing/invoices`,{tok,body:{planCode:'DIAGNOSTIC',domainCode:d}});if(i.s!==201)throw new Error('invoice '+i.s);ok(`${d}: invoice ${i.d.amountMnt}`,i.d.amountMnt===300000&&!!i.d.expiresAt);const p=await http(B,'POST',`/billing/invoices/${i.d.id}/mock-pay`,{tok});ok(`${d}: paid once`,p.d?.status==='PAID')};
const answer=async(d,limit)=>{const a=(await http(B,'POST',`/companies/${co}/assessments`,{tok,body:{domainCode:d}})).d.id;const h={'x-mmri-writer-id':'demo-'+crypto.randomBytes(5).toString('hex')};let route=(await http(B,'POST',`/assessments/${a}/start`,{tok,h,body:{mode:'QUICK',profileAnswers:pa}})).d;let n=0;
 while(route?.nextQuestion&&n<limit){const q=route.nextQuestion;const o=q.options.filter(x=>!['N_A_CLAIM','DNK'].includes(x.state));const r=rnd('v1'+q.id);const c=o[Math.min(o.length-1,Math.floor(o.length*r*r*1.15))]||q.options[0];
  const x=await http(B,'POST',`/assessments/${a}/answers`,{tok,h,body:{questionId:q.id,optionIndex:c.optionIndex,questionIssueId:route.questionIssueId,expectedAssessmentRevision:route.assessmentRevision,clientRequestId:crypto.randomUUID()}});if(x.s!==200)throw new Error('answer '+x.s);route=x.d.routing;n++;if(n%40===0)await http(B,'POST',`/assessments/${a}/writer-lease/heartbeat`,{tok,h,body:{}});
  const st=(await http(B,'GET',`/assessments/${a}/status`,{tok})).d;if(st.lifecycle?.isTerminal)break;if(limit>=300&&st.lifecycle?.canRequestCompletion){await http(B,'POST',`/assessments/${a}/complete`,{tok,h,body:{expectedAssessmentRevision:st.assessmentRevision}});break}if(!route?.nextQuestion)route=(await http(B,'GET',`/assessments/${a}/next-question`,{tok,h})).d}return {a,n}};
const only=(process.argv[3]||'it,finance,people,marketing').split(',');
for(const d of only){await login();await buy(d);const full=process.argv[4]==='full';if(d==='it'&&!full)continue;const r=await answer(d,d==='finance'&&!full?46:300);console.log(d,'answered',r.n);
 if(d==='finance'&&!full){ok('finance: in progress',sql(`select status from assessments where id='${r.a}'`)==='IN_PROGRESS');continue}
 let st='';for(let i=0;i<90;i++){await new Promise(x=>setTimeout(x,2000));st=sql(`select status from report_reviews where "assessmentId"='${r.a}'`);if(['AWAITING_REVIEW','GENERATION_FAILED'].includes(st))break}
 ok(`${d}: waits for review`,st==='AWAITING_REVIEW',st);await login();const c=await http(B,'GET',`/assessments/${r.a}/report`,{tok});const cp=await http(B,'GET',`/assessments/${r.a}/results`,{tok});ok(`${d}: report and results closed for the customer`,c.s===409&&cp.s===409,`${c.s}/${cp.s} ${c.e?.message??''}`);
 const dl=sql(`select extract(epoch from ("deadlineAt"-"submittedAt"))/3600 from report_reviews where "assessmentId"='${r.a}'`);ok(`${d}: deadline 24 h after submission`,Number(dl)===24,dl);
}
console.log('company',co);
