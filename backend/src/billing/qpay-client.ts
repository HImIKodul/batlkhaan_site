import { createHash } from "node:crypto";
import type { ApiConfig } from "../api/config.js";
import type { PaymentProviderAdapter, ProviderInvoiceRequest, ProviderInvoiceResult, ProviderPaymentResult } from "./types.js";

function asNumber(value:unknown):number{
  const n=Number(value??0);
  return Number.isFinite(n)?n:0;
}
function text(value:unknown):string|null{return typeof value==="string"&&value.trim()?value.trim():null;}
/** Transaction ids arrive as strings; a numeric id is accepted only while it is exact. */
function identifier(value:unknown):string|null{return typeof value==="number"&&Number.isSafeInteger(value)&&value>0?String(value):text(value);}
/** Documented upper-case error code (for example INVOICE_CODE_INVALID); anything else the provider says is not repeated. */
function providerCode(body:any):string{const c=text(body?.message);return c&&/^[A-Z0-9_]{3,60}$/.test(c)?` ${c}`:"";}
function jsonHeaders(token:string){return {"content-type":"application/json","authorization":`Bearer ${token}`};}
function stablePaymentSetId(ids:string[]):string|null{
  const normalized=[...new Set(ids.map(x=>x.trim()).filter(Boolean))].sort();
  if(normalized.length===0)return null;
  if(normalized.length===1)return normalized[0];
  return `qpay-set-${createHash("sha256").update(normalized.join("\n")).digest("hex").slice(0,40)}`;
}

