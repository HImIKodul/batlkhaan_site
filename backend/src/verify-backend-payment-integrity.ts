import { prisma } from "./db.js";

async function scalar(sql:string):Promise<number>{
  const rows=await prisma.$queryRawUnsafe<Array<{count:bigint|number|string}>>(sql);
  return Number(rows[0]?.count??0);
}

async function main(){
  const checks:Record<string,number>={};
  checks.settledMissingPaymentReference=await scalar(`SELECT COUNT(*) AS count FROM billing_invoices WHERE status IN ('PAID','REFUNDED') AND ("paidAt" IS NULL OR "providerPaymentId" IS NULL OR btrim("providerPaymentId")='')`);
  checks.refundedMissingMetadata=await scalar(`SELECT COUNT(*) AS count FROM billing_invoices WHERE status='REFUNDED' AND ("refundedAt" IS NULL OR "refundReference" IS NULL OR btrim("refundReference")='')`);
  checks.invalidAmountCurrency=await scalar(`SELECT COUNT(*) AS count FROM billing_invoices WHERE "amountMnt"<=0 OR currency<>'MNT'`);
  checks.duplicateProviderPaymentId=await scalar(`SELECT COUNT(*) AS count FROM (SELECT "providerPaymentId" FROM billing_invoices WHERE "providerPaymentId" IS NOT NULL GROUP BY "providerPaymentId" HAVING COUNT(*)>1) x`);
  checks.duplicateRefundReference=await scalar(`SELECT COUNT(*) AS count FROM (SELECT "refundReference" FROM billing_invoices WHERE "refundReference" IS NOT NULL GROUP BY "refundReference" HAVING COUNT(*)>1) x`);
  checks.entitlementInvoiceMismatch=await scalar(`SELECT COUNT(*) AS count FROM company_entitlements e JOIN billing_invoices i ON i.id=e."sourceInvoiceId" WHERE e."companyId"<>i."companyId" OR e."domainCode"<>i."domainCode" OR e."planCode"<>i."planCode"`);
  checks.liveEntitlementWithoutPaidInvoice=await scalar(`SELECT COUNT(*) AS count FROM company_entitlements e JOIN billing_invoices i ON i.id=e."sourceInvoiceId" WHERE e.status IN ('ACTIVE','CONSUMED') AND i.status<>'PAID'`);
  checks.refundedInvoiceLiveEntitlement=await scalar(`SELECT COUNT(*) AS count FROM billing_invoices i JOIN company_entitlements e ON e."sourceInvoiceId"=i.id WHERE i.status='REFUNDED' AND e.status IN ('ACTIVE','CONSUMED')`);
  checks.paidInvoiceWithoutEntitlement=await scalar(`SELECT COUNT(*) AS count FROM billing_invoices i LEFT JOIN company_entitlements e ON e."sourceInvoiceId"=i.id WHERE i.status='PAID' AND e.id IS NULL`);
  checks.entitlementUsageOutOfRange=await scalar(`SELECT COUNT(*) AS count FROM company_entitlements WHERE "assessmentsUsed"<0 OR ("assessmentLimit" IS NOT NULL AND ("assessmentLimit"<1 OR "assessmentsUsed">"assessmentLimit"))`);
  checks.pendingInvoiceWithActiveAssessment=await scalar(`SELECT COUNT(*) AS count FROM billing_invoices i JOIN assessments a ON a."companyId"=i."companyId" AND a."domainCode"=i."domainCode" WHERE i.status IN ('CREATED','PENDING') AND a.status IN ('PROFILE_PENDING','IN_PROGRESS','PAUSED','READY_FOR_COMPLETION','PROCESSING')`);
  checks.assessmentEntitlementNotSettled=await scalar(`SELECT COUNT(*) AS count FROM assessments a JOIN company_entitlements e ON e.id=a."entitlementId" JOIN billing_invoices i ON i.id=e."sourceInvoiceId" WHERE a."entitlementId" IS NOT NULL AND i.status NOT IN ('PAID','REFUNDED')`);
  // Administrator grants (migration 20261108100000): modelled as their own origin, never as a payment.
  checks.paidEntitlementWithoutInvoice=await scalar(`SELECT COUNT(*) AS count FROM company_entitlements WHERE origin='PAID' AND "sourceInvoiceId" IS NULL`);
  checks.adminGrantWithInvoice=await scalar(`SELECT COUNT(*) AS count FROM company_entitlements WHERE origin='ADMIN_GRANT' AND "sourceInvoiceId" IS NOT NULL`);
  checks.adminGrantWithoutActorOrReason=await scalar(`SELECT COUNT(*) AS count FROM company_entitlements WHERE origin='ADMIN_GRANT' AND ("grantedByAdminId" IS NULL OR COALESCE(length(btrim("grantReason")),0)<8)`);
  checks.revokedAdminGrantWithoutActorOrReason=await scalar(`SELECT COUNT(*) AS count FROM company_entitlements WHERE origin='ADMIN_GRANT' AND status='REVOKED' AND ("revokedByAdminId" IS NULL OR "revokedAt" IS NULL OR COALESCE(length(btrim("revokeReason")),0)<8)`);
  checks.adminGrantInvoiceFootprint=await scalar(`SELECT COUNT(*) AS count FROM billing_invoices WHERE "providerMetadata"->>'adminGrant'='true' OR "senderInvoiceNo" LIKE 'ADMGRANT-%'`);
  checks.adminGrantWithoutAuditRow=await scalar(`SELECT COUNT(*) AS count FROM company_entitlements e WHERE e.origin='ADMIN_GRANT' AND NOT EXISTS (SELECT 1 FROM admin_audit_events a WHERE a.action='ADMIN_ENTITLEMENT_GRANTED' AND a.outcome='SUCCESS' AND a."targetType"='ENTITLEMENT' AND a."targetId"=e.id)`);
  const failed=Object.entries(checks).filter(([,count])=>count!==0);
  console.log(JSON.stringify({suite:"Backend completion Step 13/20 connected payment integrity",status:failed.length?"FAIL":"PASS",checks,failed},null,2));
  if(failed.length)process.exit(1);
}
main().finally(()=>prisma.$disconnect());
