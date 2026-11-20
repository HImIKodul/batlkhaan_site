import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let ts; try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js')}
const root=process.cwd();
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mmri-step13-provider-'));
function transpile(rel){
  const src=path.join(root,rel); const source=fs.readFileSync(src,'utf8');
  const out=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext},reportDiagnostics:true,fileName:src});
  const errs=(out.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errs.length)throw new Error(errs.map(d=>`TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`).join('\n'));
  const dst=path.join(tmp,rel.replace(/\.ts$/,'.js')); fs.mkdirSync(path.dirname(dst),{recursive:true}); fs.writeFileSync(dst,out.outputText);
}
transpile('src/billing/qpay-client.ts'); transpile('src/billing/types.ts');
const {QPayMerchantV2Adapter,ManualPaymentAdapter,MockPaymentAdapter}=await import(pathToFileURL(path.join(tmp,'src/billing/qpay-client.js')));
const checks=[]; const check=(name,pass,detail)=>checks.push({name,pass:Boolean(pass),...(detail?{detail}:{})});
const config={qpayClientId:'cid',qpayClientSecret:'secret',qpayInvoiceCode:'code',qpayBaseUrl:'https://merchant.example',qpayRequestTimeoutMs:5000,manualPaymentQrText:'STATIC-QR-TEXT',manualPaymentQrImage:'',manualPaymentShortUrl:'https://pay.example'};
let authCalls=0,checkCalls=0;
globalThis.fetch=async (url,opts={})=>{
  if(String(url).endsWith('/v2/auth/token')){authCalls++; await new Promise(r=>setTimeout(r,20)); return new Response(JSON.stringify({access_token:'tok',expires_in:3600}),{status:200});}
  if(String(url).endsWith('/v2/payment/check')){checkCalls++; return new Response(JSON.stringify({rows:[{payment_status:'PAID',payment_amount:100000,payment_id:'p2'},{payment_status:'PAID',payment_amount:200000,payment_id:'p1'}]}),{status:200});}
  if(String(url).endsWith('/v2/invoice'))return new Response(JSON.stringify({invoice_id:'inv-1',qr_text:'qr',urls:[]}),{status:200});
  throw new Error(`unexpected fetch ${url}`);
};
const qpay=new QPayMerchantV2Adapter(config);
const [a,b]=await Promise.all([qpay.checkInvoicePayment('inv-1',300000),qpay.checkInvoicePayment('inv-1',300000)]);
check('concurrent provider checks share one auth request',authCalls===1,{authCalls});
check('both checks still reach payment verification',checkCalls===2,{checkCalls});
check('multiple paid rows are summed to invoice amount',a.paid&&a.paidAmountMnt===300000,a);
check('multi-row payment reference is deterministic',typeof a.paymentId==='string'&&a.paymentId.startsWith('qpay-set-')&&a.paymentId===b.paymentId,{a:a.paymentId,b:b.paymentId});
const created=await qpay.createInvoice({senderInvoiceNo:'S1',receiverCode:'C1',description:'x',amountMnt:300000,callbackUrl:'https://cb.example'});
check('invoice response maps provider invoice id',created.providerInvoiceId==='inv-1',created);
check('cached auth token is reused',authCalls===1,{authCalls});
const manual=new ManualPaymentAdapter(config);
const mi=await manual.createInvoice({senderInvoiceNo:'S2',receiverCode:'C2',description:'x',amountMnt:300000,callbackUrl:'https://cb.example'});
check('manual provider returns configured static QR text',mi.qrText==='STATIC-QR-TEXT',mi);
check('manual provider never self-confirms payment',(await manual.checkInvoicePayment('x',300000)).paid===false);
const mock=new MockPaymentAdapter();
const m=await mock.createInvoice({senderInvoiceNo:'S3',receiverCode:'C3',description:'x',amountMnt:300000,callbackUrl:'x'});
check('mock provider is clearly test-only data',m.providerInvoiceId.startsWith('mock_')&&String(m.qrText).includes('MMRI-MOCK-PAYMENT'));
check('mock check never unlocks by itself',(await mock.checkInvoicePayment('x',300000)).paid===false);
// A malformed provider response must never unlock an underpaid invoice.
const responseCases=[
  {name:'duplicate transaction rows are counted once',body:{rows:[{payment_status:'PAID',payment_amount:150000,payment_id:'duplicate'},{payment_status:'PAID',payment_amount:150000,payment_id:'duplicate'}]},paid:false,amount:150000},
  {name:'aggregate cannot inflate a partial payment',body:{paid_amount:300000,rows:[{payment_status:'PAID',payment_amount:1000,payment_id:'partial'}]},paid:false,amount:1000},
  {name:'unconfirmed payment is never counted',body:{paid_amount:300000,rows:[{payment_status:'PENDING',payment_amount:300000,payment_id:'pending'}]},paid:false,amount:0},
  {name:'foreign currency is rejected',body:{rows:[{payment_status:'PAID',payment_amount:300000,payment_id:'foreign',payment_currency:'USD'}]},error:true},
  {name:'conflicting duplicate amounts are rejected',body:{rows:[{payment_status:'PAID',payment_amount:100000,payment_id:'same'},{payment_status:'PAID',payment_amount:200000,payment_id:'same'}]},error:true},
  {name:'paid row without transaction identity is rejected',body:{rows:[{payment_status:'PAID',payment_amount:300000}]},error:true}
];
for(const test of responseCases){
 globalThis.fetch=async(url,options)=>{
  check('QPay requests reject redirects',options?.redirect==='error');
  return new Response(JSON.stringify(String(url).endsWith('/v2/auth/token')?{access_token:'synthetic-token',expires_in:3600}:test.body),{status:200});
 };
 try{const value=await new QPayMerchantV2Adapter(config).checkInvoicePayment('synthetic',300000);check(test.name,!test.error&&value.paid===test.paid&&value.paidAmountMnt===test.amount,value)}
 catch(error){check(test.name,test.error===true,String(error.message))}
}
// Pagination and constituent identities are part of the activation trust boundary.
check('paid result exposes every unique constituent transaction',a.transactions?.length===2&&a.transactions.some(x=>x.id==='p1'&&x.amountMnt===200000)&&a.transactions.some(x=>x.id==='p2'&&x.amountMnt===100000));
for(const mode of ['pages','empty-page','oversize-count','invalid-rows','repeated-page','changing-count']){
 let pages=0;const signals=[];
 globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith('/v2/auth/token'))return new Response(JSON.stringify({access_token:'synthetic-token',expires_in:3600}));
  pages++;signals.push(options.signal);const request=JSON.parse(options.body);
  check('pagination page numbers advance correctly',request.offset.page_number===pages);
  let body;
  if(mode==='pages')body={count:2,rows:[{payment_status:'PAID',payment_amount:150000,payment_id:'page-'+pages}]};
  if(mode==='empty-page')body={count:2,rows:[]};
  if(mode==='oversize-count')body={count:1001,rows:[]};
  if(mode==='invalid-rows')body={count:1,rows:null};
  if(mode==='repeated-page')body={count:2,rows:[{payment_status:'PAID',payment_amount:300000,payment_id:'same-page-id'}]};
  if(mode==='changing-count')body={count:pages===1?2:3,rows:[{payment_status:'PAID',payment_amount:150000,payment_id:'page-'+pages}]};
  return new Response(JSON.stringify(body));
 };
 try{
  const value=await new QPayMerchantV2Adapter(config).checkInvoicePayment('synthetic',300000);
  check('complete paginated payment is summed and retains identities',mode==='pages'&&pages===2&&value.paid&&value.transactions.length===2);
  check('pagination shares one overall verification deadline',signals.length===2&&signals[0]===signals[1]);
 }catch(error){check(mode+' fails closed',mode!=='pages',String(error.message))}
}
const failed=checks.filter(x=>!x.pass);
console.log(JSON.stringify({suite:'Backend completion Step 13/20 provider regression',status:failed.length?'FAIL':'PASS',passed:checks.length-failed.length,total:checks.length,failed,checks},null,2));
if(failed.length)process.exit(1);
