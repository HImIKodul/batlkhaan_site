import { basicInfoQuestions, basicToLegacy, legacyToBasic } from '../../frontend/src/data/basicInfoQuestions.ts';
// Onboarding (20 company-profile questions) persistence, isolation and validation against an ISOLATED backend with synthetic users only.
// Usage: API=http://127.0.0.1:4310/api/v1 ORIGIN=http://127.0.0.1:5310 npx tsx scripts/qa-onboarding-save-regression.ts
const API=process.env.API??'http://127.0.0.1:4310/api/v1', ORIGIN=process.env.ORIGIN??'http://127.0.0.1:5310';
if(/businessmri\.mn/i.test(API))throw new Error('Refusing to run against the production host.');
async function call(token:string,method:string,path:string,body?:any,extra:any={}){
  const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',Origin:ORIGIN,'X-MMRI-Writer-ID':'matrix-writer-0001',...(token?{Authorization:'Bearer '+token}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
  const t=await r.text(); let j:any; try{j=JSON.parse(t)}catch{j=t}
  return {status:r.status,body:j,headers:r.headers};
}
const D=(r:any)=>r.body?.data??r.body;
const canon=(o:any)=>JSON.stringify(Object.keys(o).sort().map(k=>[k,o[k]]));
async function mk(tag:string){const email=`m_${tag}_${Date.now()}_${Math.random().toString(36).slice(2,6)}@example.test`;const pw='Matrix-Pass-12345!';
 const reg=await call('','POST','/auth/register',{email,password:pw,displayName:'Synthetic '+tag});const token=D(reg).accessToken;
 const co=await call(token,'POST','/companies',{name:'Synthetic '+tag+' ХХК'});return {email,pw,token,cid:D(co).id};}
