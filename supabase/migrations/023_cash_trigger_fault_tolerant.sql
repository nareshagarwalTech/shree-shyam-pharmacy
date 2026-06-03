-- =============================================================================
-- Migration 023: Make cash-sales sync trigger fault-tolerant
-- =============================================================================
-- The recompute_cash_sales_for_date() call inside the trigger could raise an
-- exception (e.g., during cascade deletes when the view state is transient),
-- which would abort the user's DELETE / UPDATE. That's a bad UX — the user's
-- action should succeed even if the derived-sales sync fails. The sync can
-- always be re-run later by editing the closing balance.
--
-- This migration wraps the PERFORM calls in EXCEPTION blocks. Any failure is
-- logged as a WARNING but doesn't propagate.
--
-- Run AFTER migration 022.
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_recompute_cash_sales() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_cash_account_id UUID;
    v_old_date        DATE;
    v_new_date        DATE;
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

    -- Decide which date(s) need a recompute.
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

    -- Defensive: don't abort the user's action if recompute fails.
    IF v_new_date IS NOT NULL THEN
        BEGIN
            PERFORM recompute_cash_sales_for_date(v_new_date);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'recompute_cash_sales_for_date(%) failed: % %', v_new_date, SQLSTATE, SQLERRM;
        END;
    END IF;
    IF v_old_date IS NOT NULL AND v_old_date IS DISTINCT FROM v_new_date THEN
        BEGIN
            PERFORM recompute_cash_sales_for_date(v_old_date);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'recompute_cash_sales_for_date(%) failed: % %', v_old_date, SQLSTATE, SQLERRM;
        END;
    END IF;

    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
