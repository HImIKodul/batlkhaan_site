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
const failed=checks.filter(x=>!x.pass);
console.log(JSON.stringify({suite:'Backend completion Step 13/20 provider regression',status:failed.length?'FAIL':'PASS',passed:checks.length-failed.length,total:checks.length,failed,checks},null,2));
if(failed.length)process.exit(1);
