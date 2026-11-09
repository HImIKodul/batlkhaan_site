import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";
import type { ApiConfig } from "../api/config.js";
import { ApiError, conflict, notFound } from "../api/errors.js";
import { ManualPaymentAdapter, MockPaymentAdapter, QPayMerchantV2Adapter } from "./qpay-client.js";
import type { BillingPlanCode, PaymentProviderAdapter, ProviderPaymentResult } from "./types.js";

/** An entitlement is usable when it is an administrator grant (no invoice by design, enforced by a database CHECK) or its source invoice is PAID. */
const SETTLED_ENTITLEMENT={OR:[{origin:"ADMIN_GRANT" as const},{sourceInvoice:{status:"PAID" as const}}]};
import { normalizeDomainCode, type DomainCode } from "../domain-methodology.js";

const PLAN_META:Record<BillingPlanCode,{name:string;billingLabel:string;description:string}>={
  DIAGNOSTIC:{name:"Анхны оношилгоо",billingLabel:"Нэг удаагийн төлбөр",description:"Сонгосон бизнесийн чиглэлийн нэг бүрэн оношилгоо, тайлан, 365 хоногийн төлөвлөгөө."},
  RETAKE:{name:"Дахин оношилгоо",billingLabel:"Дахин оношилгооны төлбөр",description:"Өмнөх тайланг хадгалж, шинэ оношилгоо болон шинэ тайлан үүсгэх нэг удаагийн эрх."}
};
const ACTIVE_ASSESSMENT_STATUSES=["PROFILE_PENDING","IN_PROGRESS","PAUSED","READY_FOR_COMPLETION","PROCESSING"] as const;

