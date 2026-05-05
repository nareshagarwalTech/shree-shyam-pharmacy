-- =============================================================================
-- Transaction-data cleanup
-- =============================================================================
-- Wipes all TRANSACTION tables but PRESERVES master data.
--
-- DELETED (transaction data):
--   - sales_transactions   (every bill / delivery row)
--   - payments             (every payment row)
--   - reminders            (every WhatsApp send-log row)
--
-- PRESERVED (master data):
--   - customers            (customer master)
--   - groups               (group definitions)
--   - customer_groups      (which customer is in which group)
--   - message_templates    (refill / due / marketing templates)
--
-- USE FOR:
--   - Resetting a staging environment before re-importing fresh data
--   - Wiping test entries before going live
--
-- DO NOT USE IN PRODUCTION WITHOUT A BACKUP. THIS IS DESTRUCTIVE AND
-- CANNOT BE UNDONE FROM THIS SCRIPT.
--
-- HOW TO RUN:
--   1. Open Supabase SQL Editor for your project
--   2. Take a backup first (Database → Backups → "Create backup")
--   3. Paste this entire file and click "Run"
--   4. Review the BEFORE / AFTER counts in the result panel
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Show row counts BEFORE the wipe (for the audit trail)
-- ---------------------------------------------------------------------------
SELECT 'BEFORE — transaction tables' AS phase;

SELECT 'sales_transactions' AS table_name, COUNT(*) AS rows FROM sales_transactions
UNION ALL
SELECT 'payments',                     COUNT(*)            FROM payments
UNION ALL
SELECT 'reminders',                    COUNT(*)            FROM reminders;

SELECT 'BEFORE — master tables (will be PRESERVED)' AS phase;

SELECT 'customers',         COUNT(*) FROM customers
UNION ALL
SELECT 'groups',            COUNT(*) FROM groups
UNION ALL
SELECT 'customer_groups',   COUNT(*) FROM customer_groups
UNION ALL
SELECT 'message_templates', COUNT(*) FROM message_templates;

-- ---------------------------------------------------------------------------
-- 2. Wipe transaction data
-- ---------------------------------------------------------------------------
-- Order matters: payments and reminders reference sales_transactions, so
-- delete the children first. Using DELETE (not TRUNCATE) so it runs inside
-- a transaction and can be rolled back if something looks wrong.
-- ---------------------------------------------------------------------------

BEGIN;

DELETE FROM payments;
DELETE FROM reminders;
DELETE FROM sales_transactions;

-- If you have a separate import_batches table, uncomment the next line
-- (ignore the error if the table doesn't exist).
-- DELETE FROM import_batches;

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. Verify post-wipe counts
-- ---------------------------------------------------------------------------
SELECT 'AFTER — transaction tables (should all be 0)' AS phase;

SELECT 'sales_transactions' AS table_name, COUNT(*) AS rows FROM sales_transactions
UNION ALL
SELECT 'payments',                     COUNT(*)            FROM payments
UNION ALL
SELECT 'reminders',                    COUNT(*)            FROM reminders;

SELECT 'AFTER — master tables (should match BEFORE)' AS phase;

SELECT 'customers',         COUNT(*) FROM customers
UNION ALL
SELECT 'groups',            COUNT(*) FROM groups
UNION ALL
SELECT 'customer_groups',   COUNT(*) FROM customer_groups
UNION ALL
SELECT 'message_templates', COUNT(*) FROM message_templates;
