-- =============================================================================
-- Transaction-data cleanup (scoped by date range)
-- =============================================================================
-- Same intent as cleanup_transactions.sql but only deletes rows whose
-- delivery_date / payment_date / sent_at falls in the date range you set
-- below. Useful for clearing out a specific test session without wiping
-- the whole table.
--
-- DELETED (transaction data, only inside the range):
--   - payments              where payment_date     between :start AND :end
--   - reminders             where sent_at::date   between :start AND :end
--   - sales_transactions    where delivery_date   between :start AND :end
--
-- PRESERVED:
--   - All customers, groups, customer_groups, message_templates
--   - Any payment / bill / reminder OUTSIDE the date range
--
-- HOW TO RUN:
--   1. Edit the two dates below — :start and :end — in YYYY-MM-DD
--   2. Open Supabase SQL Editor and run the entire file
--   3. Review the BEFORE / DELETED / AFTER counts in the result panel
--
-- WARNING: deleting a sales_transactions row that has CHILD payments
-- attached will fail because the FK is ON DELETE SET NULL. The child
-- rows lose their bill link but stay in the customer ledger as
-- customer-level (FIFO) payments. If you don't want that, delete the
-- payments first (this script does that automatically).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ⬇️ EDIT THESE TWO DATES, THEN RUN THE WHOLE FILE
-- ---------------------------------------------------------------------------
\set start_date '''2026-05-01'''
\set end_date   '''2026-05-31'''

-- ---------------------------------------------------------------------------
-- BEFORE counts (just rows in the range)
-- ---------------------------------------------------------------------------
SELECT 'BEFORE — rows in range' AS phase, :start_date AS range_start, :end_date AS range_end;

SELECT 'sales_transactions in range' AS table_name,
       COUNT(*) AS rows
  FROM sales_transactions
 WHERE delivery_date BETWEEN :start_date::date AND :end_date::date
UNION ALL
SELECT 'payments in range',
       COUNT(*)
  FROM payments
 WHERE payment_date BETWEEN :start_date::date AND :end_date::date
UNION ALL
SELECT 'reminders in range',
       COUNT(*)
  FROM reminders
 WHERE sent_at::date BETWEEN :start_date::date AND :end_date::date;

-- ---------------------------------------------------------------------------
-- Wipe in the right order (children → parents)
-- ---------------------------------------------------------------------------
BEGIN;

DELETE FROM payments
 WHERE payment_date BETWEEN :start_date::date AND :end_date::date;

DELETE FROM reminders
 WHERE sent_at::date BETWEEN :start_date::date AND :end_date::date;

-- This deletes bills in range AND their remaining child payments via
-- the ON DELETE CASCADE on payments.sales_transaction_id (set in 005).
DELETE FROM sales_transactions
 WHERE delivery_date BETWEEN :start_date::date AND :end_date::date;

COMMIT;

-- ---------------------------------------------------------------------------
-- AFTER counts (should be 0 in range)
-- ---------------------------------------------------------------------------
SELECT 'AFTER — rows in range (should all be 0)' AS phase;

SELECT 'sales_transactions in range' AS table_name,
       COUNT(*) AS rows
  FROM sales_transactions
 WHERE delivery_date BETWEEN :start_date::date AND :end_date::date
UNION ALL
SELECT 'payments in range',
       COUNT(*)
  FROM payments
 WHERE payment_date BETWEEN :start_date::date AND :end_date::date
UNION ALL
SELECT 'reminders in range',
       COUNT(*)
  FROM reminders
 WHERE sent_at::date BETWEEN :start_date::date AND :end_date::date;
