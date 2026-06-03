-- =============================================================================
-- Migration 024: Forward-cascade for cash-sales recompute
-- =============================================================================
-- Problem (before this migration):
--   When the user edits a CASH entry on an old date (e.g. changes May 10's
--   closing balance, or deletes a May 10 expense), the trigger recomputes
--   only May 10's auto-cash-sales row. May 11+ auto-rows are now stale —
--   their opening (computed from the bank ledger view) reflects the new
--   May 10 movement, but their stored derived_sales amount still assumes
--   the old May 10 closing. Result: May 11+ show "Cash Diff ≠ 0" until the
--   user manually re-saves each future closing balance.
--
-- Fix:
--   New function recompute_cash_sales_cascade(p_from_date) walks every
--   cash_count entry on/after p_from_date and recomputes its auto-cash-
--   sales row in order. The trigger now calls cascade() instead of
--   single-date recompute(), so any edit to a past CASH entry propagates
--   forward through all future "closed" days automatically.
--
-- Run AFTER migration 023.
-- =============================================================================

CREATE OR REPLACE FUNCTION recompute_cash_sales_cascade(p_from_date DATE)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    d                 DATE;
    v_cash_account_id UUID;
BEGIN
    SELECT id INTO v_cash_account_id
    FROM accounts WHERE kind = 'cash' AND is_active LIMIT 1;
    IF v_cash_account_id IS NULL THEN RETURN; END IF;

    -- Step 1: always recompute the start date itself (even if it has no
    -- cash_count — function will clean up any orphan auto-rows for that
    -- date if cash_count was just deleted).
    PERFORM recompute_cash_sales_for_date(p_from_date);

    -- Step 2: walk every later date that has a cash_count entry, in order.
    -- Each recompute_cash_sales_for_date() reads the (now updated) prior
    -- day's net movement via the bank-ledger view, so opening balances
    -- propagate correctly through the chain.
    FOR d IN
        SELECT DISTINCT entry_date
        FROM daily_entries
        WHERE txn_type = 'cash_count'
          AND account_id = v_cash_account_id
          AND entry_date > p_from_date
        ORDER BY entry_date
    LOOP
        PERFORM recompute_cash_sales_for_date(d);
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_cash_sales_cascade(DATE) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Update the trigger to use the cascade function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_recompute_cash_sales() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_cash_account_id UUID;
    v_old_date        DATE;
    v_new_date        DATE;
    v_start_date      DATE;
BEGIN
    SELECT id INTO v_cash_account_id
    FROM accounts WHERE kind = 'cash' AND is_active LIMIT 1;
    IF v_cash_account_id IS NULL THEN
        RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    -- Recursion guard: ignore changes to the auto-cash-sales row itself.
    IF TG_OP = 'INSERT' AND NEW.linked_role = 'auto_cash_sales' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND (
       COALESCE(OLD.linked_role, '') = 'auto_cash_sales'
       OR COALESCE(NEW.linked_role, '') = 'auto_cash_sales'
    ) THEN RETURN NEW; END IF;
    IF TG_OP = 'DELETE' AND OLD.linked_role = 'auto_cash_sales' THEN RETURN OLD; END IF;

    -- Find dates touching the CASH account.
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.account_id = v_cash_account_id
           OR NEW.transfer_to_account_id = v_cash_account_id THEN
            v_new_date := NEW.entry_date;
        END IF;
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.account_id = v_cash_account_id
           OR OLD.transfer_to_account_id = v_cash_account_id THEN
            v_old_date := OLD.entry_date;
        END IF;
    END IF;

    -- Cascade start = earliest affected date.
    IF v_old_date IS NOT NULL AND v_new_date IS NOT NULL THEN
        v_start_date := LEAST(v_old_date, v_new_date);
    ELSE
        v_start_date := COALESCE(v_old_date, v_new_date);
    END IF;

    IF v_start_date IS NOT NULL THEN
        BEGIN
            PERFORM recompute_cash_sales_cascade(v_start_date);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'recompute_cash_sales_cascade(%) failed: % %', v_start_date, SQLSTATE, SQLERRM;
        END;
    END IF;

    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