const answers=(f:(i:number)=>number)=>Object.fromEntries(basicInfoQuestions.map((q,i)=>[q.id,[Math.min(f(i),q.options.length)]])) as Record<string,number[]>;
const payload=(a:Record<string,number[]>)=>({profileAnswers:basicToLegacy(a),basicInfoAnswers:basicInfoQuestions.map(q=>({questionId:q.id,optionIndexes:a[q.id]}))});
const out:string[]=[];const rec=(n:string,ok:boolean,d='')=>{out.push(`${ok?'PASS':'FAIL'} ${n}${d?' - '+d:''}`)};
const A=await mk('A'),B=await mk('B');
const a1=answers(i=>(i%4)+1);
let r=await call(A.token,'PUT',`/companies/${A.cid}/profile-answers`,payload(a1));rec('save 20 answers',r.status===200,String(r.status));
r=await call(A.token,'GET',`/companies/${A.cid}`);const prof=D(r).profile;
rec('GET company returns saved basicInfoAnswersV2 (20)',prof?.basicInfoAnswersV2?.length===20);
rec('basicInfoCompleted flag true',prof?.basicInfoCompleted===true);
const back=Object.fromEntries(prof.basicInfoAnswersV2.map((x:any)=>[x.questionId,x.optionIndexes]));
rec('round-trip equals what was sent',canon(back)===canon(a1));
rec('legacy round-trip (legacyToBasic) equals',canon(legacyToBasic(prof.assessmentProfileAnswers))===canon(a1));
// re-login
const lg=await call('','POST','/auth/login',{email:A.email,password:A.pw});rec('login after save',lg.status===200,String(lg.status));
const t2=D(lg).accessToken;r=await call(t2,'GET',`/companies/${A.cid}`);rec('answers persist after re-login',D(r).profile?.basicInfoAnswersV2?.length===20);
// logout
const lo=await call(t2,'POST','/auth/logout',{});rec('logout',lo.status>=200&&lo.status<300,String(lo.status));
// isolation
r=await call(B.token,'PUT',`/companies/${A.cid}/profile-answers`,payload(answers(()=>1)));rec('other company cannot write',r.status===403||r.status===404,String(r.status));
r=await call(B.token,'GET',`/companies/${A.cid}`);rec('other company cannot read',r.status===403||r.status===404,String(r.status));
r=await call(A.token,'GET',`/companies/${A.cid}`);rec('owner data unchanged after attack',canon(Object.fromEntries(D(r).profile.basicInfoAnswersV2.map((x:any)=>[x.questionId,x.optionIndexes])))===canon(a1));
// partial/invalid
const p=payload(a1);
r=await call(A.token,'PUT',`/companies/${A.cid}/profile-answers`,{...p,profileAnswers:p.profileAnswers.slice(0,19)});rec('19 profile answers rejected 400',r.status===400,r.status+' '+JSON.stringify(r.body?.error?.message));
r=await call(A.token,'PUT',`/companies/${A.cid}/profile-answers`,{...p,basicInfoAnswers:p.basicInfoAnswers.slice(0,19)});rec('19 basic answers rejected 400',r.status===400,String(r.status));
const bad=structuredClone(p);bad.profileAnswers[0].optionIndexes=[99];r=await call(A.token,'PUT',`/companies/${A.cid}/profile-answers`,bad);rec('option 99 rejected 400',r.status===400,r.status+' '+JSON.stringify(r.body?.error?.message));
const bad2=structuredClone(p);bad2.profileAnswers[1].optionIndexes=[1,2];r=await call(A.token,'PUT',`/companies/${A.cid}/profile-answers`,bad2);rec('2 options on single-select rejected 400',r.status===400,String(r.status));
r=await call(A.token,'PUT',`/companies/${A.cid}/profile-answers`,{profileAnswers:'x'});rec('garbage body rejected 400',r.status===400,String(r.status));
r=await call('','PUT',`/companies/${A.cid}/profile-answers`,p);rec('no token 401',r.status===401,String(r.status));
r=await call(A.token,'GET',`/companies/${A.cid}`);rec('failed saves did not clobber earlier answers',canon(Object.fromEntries(D(r).profile.basicInfoAnswersV2.map((x:any)=>[x.questionId,x.optionIndexes])))===canon(a1));
// profile-only (no basic) save
r=await call(B.token,'PUT',`/companies/${B.cid}/profile-answers`,{profileAnswers:p.profileAnswers});rec('legacy-only save accepted',r.status===200,String(r.status));
r=await call(B.token,'GET',`/companies/${B.cid}`);rec('legacy-only save does NOT mark basicInfoCompleted (frontend then shows questions again)',D(r).profile?.basicInfoCompleted!==true,'completed='+D(r).profile?.basicInfoCompleted);
// repeated + concurrent
const a2=answers(i=>((i+1)%3)+1);
const rs=await Promise.all(Array.from({length:8},(_,i)=>call(A.token,'PUT',`/companies/${A.cid}/profile-answers`,payload(i%2?a1:a2))));
rec('8 concurrent saves all 200',rs.every(x=>x.status===200),rs.map(x=>x.status).join(','));
r=await call(A.token,'GET',`/companies/${A.cid}`);const fin=Object.fromEntries(D(r).profile.basicInfoAnswersV2.map((x:any)=>[x.questionId,x.optionIndexes]));
const leg=legacyToBasic(D(r).profile.assessmentProfileAnswers);
rec('after concurrent saves basic and legacy copies are consistent (same snapshot)',canon(fin)===canon(leg));
// profile preserved alongside name update concurrently
const [x1,x2]=await Promise.all([call(A.token,'PUT',`/companies/${A.cid}`,{name:'Renamed ХХК'}),call(A.token,'PUT',`/companies/${A.cid}/profile-answers`,payload(a1))]);
r=await call(A.token,'GET',`/companies/${A.cid}`);rec('rename + save concurrently: both applied',D(r).name==='Renamed ХХК'&&D(r).profile?.basicInfoAnswersV2?.length===20,`${x1.status}/${x2.status} name=${D(r).name}`);
console.log(out.join('\n'));if(out.some(x=>x.startsWith('FAIL')))process.exit(1);
