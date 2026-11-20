-- Additive migration: preserve existing accounts, tokens, invoices and historical identifiers.
ALTER TABLE "users" ADD COLUMN "emailVerificationRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "password_reset_tokens" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'PASSWORD_RESET';
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_purpose_check"
  CHECK ("purpose" IN ('PASSWORD_RESET', 'EMAIL_VERIFICATION'));
CREATE TABLE "billing_payment_transactions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" "PaymentProvider" NOT NULL,
  "transactionId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL REFERENCES "billing_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amountMnt" INTEGER NOT NULL CHECK ("amountMnt" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "billing_payment_transactions_provider_transactionId_key"
  ON "billing_payment_transactions"("provider", "transactionId");
CREATE INDEX "billing_payment_transactions_invoiceId_idx" ON "billing_payment_transactions"("invoiceId");
-- Single historical references can be preserved. Combined QPay references require provider
-- reconciliation; application activation fails closed until those sets have a complete ledger.
INSERT INTO "billing_payment_transactions" ("id", "provider", "transactionId", "invoiceId", "amountMnt")
SELECT 'legacy:' || "id", "provider", "providerPaymentId", "id", "amountMnt"
FROM "billing_invoices" WHERE "providerPaymentId" IS NOT NULL AND "amountMnt" > 0
  AND "providerPaymentId" NOT LIKE 'qpay-set-%';
