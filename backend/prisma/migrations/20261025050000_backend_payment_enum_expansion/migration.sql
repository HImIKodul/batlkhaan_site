-- Backend completion Step 13/20 — payment provider/state expansion.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'MANUAL';
ALTER TYPE "BillingInvoiceStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
