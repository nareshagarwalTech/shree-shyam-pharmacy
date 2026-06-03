-- =============================================================================
-- Migration 025: Dedupe cash_count rows + unique constraint per day+account
-- =============================================================================
-- Found two cash_count rows per day in prod (probably from a denomination
-- counter that always INSERTs + a manual cash_count from the modal). The
-- cash-day-reconciliation function picks ORDER BY created_at DESC LIMIT 1,
-- so behavior is technically correct, but having duplicates is confusing
-- and risks accidental edits to the wrong row.
--
-- This migration:
--   1. Deletes all but the most recent cash_count per (entry_date, account_id)
--   2. Adds a partial UNIQUE index enforcing one cash_count per day+account
--   3. Re-cascades the auto-cash-sales rows for any affected dates
--
-- Run AFTER migration 024.
-- =============================================================================

-- Step 1: Delete dupe cash_count rows (keep most recent created_at per day+account).
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY entry_date, account_id
               ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM daily_entries
    WHERE txn_type = 'cash_count'
)
DELETE FROM daily_entries
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: Partial UNIQUE index — only one cash_count row per (day, account).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cash_count_per_day_account
    ON daily_entries (account_id, entry_date)
    WHERE txn_type = 'cash_count';

-- Step 3: Re-run the cascade starting from the earliest cash_count to make sure
-- all auto-cash-sales are consistent after dedup.
DO $$
DECLARE
    v_earliest DATE;
    v_cash_account_id UUID;
BEGIN
    SELECT id INTO v_cash_account_id FROM accounts WHERE kind = 'cash' AND is_active LIMIT 1;
    IF v_cash_account_id IS NULL THEN RETURN; END IF;

    SELECT MIN(entry_date) INTO v_earliest
    FROM daily_entries
    WHERE txn_type = 'cash_count' AND account_id = v_cash_account_id;

    IF v_earliest IS NOT NULL THEN
        PERFORM recompute_cash_sales_cascade(v_earliest);
    END IF;
END $$;
