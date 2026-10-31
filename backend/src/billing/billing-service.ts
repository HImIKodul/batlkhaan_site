import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";
import type { ApiConfig } from "../api/config.js";
import { ApiError, conflict, notFound } from "../api/errors.js";
import { ManualPaymentAdapter, MockPaymentAdapter, QPayMerchantV2Adapter } from "./qpay-client.js";
import type { BillingPlanCode, PaymentProviderAdapter, ProviderPaymentResult } from "./types.js";
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
      where:{companyId,...(domainCode?{domainCode}:{}),status:"CONSUMED",assessmentsUsed:1,updatedAt:{lt:cutoff},sourceInvoice:{status:"PAID"},assessments:{none:{}}},
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

    const active=await prisma.assessment.findFirst({where:{companyId,domainCode,status:{in:[...ACTIVE_ASSESSMENT_STATUSES] as any}},select:{id:true,status:true}});
    if(active)throw new ApiError(409,"ASSESSMENT_ALREADY_ACTIVE","Энэ чиглэлийн оношилгоо аль хэдийн эхэлсэн байна. Шинэ төлбөр үүсгэхийн оронд одоо байгаа оношилгоогоо үргэлжлүүлнэ үү.");

    const prior=await prisma.assessment.findFirst({where:{companyId,domainCode,status:{in:["COMPLETED","COMPLETED_WITH_REVIEW","EXHAUSTED"]}},select:{id:true}});
    if(planCode==="RETAKE"&&!prior)throw new ApiError(409,"RETAKE_NOT_AVAILABLE","Дахин оношилгоо авахын өмнө нэг бүрэн оношилгоо дууссан байх шаардлагатай.");
    if(planCode==="DIAGNOSTIC"&&prior)throw new ApiError(409,"RETAKE_REQUIRED","Энэ чиглэлийн анхны оношилгоо аль хэдийн дууссан байна. Дахин оношилгооны эрх сонгоно уу.");
    const covered=await this.hasUsablePlan(companyId,planCode,domainCode);
    if(covered)throw new ApiError(409,"ENTITLEMENT_ALREADY_ACTIVE","Энэ байгууллагад төлөгдсөн, эхлүүлээгүй оношилгоо аль хэдийн байна.");
    const existing=await prisma.billingInvoice.findFirst({where:{companyId,domainCode,planCode,amountMnt,status:{in:["CREATED","PENDING"]}},orderBy:{createdAt:"desc"}});
    if(existing)return this.presentInvoice(existing);

    const callbackToken=randomBytes(32).toString("base64url");
    const senderInvoiceNo=`MMRI-${Date.now()}-${randomUUID().slice(0,8)}`;
    const local=await prisma.billingInvoice.create({data:{companyId,domainCode,createdByUserId:userId,planCode,amountMnt,provider:this.provider.name,senderInvoiceNo,callbackTokenHash:hashToken(callbackToken),status:"CREATED"}});
    const callbackUrl=`${this.config.billingCallbackBaseUrl}/api/v1/billing/qpay/callback/${encodeURIComponent(local.id)}?token=${encodeURIComponent(callbackToken)}`;
    try{
      const remote=await this.provider.createInvoice({senderInvoiceNo,receiverCode:companyId,description:`MMRI · ${domainCode} · ${PLAN_META[planCode].name}`,amountMnt,callbackUrl});
      const updated=await prisma.billingInvoice.update({where:{id:local.id},data:{providerInvoiceId:remote.providerInvoiceId,qrText:remote.qrText,qrImage:remote.qrImage,shortUrl:remote.shortUrl,deeplinks:remote.deeplinks as any,providerMetadata:safeProviderMetadata(remote.raw),status:"PENDING"}});
      return this.presentInvoice(updated);
    }catch(error:any){
      await prisma.billingInvoice.update({where:{id:local.id},data:{status:"FAILED",failureReason:String(error?.message??"Provider error").slice(0,500)}}).catch(()=>{});
      throw new ApiError(502,"PAYMENT_PROVIDER_ERROR","Төлбөрийн нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу.");
    }
  }

  async getInvoice(invoiceId:string){
    const row=await prisma.billingInvoice.findUnique({where:{id:invoiceId}});
    if(!row)throw notFound("Billing invoice not found");
    return this.presentInvoice(row);
  }

  async getCompanyStatus(companyId:string){
    await this.recoverInterruptedInvoiceCreations(companyId);
    await this.recoverOrphanedEntitlementClaims(companyId);
    await this.expireStaleEntitlements(companyId);
    const [entitlements,invoices]=await Promise.all([
      prisma.companyEntitlement.findMany({where:{companyId},orderBy:{createdAt:"desc"}}),
      prisma.billingInvoice.findMany({where:{companyId},orderBy:{createdAt:"desc"},take:50})
    ]);
    const paidInvoices=invoices.filter((x:any)=>x.status==="PAID");
    const refundedInvoices=invoices.filter((x:any)=>x.status==="REFUNDED");
    return {
      enforcement:this.config.billingEnforcement,
      provider:this.provider.name,
      entitlements:entitlements.map((x:any)=>({id:x.id,domainCode:x.domainCode,planCode:x.planCode,status:x.status,startsAt:x.startsAt,endsAt:x.endsAt,assessmentLimit:x.assessmentLimit,assessmentsUsed:x.assessmentsUsed})),
      invoices:invoices.map((x:any)=>this.presentInvoiceSummary(x)),
      summary:{
        totalPaidMnt:paidInvoices.reduce((sum:number,x:any)=>sum+Number(x.amountMnt??0),0),
        paidCount:paidInvoices.length,
        refundedMnt:refundedInvoices.reduce((sum:number,x:any)=>sum+Number(x.amountMnt??0),0),
        refundedCount:refundedInvoices.length,
        pendingCount:invoices.filter((x:any)=>x.status==="CREATED"||x.status==="PENDING").length
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
      try{await this.provider.cancelInvoice(invoice.providerInvoiceId)}catch{
        throw new ApiError(502,"PAYMENT_PROVIDER_ERROR","Нэхэмжлэхийг төлбөрийн үйлчилгээ дээр цуцалж чадсангүй. Дахин оролдоно уу.");
      }
    }
    const updated=await prisma.billingInvoice.update({where:{id:invoice.id},data:{status:"CANCELLED",failureReason:null}});
    return this.presentInvoice(updated);
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
    if(invoice.status!=="CREATED"&&invoice.status!=="PENDING")throw new ApiError(409,"INVOICE_NOT_RECONCILABLE","Энэ нэхэмжлэхийг төлбөртэй тулгах боломжгүй төлөвт байна.");
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
    return prisma.$transaction(async(tx:any)=>{
      const current=await tx.billingInvoice.findUnique({where:{id:invoiceId}});
      if(!current)throw notFound("Billing invoice not found");
      if(current.status==="REFUNDED")return this.presentInvoice(current);
      if(current.status==="PAID")return this.presentInvoice(current);
      if(current.status!=="CREATED"&&current.status!=="PENDING")throw new ApiError(409,"INVOICE_NOT_PAYABLE","Энэ нэхэмжлэх төлбөрөөр идэвхжих боломжгүй төлөвт байна.");
      if(paidAmount<current.amountMnt)throw new ApiError(409,"PARTIAL_PAYMENT","Төлбөрийн дүн нэхэмжлэхийн дүнгээс бага байна.");
      const duplicate=await tx.billingInvoice.findFirst({where:{providerPaymentId,id:{not:current.id}},select:{id:true}});
      if(duplicate)throw new ApiError(409,"PAYMENT_ALREADY_USED","Нэг төлбөрөөр хоёр нэхэмжлэх идэвхжүүлэх боломжгүй.");

      const transitioned=await tx.billingInvoice.updateMany({
        where:{id:current.id,status:{in:["CREATED","PENDING"]}},
        data:{status:"PAID",paidAt:new Date(),lastVerifiedAt:new Date(),providerPaymentId,providerMetadata:safeProviderMetadata(verification.raw),failureReason:null}
      });
      if(transitioned.count===0){
        const latest=await tx.billingInvoice.findUnique({where:{id:current.id}});
        if(latest&&(latest.status==="PAID"||latest.status==="REFUNDED"))return this.presentInvoice(latest);
        throw new ApiError(409,"PAYMENT_STATE_CHANGED","Нэхэмжлэхийн төлөв зэрэг өөрчлөгдсөн тул төлбөрийг автоматаар идэвхжүүлсэнгүй.");
      }

      await tx.companyEntitlement.upsert({
        where:{sourceInvoiceId:current.id},
        create:{companyId:current.companyId,domainCode:current.domainCode,sourceInvoiceId:current.id,planCode:current.planCode,status:"ACTIVE",startsAt:new Date(),endsAt:null,assessmentLimit:1,assessmentsUsed:0},
        update:{}
      });
      const paid=await tx.billingInvoice.findUnique({where:{id:invoiceId}});
      return this.presentInvoice(paid);
    },{isolationLevel:"Serializable"} as any);
  }

  async claimAssessmentEntitlement(companyId:string,rawDomainCode:unknown="marketing"):Promise<{entitlementId:string|null;claimedDiagnostic:boolean}> {
    const domainCode=normalizeDomainCode(rawDomainCode);
    await this.recoverOrphanedEntitlementClaims(companyId,domainCode);
    await this.expireStaleEntitlements(companyId);
    const prior=await prisma.assessment.findFirst({where:{companyId,domainCode,status:{in:["COMPLETED","COMPLETED_WITH_REVIEW","EXHAUSTED"]}},select:{id:true}});
    const expectedPlan:BillingPlanCode=prior?"RETAKE":"DIAGNOSTIC";
    const entitlement=await prisma.companyEntitlement.findFirst({where:{companyId,domainCode,planCode:expectedPlan,status:"ACTIVE",assessmentsUsed:{lt:1},sourceInvoice:{status:"PAID"}},orderBy:{startsAt:"asc"}});
    if(entitlement){
      const claimed=await prisma.companyEntitlement.updateMany({where:{id:entitlement.id,planCode:expectedPlan,status:"ACTIVE",assessmentsUsed:{lt:1}},data:{assessmentsUsed:{increment:1},status:"CONSUMED"}});
      if(claimed.count===1)return {entitlementId:entitlement.id,claimedDiagnostic:true};
      return this.claimAssessmentEntitlement(companyId,domainCode);
    }
    if(this.config.billingEnforcement){
      const wrongPlan=await prisma.companyEntitlement.findFirst({where:{companyId,domainCode,planCode:expectedPlan==="RETAKE"?"DIAGNOSTIC":"RETAKE",status:"ACTIVE",assessmentsUsed:{lt:1},sourceInvoice:{status:"PAID"}},select:{id:true,planCode:true}});
      if(wrongPlan)throw new ApiError(409,"ENTITLEMENT_PLAN_MISMATCH",expectedPlan==="RETAKE"?"Дууссан оношилгооны дараа зөвхөн дахин оношилгооны эрх ашиглана.":"Анхны оношилгоонд анхны оношилгооны эрх шаардлагатай.");
      throw new ApiError(402,"PAYMENT_REQUIRED","Оношилгоо эхлүүлэхийн өмнө төлбөр баталгаажсан байх шаардлагатай.");
    }
    return {entitlementId:null,claimedDiagnostic:false};
  }

  async releaseClaim(claim:{entitlementId:string|null;claimedDiagnostic:boolean}){
    if(!claim.entitlementId||!claim.claimedDiagnostic)return;
    await prisma.companyEntitlement.updateMany({where:{id:claim.entitlementId,status:"CONSUMED",assessmentsUsed:1,sourceInvoice:{status:"PAID"}},data:{assessmentsUsed:0,status:"ACTIVE"}});
  }

  private async hasUsablePlan(companyId:string,planCode:BillingPlanCode,domainCode:DomainCode){
    return !!(await prisma.companyEntitlement.findFirst({where:{companyId,domainCode,planCode,status:"ACTIVE",assessmentsUsed:{lt:1},sourceInvoice:{status:"PAID"}}}));
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
