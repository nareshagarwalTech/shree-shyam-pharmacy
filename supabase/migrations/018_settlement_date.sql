-- =============================================================================
-- Migration 018: Settlement date + auto-linked bank charges expense
-- =============================================================================
-- For POS/QR sales where the bank settles less than the gross (commission
-- deducted), this migration:
--   1. Adds `settlement_date` to daily_entries — when the bank actually
--      credited the money (typically T+1 or T+2). Sales aggregate by
--      transaction date (entry_date); bank ledger uses settlement_date.
--   2. Adds `linked_sale_id` so an auto-created BANK CHARGES expense row can
--      point back to its parent sale.
--   3. Trigger sync_sale_bank_charges keeps the linked BANK CHARGES expense
--      in sync with the sale on every INSERT/UPDATE. CASCADE handles DELETE.
--   4. Backfills linked BANK CHARGES for existing sales with commission.
--   5. Updates daily_book_bank_ledger to credit SALE with the FULL txn_amount
--      on settlement_date — the linked expense debits the commission,
--      netting correctly to the settled amount.
--
-- Run AFTER migration 017.
-- =============================================================================

-- =============================================================================
-- 1. Columns
-- =============================================================================
ALTER TABLE daily_entries
    ADD COLUMN IF NOT EXISTS settlement_date DATE,
    ADD COLUMN IF NOT EXISTS linked_sale_id  UUID REFERENCES daily_entries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_daily_entries_linked_sale
    ON daily_entries(linked_sale_id) WHERE linked_sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_entries_settlement_date
    ON daily_entries(settlement_date) WHERE settlement_date IS NOT NULL;

-- =============================================================================
-- 2. Trigger function — sync linked BANK CHARGES expense for SALE rows
-- =============================================================================
-- Idempotent: insert if missing, update if exists, delete if commission goes
-- to zero or sale loses its bank account. Skips non-SALE entries and rows
-- that are themselves linked expenses (avoid recursion).
CREATE OR REPLACE FUNCTION sync_sale_bank_charges()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_commission     NUMERIC(14, 2);
    v_settle_date    DATE;
    v_linked_id      UUID;
    v_bank_charges_cat UUID;
BEGIN
    -- Only react to SALE rows. Linked expenses (entry_type='expense' with
    -- linked_sale_id set) are not handled here; they're managed indirectly
    -- via the parent sale's INSERT/UPDATE.
    IF NEW.entry_type <> 'sale' THEN RETURN NEW; END IF;

    -- Find an existing linked bank-charges expense (if any).
    SELECT id INTO v_linked_id
    FROM daily_entries
    WHERE linked_sale_id = NEW.id
    LIMIT 1;

    -- Conditions under which there should be NO linked charge:
    --   - no settled_amount (full settlement assumed)
    --   - settled >= txn (no commission)
    --   - no account_id (e.g., CREDIT channel — bank not involved)
    IF NEW.settled_amount IS NULL
       OR NEW.settled_amount >= NEW.txn_amount
       OR NEW.account_id IS NULL THEN
        IF v_linked_id IS NOT NULL THEN
            DELETE FROM daily_entries WHERE id = v_linked_id;
        END IF;
        RETURN NEW;
    END IF;

    v_commission  := NEW.txn_amount - NEW.settled_amount;
    v_settle_date := COALESCE(NEW.settlement_date, NEW.entry_date);

    SELECT id INTO v_bank_charges_cat
    FROM expense_categories WHERE slug = 'bank_charges' LIMIT 1;

    IF v_bank_charges_cat IS NULL THEN
        RAISE WARNING 'sync_sale_bank_charges: bank_charges category missing; skipping';
        RETURN NEW;
    END IF;

    IF v_linked_id IS NULL THEN
        INSERT INTO daily_entries (
            entry_date, entry_type, narration, txn_amount, account_id,
            expense_category_id, linked_sale_id, notes, created_by
        ) VALUES (
            v_settle_date, 'expense',
            'Auto: bank charges from ' || COALESCE(NEW.narration, 'sale'),
            v_commission, NEW.account_id,
            v_bank_charges_cat, NEW.id,
            'Auto-created by sync_sale_bank_charges trigger. Edit the source sale to change.',
            'system'
        );
    ELSE
        UPDATE daily_entries SET
            entry_date          = v_settle_date,
            txn_amount          = v_commission,
            account_id          = NEW.account_id,
            narration           = 'Auto: bank charges from ' || COALESCE(NEW.narration, 'sale'),
            updated_at          = NOW()
        WHERE id = v_linked_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sale_bank_charges ON daily_entries;
