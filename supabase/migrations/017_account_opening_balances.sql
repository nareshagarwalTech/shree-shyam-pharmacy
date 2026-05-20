-- =============================================================================
-- Migration 017: Per-account, per-period opening balances
-- =============================================================================
-- Adds `account_opening_balances` so the manager can set an opening figure for
-- an account on a specific date (typically 1st of month). The most-recent
-- opening at or before any given date becomes the baseline for that date's
-- ledger computation.
--
-- `accounts.opening_balance` is kept as the "inception" / all-time opening.
-- If no monthly opening exists for an account, views behave exactly as before
-- (backward compatible).
--
-- Run AFTER migration 016.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop views first so we can recreate them with the new logic.
DROP VIEW IF EXISTS daily_book_account_balances CASCADE;
DROP VIEW IF EXISTS daily_book_bank_ledger      CASCADE;
DROP TABLE IF EXISTS account_opening_balances   CASCADE;

-- =============================================================================
-- account_opening_balances
-- =============================================================================
CREATE TABLE account_opening_balances (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id      UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    effective_date  DATE         NOT NULL,    -- balance "as of start of this day"
    amount          NUMERIC(14, 2) NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (account_id, effective_date)
);
CREATE INDEX idx_account_opening_balances_lookup
    ON account_opening_balances (account_id, effective_date DESC);

CREATE TRIGGER trg_account_opening_balances_updated_at
    BEFORE UPDATE ON account_opening_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE account_opening_balances DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- daily_book_bank_ledger — recreated with monthly-opening support
