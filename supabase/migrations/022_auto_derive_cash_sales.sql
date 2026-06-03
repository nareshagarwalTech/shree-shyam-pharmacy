-- =============================================================================
-- Migration 022: Auto-derive Cash Sales from closing balance
-- =============================================================================
-- Workflow for the pharmacy:
--   * During the day, the user enters all cash expenses, transfers, and any
--     non-sales cash income (personal deposits to drawer, gifts, refunds).
--   * Manually entering each cash sale is tedious — there can be hundreds of
--     small walk-in sales per day.
--   * At end of day, the user counts the drawer and records the closing
--     balance via a `cash_count` entry.
--
-- The system then back-calculates implied Cash Sales:
--
--     Derived Sales = Closing − Opening + CashOutflows − NonSaleCashInflows
--                                       − ManualCashSalesAlreadyEntered
--   where:
--     CashOutflows         = cash expenses (biz + personal, excl. credit notes)
--                          + transfers OUT of CASH (cash_deposit / bank_transfer)
--     NonSaleCashInflows   = income to CASH NOT tagged as Sales (Walk-in/Credit)
--                          + credit-note refunds (is_credit_note expense entries)
--                          + transfers IN to CASH
--     ManualCashSales      = income to CASH tagged Sales (Walk-in) or Sales (Credit)
--                            already entered manually by the user
--
-- If derived > 0 → auto-create / update ONE BIZ-IN Sales (Walk-in) Cash entry
--                  linked to the cash_count via linked_entry_id +
--                  linked_role='auto_cash_sales'.
-- If derived ≤ 0 → no entry created (warn in UI: cash short).
--
-- A trigger keeps this in sync on every change to daily_entries that touches
-- the CASH account, with recursion protection for the auto-row itself.
--
-- Run AFTER migration 021.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- recompute_cash_sales_for_date(p_date)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recompute_cash_sales_for_date(p_date DATE)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_cash_account_id   UUID;
    v_cash_count_id     UUID;
    v_closing           NUMERIC;
    v_opening           NUMERIC;
    v_cash_expenses     NUMERIC;
    v_cr_note_in        NUMERIC;
    v_deposits_out      NUMERIC;
    v_deposits_in       NUMERIC;
    v_non_sale_in       NUMERIC;
    v_manual_sales      NUMERIC;
    v_derived_sales     NUMERIC;
    v_sales_cat_id      UUID;
    v_cash_mode_id      UUID;
    v_existing_id       UUID;
