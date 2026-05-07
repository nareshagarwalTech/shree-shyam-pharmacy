-- =============================================================================
-- Cleanup: remove Excel-imported sales_transactions + their payments
-- =============================================================================
-- The "Sales Upload" page was historically used to bulk-import the
-- reminder.ssp.xlsx workbook, which is actually a reminder list, not a
-- bills-and-payments register. Those rows polluted Daily Collection /
-- Pending / Aging.
--
-- This script wipes ONLY the rows that came from Excel uploads
-- (import_batch_id IS NOT NULL). Bills entered through /deliveries/new
-- (which have import_batch_id = NULL) are preserved.
--
-- HOW TO RUN
--   1. Apply migration 012_customer_reminder_fields.sql first
--   2. Take a fresh database backup (Supabase: Database → Backups)
--   3. Paste this whole file into the SQL editor
--   4. Read the BEFORE counts, then read AFTER counts
--   5. Re-import the reminder list via /dashboard/whatsapp/reminder-upload
-- =============================================================================

-- ---------------------------------------------------------------------------
-- BEFORE counts
-- ---------------------------------------------------------------------------
SELECT 'BEFORE' AS phase;

SELECT 'sales_transactions: total'           AS metric, COUNT(*) AS rows
  FROM sales_transactions
UNION ALL SELECT 'sales_transactions: from Excel imports',
       COUNT(*) FROM sales_transactions WHERE import_batch_id IS NOT NULL
UNION ALL SELECT 'sales_transactions: manual (kept)',
       COUNT(*) FROM sales_transactions WHERE import_batch_id IS NULL
UNION ALL SELECT 'payments: total',
       COUNT(*) FROM payments
UNION ALL SELECT 'payments: linked to Excel imports (will be deleted)',
       COUNT(*) FROM payments p
       WHERE p.sales_transaction_id IN (
         SELECT id FROM sales_transactions WHERE import_batch_id IS NOT NULL
       );

-- ---------------------------------------------------------------------------
-- The wipe — children first
-- ---------------------------------------------------------------------------
BEGIN;

-- Delete payments that reference Excel-imported bills
DELETE FROM payments
 WHERE sales_transaction_id IN (
   SELECT id FROM sales_transactions WHERE import_batch_id IS NOT NULL
 );

-- Delete reminders that reference Excel-imported bills (set FK to null first
-- if they're still in 'queued' state, otherwise the reminder log is history
-- worth keeping). We just NULL out sales_transaction_id so the audit trail
-- in /dashboard/history is preserved.
UPDATE reminders
   SET sales_transaction_id = NULL
 WHERE sales_transaction_id IN (
   SELECT id FROM sales_transactions WHERE import_batch_id IS NOT NULL
 );

-- Delete the bills themselves
DELETE FROM sales_transactions
 WHERE import_batch_id IS NOT NULL;

-- Mark the import_batches as cancelled so the audit trail still exists
UPDATE import_batches
   SET notes = COALESCE(notes, '') || ' [WIPED on ' || CURRENT_DATE || ': moved to reminder-only flow]'
 WHERE source_type = 'daily_sales';

COMMIT;

-- ---------------------------------------------------------------------------
-- AFTER counts (Excel rows should be 0; manual rows unchanged)
-- ---------------------------------------------------------------------------
SELECT 'AFTER' AS phase;

SELECT 'sales_transactions: total'           AS metric, COUNT(*) AS rows
  FROM sales_transactions
UNION ALL SELECT 'sales_transactions: from Excel imports (should be 0)',
       COUNT(*) FROM sales_transactions WHERE import_batch_id IS NOT NULL
UNION ALL SELECT 'sales_transactions: manual (unchanged)',
       COUNT(*) FROM sales_transactions WHERE import_batch_id IS NULL
UNION ALL SELECT 'payments: total',
       COUNT(*) FROM payments
UNION ALL SELECT 'customers: total (untouched)',
       COUNT(*) FROM customers WHERE is_active = true;
