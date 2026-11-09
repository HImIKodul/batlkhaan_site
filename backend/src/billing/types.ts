export type BillingPlanCode="DIAGNOSTIC"|"RETAKE";
export type ProviderName="QPAY"|"MOCK"|"MANUAL";

export interface ProviderInvoiceRequest {
  senderInvoiceNo:string;
  receiverCode:string;
  description:string;
  amountMnt:number;
  callbackUrl:string;
}

export interface ProviderInvoiceResult {
  providerInvoiceId:string;
  qrText:string|null;
  qrImage:string|null;
  shortUrl:string|null;
  deeplinks:Array<{name?:string;description?:string;logo?:string;link:string}>;
  raw:unknown;
}

export interface ProviderPaymentResult {
  paid:boolean;
  paidAmountMnt:number;
  paymentId:string|null;
  raw:unknown;
}

export interface PaymentProviderAdapter {
  readonly name:ProviderName;
  createInvoice(input:ProviderInvoiceRequest):Promise<ProviderInvoiceResult>;
  checkInvoicePayment(providerInvoiceId:string,expectedAmountMnt:number):Promise<ProviderPaymentResult>;
  cancelInvoice(providerInvoiceId:string):Promise<void>;
}