BEGIN
    -- Find the CASH account.
    SELECT id INTO v_cash_account_id
    FROM accounts WHERE kind = 'cash' AND is_active LIMIT 1;
    IF v_cash_account_id IS NULL THEN RETURN; END IF;

    -- Find the most recent cash_count for the date (last one wins).
    SELECT id, txn_amount INTO v_cash_count_id, v_closing
    FROM daily_entries
    WHERE entry_date = p_date
      AND txn_type = 'cash_count'
      AND account_id = v_cash_account_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- No closing balance set for this date → make sure no orphan auto-row exists.
    IF v_cash_count_id IS NULL THEN
        DELETE FROM daily_entries
        WHERE entry_date = p_date
          AND linked_role = 'auto_cash_sales';
        RETURN;
    END IF;

    -- Opening balance for the date.
    SELECT opening_today INTO v_opening
    FROM daily_book_balances_on(p_date)
    WHERE account_id = v_cash_account_id;
    v_opening := COALESCE(v_opening, 0);

    -- Cash expenses (regular, non-credit-note).
    SELECT COALESCE(SUM(de.txn_amount), 0) INTO v_cash_expenses
    FROM daily_entries de
    LEFT JOIN categories c ON c.id = de.category_id
    WHERE de.entry_date = p_date
      AND de.account_id = v_cash_account_id
      AND de.txn_type = 'entry'
      AND de.direction = 'expense'
      AND (c.is_credit_note IS NULL OR c.is_credit_note = FALSE);

    -- Credit-note "expenses" — money flowing back INTO cash. Treat as inflow.
    SELECT COALESCE(SUM(de.txn_amount), 0) INTO v_cr_note_in
    FROM daily_entries de
    JOIN categories c ON c.id = de.category_id
    WHERE de.entry_date = p_date
      AND de.account_id = v_cash_account_id
      AND de.txn_type = 'entry'
      AND de.direction = 'expense'
      AND c.is_credit_note = TRUE;

    -- Cash deposits OUT (transfers FROM cash to a bank).
    SELECT COALESCE(SUM(txn_amount), 0) INTO v_deposits_out
    FROM daily_entries
    WHERE entry_date = p_date
      AND account_id = v_cash_account_id
      AND txn_type = 'transfer';

    -- Cash deposits IN (transfers TO cash from a bank).
    SELECT COALESCE(SUM(txn_amount), 0) INTO v_deposits_in
    FROM daily_entries
    WHERE entry_date = p_date
      AND transfer_to_account_id = v_cash_account_id
      AND txn_type = 'transfer';

    -- Non-sales cash income (personal/business income to CASH that is NOT
    -- Sales (Walk-in) / Sales (Credit) — i.e. things like personal deposits,
    -- gifts, dividends, refunds. Also excludes the auto-cash-sales we maintain.
    SELECT COALESCE(SUM(de.txn_amount), 0) INTO v_non_sale_in
    FROM daily_entries de
    JOIN categories c ON c.id = de.category_id
    WHERE de.entry_date = p_date
      AND de.account_id = v_cash_account_id
      AND de.txn_type = 'entry'
      AND de.direction = 'income'
      AND (de.linked_role IS NULL OR de.linked_role <> 'auto_cash_sales')
      AND c.slug NOT IN ('sales_walkin', 'sales_credit');

    -- Manually entered cash sales (already counted by the user).
    SELECT COALESCE(SUM(de.txn_amount), 0) INTO v_manual_sales
    FROM daily_entries de
    JOIN categories c ON c.id = de.category_id
    WHERE de.entry_date = p_date
      AND de.account_id = v_cash_account_id
      AND de.txn_type = 'entry'
      AND de.direction = 'income'
      AND (de.linked_role IS NULL OR de.linked_role <> 'auto_cash_sales')
      AND c.slug IN ('sales_walkin', 'sales_credit');

    -- Derived sales:
    -- Closing = Opening + ManualSales + DerivedSales + NonSaleIn + CrNoteIn + DepositsIn
    --                      − Expenses − DepositsOut
    -- Solve for DerivedSales:
    v_derived_sales :=
        v_closing
      - v_opening
      - v_manual_sales
      - v_non_sale_in
      - v_cr_note_in
      - v_deposits_in
      + v_cash_expenses
      + v_deposits_out;

    -- Find an existing auto-cash-sales row linked to this cash_count.
    SELECT id INTO v_existing_id
    FROM daily_entries
    WHERE linked_entry_id = v_cash_count_id
      AND linked_role = 'auto_cash_sales'
    LIMIT 1;

    IF v_derived_sales > 0.005 THEN
        -- Look up target category + mode for the auto-row.
        SELECT id INTO v_sales_cat_id
        FROM categories
        WHERE direction = 'income' AND scope = 'business' AND slug = 'sales_walkin'
        LIMIT 1;
        SELECT id INTO v_cash_mode_id FROM payment_modes WHERE slug = 'cash' LIMIT 1;

        IF v_sales_cat_id IS NULL OR v_cash_mode_id IS NULL THEN
            RAISE WARNING 'recompute_cash_sales: Sales (Walk-in) cat or Cash mode missing — skipping';
            RETURN;
        END IF;

        IF v_existing_id IS NULL THEN
            INSERT INTO daily_entries (
                entry_date, txn_type, direction, scope,
                account_id, mode_id, category_id,
                txn_amount, narration, notes,
                linked_entry_id, linked_role, created_by
            ) VALUES (
                p_date, 'entry', 'income', 'business',
                v_cash_account_id, v_cash_mode_id, v_sales_cat_id,
                v_derived_sales,
                'Auto: cash sales derived from closing balance',
                'Auto-managed by the closing-balance reconciler. Edit the day''s cash count to change this amount.',
                v_cash_count_id, 'auto_cash_sales',
                'system'
            );
        ELSE
            UPDATE daily_entries SET
                txn_amount  = v_derived_sales,
                updated_at  = NOW()
            WHERE id = v_existing_id;
        END IF;
    ELSE
        -- Closing is at or below expected — no derived sales row needed.
        IF v_existing_id IS NOT NULL THEN
            DELETE FROM daily_entries WHERE id = v_existing_id;
        END IF;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger function: fires on any daily_entries change touching CASH.
-- Recursion protected: skips when the change IS our auto-cash-sales row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_recompute_cash_sales() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_cash_account_id UUID;
    v_old_date DATE;
    v_new_date DATE;
BEGIN
    SELECT id INTO v_cash_account_id
    FROM accounts WHERE kind = 'cash' AND is_active LIMIT 1;
    IF v_cash_account_id IS NULL THEN
        RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    -- Recursion guard: ignore changes to/from the auto-cash-sales row itself.
    IF TG_OP = 'INSERT' AND NEW.linked_role = 'auto_cash_sales' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND (
       COALESCE(OLD.linked_role, '') = 'auto_cash_sales'
       OR COALESCE(NEW.linked_role, '') = 'auto_cash_sales'
    ) THEN RETURN NEW; END IF;
    IF TG_OP = 'DELETE' AND OLD.linked_role = 'auto_cash_sales' THEN RETURN OLD; END IF;

    -- Decide if the row touches CASH.
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

    IF v_new_date IS NOT NULL THEN
        PERFORM recompute_cash_sales_for_date(v_new_date);
    END IF;
    IF v_old_date IS NOT NULL AND v_old_date IS DISTINCT FROM v_new_date THEN
        PERFORM recompute_cash_sales_for_date(v_old_date);
    END IF;

    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_cash_sales_aiud ON daily_entries;
CREATE TRIGGER trg_recompute_cash_sales_aiud
    AFTER INSERT OR UPDATE OR DELETE ON daily_entries
    FOR EACH ROW
    EXECUTE FUNCTION trg_recompute_cash_sales();

-- ---------------------------------------------------------------------------
-- cash_day_reconciliation(p_date) — single-row summary used by the dashboard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cash_day_reconciliation(p_date DATE)
RETURNS TABLE (
    entry_date          DATE,
    cash_account_id     UUID,
    opening             NUMERIC,
    non_sale_in         NUMERIC,
    cr_note_in          NUMERIC,
    deposits_in         NUMERIC,
    expenses            NUMERIC,
    deposits_out        NUMERIC,
    manual_sales        NUMERIC,
    expected_closing    NUMERIC,    -- before derived sales
    actual_closing      NUMERIC,    -- from cash_count entry, NULL if not entered
    derived_sales       NUMERIC,    -- the auto-cash-sales amount (0 if not derived)
    cash_diff           NUMERIC     -- actual − expected − derived; should be 0 if balanced, < 0 if cash short
)
LANGUAGE sql STABLE AS $$
    WITH cash_acct AS (
        SELECT id FROM accounts WHERE kind = 'cash' AND is_active LIMIT 1
    ),
    opening_q AS (
        SELECT b.opening_today
        FROM daily_book_balances_on(p_date) b
        JOIN cash_acct ca ON ca.id = b.account_id
    ),
    cash_count_q AS (
        SELECT de.txn_amount AS closing
        FROM daily_entries de
        JOIN cash_acct ca ON ca.id = de.account_id
        WHERE de.entry_date = p_date AND de.txn_type = 'cash_count'
        ORDER BY de.created_at DESC LIMIT 1
    ),
    sums AS (
        SELECT
            COALESCE(SUM(de.txn_amount) FILTER (
                WHERE de.txn_type = 'entry' AND de.direction = 'expense'
                  AND (c.is_credit_note IS NULL OR c.is_credit_note = FALSE)
            ), 0) AS expenses,
            COALESCE(SUM(de.txn_amount) FILTER (
                WHERE de.txn_type = 'entry' AND de.direction = 'expense' AND c.is_credit_note = TRUE
            ), 0) AS cr_note_in,
            COALESCE(SUM(de.txn_amount) FILTER (
                WHERE de.txn_type = 'transfer' AND de.account_id = (SELECT id FROM cash_acct)
            ), 0) AS deposits_out,
            COALESCE(SUM(de.txn_amount) FILTER (
                WHERE de.txn_type = 'entry' AND de.direction = 'income'
                  AND (de.linked_role IS NULL OR de.linked_role <> 'auto_cash_sales')
                  AND c.slug NOT IN ('sales_walkin', 'sales_credit')
            ), 0) AS non_sale_in,
            COALESCE(SUM(de.txn_amount) FILTER (
                WHERE de.txn_type = 'entry' AND de.direction = 'income'
                  AND (de.linked_role IS NULL OR de.linked_role <> 'auto_cash_sales')
                  AND c.slug IN ('sales_walkin', 'sales_credit')
            ), 0) AS manual_sales,
            COALESCE(SUM(de.txn_amount) FILTER (
                WHERE de.txn_type = 'entry' AND de.direction = 'income'
                  AND de.linked_role = 'auto_cash_sales'
            ), 0) AS derived_sales
        FROM daily_entries de
        LEFT JOIN categories c ON c.id = de.category_id
        WHERE de.entry_date = p_date
          AND (de.account_id = (SELECT id FROM cash_acct)
            OR (de.txn_type = 'transfer' AND de.transfer_to_account_id = (SELECT id FROM cash_acct)))
    ),
    transfers_in AS (
        SELECT COALESCE(SUM(de.txn_amount), 0) AS deposits_in
        FROM daily_entries de
        WHERE de.entry_date = p_date
          AND de.txn_type = 'transfer'
          AND de.transfer_to_account_id = (SELECT id FROM cash_acct)
    )
    SELECT
        p_date,
        (SELECT id FROM cash_acct),
        COALESCE((SELECT opening_today FROM opening_q), 0),
        s.non_sale_in,
        s.cr_note_in,
        ti.deposits_in,
        s.expenses,
        s.deposits_out,
        s.manual_sales,
        -- Expected closing BEFORE derived sales added
        (COALESCE((SELECT opening_today FROM opening_q), 0)
         + s.manual_sales + s.non_sale_in + s.cr_note_in + ti.deposits_in
         - s.expenses - s.deposits_out)              AS expected_closing,
        (SELECT closing FROM cash_count_q),
        s.derived_sales,
        -- Cash diff = actual − (expected + derived). Should be 0 when balanced.
        COALESCE((SELECT closing FROM cash_count_q), 0)
          - (COALESCE((SELECT opening_today FROM opening_q), 0)
             + s.manual_sales + s.non_sale_in + s.cr_note_in + ti.deposits_in
             - s.expenses - s.deposits_out
             + s.derived_sales)                      AS cash_diff
    FROM sums s, transfers_in ti;
$$;

GRANT EXECUTE ON FUNCTION recompute_cash_sales_for_date(DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cash_day_reconciliation(DATE)        TO anon, authenticated;
