/* WS-E MMRI-29 / MMRI-02 (deterministic part): roadmap narrative must be the complete ordered plan; stated overall/purpose scores must be the payload values.
   Run after `npm run strategy:typecheck`. Pure in-process (synthetic payload, no database, no network). */
import { buildSyntheticPayload } from './lib/synthetic-report-payload.mjs';
import { deterministicFallbackNarrative } from '../dist-strategy/report/index.js';
import { validateNarrativeDraft } from '../dist-strategy/report/validator.js';
const payload=await buildSyntheticPayload();const base=deterministicFallbackNarrative(payload);
let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const clone=x=>JSON.parse(JSON.stringify(x));const has=(r,id)=>r.issues.some(i=>i.checkId===id);
const ms=payload.roadmap.flatMap(r=>r.milestones);
rec('W29-00 setup: the synthetic plan has at least 4 milestones and the fallback passes',ms.length>=4&&validateNarrativeDraft(payload,base).state==='PASS',`milestones=${ms.length} state=${validateNarrativeDraft(payload,base).state}`);
let d=clone(base);let s8=d.sections.find(s=>s.id==='S08');s8.claims=s8.claims.slice(0,1);
let r=validateNarrativeDraft(payload,d);rec('W29-01 one milestone claim out of many is rejected (the audited 22-vs-1 case)',r.state!=='PASS'&&has(r,'V38'),r.issues.map(i=>i.checkId).join(','));
d=clone(base);s8=d.sections.find(s=>s.id==='S08');s8.claims=s8.claims.slice(0,-1);r=validateNarrativeDraft(payload,d);rec('W29-02 omitting the last milestone is rejected',r.state!=='PASS'&&has(r,'V38'));
d=clone(base);s8=d.sections.find(s=>s.id==='S08');s8.claims.push(clone(s8.claims[0]));r=validateNarrativeDraft(payload,d);rec('W29-03 a duplicated milestone claim is rejected',r.state!=='PASS'&&has(r,'V38'));
d=clone(base);s8=d.sections.find(s=>s.id==='S08');[s8.claims[0],s8.claims[1]]=[s8.claims[1],s8.claims[0]];r=validateNarrativeDraft(payload,d);rec('W29-04 reordered milestones are rejected',r.state!=='PASS'&&has(r,'V38'));
d=clone(base);s8=d.sections.find(s=>s.id==='S08');s8.claims[1].textMn=s8.claims[1].textMn+' (өөрчилсөн)';r=validateNarrativeDraft(payload,d);rec('W29-05 editing milestone wording without changing the plan still passes (no false positive)',!has(r,'V38'));
d=clone(base);d.sections=d.sections.map(s=>s.id==='S02'?{...s,claims:s.claims.map(c=>c.claimType==='DESCRIPTIVE_SCORE'?{...c,textMn:c.textMn.replace(/\d+(?:\.\d+)?/,'99.9')}:c)}:s);r=validateNarrativeDraft(payload,d);
rec('W02-06 S02 stating another overall score is rejected (V39)',has(r,'V39'),r.issues.map(i=>i.checkId).join(','));
d=clone(base);const s3=d.sections.find(s=>s.id==='S03');s3.claims[0].textMn=s3.claims[0].textMn.replace(/:\s*\d+(?:\.\d+)?/,': 98.7');r=validateNarrativeDraft(payload,d);rec('W02-07 a purpose claim with a score other than its own is rejected (V39)',has(r,'V39'));
console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