CREATE TRIGGER trg_sync_sale_bank_charges
    AFTER INSERT OR UPDATE OF settled_amount, txn_amount, account_id, settlement_date, entry_date, narration
    ON daily_entries
    FOR EACH ROW
    WHEN (NEW.entry_type = 'sale')
    EXECUTE FUNCTION sync_sale_bank_charges();

-- =============================================================================
-- 3. Backfill — for existing sales with commission and no linked charge
-- =============================================================================
INSERT INTO daily_entries (
    entry_date, entry_type, narration, txn_amount, account_id,
    expense_category_id, linked_sale_id, notes, created_by
)
SELECT
    COALESCE(s.settlement_date, s.entry_date),
    'expense',
    'Auto: bank charges from ' || COALESCE(s.narration, 'sale'),
    s.txn_amount - s.settled_amount,
    s.account_id,
    (SELECT id FROM expense_categories WHERE slug = 'bank_charges'),
    s.id,
    'Backfilled by migration 018.',
    'system'
FROM daily_entries s
WHERE s.entry_type = 'sale'
  AND s.settled_amount IS NOT NULL
  AND s.settled_amount < s.txn_amount
  AND s.account_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM daily_entries d WHERE d.linked_sale_id = s.id);

-- =============================================================================
-- 4. Update daily_book_bank_ledger — SALE credit = txn_amount, on settlement_date
--    Linked bank-charges expense rows already debit account_id, so the net
--    effect equals the settled amount.
-- =============================================================================
DROP VIEW IF EXISTS daily_book_bank_ledger CASCADE;
CREATE OR REPLACE VIEW daily_book_bank_ledger AS
WITH movements AS (
    -- SALE: credit FULL txn_amount on settlement_date (or entry_date fallback)
    SELECT
        COALESCE(de.settlement_date, de.entry_date) AS entry_date,
        de.account_id,
        de.txn_amount AS credit,
        0::NUMERIC AS debit
    FROM daily_entries de
    WHERE de.entry_type = 'sale' AND de.account_id IS NOT NULL

    UNION ALL
    -- EXPENSE (non-CR.NOTE) — includes manually-entered AND auto-linked bank charges
    SELECT de.entry_date, de.account_id, 0::NUMERIC, de.txn_amount
    FROM daily_entries de
    JOIN expense_categories ec ON ec.id = de.expense_category_id
    WHERE de.entry_type = 'expense' AND ec.is_credit_note = FALSE

    UNION ALL
    -- CR.NOTE refund INTO account_id (credit)
    SELECT de.entry_date, de.account_id, de.txn_amount, 0::NUMERIC
    FROM daily_entries de
    JOIN expense_categories ec ON ec.id = de.expense_category_id
    WHERE de.entry_type = 'expense' AND ec.is_credit_note = TRUE

    UNION ALL
    -- Bank transfer / cash deposit OUT
    SELECT de.entry_date, de.account_id, 0::NUMERIC, de.txn_amount
    FROM daily_entries de
    WHERE de.entry_type IN ('bank_transfer', 'cash_deposit') AND de.account_id IS NOT NULL

    UNION ALL
    -- Bank transfer / cash deposit IN
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
-- 5. Update daily_book_account_balances to match (SALE credit = txn_amount)
--    movements use entry_date for non-sales, settlement_date for sales.
-- =============================================================================
DROP VIEW IF EXISTS daily_book_account_balances CASCADE;
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
        SELECT de.account_id,
               COALESCE(de.settlement_date, de.entry_date) AS entry_date,
               de.txn_amount AS net_change
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
    COALESCE(
        (SELECT SUM(m.net_change) FROM movements m WHERE m.account_id = a.id),
        0
    ) AS lifetime_net,
    a.is_active,
    a.sort_order
FROM accounts a
LEFT JOIN latest_opening lo ON lo.account_id = a.id
ORDER BY a.sort_order, a.name;
