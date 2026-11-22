-- PAY-03: at most ONE open dispute per invoice, enforced by the database (the application read-before-create is a race).
-- Fails loudly (instead of deleting anything) if duplicate open disputes already exist; resolve those by hand first.
CREATE UNIQUE INDEX "payment_disputes_one_open_per_invoice" ON "payment_disputes"("invoiceId") WHERE "status" IN ('OPEN', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED');
