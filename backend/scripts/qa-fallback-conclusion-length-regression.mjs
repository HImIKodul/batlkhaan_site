/* Regression: the deterministic fallback executive conclusion (S10) must stay within 80-160 words (validator V27) even when the
   priority action, KPI and capability names are long. Before the fix Operations best-case reports failed with HTTP 500 (162 words).
   Run after `npm run strategy:typecheck` (emits dist-strategy). */
import { deterministicFallbackNarrative } from '../dist-strategy/report/fallback-renderer.js';
const words=t=>t.trim().split(/\s+/).length;
const long=(n,w)=>Array.from({length:n},(_,i)=>`${w}${i}`).join(' ');
const mk=(len)=>({
 payloadHash:'h',assessmentId:'A1',assessmentMode:'FULL',assessmentStatus:'COMPLETED',methodologyVersion:'4.4.7',metricType:'OFFICIAL_OVERALL_SCORE',companyName:'Бодит компани',
 overall:{score:100,band:'Өндөр',confidence:1,coverage:1},requiredWarnings:[],purposes:[],evidenceActions:[],roadmap:[],risks:[],traceIndex:{},
 remeasurement:{labelMn:'Дахин оношилгоо хийх'},rootFindings:[],
 strengths:['Эхний чадавх','Хоёр дахь чадавх','Гурав дахь чадавх'].map((n,i)=>({nameMn:n+' '+long(len.name,'нэр'),sourceTraceIds:['t'+i]})),
 weaknesses:['Эхний сул','Хоёр дахь сул','Гурав дахь сул'].map((n,i)=>({nameMn:n+' '+long(len.name,'сул'),sourceTraceIds:['w'+i]})),
 priorityActions:[{id:'R1',titleMn:long(len.title,'гарчиг'),actionMn:long(len.action,'үйлдэл')+'.',kpiMn:long(len.kpi,'хэмжүүр'),deliverableMn:'гарц',sourceTraceIds:['recommendation:R1']}]
});
const results=[];let fail=0;
// V28: English management terms inside frozen action/KPI/capability names must not make the conclusion invalid
{const p=mk({name:1,title:3,action:6,kpi:3});p.priorityActions[0].kpiMn='SLA ба KPI хэмжүүр';p.priorityActions[0].titleMn='CRM dashboard workflow';p.strengths[0].nameMn='ERP benchmark чадавх';
 const c=deterministicFallbackNarrative(p).sections.find(s=>s.id==='S10').claims[0].textMn;const bad=/\b(?:KPI|dashboard|workflow|review|performance|benchmark|ROI|CRM|ERP|OKR|SLA)\b/i.test(c);const n=words(c);
 const ungrounded=[...c.matchAll(/\d+/g)].filter(m=>!['100','0','1'].includes(m[0]));const ok=!bad&&n>=80&&n<=160&&ungrounded.length===0;if(!ok)fail++;console.log(`${ok?'PASS':'FAIL'} conclusion with English terms in source data: ${n} words, foreign term present: ${bad}`)}
for(const [name,len] of [['short',{name:0,title:3,action:6,kpi:3}],['medium',{name:3,title:8,action:18,kpi:8}],['long',{name:6,title:12,action:30,kpi:14}],['very long',{name:8,title:16,action:40,kpi:20}]]){
 const d=deterministicFallbackNarrative(mk(len));const c=d.sections.find(s=>s.id==='S10').claims[0].textMn;const n=words(c);
 const ok=n>=80&&n<=160;if(!ok)fail++;console.log(`${ok?'PASS':'FAIL'} conclusion ${name}: ${n} words`);
}
console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
