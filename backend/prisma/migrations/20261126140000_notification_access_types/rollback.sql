-- Rollback for 20261126140000_notification_access_types. The access notifications created since the migration are removed (they are informational copies of audited administrator decisions).
-- Run ONLY after stopping the API. Then: DELETE FROM "_prisma_migrations" WHERE migration_name = '20261126140000_notification_access_types';
DELETE FROM "customer_notifications" WHERE "type" IN ('ACCESS_GRANTED','ACCESS_REVOKED');
ALTER TABLE "customer_notifications" DROP CONSTRAINT IF EXISTS "customer_notifications_type_check";
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_type_check" CHECK ("type" IN (
  'PAYMENT_CONFIRMED','ASSESSMENT_COMPLETED','REPORT_UNDER_REVIEW','REPORT_APPROVED','REPORT_RELEASED',
  'ACCOUNT_EMAIL_VERIFIED','ACCOUNT_PASSWORD_CHANGED'));
