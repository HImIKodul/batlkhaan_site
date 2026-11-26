-- Administrator access decisions are notified in the app: two more customer notification types. Additive: the CHECK list is widened, no data is changed.
ALTER TABLE "customer_notifications" DROP CONSTRAINT IF EXISTS "customer_notifications_type_check";
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_type_check" CHECK ("type" IN (
  'PAYMENT_CONFIRMED','ASSESSMENT_COMPLETED','REPORT_UNDER_REVIEW','REPORT_APPROVED','REPORT_RELEASED',
  'ACCOUNT_EMAIL_VERIFIED','ACCOUNT_PASSWORD_CHANGED','ACCESS_GRANTED','ACCESS_REVOKED'));
