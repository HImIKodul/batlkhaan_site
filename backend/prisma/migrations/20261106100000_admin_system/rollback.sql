-- Manual rollback for 20261106100000_admin_system (not run by Prisma). Drops ONLY the admin tables; no existing table is touched.
-- WARNING: it deletes all admin data (reviews, revisions, notifications, disputes, support cases, audit log). Export first if needed.
-- After running it also delete the row from _prisma_migrations: DELETE FROM _prisma_migrations WHERE migration_name='20261106100000_admin_system';
DROP TABLE IF EXISTS "support_case_events","support_cases","payment_dispute_events","payment_disputes","admin_notification_reads","admin_notifications","report_review_suggestions","report_review_revisions","report_reviews","admin_sessions","admin_audit_events","admin_accounts" CASCADE;
DROP FUNCTION IF EXISTS mmri_forbid_row_change();
