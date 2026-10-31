import { createHash } from "node:crypto";
import type { ApiConfig } from "../api/config.js";
import type { PaymentProviderAdapter, ProviderInvoiceRequest, ProviderInvoiceResult, ProviderPaymentResult } from "./types.js";

function asNumber(value:unknown):number{
  const n=Number(value??0);
  return Number.isFinite(n)?n:0;
}
function text(value:unknown):string|null{return typeof value==="string"&&value.trim()?value.trim():null;}
function jsonHeaders(token:string){return {"content-type":"application/json","authorization":`Bearer ${token}`};}
function stablePaymentSetId(ids:string[]):string|null{
  const normalized=[...new Set(ids.map(x=>x.trim()).filter(Boolean))].sort();
  if(normalized.length===0)return null;
  if(normalized.length===1)return normalized[0];
  return `qpay-set-${createHash("sha256").update(normalized.join("\n")).digest("hex").slice(0,40)}`;
}

export class QPayMerchantV2Adapter implements PaymentProviderAdapter {
  readonly name="QPAY" as const;
  private tokenCache:{token:string;expiresAt:number}|null=null;
  private tokenInflight:Promise<string>|null=null;
  constructor(private readonly config:ApiConfig){}

  private requestSignal(){return AbortSignal.timeout(this.config.qpayRequestTimeoutMs);}

  private async token(){
    if(this.tokenCache&&Date.now()<this.tokenCache.expiresAt-60_000)return this.tokenCache.token;
    if(this.tokenInflight)return this.tokenInflight;
    this.tokenInflight=(async()=>{
      const basic=Buffer.from(`${this.config.qpayClientId}:${this.config.qpayClientSecret}`,"utf8").toString("base64");
      const res=await fetch(`${this.config.qpayBaseUrl}/v2/auth/token`,{method:"POST",headers:{authorization:`Basic ${basic}`},signal:this.requestSignal()});
      const body=await readProviderBody(res);
      if(!res.ok)throw new Error(`QPay auth failed (${res.status})`);
      const access=text((body as any)?.access_token);
      if(!access)throw new Error("QPay auth response did not contain access_token");
      const expiresIn=Math.max(120,asNumber((body as any)?.expires_in)||3600);
      this.tokenCache={token:access,expiresAt:Date.now()+expiresIn*1000};
      return access;
    })();
    try{return await this.tokenInflight;}finally{this.tokenInflight=null;}
  }

  async createInvoice(input:ProviderInvoiceRequest):Promise<ProviderInvoiceResult>{
    const token=await this.token();
    const payload={
      invoice_code:this.config.qpayInvoiceCode,
      sender_invoice_no:input.senderInvoiceNo,
      invoice_receiver_code:input.receiverCode,
      invoice_description:input.description,
      amount:input.amountMnt,
      callback_url:input.callbackUrl
    };
    const res=await fetch(`${this.config.qpayBaseUrl}/v2/invoice`,{method:"POST",headers:jsonHeaders(token),body:JSON.stringify(payload),signal:this.requestSignal()});
    const body:any=await readProviderBody(res);
    if(!res.ok)throw new Error(`QPay invoice creation failed (${res.status})`);
    const providerInvoiceId=text(body?.invoice_id);
    if(!providerInvoiceId)throw new Error("QPay invoice response did not contain invoice_id");
    const rawLinks=Array.isArray(body?.urls)?body.urls:Array.isArray(body?.qpay_urls)?body.qpay_urls:[];
    const deeplinks=rawLinks.map((x:any)=>({name:text(x?.name)??undefined,description:text(x?.description)??undefined,logo:text(x?.logo)??undefined,link:text(x?.link)??text(x?.url)??""})).filter((x:any)=>x.link);
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
    const token=await this.token();
    const res=await fetch(`${this.config.qpayBaseUrl}/v2/invoice/${encodeURIComponent(providerInvoiceId)}`,{method:"DELETE",headers:{authorization:`Bearer ${token}`},signal:this.requestSignal()});
    if(!res.ok){
      await readProviderBody(res);
      throw new Error(`QPay invoice cancellation failed (${res.status})`);
    }
  }

  async checkInvoicePayment(providerInvoiceId:string,expectedAmountMnt:number):Promise<ProviderPaymentResult>{
    const token=await this.token();
    const payload={object_type:"INVOICE",object_id:providerInvoiceId,offset:{page_number:1,page_limit:100}};
    const res=await fetch(`${this.config.qpayBaseUrl}/v2/payment/check`,{method:"POST",headers:jsonHeaders(token),body:JSON.stringify(payload),signal:this.requestSignal()});
    const body:any=await readProviderBody(res);
    if(!res.ok)throw new Error(`QPay payment verification failed (${res.status})`);
    const rows=Array.isArray(body?.rows)?body.rows:[];
    const paidRows=rows.filter((r:any)=>String(r?.payment_status??r?.status??"").toUpperCase()==="PAID");
    const rowAmount=paidRows.reduce((sum:number,r:any)=>sum+asNumber(r?.payment_amount??r?.amount),0);
    const paidAmount=Math.max(asNumber(body?.paid_amount),rowAmount);
    const paymentIds=paidRows.map((r:any)=>text(r?.payment_id)).filter((x:string|null):x is string=>Boolean(x));
    return {paid:paidAmount>=expectedAmountMnt,paidAmountMnt:paidAmount,paymentId:stablePaymentSetId(paymentIds),raw:body};
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