-- =============================================================================
-- Each daily row finds its baseline:
--   baseline = (latest account_opening_balances.amount where effective_date <= entry_date)
--              OR accounts.opening_balance if no opening row exists
--   baseline_date = corresponding effective_date OR '1900-01-01' sentinel
-- Then opening_bal = baseline + sum of net_change in the same (account, baseline_date)
-- partition strictly before entry_date.
CREATE OR REPLACE VIEW daily_book_bank_ledger AS
WITH movements AS (
    SELECT de.entry_date, de.account_id, COALESCE(de.settled_amount, de.txn_amount) AS credit, 0::NUMERIC AS debit
    FROM daily_entries de
    WHERE de.entry_type = 'sale' AND de.account_id IS NOT NULL

    UNION ALL
    SELECT de.entry_date, de.account_id, 0::NUMERIC, de.txn_amount
    FROM daily_entries de
    JOIN expense_categories ec ON ec.id = de.expense_category_id
    WHERE de.entry_type = 'expense' AND ec.is_credit_note = FALSE

    UNION ALL
    SELECT de.entry_date, de.account_id, de.txn_amount, 0::NUMERIC
    FROM daily_entries de
    JOIN expense_categories ec ON ec.id = de.expense_category_id
    WHERE de.entry_type = 'expense' AND ec.is_credit_note = TRUE

    UNION ALL
    SELECT de.entry_date, de.account_id, 0::NUMERIC, de.txn_amount
    FROM daily_entries de
    WHERE de.entry_type IN ('bank_transfer', 'cash_deposit') AND de.account_id IS NOT NULL

    UNION ALL
    SELECT de.entry_date, de.transfer_to_account_id, de.txn_amount, 0::NUMERIC
    FROM daily_entries de
    WHERE de.entry_type IN ('bank_transfer', 'cash_deposit') AND de.transfer_to_account_id IS NOT NULL
),
daily AS (
    SELECT
        m.account_id,
        m.entry_date,
        SUM(m.credit) AS total_credit,
        SUM(m.debit)  AS total_debit,
        SUM(m.credit) - SUM(m.debit) AS net_change
    FROM movements m
    GROUP BY m.account_id, m.entry_date
),
with_baseline AS (
    SELECT
        d.*,
        a.name        AS account_name,
        a.short_name  AS account_short_name,
        a.kind        AS account_kind,
        -- Most recent opening on/before this date (NULL if none).
        COALESCE(
            (SELECT aob.amount FROM account_opening_balances aob
             WHERE aob.account_id = d.account_id AND aob.effective_date <= d.entry_date
             ORDER BY aob.effective_date DESC LIMIT 1),
            a.opening_balance
        ) AS baseline_amount,
        COALESCE(
            (SELECT aob.effective_date FROM account_opening_balances aob
             WHERE aob.account_id = d.account_id AND aob.effective_date <= d.entry_date
             ORDER BY aob.effective_date DESC LIMIT 1),
            DATE '1900-01-01'
        ) AS baseline_date
    FROM daily d
    JOIN accounts a ON a.id = d.account_id
)
SELECT
    wb.account_id,
    wb.account_name,
    wb.account_short_name,
    wb.account_kind,
    wb.entry_date,
    wb.total_credit,
    wb.total_debit,
    wb.net_change,
    wb.baseline_amount + COALESCE(
        SUM(wb.net_change) OVER (
            PARTITION BY wb.account_id, wb.baseline_date
            ORDER BY wb.entry_date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0
    ) AS opening_bal,
    wb.baseline_amount + SUM(wb.net_change) OVER (
        PARTITION BY wb.account_id, wb.baseline_date
        ORDER BY wb.entry_date
    ) AS closing_bal
FROM with_baseline wb
ORDER BY wb.account_id, wb.entry_date DESC;

-- =============================================================================
-- daily_book_account_balances — current snapshot per account
-- =============================================================================
-- baseline = latest opening on/before today, or accounts.opening_balance
-- current = baseline + sum(net_change from baseline_date onward)
CREATE OR REPLACE VIEW daily_book_account_balances AS
WITH latest_opening AS (
    SELECT DISTINCT ON (account_id)
        account_id, amount, effective_date
    FROM account_opening_balances
    WHERE effective_date <= CURRENT_DATE
    ORDER BY account_id, effective_date DESC
),
movements AS (
    SELECT account_id, entry_date, net_change FROM (
        SELECT de.account_id, de.entry_date, COALESCE(de.settled_amount, de.txn_amount) AS net_change
        FROM daily_entries de WHERE de.entry_type = 'sale' AND de.account_id IS NOT NULL
        UNION ALL
        SELECT de.account_id, de.entry_date, -de.txn_amount
        FROM daily_entries de
        JOIN expense_categories ec ON ec.id = de.expense_category_id
        WHERE de.entry_type = 'expense' AND ec.is_credit_note = FALSE
        UNION ALL
        SELECT de.account_id, de.entry_date, de.txn_amount
        FROM daily_entries de
        JOIN expense_categories ec ON ec.id = de.expense_category_id
        WHERE de.entry_type = 'expense' AND ec.is_credit_note = TRUE
        UNION ALL
        SELECT de.account_id, de.entry_date, -de.txn_amount
        FROM daily_entries de WHERE de.entry_type IN ('bank_transfer', 'cash_deposit') AND de.account_id IS NOT NULL
        UNION ALL
        SELECT de.transfer_to_account_id, de.entry_date, de.txn_amount
        FROM daily_entries de WHERE de.entry_type IN ('bank_transfer', 'cash_deposit') AND de.transfer_to_account_id IS NOT NULL
    ) x
)
SELECT
    a.id              AS account_id,
    a.name            AS account_name,
    a.short_name      AS account_short_name,
    a.kind            AS account_kind,
    a.opening_balance,
    lo.amount         AS monthly_opening_amount,
    lo.effective_date AS monthly_opening_date,
    COALESCE(
        (SELECT SUM(m.net_change) FROM movements m
         WHERE m.account_id = a.id
           AND m.entry_date >= COALESCE(lo.effective_date, DATE '1900-01-01')),
        0
    ) AS movements_since_baseline,
    COALESCE(lo.amount, a.opening_balance) + COALESCE(
        (SELECT SUM(m.net_change) FROM movements m
         WHERE m.account_id = a.id
           AND m.entry_date >= COALESCE(lo.effective_date, DATE '1900-01-01')),
        0
    ) AS current_balance,
    -- Preserve old "lifetime_net" field for backward compatibility
    COALESCE(
        (SELECT SUM(m.net_change) FROM movements m WHERE m.account_id = a.id),
        0
    ) AS lifetime_net,
    a.is_active,
    a.sort_order
FROM accounts a
LEFT JOIN latest_opening lo ON lo.account_id = a.id
ORDER BY a.sort_order, a.name;
