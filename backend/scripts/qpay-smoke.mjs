/* Checks QPay credentials WITHOUT creating an invoice or a payment: sign in, refresh, and one payment/check for a random id. Prints only statuses.
   --sandbox-invoice additionally creates and cancels one 100 MNT invoice; it is refused unless the address is the QPay sandbox.
   usage: node scripts/qpay-smoke.mjs /path/to/qpay.env [--sandbox-invoice] */
import fs from 'node:fs';import crypto from 'node:crypto';
const file=process.argv[2];if(!file)throw new Error('path of the credentials file required');
if((fs.statSync(file).mode&0o077)!==0)throw new Error('credentials file must be private (chmod 600)');
const env=Object.fromEntries(fs.readFileSync(file,'utf8').split('\n').map(l=>/^([A-Z_]+)='(.*)'$/.exec(l)).filter(Boolean).map(m=>[m[1],m[2]]));
const base=String(env.QPAY_BASE_URL||'').replace(/\/+$/,'');if(!['https://merchant.qpay.mn','https://merchant-sandbox.qpay.mn'].includes(base))throw new Error('unknown QPay address');
const sandbox=base.includes('sandbox');const req=async(path,o={})=>{const r=await fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(15000),...o});let b={};try{b=await r.json()}catch{}return{s:r.status,b}};
let bad=0;const say=(n,ok,x='')=>{if(!ok)bad++;console.log(`${ok?'PASS':'FAIL'} ${n} ${x}`)};
const t=await req('/v2/auth/token',{method:'POST',headers:{authorization:'Basic '+Buffer.from(`${env.QPAY_CLIENT_ID}:${env.QPAY_CLIENT_SECRET}`).toString('base64')}});
say(`sign-in (${sandbox?'sandbox':'PRODUCTION'})`,t.s===200&&!!t.b.access_token,`status ${t.s}`);if(bad)process.exit(1);
say('expires_in is a Unix timestamp',Number(t.b.expires_in)>1e9,`valid about ${Math.round((Number(t.b.expires_in)-Date.now()/1000)/3600)} h`);
const rf=await req('/v2/auth/refresh',{method:'POST',headers:{authorization:'Bearer '+t.b.refresh_token}});say('refresh',rf.s===200&&!!rf.b.access_token,`status ${rf.s}`);
const H={authorization:'Bearer '+(rf.b.access_token||t.b.access_token),'content-type':'application/json'};
const c=await req('/v2/payment/check',{method:'POST',headers:H,body:JSON.stringify({object_type:'INVOICE',object_id:crypto.randomUUID(),offset:{page_number:1,page_limit:100}})});say('payment/check reachable with these rights',c.s!==401&&c.s!==403,`status ${c.s}`);
if(process.argv.includes('--sandbox-invoice')){
 if(!sandbox){console.log('REFUSED --sandbox-invoice: this is the production address');process.exit(1)}
 const i=await req('/v2/invoice',{method:'POST',headers:H,body:JSON.stringify({invoice_code:env.QPAY_INVOICE_CODE,sender_invoice_no:'SMOKE'+Date.now(),invoice_receiver_code:'smoke',invoice_description:'BusinessMRI smoke',amount:100,allow_partial:false,allow_exceed:false,callback_url:'https://businessmri.mn/api/v1/billing/qpay/callback/smoke'})});
 say('invoice with QR and bank links',i.s===200&&!!i.b.qr_text&&Array.isArray(i.b.urls),`status ${i.s} ${/^[A-Z0-9_]{3,60}$/.test(i.b.message||'')?i.b.message:''} links ${i.b.urls?.length??0}`);
 if(i.b.invoice_id){const d=await req('/v2/invoice/'+i.b.invoice_id,{method:'DELETE',headers:H});say('cancel',d.s===200,`status ${d.s}`)}
}
process.exit(bad?1:0);