/** QPay documents `expires_in` / `refresh_expires_in` as a Unix timestamp in SECONDS (not a remaining duration). Small values are still read as a duration so a differently configured merchant can never yield a token that looks valid for decades. */
export function qpayExpiryMs(value:unknown,now=Date.now()):number{
  const n=asNumber(value);
  const at=n>1_000_000_000?n*1000:n>0?now+n*1000:now+3_600_000;
  return Math.min(at,now+7*86_400_000);
}
/** QPay refuses special characters in `sender_invoice_no` and `invoice_description`. */
export function qpayPlainText(value:string,max:number):string{return value.normalize("NFC").replace(/[^\p{L}\p{N} .]+/gu," ").replace(/\s+/g," ").trim().slice(0,max);}
/** Bank-app links are passed on exactly as QPay sent them; only schemes a browser could execute are dropped. */
export function safeDeeplink(link:string):boolean{return /^[a-z][a-z0-9+.-]{1,40}:\/\//i.test(link)&&!/^(javascript|data|vbscript|file|blob|about|chrome|view-source|filesystem):/i.test(link)&&!/[\u0000-\u0020]/.test(link);}

type QPayToken={access:string;expiresAt:number;refresh:string|null;refreshExpiresAt:number};

export class QPayMerchantV2Adapter implements PaymentProviderAdapter {
  readonly name="QPAY" as const;
  /** Tokens live in process memory only (QPay recommendation): never in the database, logs or a browser. */
  private tokenCache:QPayToken|null=null;
  private tokenInflight:Promise<string>|null=null;
  constructor(private readonly config:ApiConfig){}

  private requestSignal(){return AbortSignal.timeout(this.config.qpayRequestTimeoutMs);}

  private storeToken(body:any):string{
    const access=text(body?.access_token);
    if(!access)throw new Error("QPay auth response did not contain access_token");
    const refresh=text(body?.refresh_token);
    this.tokenCache={access,expiresAt:qpayExpiryMs(body?.expires_in),refresh,refreshExpiresAt:refresh?qpayExpiryMs(body?.refresh_expires_in):0};
    return access;
  }

  private async token(){
    if(this.tokenCache&&Date.now()<this.tokenCache.expiresAt-60_000)return this.tokenCache.access;
    if(this.tokenInflight)return this.tokenInflight;
    this.tokenInflight=(async()=>{
      const old=this.tokenCache;this.tokenCache=null;
      if(old?.refresh&&Date.now()<old.refreshExpiresAt-30_000){
        try{
          const res=await fetch(`${this.config.qpayBaseUrl}/v2/auth/refresh`,{method:"POST",headers:{authorization:`Bearer ${old.refresh}`},redirect:"error",signal:this.requestSignal()});
          const body=await readProviderBody(res);
          if(res.ok)return this.storeToken(body);
        }catch{/* fall through to a full sign-in */}
      }
      const basic=Buffer.from(`${this.config.qpayClientId}:${this.config.qpayClientSecret}`,"utf8").toString("base64");
      const res=await fetch(`${this.config.qpayBaseUrl}/v2/auth/token`,{method:"POST",headers:{authorization:`Basic ${basic}`},redirect:"error",signal:this.requestSignal()});
      const body=await readProviderBody(res);
      if(!res.ok)throw new Error(`QPay auth failed (${res.status})`);
      return this.storeToken(body);
    })();
    try{return await this.tokenInflight;}finally{this.tokenInflight=null;}
  }

  /** Signed request. QPay may revoke a token early (401/403): drop it, sign in again and repeat at most once. */
  private async authed(path:string,init:{method:string;body?:string},signal:AbortSignal):Promise<Response>{
    for(let attempt=1;;attempt++){
      const token=await this.token();
      const res=await fetch(`${this.config.qpayBaseUrl}${path}`,{...init,headers:init.body===undefined?{authorization:`Bearer ${token}`}:jsonHeaders(token),redirect:"error",signal});
      if((res.status!==401&&res.status!==403)||attempt>1)return res;
      await readProviderBody(res);
      // Only this rejected token is discarded: a newer one obtained by a concurrent request stays.
      if(this.tokenCache?.access===token)this.tokenCache=null;
    }
  }

  async createInvoice(input:ProviderInvoiceRequest):Promise<ProviderInvoiceResult>{
    if(!/^https?:\/\//.test(input.callbackUrl)||input.callbackUrl.length>255)throw new Error("QPay callback URL is invalid or longer than 255 characters");
    const payload={
      invoice_code:this.config.qpayInvoiceCode,
      sender_invoice_no:input.senderInvoiceNo,
      invoice_receiver_code:input.receiverCode,
      invoice_description:qpayPlainText(input.description,200),
      amount:input.amountMnt,
      // A domain purchase is one exact price: no partial, larger or recurring payment.
      allow_partial:false,
      allow_exceed:false,
      allow_subscribe:false,
      callback_url:input.callbackUrl
    };
    const res=await this.authed("/v2/invoice",{method:"POST",body:JSON.stringify(payload)},this.requestSignal());
    const body:any=await readProviderBody(res);
    if(!res.ok)throw new Error(`QPay invoice creation failed (${res.status}${providerCode(body)})`);
    const providerInvoiceId=text(body?.invoice_id);
    if(!providerInvoiceId)throw new Error("QPay invoice response did not contain invoice_id");
    const rawLinks=Array.isArray(body?.urls)?body.urls:Array.isArray(body?.qpay_urls)?body.qpay_urls:[];
    const deeplinks=rawLinks.slice(0,60).map((x:any)=>({name:text(x?.name)??undefined,description:text(x?.description)??undefined,logo:text(x?.logo)??undefined,link:text(x?.link)??text(x?.url)??""})).filter((x:any)=>safeDeeplink(x.link));
    return {
      providerInvoiceId,
      qrText:text(body?.qr_text),
      qrImage:text(body?.qr_image),
      shortUrl:text(body?.qPay_shortUrl)??text(body?.qpay_short_url)??text(body?.short_url),
      deeplinks,
      raw:body
    };
  }

  async cancelInvoice(providerInvoiceId:string):Promise<void>{
    const res=await this.authed(`/v2/invoice/${encodeURIComponent(providerInvoiceId)}`,{method:"DELETE"},this.requestSignal());
    if(!res.ok){
      await readProviderBody(res);
      throw new Error(`QPay invoice cancellation failed (${res.status})`);
    }
  }

  /** Independent second look at one transaction: it must be a settled MNT payment of THIS invoice. A mismatch refuses activation; an unreachable detail endpoint leaves the decision to payment/check. */
  private async assertPaymentBelongs(paymentId:string,providerInvoiceId:string,amountMnt:number,signal:AbortSignal){
    let body:any;
    try{
      const res=await this.authed(`/v2/payment/${encodeURIComponent(paymentId)}`,{method:"GET"},signal);
      body=await readProviderBody(res);
      if(!res.ok)return;
    }catch{return}
    const objectId=identifier(body?.object_id),type=text(body?.object_type),status=text(body?.payment_status),currency=text(body?.payment_currency);
    if(objectId&&(!type||type.toUpperCase()==="INVOICE")&&objectId!==providerInvoiceId)throw new Error("QPay payment belongs to a different invoice");
    if(status&&status.toUpperCase()!=="PAID")throw new Error("QPay payment is not settled");
    if(currency&&currency.toUpperCase()!=="MNT")throw new Error("QPay returned an unexpected payment currency");
    if(body?.payment_amount!==undefined&&asNumber(body.payment_amount)!==amountMnt)throw new Error("QPay payment amount differs between endpoints");
  }

  async checkInvoicePayment(providerInvoiceId:string,expectedAmountMnt:number):Promise<ProviderPaymentResult>{
    const signal=this.requestSignal();
    const rows:any[]=[];
    let body:any;let expectedCount:number|null=null;
    // Provider pagination is bounded. Incomplete/malformed responses never activate an invoice.
    for(let page=1;page<=10;page++){
      const payload={object_type:"INVOICE",object_id:providerInvoiceId,offset:{page_number:page,page_limit:100}};
      const res=await this.authed("/v2/payment/check",{method:"POST",body:JSON.stringify(payload)},signal);
      body=await readProviderBody(res);
      if(!res.ok)throw new Error(`QPay payment verification failed (${res.status})`);
      if(!Array.isArray(body?.rows)||body.rows.length>100)throw new Error("QPay returned invalid payment rows");
      rows.push(...body.rows);
      const count=body.count===undefined?null:Number(body.count);
      if(count!==null&&(!Number.isSafeInteger(count)||count<0||count>1000))throw new Error("QPay returned an invalid payment count");
      if(page===1)expectedCount=count;else if(count!==expectedCount)throw new Error("QPay payment count changed during pagination");
      if(count!==null&&rows.length>count)throw new Error("QPay returned inconsistent payment count");
      if(count!==null ? rows.length>=count : body.rows.length<100)break;
      if(!body.rows.length||page===10)throw new Error("QPay payment response is incomplete");
    }
    const returnedIds=rows.map(row=>identifier(row?.payment_id));
    if(expectedCount!==null&&returnedIds.every(Boolean)&&new Set(returnedIds).size<expectedCount)throw new Error("QPay payment pages contain repeated transactions");
    const paidRows=rows.filter((r:any)=>String(r?.payment_status??r?.status??"").toUpperCase()==="PAID");
    // Count each provider transaction once. Aggregate totals alone cannot establish a
    // payable amount: they may include other pages, duplicate rows, or unconfirmed rows.
    const amounts=new Map<string,number>();
    for(const row of paidRows){
      const id=identifier(row?.payment_id),amount=asNumber(row?.payment_amount??row?.amount);
      if(!id||!Number.isSafeInteger(amount)||amount<=0)throw new Error("QPay returned an invalid paid transaction");
      if(row?.payment_currency&&String(row.payment_currency).toUpperCase()!=="MNT")throw new Error("QPay returned an unexpected payment currency");
      if(identifier(row?.object_id)&&identifier(row.object_id)!==providerInvoiceId)throw new Error("QPay payment belongs to a different invoice");
      if(amounts.has(id)&&amounts.get(id)!==amount)throw new Error("QPay returned inconsistent duplicate transactions");
      amounts.set(id,amount);
    }
    const paidAmount=[...amounts.values()].reduce((sum,amount)=>sum+amount,0);
    if(!Number.isSafeInteger(paidAmount))throw new Error("QPay returned an invalid payment total");
    const paymentIds=[...amounts.keys()];
    if(paidAmount>=expectedAmountMnt)for(const [id,amount] of [...amounts].slice(0,5))await this.assertPaymentBelongs(id,providerInvoiceId,amount,this.requestSignal());
    return {paid:paidAmount>=expectedAmountMnt,paidAmountMnt:paidAmount,paymentId:stablePaymentSetId(paymentIds),transactions:[...amounts].map(([id,amountMnt])=>({id,amountMnt})),raw:body};
  }
}

export class ManualPaymentAdapter implements PaymentProviderAdapter {
  readonly name="MANUAL" as const;
  constructor(private readonly config:ApiConfig){}
  async createInvoice(input:ProviderInvoiceRequest):Promise<ProviderInvoiceResult>{
    const id=`manual_${input.senderInvoiceNo}`;
    return {
      providerInvoiceId:id,
      qrText:this.config.manualPaymentQrText||null,
      qrImage:this.config.manualPaymentQrImage||null,
      shortUrl:this.config.manualPaymentShortUrl||null,
      deeplinks:[],
      raw:{mode:"manual",invoice_id:id}
    };
  }
  async checkInvoicePayment(_providerInvoiceId:string,_expectedAmountMnt:number):Promise<ProviderPaymentResult>{
    return {paid:false,paidAmountMnt:0,paymentId:null,raw:{mode:"manual",note:"Operator confirmation required."}};
  }
  async cancelInvoice(_providerInvoiceId:string):Promise<void>{return;}
}

export class MockPaymentAdapter implements PaymentProviderAdapter {
  readonly name="MOCK" as const;
  async createInvoice(input:ProviderInvoiceRequest):Promise<ProviderInvoiceResult>{
    const id=`mock_${input.senderInvoiceNo}`;
    return {providerInvoiceId:id,qrText:`MMRI-MOCK-PAYMENT:${id}:${input.amountMnt}`,qrImage:null,shortUrl:null,deeplinks:[],raw:{mode:"mock",invoice_id:id}};
  }
  async checkInvoicePayment(_providerInvoiceId:string,_expectedAmountMnt:number):Promise<ProviderPaymentResult>{
    return {paid:false,paidAmountMnt:0,paymentId:null,raw:{mode:"mock",note:"Use the authenticated mock-pay endpoint."}};
  }
  async cancelInvoice(_providerInvoiceId:string):Promise<void>{return;}
}

async function readProviderBody(res:Response){
  const textBody=await res.text();
  if(!textBody)return {};
  try{return JSON.parse(textBody)}catch{return {raw:textBody.slice(0,500)}}
}