function hashToken(token:string){return createHash("sha256").update(token).digest("hex");}
function safeTokenEqual(raw:string,expectedHash:string){
  const actual=Buffer.from(hashToken(raw),"hex"), expected=Buffer.from(expectedHash,"hex");
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
function paymentReference(value:unknown,label="payment reference"){
  const out=String(value??"").trim();
  if(!out||out.length>200||!/^[A-Za-z0-9._:@/+\-=]+$/.test(out))throw new ApiError(400,"INVALID_PAYMENT_REFERENCE",`${label} is invalid`);
  return out;
}
function paymentAmount(value:unknown){
  const amount=Number(value);
  if(!Number.isSafeInteger(amount)||amount<=0)throw new ApiError(400,"INVALID_PAYMENT_AMOUNT","Төлбөрийн дүн буруу байна.");
  return amount;
}

function boundedRecoveryMs(name:string,fallback:number,min:number,max:number){
  const raw=process.env[name];
  const value=raw===undefined?fallback:Number(raw);
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
function interruptedInvoiceRecoveryMs(){return boundedRecoveryMs("MMRI_BILLING_INTERRUPTED_INVOICE_RECOVERY_MS",300_000,60_000,3_600_000);}
function orphanEntitlementRecoveryMs(){return boundedRecoveryMs("MMRI_ENTITLEMENT_ORPHAN_RECOVERY_MS",120_000,60_000,3_600_000);}

export class BillingService {
  private readonly provider:PaymentProviderAdapter;
  constructor(private readonly config:ApiConfig){
    this.provider=config.billingProvider==="qpay"?new QPayMerchantV2Adapter(config):config.billingProvider==="manual"?new ManualPaymentAdapter(config):new MockPaymentAdapter();
  }

  private async recoverInterruptedInvoiceCreations(companyId:string,domainCode?:DomainCode){
    const cutoff=new Date(Date.now()-interruptedInvoiceRecoveryMs());
    await prisma.billingInvoice.updateMany({
      where:{companyId,...(domainCode?{domainCode}:{}),status:"CREATED",providerInvoiceId:null,createdAt:{lt:cutoff}},
      data:{status:"FAILED",failureReason:"Нэхэмжлэх үүсгэх ажиллагаа серверийн тасалдлаас болж дуусаагүй. Шинэ нэхэмжлэх үүсгэнэ үү."}
    });
  }

  private async recoverOrphanedEntitlementClaims(companyId:string,domainCode?:DomainCode){
    const cutoff=new Date(Date.now()-orphanEntitlementRecoveryMs());
    const stranded=await prisma.companyEntitlement.findMany({
      where:{companyId,...(domainCode?{domainCode}:{}),status:"CONSUMED",assessmentsUsed:1,updatedAt:{lt:cutoff},...SETTLED_ENTITLEMENT,assessments:{none:{}}},
      select:{id:true}
    });
    for(const row of stranded){
      await prisma.companyEntitlement.updateMany({
        where:{id:row.id,status:"CONSUMED",assessmentsUsed:1,assessments:{none:{}}},
        data:{status:"ACTIVE",assessmentsUsed:0}
      });
    }
  }

  catalog(){
    return (["DIAGNOSTIC","RETAKE"] as BillingPlanCode[]).map(code=>{
      const amountMnt=code==="RETAKE"?this.config.retakePriceMnt:this.config.diagnosticPriceMnt;
      return {code,...PLAN_META[code],amountMnt,currency:"MNT",available:amountMnt!==null,provider:this.provider.name,testMode:this.provider.name==="MOCK",manualMode:this.provider.name==="MANUAL"};
    });
  }

  private price(planCode:BillingPlanCode){
    const amount=planCode==="RETAKE"?this.config.retakePriceMnt:this.config.diagnosticPriceMnt;
    if(amount===null)throw new ApiError(409,"PRICE_NOT_CONFIGURED","Оношилгооны төлбөрийн дүн одоогоор тохируулагдаагүй байна.");
    return amount;
  }

  private validatePlan(value:string):BillingPlanCode{
    const plan=value.toUpperCase() as BillingPlanCode;
    if(plan!=="DIAGNOSTIC"&&plan!=="RETAKE")throw new ApiError(400,"BAD_REQUEST","Дэмжигдээгүй төлбөрийн төрөл байна.");
    return plan;
  }

  async createInvoice(companyId:string,userId:string,rawPlanCode:string,rawDomainCode:unknown="marketing"){
    const planCode=this.validatePlan(rawPlanCode);
    const domainCode=normalizeDomainCode(rawDomainCode);
    const amountMnt=this.price(planCode);
    await this.recoverInterruptedInvoiceCreations(companyId,domainCode);
    await this.recoverOrphanedEntitlementClaims(companyId,domainCode);
    await this.expireStaleEntitlements(companyId);

    await this.assertPurchaseEligible(prisma,companyId,planCode,domainCode);
    const callbackToken=randomBytes(32).toString("base64url");
    const senderInvoiceNo=`MMRI-${Date.now()}-${randomUUID().slice(0,8)}`;
    /* PAY-CONC-3: the "open invoice already exists?" check and the insert must be one atomic step, otherwise parallel requests all pass the check
       and each create an invoice. A transaction-scoped advisory lock keyed by company/domain/plan serialises them (no schema change, works across instances). */
    const claimed=await prisma.$transaction(async(tx:any)=>{
      await this.lockPurchase(tx,companyId,domainCode);
      // MMRI-11: the pre-lock check above can be stale (a payment may have activated since). Re-decide eligibility under the same lock activation takes.
      await this.assertPurchaseEligible(tx,companyId,planCode,domainCode);
      const open=await tx.billingInvoice.findFirst({where:{companyId,domainCode,planCode,amountMnt,status:{in:["CREATED","PENDING"]}},orderBy:{createdAt:"desc"}});
      if(open)return {existing:open,local:null};
      const created=await tx.billingInvoice.create({data:{companyId,domainCode,createdByUserId:userId,planCode,amountMnt,provider:this.provider.name,senderInvoiceNo,callbackTokenHash:hashToken(callbackToken),status:"CREATED"}});
      return {existing:null,local:created};
    });
    if(claimed.existing)return this.presentInvoice(claimed.existing);
    const local=claimed.local;
    const callbackUrl=`${this.config.billingCallbackBaseUrl}/api/v1/billing/qpay/callback/${encodeURIComponent(local.id)}?token=${encodeURIComponent(callbackToken)}`;
    let remote:Awaited<ReturnType<PaymentProviderAdapter["createInvoice"]>>;
    try{
      remote=await this.provider.createInvoice({senderInvoiceNo,receiverCode:companyId,description:`MMRI · ${domainCode} · ${PLAN_META[planCode].name}`,amountMnt,callbackUrl});
    }catch(error:any){
      // Compare-and-set: only a still-CREATED row may become FAILED (a concurrent cancel/recovery decision is never overwritten).
      await prisma.billingInvoice.updateMany({where:{id:local.id,status:"CREATED"},data:{status:"FAILED",failureReason:String(error?.message??"Provider error").slice(0,500)}}).catch(()=>{});
      throw new ApiError(502,"PAYMENT_PROVIDER_ERROR","Төлбөрийн нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу.");
    }
    const remoteData={providerInvoiceId:remote.providerInvoiceId,qrText:remote.qrText,qrImage:remote.qrImage,shortUrl:remote.shortUrl,deeplinks:remote.deeplinks as any,providerMetadata:safeProviderMetadata(remote.raw)};
    let moved:{count:number};
    try{
      // MMRI-22: CREATED -> PENDING only if nobody cancelled/failed the row while the provider call was outstanding.
      moved=await prisma.billingInvoice.updateMany({where:{id:local.id,status:"CREATED"},data:{...remoteData,status:"PENDING"}});
    }catch{
      // The remote invoice exists but the local write failed: never lose its id. Retry once, then cancel it remotely and keep the id on a FAILED row for reconcile.
      moved=await prisma.billingInvoice.updateMany({where:{id:local.id,status:"CREATED"},data:{...remoteData,status:"PENDING"}}).catch(()=>({count:-1}));
      if(moved.count===-1){
        await this.stranded(local.id,remote.providerInvoiceId,"Нэхэмжлэхийн мэдээллийг хадгалж чадсангүй.",remoteData);
        throw new ApiError(502,"PAYMENT_PROVIDER_ERROR","Төлбөрийн нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу.");
      }
    }
    if(moved.count===0){
      // The row was cancelled/failed meanwhile. Keep the remote id (reconcile honours a later payment) and cancel the remote invoice best-effort.
      await this.stranded(local.id,remote.providerInvoiceId,null,remoteData);
      throw new ApiError(409,"INVOICE_CANCELLED_DURING_CREATION","Нэхэмжлэх үүсгэх явцад цуцлагдсан тул шинэ нэхэмжлэх үүсгэнэ үү.");
    }
    return this.presentInvoice(await prisma.billingInvoice.findUniqueOrThrow({where:{id:local.id}}));
  }

  /** Record the provider id of a remote invoice that has no usable local row, then try to cancel it remotely. Status is only changed from CREATED. */
  private async stranded(localId:string,providerInvoiceId:string,failureReason:string|null,remoteData:Record<string,unknown>){
    await prisma.billingInvoice.updateMany({where:{id:localId,status:"CREATED"},data:{status:"FAILED",failureReason}}).catch(()=>{});
    await prisma.billingInvoice.updateMany({where:{id:localId,providerInvoiceId:null},data:remoteData as any}).catch(()=>{
      console.log(JSON.stringify({ts:new Date().toISOString(),level:"error",event:"stranded_remote_invoice_unrecorded",invoiceId:localId,providerInvoiceId}));
    });
    try{await this.provider.cancelInvoice(providerInvoiceId)}catch{
      console.log(JSON.stringify({ts:new Date().toISOString(),level:"warn",event:"stranded_remote_invoice_cancel_failed",invoiceId:localId,providerInvoiceId}));
    }
  }

  async getInvoice(invoiceId:string){
    const row=await prisma.billingInvoice.findUnique({where:{id:invoiceId}});
    if(!row)throw notFound("Billing invoice not found");
    return this.presentInvoice(row);
  }

  /** `includeInvoices` (company OWNER/ADMIN only): invoice history rows. Every role gets entitlement state and the all-invoice paid summary. */
  async getCompanyStatus(companyId:string,opts:{includeInvoices?:boolean;limit?:number;offset?:number}={}){
    await this.recoverInterruptedInvoiceCreations(companyId);
    await this.recoverOrphanedEntitlementClaims(companyId);
    await this.expireStaleEntitlements(companyId);
    const limit=Math.min(Math.max(Math.trunc(opts.limit??50)||50,1),200), offset=Math.max(Math.trunc(opts.offset??0)||0,0);
    // MMRI-23: totals come from aggregates over ALL invoices, never from the (paged) history rows.
    const [entitlements,groups,invoices]=await Promise.all([
      prisma.companyEntitlement.findMany({where:{companyId},orderBy:{createdAt:"desc"}}),
      prisma.billingInvoice.groupBy({by:["status"],where:{companyId},_count:{_all:true},_sum:{amountMnt:true}}),
      opts.includeInvoices?prisma.billingInvoice.findMany({where:{companyId},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:offset,take:limit}):Promise.resolve([] as any[])
    ]);
    const g=(status:string)=>groups.find((x:any)=>x.status===status);
    const count=(...statuses:string[])=>statuses.reduce((n,st)=>n+Number(g(st)?._count._all??0),0);
    const total=groups.reduce((n:number,x:any)=>n+Number(x._count._all),0);
    return {
      enforcement:this.config.billingEnforcement,
      provider:this.provider.name,
      entitlements:entitlements.map((x:any)=>({id:x.id,domainCode:x.domainCode,planCode:x.planCode,status:x.status,startsAt:x.startsAt,endsAt:x.endsAt,assessmentLimit:x.assessmentLimit,assessmentsUsed:x.assessmentsUsed})),
      invoices:invoices.map((x:any)=>this.presentInvoiceSummary(x)),
      history:{total,limit,offset,hasMore:!!opts.includeInvoices&&offset+invoices.length<total,restricted:!opts.includeInvoices},
      summary:{
        totalPaidMnt:Number(g("PAID")?._sum.amountMnt??0),
        paidCount:count("PAID"),
        refundedMnt:Number(g("REFUNDED")?._sum.amountMnt??0),
        refundedCount:count("REFUNDED"),
        pendingCount:count("CREATED","PENDING")
      }
    };
  }

  async cancelInvoice(invoiceId:string){
    const invoice=await prisma.billingInvoice.findUnique({where:{id:invoiceId}});
    if(!invoice)throw notFound("Billing invoice not found");
    if(invoice.status==="CANCELLED")return this.presentInvoice(invoice);
    if(invoice.status==="PAID")throw new ApiError(409,"PAID_INVOICE_CANNOT_BE_CANCELLED","Төлөгдсөн нэхэмжлэхийг цуцлах боломжгүй.");
    if(invoice.status==="REFUNDED")throw new ApiError(409,"REFUNDED_INVOICE_CANNOT_BE_CANCELLED","Буцаалт бүртгэгдсэн нэхэмжлэхийг цуцлах боломжгүй.");
    if(invoice.status==="FAILED")throw new ApiError(409,"FAILED_INVOICE_CANNOT_BE_CANCELLED","Амжилтгүй болсон нэхэмжлэхийг дахин цуцлах шаардлагагүй.");
    if(invoice.providerInvoiceId&&invoice.provider==="QPAY"){
      if(this.provider.name!=="QPAY")throw new ApiError(409,"PAYMENT_PROVIDER_MISMATCH","Энэ QPay нэхэмжлэхийг цуцлах төлбөрийн үйлчилгээ одоогоор идэвхгүй байна.");
      // A payment may already have been made but not yet reported to us: ask the provider first, and never cancel a paid invoice.
      let verification:ProviderPaymentResult|null=null;
      try{verification=await this.provider.checkInvoicePayment(invoice.providerInvoiceId,invoice.amountMnt)}catch{throw new ApiError(502,"PAYMENT_VERIFICATION_ERROR","QPay төлбөрийн баталгаажуулалт түр амжилтгүй боллоо. Дахин оролдоно уу.")}
      if(verification.paid){await this.activatePaidInvoice(invoice.id,verification);throw new ApiError(409,"PAID_INVOICE_CANNOT_BE_CANCELLED","Төлбөр хийгдсэн байсан тул нэхэмжлэхийг цуцлах боломжгүй.")}
      try{await this.provider.cancelInvoice(invoice.providerInvoiceId)}catch{
        throw new ApiError(502,"PAYMENT_PROVIDER_ERROR","Нэхэмжлэхийг төлбөрийн үйлчилгээ дээр цуцалж чадсангүй. Дахин оролдоно уу.");
      }
    }
    // Guarded transition: only an open invoice may become CANCELLED. A payment confirmed concurrently (callback, reconcile) wins and is never overwritten.
    const changed=await prisma.billingInvoice.updateMany({where:{id:invoice.id,status:{in:["CREATED","PENDING"]}},data:{status:"CANCELLED",failureReason:null}});
    const latest=await prisma.billingInvoice.findUnique({where:{id:invoice.id}});
    if(!latest)throw notFound("Billing invoice not found");
    if(changed.count===0&&(latest.status==="PAID"||latest.status==="REFUNDED"))throw new ApiError(409,latest.status==="PAID"?"PAID_INVOICE_CANNOT_BE_CANCELLED":"REFUNDED_INVOICE_CANNOT_BE_CANCELLED","Төлбөр хийгдсэн тул нэхэмжлэхийг цуцлах боломжгүй.");
    return this.presentInvoice(latest);
  }

  async handleProviderCallback(invoiceId:string,callbackToken:string){
    const invoice=await prisma.billingInvoice.findUnique({where:{id:invoiceId}});
    if(!invoice)throw notFound("Billing invoice not found");
    if(!callbackToken||!safeTokenEqual(callbackToken,invoice.callbackTokenHash))throw new ApiError(403,"INVALID_CALLBACK_TOKEN","Invalid payment callback token");
    if(invoice.status==="PAID"||invoice.status==="REFUNDED")return this.presentInvoice(invoice);
    if(invoice.provider!=="QPAY"||!invoice.providerInvoiceId)throw new ApiError(400,"INVALID_PROVIDER_CALLBACK","This invoice does not accept QPay callbacks");
    if(this.provider.name!=="QPAY")throw new ApiError(409,"PAYMENT_PROVIDER_MISMATCH","QPay payment verification is not active on this server.");
    let verification:ProviderPaymentResult;
    try{verification=await this.provider.checkInvoicePayment(invoice.providerInvoiceId,invoice.amountMnt);}catch{
      await prisma.billingInvoice.update({where:{id:invoice.id},data:{callbackReceivedAt:new Date()}});
      throw new ApiError(502,"PAYMENT_VERIFICATION_ERROR","QPay төлбөрийн баталгаажуулалт түр амжилтгүй боллоо.");
    }
    await prisma.billingInvoice.update({where:{id:invoice.id},data:{callbackReceivedAt:new Date(),lastVerifiedAt:new Date(),providerMetadata:safeProviderMetadata(verification.raw)}});
    if(!verification.paid)return this.getInvoice(invoice.id);
    return this.activatePaidInvoice(invoice.id,verification);
  }

  async reconcileInvoice(invoiceId:string){
    const invoice=await prisma.billingInvoice.findUnique({where:{id:invoiceId}});
    if(!invoice)throw notFound("Billing invoice not found");
    if(invoice.status==="PAID"||invoice.status==="REFUNDED")return this.presentInvoice(invoice);
    // CANCELLED stays reconcilable for provider invoices: a payment confirmed after a local cancel must be honoured, not lost.
    if(invoice.status!=="CREATED"&&invoice.status!=="PENDING"&&!((invoice.status==="CANCELLED"||(invoice.status==="FAILED"&&invoice.providerInvoiceId))&&invoice.provider==="QPAY"))throw new ApiError(409,"INVOICE_NOT_RECONCILABLE","Энэ нэхэмжлэхийг төлбөртэй тулгах боломжгүй төлөвт байна.");
    if(invoice.provider!=="QPAY"||!invoice.providerInvoiceId)throw new ApiError(409,"AUTOMATIC_RECONCILIATION_UNAVAILABLE","Энэ төлбөрийн төрөл автоматаар шалгагдахгүй.");
    if(this.provider.name!=="QPAY")throw new ApiError(409,"PAYMENT_PROVIDER_MISMATCH","QPay payment verification is not active on this server.");
    let verification:ProviderPaymentResult;
    try{verification=await this.provider.checkInvoicePayment(invoice.providerInvoiceId,invoice.amountMnt);}catch{
      throw new ApiError(502,"PAYMENT_VERIFICATION_ERROR","QPay төлбөрийн баталгаажуулалт түр амжилтгүй боллоо.");
    }
    await prisma.billingInvoice.update({where:{id:invoice.id},data:{lastVerifiedAt:new Date(),providerMetadata:safeProviderMetadata(verification.raw)}});
    return verification.paid?this.activatePaidInvoice(invoice.id,verification):this.getInvoice(invoice.id);
  }

  async mockPay(invoiceId:string){
    if(this.config.environment==="production"||this.provider.name!=="MOCK")throw new ApiError(404,"NOT_FOUND","Route not found");
    const invoice=await prisma.billingInvoice.findUnique({where:{id:invoiceId}});
    if(!invoice)throw notFound("Billing invoice not found");
    if(invoice.provider!=="MOCK")throw conflict("Invoice is not a mock invoice");
    if(invoice.status!=="CREATED"&&invoice.status!=="PENDING")throw conflict("Only an open mock invoice can be paid");
    return this.activatePaidInvoice(invoice.id,{paid:true,paidAmountMnt:invoice.amountMnt,paymentId:`mock_payment_${randomUUID()}`,raw:{mode:"mock",confirmed:true}});
  }

  async confirmManualPayment(invoiceId:string,rawReference:unknown,rawAmount:unknown){
    if(this.provider.name!=="MANUAL")throw new ApiError(404,"NOT_FOUND","Route not found");
    const invoice=await prisma.billingInvoice.findUnique({where:{id:invoiceId}});
    if(!invoice)throw notFound("Billing invoice not found");
    if(invoice.provider!=="MANUAL")throw new ApiError(409,"PAYMENT_PROVIDER_MISMATCH","This invoice is not a manual-payment invoice.");
    if(invoice.status==="PAID"||invoice.status==="REFUNDED")return this.presentInvoice(invoice);
    if(invoice.status!=="CREATED"&&invoice.status!=="PENDING")throw new ApiError(409,"INVOICE_NOT_PAYABLE","Энэ нэхэмжлэх төлбөр баталгаажуулах боломжгүй төлөвт байна.");
    const reference=paymentReference(rawReference,"payment reference");
    const amount=paymentAmount(rawAmount);
    if(amount!==invoice.amountMnt)throw new ApiError(409,"PAYMENT_AMOUNT_MISMATCH","Баталгаажуулах төлбөрийн дүн нэхэмжлэхийн дүнтэй яг таарах ёстой.");
    return this.activatePaidInvoice(invoice.id,{paid:true,paidAmountMnt:amount,paymentId:`manual:${reference}`,raw:{mode:"manual",confirmed:true,payment_id:`manual:${reference}`,payment_amount:amount}});
  }

  async recordConfirmedRefund(invoiceId:string,rawReference:unknown,rawReason:unknown){
    const reference=paymentReference(rawReference,"refund reference");
    const reason=String(rawReason??"").trim().slice(0,500)||null;
    return prisma.$transaction(async(tx:any)=>{
      const invoice=await tx.billingInvoice.findUnique({where:{id:invoiceId}});
      if(!invoice)throw notFound("Billing invoice not found");
      if(invoice.status==="REFUNDED"){
        if(invoice.refundReference&&invoice.refundReference!==reference)throw new ApiError(409,"REFUND_REFERENCE_MISMATCH","Буцаалтын өөр дугаар аль хэдийн бүртгэгдсэн байна.");
        return this.presentInvoice(invoice);
      }
      if(invoice.status!=="PAID")throw new ApiError(409,"ONLY_PAID_INVOICE_CAN_BE_REFUNDED","Зөвхөн төлөгдсөн нэхэмжлэх дээр баталгаажсан буцаалт бүртгэнэ.");
      const duplicate=await tx.billingInvoice.findFirst({where:{refundReference:reference,id:{not:invoice.id}},select:{id:true}});
      if(duplicate)throw new ApiError(409,"REFUND_REFERENCE_ALREADY_USED","Энэ буцаалтын дугаар өөр нэхэмжлэх дээр бүртгэгдсэн байна.");
      const now=new Date();
      const updated=await tx.billingInvoice.update({where:{id:invoice.id},data:{status:"REFUNDED",refundedAt:now,refundReference:reference,refundReason:reason}});
      await tx.companyEntitlement.updateMany({where:{sourceInvoiceId:invoice.id,status:{in:["ACTIVE","CONSUMED"]}},data:{status:"REVOKED",endsAt:now}});
      return this.presentInvoice(updated);
    },{isolationLevel:"Serializable"} as any);
  }

  private async activatePaidInvoice(invoiceId:string,verification:ProviderPaymentResult){
    if(!verification.paid)throw new ApiError(409,"PAYMENT_NOT_CONFIRMED","Төлбөр баталгаажаагүй байна.");
    const paidAmount=Number(verification.paidAmountMnt);
    if(!Number.isSafeInteger(paidAmount)||paidAmount<=0)throw new ApiError(502,"INVALID_PROVIDER_PAYMENT_AMOUNT","Төлбөрийн үйлчилгээ баталгаажуулах боломжгүй дүн буцаалаа.");
    if(!verification.paymentId)throw new ApiError(502,"MISSING_PROVIDER_PAYMENT_ID","Төлбөрийн үйлчилгээ гүйлгээний баталгаажуулах дугаар буцаасангүй.");
    const providerPaymentId=paymentReference(verification.paymentId,"provider payment id");
    return this.withSerializableRetry(()=>prisma.$transaction(async(tx:any)=>{
      const head=await tx.billingInvoice.findUnique({where:{id:invoiceId},select:{companyId:true,domainCode:true}});
      if(!head)throw notFound("Billing invoice not found");
      await this.lockPurchase(tx,head.companyId,head.domainCode as DomainCode);
      const current=await tx.billingInvoice.findUnique({where:{id:invoiceId}});
      if(!current)throw notFound("Billing invoice not found");
      if(current.status==="REFUNDED")return this.presentInvoice(current);
      if(current.status==="PAID")return this.presentInvoice(current);
      if(current.status!=="CREATED"&&current.status!=="PENDING"&&current.status!=="CANCELLED"&&!(current.status==="FAILED"&&current.providerInvoiceId))throw new ApiError(409,"INVOICE_NOT_PAYABLE","Энэ нэхэмжлэх төлбөрөөр идэвхжих боломжгүй төлөвт байна.");
      if(paidAmount<current.amountMnt)throw new ApiError(409,"PARTIAL_PAYMENT","Төлбөрийн дүн нэхэмжлэхийн дүнгээс бага байна.");
      const duplicate=await tx.billingInvoice.findFirst({where:{providerPaymentId,id:{not:current.id}},select:{id:true}});
      if(duplicate)throw new ApiError(409,"PAYMENT_ALREADY_USED","Нэг төлбөрөөр хоёр нэхэмжлэх идэвхжүүлэх боломжгүй.");

      const transitioned=await tx.billingInvoice.updateMany({
        where:{id:current.id,OR:[{status:{in:["CREATED","PENDING","CANCELLED"]}},{status:"FAILED",providerInvoiceId:{not:null}}]},
        data:{status:"PAID",paidAt:new Date(),lastVerifiedAt:new Date(),providerPaymentId,providerMetadata:safeProviderMetadata(verification.raw),failureReason:null}
      });
      if(transitioned.count===0){
        const latest=await tx.billingInvoice.findUnique({where:{id:current.id}});
        if(latest&&(latest.status==="PAID"||latest.status==="REFUNDED"))return this.presentInvoice(latest);
        throw new ApiError(409,"PAYMENT_STATE_CHANGED","Нэхэмжлэхийн төлөв зэрэг өөрчлөгдсөн тул төлбөрийг автоматаар идэвхжүүлсэнгүй.");
      }

      if(current.status==="CANCELLED"||current.status==="FAILED")console.log(JSON.stringify({ts:new Date().toISOString(),level:"warn",event:"payment_confirmed_after_cancel_reconciled",invoiceId:current.id}));
      await tx.companyEntitlement.upsert({
        where:{sourceInvoiceId:current.id},
        create:{companyId:current.companyId,domainCode:current.domainCode,sourceInvoiceId:current.id,planCode:current.planCode,status:"ACTIVE",startsAt:new Date(),endsAt:null,assessmentLimit:1,assessmentsUsed:0},
        update:{}
      });
      const paid=await tx.billingInvoice.findUnique({where:{id:invoiceId}});
      return this.presentInvoice(paid);
    },{isolationLevel:"Serializable"} as any));
  }

  /** Bounded retry for transient Serializable conflicts (P2034); the transaction body is idempotent. */
  private async withSerializableRetry<T>(run:()=>Promise<T>,attempts=4):Promise<T>{
    for(let i=1;;i++){
      try{return await run()}catch(error:any){
        if(error?.code!=="P2034"||i>=attempts)throw error;
        await new Promise(r=>setTimeout(r,15*i+Math.floor(Math.random()*25)));
      }
    }
  }

  async claimAssessmentEntitlement(companyId:string,rawDomainCode:unknown="marketing"):Promise<{entitlementId:string|null;claimedDiagnostic:boolean}> {
    const domainCode=normalizeDomainCode(rawDomainCode);
    await this.recoverOrphanedEntitlementClaims(companyId,domainCode);
    await this.expireStaleEntitlements(companyId);
    const prior=await prisma.assessment.findFirst({where:{companyId,domainCode,status:{in:["COMPLETED","COMPLETED_WITH_REVIEW","EXHAUSTED"]}},select:{id:true}});
    const expectedPlan:BillingPlanCode=prior?"RETAKE":"DIAGNOSTIC";
    const entitlement=await prisma.companyEntitlement.findFirst({where:{companyId,domainCode,planCode:expectedPlan,status:"ACTIVE",assessmentsUsed:{lt:1},...SETTLED_ENTITLEMENT},orderBy:{startsAt:"asc"}});
    if(entitlement){
      const claimed=await prisma.companyEntitlement.updateMany({where:{id:entitlement.id,planCode:expectedPlan,status:"ACTIVE",assessmentsUsed:{lt:1}},data:{assessmentsUsed:{increment:1},status:"CONSUMED"}});
      if(claimed.count===1)return {entitlementId:entitlement.id,claimedDiagnostic:true};
      return this.claimAssessmentEntitlement(companyId,domainCode);
    }
    if(this.config.billingEnforcement){
      const wrongPlan=await prisma.companyEntitlement.findFirst({where:{companyId,domainCode,planCode:expectedPlan==="RETAKE"?"DIAGNOSTIC":"RETAKE",status:"ACTIVE",assessmentsUsed:{lt:1},...SETTLED_ENTITLEMENT},select:{id:true,planCode:true}});
      if(wrongPlan)throw new ApiError(409,"ENTITLEMENT_PLAN_MISMATCH",expectedPlan==="RETAKE"?"Дууссан оношилгооны дараа зөвхөн дахин оношилгооны эрх ашиглана.":"Анхны оношилгоонд анхны оношилгооны эрх шаардлагатай.");
      throw new ApiError(402,"PAYMENT_REQUIRED","Оношилгоо эхлүүлэхийн өмнө төлбөр баталгаажсан байх шаардлагатай.");
    }
    return {entitlementId:null,claimedDiagnostic:false};
  }

  async releaseClaim(claim:{entitlementId:string|null;claimedDiagnostic:boolean}){
    if(!claim.entitlementId||!claim.claimedDiagnostic)return;
    await prisma.companyEntitlement.updateMany({where:{id:claim.entitlementId,status:"CONSUMED",assessmentsUsed:1,...SETTLED_ENTITLEMENT},data:{assessmentsUsed:0,status:"ACTIVE"}});
  }

  /** One serialization boundary per company/domain shared by invoice creation and payment activation (transaction-scoped advisory lock; no schema change, works across instances). */
  private async lockPurchase(tx:any,companyId:string,domainCode:DomainCode){
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mmri-purchase:${companyId}:${domainCode}`}))`;
  }

  private async assertPurchaseEligible(db:any,companyId:string,planCode:BillingPlanCode,domainCode:DomainCode){
    const active=await db.assessment.findFirst({where:{companyId,domainCode,status:{in:[...ACTIVE_ASSESSMENT_STATUSES] as any}},select:{id:true,status:true}});
    if(active)throw new ApiError(409,"ASSESSMENT_ALREADY_ACTIVE","Энэ чиглэлийн оношилгоо аль хэдийн эхэлсэн байна. Шинэ төлбөр үүсгэхийн оронд одоо байгаа оношилгоогоо үргэлжлүүлнэ үү.");
    const prior=await db.assessment.findFirst({where:{companyId,domainCode,status:{in:["COMPLETED","COMPLETED_WITH_REVIEW","EXHAUSTED"]}},select:{id:true}});
    if(planCode==="RETAKE"&&!prior)throw new ApiError(409,"RETAKE_NOT_AVAILABLE","Дахин оношилгоо авахын өмнө нэг бүрэн оношилгоо дууссан байх шаардлагатай.");
    if(planCode==="DIAGNOSTIC"&&prior)throw new ApiError(409,"RETAKE_REQUIRED","Энэ чиглэлийн анхны оношилгоо аль хэдийн дууссан байна. Дахин оношилгооны эрх сонгоно уу.");
    if(await this.hasUsablePlan(planCode,companyId,domainCode,db))throw new ApiError(409,"ENTITLEMENT_ALREADY_ACTIVE","Энэ байгууллагад төлөгдсөн, эхлүүлээгүй оношилгоо аль хэдийн байна.");
  }

  private async hasUsablePlan(planCode:BillingPlanCode,companyId:string,domainCode:DomainCode,db:any=prisma){
    return !!(await db.companyEntitlement.findFirst({where:{companyId,domainCode,planCode,status:"ACTIVE",assessmentsUsed:{lt:1},...SETTLED_ENTITLEMENT}}));
  }

  private async expireStaleEntitlements(_companyId:string){
    // Нэг удаагийн оношилгооны эрх хугацаагаар бус, ашиглалтаар дуусна.
  }

  presentInvoice(row:any){
    return {id:row.id,companyId:row.companyId,domainCode:row.domainCode,planCode:row.planCode,amountMnt:row.amountMnt,currency:row.currency,provider:row.provider,status:row.status,senderInvoiceNo:row.senderInvoiceNo,qrText:row.qrText,qrImage:row.qrImage,shortUrl:row.shortUrl,deeplinks:Array.isArray(row.deeplinks)?row.deeplinks:[],paidAt:row.paidAt,refundedAt:row.refundedAt,refundReason:row.refundReason,lastVerifiedAt:row.lastVerifiedAt,callbackReceivedAt:row.callbackReceivedAt,createdAt:row.createdAt,updatedAt:row.updatedAt,testMode:row.provider==="MOCK",manualMode:row.provider==="MANUAL"};
  }

  presentInvoiceSummary(row:any){
    return {id:row.id,companyId:row.companyId,domainCode:row.domainCode,planCode:row.planCode,amountMnt:row.amountMnt,currency:row.currency,provider:row.provider,status:row.status,senderInvoiceNo:row.senderInvoiceNo,paidAt:row.paidAt,refundedAt:row.refundedAt,lastVerifiedAt:row.lastVerifiedAt,createdAt:row.createdAt,updatedAt:row.updatedAt,testMode:row.provider==="MOCK",manualMode:row.provider==="MANUAL"};
  }
}

function safeProviderMetadata(raw:unknown):Prisma.InputJsonValue{
  const result:Record<string,Prisma.InputJsonValue>={};
  if(!raw||typeof raw!=="object")return result;
  const obj=raw as Record<string,unknown>;
  // Keep only reconciliation fields; credentials/tokens and arbitrary provider payloads are never persisted.
  const allow=["count","paid_amount","invoice_id","payment_id","payment_status","payment_amount","mode","confirmed"];
  for(const key of allow){
    const value=obj[key];
    if(typeof value==="string"||typeof value==="number"||typeof value==="boolean")result[key]=value;
  }
  return result;
}
