-- Rollback for 20261126120000_admin_email_challenges. Only the one-time admin e-mail codes are lost (they are short-lived); nothing else references the table.
-- Run ONLY after setting MMRI_ADMIN_EMAIL_OTP=off and stopping the API. Then: DELETE FROM "_prisma_migrations" WHERE migration_name = '20261126120000_admin_email_challenges';
DROP TABLE IF EXISTS "admin_email_challenges";
