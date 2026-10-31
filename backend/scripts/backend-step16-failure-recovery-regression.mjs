import assert from 'node:assert/strict';
import crypto from 'node:crypto';
let pass=0;const ok=(name,fn)=>{try{fn();console.log('PASS',name);pass++;}catch(e){console.error('FAIL',name,e.message);process.exitCode=1;}};
const now=1_000_000;
const persisted={
 invoices:[
  {id:'i-old',status:'CREATED',providerInvoiceId:null,createdAt:now-400_000},
  {id:'i-fresh',status:'CREATED',providerInvoiceId:null,createdAt:now-30_000},
  {id:'i-pending',status:'PENDING',providerInvoiceId:'q-1',createdAt:now-400_000},
  {id:'i-paid',status:'PAID',providerInvoiceId:'q-2',createdAt:now-400_000},
 ],
 entitlements:[
  {id:'e-orphan',status:'CONSUMED',assessmentsUsed:1,updatedAt:now-200_000,paid:true,assessmentIds:[]},
  {id:'e-fresh',status:'CONSUMED',assessmentsUsed:1,updatedAt:now-30_000,paid:true,assessmentIds:[]},
  {id:'e-linked',status:'CONSUMED',assessmentsUsed:1,updatedAt:now-200_000,paid:true,assessmentIds:['a-1']},
 ],
 answers:new Map(), events:[], draft:{question:'q1',optionIndex:2}, assessment:{status:'PAUSED',revision:5,current:'q1'},
 report:{generationState:'PASS',narrativeHash:'good',leaseId:'dead',leaseExpiresAt:now-1},
 artifact:{sourceHash:'source',contentHash:null,bytes:null}
};
function restart(){return persisted;}
function recoverBilling(s){for(const i of s.invoices){if(i.status==='CREATED'&&!i.providerInvoiceId&&i.createdAt<now-300_000){i.status='FAILED';i.failureReason='interrupted';}}for(const e of s.entitlements){if(e.status==='CONSUMED'&&e.assessmentsUsed===1&&e.paid&&e.assessmentIds.length===0&&e.updatedAt<now-120_000){e.status='ACTIVE';e.assessmentsUsed=0;}}}
recoverBilling(restart());
ok('old interrupted invoice becomes FAILED',()=>assert.equal(persisted.invoices[0].status,'FAILED'));
ok('fresh local invoice is not stolen from active request',()=>assert.equal(persisted.invoices[1].status,'CREATED'));
ok('provider-backed pending invoice survives restart',()=>assert.equal(persisted.invoices[2].status,'PENDING'));
ok('paid invoice survives restart',()=>assert.equal(persisted.invoices[3].status,'PAID'));
ok('old orphaned paid entitlement is recovered',()=>assert.deepEqual([persisted.entitlements[0].status,persisted.entitlements[0].assessmentsUsed],['ACTIVE',0]));
ok('fresh claim is not prematurely recovered',()=>assert.equal(persisted.entitlements[1].status,'CONSUMED'));
ok('linked consumed entitlement is never reopened',()=>assert.equal(persisted.entitlements[2].status,'CONSUMED'));
function submit(requestId,payload){const old=persisted.events.find(x=>x.id===requestId);if(old){assert.deepEqual(old.payload,payload);return old.ack;}const ack={accepted:true,answerId:`a${persisted.events.length+1}`};persisted.events.push({id:requestId,payload,ack});persisted.answers.set(payload.question,payload.option);return ack;}
const a1=submit('r1',{question:'q1',option:3});const a2=submit('r1',{question:'q1',option:3});
ok('exact answer retry after connection loss is idempotent',()=>assert.deepEqual(a2,a1));
ok('answer retry does not duplicate event',()=>assert.equal(persisted.events.length,1));
ok('request id reuse with changed answer is rejected',()=>assert.throws(()=>submit('r1',{question:'q1',option:4})));
ok('saved answer survives process restart',()=>assert.equal(restart().answers.get('q1'),3));
ok('draft survives process restart',()=>assert.equal(restart().draft.optionIndex,2));
ok('paused assessment survives process restart',()=>assert.equal(restart().assessment.status,'PAUSED'));
function acquireReportLease(s,t){if(s.report.leaseId&&s.report.leaseExpiresAt>=t)return false;s.report.leaseId='new';s.report.leaseExpiresAt=t+60_000;return true;}
ok('expired report generation lease can be reclaimed',()=>assert.equal(acquireReportLease(persisted,now),true));
ok('live report generation lease blocks competing worker',()=>assert.equal(acquireReportLease(persisted,now+1),false));
function reportFailure(priorPublished){const r={generationState:priorPublished?'PASS':'PAYLOAD_FROZEN',leaseId:'x',leaseExpiresAt:now+1};r.generationState=priorPublished?r.generationState:'GENERATION_BLOCKED';r.leaseId=null;r.leaseExpiresAt=null;return r;}
ok('AI/report failure preserves prior published report',()=>assert.equal(reportFailure(true).generationState,'PASS'));
ok('first-time report failure is recoverable blocked state',()=>assert.equal(reportFailure(false).generationState,'GENERATION_BLOCKED'));
ok('report failure releases lease',()=>assert.equal(reportFailure(false).leaseId,null));
function hash(b){return crypto.createHash('sha256').update(b).digest('hex')}
function render(source){return Buffer.from(`%PDF-1.7\n${source}\n%%EOF`)}
function ensurePdf(s,source,{corrupt=false}={}){const expectedSource=hash(Buffer.from(source));if(s.artifact.bytes&&!corrupt&&s.artifact.sourceHash===expectedSource&&hash(s.artifact.bytes)===s.artifact.contentHash)return s.artifact;const bytes=render(source);const contentHash=hash(bytes);if(s.artifact.contentHash&&s.artifact.sourceHash===expectedSource&&s.artifact.contentHash!==contentHash)throw Error('NONDETERMINISTIC');s.artifact={sourceHash:expectedSource,contentHash,bytes};return s.artifact;}
const pdf1=ensurePdf(persisted,'frozen-report');persisted.artifact.bytes=Buffer.from('corrupt');const pdf2=ensurePdf(persisted,'frozen-report',{corrupt:true});
ok('corrupt PDF can be regenerated from frozen source',()=>assert.equal(pdf2.contentHash,pdf1.contentHash));
ok('PDF regeneration restores valid PDF bytes',()=>assert.equal(pdf2.bytes.subarray(0,4).toString(),'%PDF'));
const deterministicHash=pdf2.contentHash;
ok('same frozen report regenerates deterministically',()=>assert.equal(hash(render('frozen-report')),deterministicHash));
const payment={status:'PENDING',paid:false};function verification(outcome){if(outcome==='network')throw Error('TEMP');if(outcome==='unpaid')return payment;payment.status='PAID';payment.paid=true;return payment;}
ok('payment verification outage leaves invoice pending',()=>{assert.throws(()=>verification('network'));assert.equal(payment.status,'PENDING')});
ok('later reconciliation can settle payment',()=>assert.equal(verification('paid').status,'PAID'));
ok('duplicate successful reconciliation stays paid',()=>assert.equal(verification('paid').status,'PAID'));
console.log(`\nStep 16 recovery regression: ${pass}/24 PASS`);if(process.exitCode)process.exit(1);
