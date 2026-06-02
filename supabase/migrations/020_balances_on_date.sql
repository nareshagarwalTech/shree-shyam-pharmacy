-- =============================================================================
-- Migration 020: SQL function for per-account balances on any given date
-- =============================================================================
-- Replaces the previous "current balance only" view with a parameterized
-- function that returns each account's opening + today's movements + closing
-- as of any date. Powers the Daily Book dashboard's per-day balance panel.
--
-- Mental model:
--   opening_today(D) = baseline + sum(net_change on all dates < D since baseline)
--   credit_today(D) = sum of credits on date D
--   debit_today(D)  = sum of debits on date D
--   net_today(D)    = credit_today - debit_today
--   closing_today(D) = opening_today(D) + net_today(D)
--
-- baseline = latest account_opening_balances.amount where effective_date <= D
--            OR accounts.opening_balance if no monthly override exists.
--
-- Continuity property:
--   closing_today(D) == opening_today(D + 1)   (rolls forward automatically)
--
-- Run AFTER migration 019.
-- =============================================================================

DROP FUNCTION IF EXISTS daily_book_balances_on(DATE);

CREATE OR REPLACE FUNCTION daily_book_balances_on(p_date DATE)
RETURNS TABLE (
    account_id           UUID,
    account_name         VARCHAR,
    account_short_name   VARCHAR,
    account_kind         VARCHAR,
    inception_opening    NUMERIC,
    monthly_opening_amount NUMERIC,
    monthly_opening_date DATE,
    opening_today        NUMERIC,
    credit_today         NUMERIC,
    debit_today          NUMERIC,
    net_today            NUMERIC,
    closing_today        NUMERIC,
    sort_order           INTEGER
)
LANGUAGE sql STABLE
AS $$
    WITH baselines AS (
        SELECT
            a.id AS account_id,
            COALESCE(
              (SELECT aob.amount FROM account_opening_balances aob
               WHERE aob.account_id = a.id AND aob.effective_date <= p_date
               ORDER BY aob.effective_date DESC LIMIT 1),
              a.opening_balance
            ) AS baseline,
            (SELECT aob.effective_date FROM account_opening_balances aob
             WHERE aob.account_id = a.id AND aob.effective_date <= p_date
             ORDER BY aob.effective_date DESC LIMIT 1) AS monthly_eff_date
        FROM accounts a
        WHERE a.is_active = TRUE
    ),
    mvt_before AS (
        SELECT
            b.account_id,
            COALESCE(SUM(l.net_change), 0) AS net
        FROM baselines b
        LEFT JOIN daily_book_bank_ledger l
          ON l.account_id = b.account_id
         AND l.entry_date >= COALESCE(b.monthly_eff_date, DATE '1900-01-01')
         AND l.entry_date < p_date
        GROUP BY b.account_id
    ),
    mvt_today AS (
        SELECT
            l.account_id,
            l.total_credit,
            l.total_debit,
            l.net_change
        FROM daily_book_bank_ledger l
        WHERE l.entry_date = p_date
    )
    SELECT
        a.id,
        a.name,
        a.short_name,
        a.kind,
        a.opening_balance,
        (SELECT aob.amount FROM account_opening_balances aob
         WHERE aob.account_id = a.id AND aob.effective_date <= p_date
         ORDER BY aob.effective_date DESC LIMIT 1) AS monthly_opening_amount,
        b.monthly_eff_date,
        (b.baseline + COALESCE(mb.net, 0))::NUMERIC AS opening_today,
        COALESCE(mt.total_credit, 0) AS credit_today,
        COALESCE(mt.total_debit,  0) AS debit_today,
        COALESCE(mt.net_change,   0) AS net_today,
        (b.baseline + COALESCE(mb.net, 0) + COALESCE(mt.net_change, 0))::NUMERIC AS closing_today,
        a.sort_order
    FROM accounts a
    JOIN baselines b ON b.account_id = a.id
    LEFT JOIN mvt_before mb ON mb.account_id = a.id
    LEFT JOIN mvt_today mt ON mt.account_id = a.id
    WHERE a.is_active = TRUE
    ORDER BY a.sort_order, a.name;
$$;

GRANT EXECUTE ON FUNCTION daily_book_balances_on(DATE) TO anon, authenticated;
