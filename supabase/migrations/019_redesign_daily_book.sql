-- =============================================================================
-- Migration 019: Daily Book redesign — Direction × Scope model
-- =============================================================================
-- The Daily Book is reshaped around 4 buckets of money:
--    BUSINESS INCOME  / BUSINESS EXPENSE
--    PERSONAL INCOME  / PERSONAL EXPENSE
-- ...plus two utility transaction types: CASH_COUNT and TRANSFER.
--
-- Accounts (CASH/HDFC/MAHESH BANK) hold both personal and business money
-- mixed. Every entry must tag its direction + scope + payment mode + category.
-- Categories and modes are fully user-managed (CRUD) — only seeded with
-- sensible defaults.
--
-- What this drops (must already be empty — no transactional data lost):
--   * Tables: sale_channels, expense_categories, daily_entries,
--             cash_denominations
--   * Views: daily_book_sales_summary, daily_book_expense_summary,
--            daily_book_bank_ledger, daily_book_account_balances,
--            daily_book_closing_balance, daily_book_payment_reconciliation
--   * Trigger: trg_sync_sale_bank_charges (recreated on new table)
--
-- What this preserves:
--   * accounts (and their opening_balance values)
--   * account_opening_balances (monthly opening overrides)
--   * The update_updated_at_column() trigger function (used elsewhere)
--
-- Run AFTER migration 018.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Safety check: refuse to run if daily_entries holds any data.
-- The user explicitly stated no daily data was loaded; this is belt+braces.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM daily_entries;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Refusing to run migration 019: daily_entries has % rows. '
                    'Back them up first, then DELETE them, then re-run.', v_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Drop dependents first (views), then trigger, then tables.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS daily_book_payment_reconciliation CASCADE;
DROP VIEW IF EXISTS daily_book_closing_balance        CASCADE;
DROP VIEW IF EXISTS daily_book_account_balances       CASCADE;
DROP VIEW IF EXISTS daily_book_bank_ledger            CASCADE;
DROP VIEW IF EXISTS daily_book_expense_summary        CASCADE;
DROP VIEW IF EXISTS daily_book_sales_summary          CASCADE;

DROP TRIGGER IF EXISTS trg_sync_sale_bank_charges ON daily_entries;
DROP FUNCTION IF EXISTS sync_sale_bank_charges() CASCADE;

DROP TABLE IF EXISTS cash_denominations    CASCADE;
DROP TABLE IF EXISTS daily_entries          CASCADE;
DROP TABLE IF EXISTS sale_channels          CASCADE;
DROP TABLE IF EXISTS expense_categories     CASCADE;

-- =============================================================================
-- 1. PAYMENT_MODES  (Cash / UPI/QR / Online Banking / POS Card / Cheque …)
-- =============================================================================
CREATE TABLE payment_modes (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(50)  UNIQUE NOT NULL,
    slug            VARCHAR(50)  UNIQUE NOT NULL,
    has_commission  BOOLEAN      DEFAULT FALSE,    -- TRUE for POS Card, QR/UPI (sometimes delayed settlement)
    sort_order      INTEGER      DEFAULT 100,
    is_active       BOOLEAN      DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX idx_payment_modes_active ON payment_modes(is_active) WHERE is_active = TRUE;

CREATE TRIGGER trg_payment_modes_updated_at
    BEFORE UPDATE ON payment_modes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO payment_modes (name, slug, has_commission, sort_order) VALUES
    ('Cash',                'cash',     FALSE, 10),
    ('UPI / QR',            'upi_qr',   TRUE,  20),
    ('Online Banking',      'online',   FALSE, 30),
    ('POS Card',            'pos_card', TRUE,  40),
    ('Cheque',              'cheque',   FALSE, 50);

ALTER TABLE payment_modes DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. CATEGORIES  (scoped by direction × scope)
-- =============================================================================
CREATE TABLE categories (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(80)  NOT NULL,
    slug            VARCHAR(80)  NOT NULL,
    direction       VARCHAR(10)  NOT NULL CHECK (direction IN ('income', 'expense')),
    scope           VARCHAR(10)  NOT NULL CHECK (scope IN ('business', 'personal')),
    is_credit_note  BOOLEAN      DEFAULT FALSE,   -- refunds / money flowing back
    sort_order      INTEGER      DEFAULT 100,
    is_active       BOOLEAN      DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (direction, scope, slug)
);
CREATE INDEX idx_categories_lookup ON categories (direction, scope, is_active, sort_order);

CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: BUSINESS INCOME
INSERT INTO categories (name, slug, direction, scope, sort_order) VALUES
    ('Sales (Walk-in)',     'sales_walkin',    'income', 'business', 10),
    ('Sales (Credit)',      'sales_credit',    'income', 'business', 20),
    ('Refund from supplier','refund_supplier', 'income', 'business', 30),
    ('Other Business Income','other_biz_income','income','business', 90);

-- Seed: BUSINESS EXPENSE
INSERT INTO categories (name, slug, direction, scope, sort_order) VALUES
    ('Purchase / Stock', 'purchase',     'expense', 'business', 10),
    ('Salary',           'salary',       'expense', 'business', 20),
    ('Rent',             'rent',         'expense', 'business', 30),
    ('Electricity',      'electricity',  'expense', 'business', 40),
    ('Transport',        'transport',    'expense', 'business', 50),
    ('Diesel',           'diesel',       'expense', 'business', 60),
    ('Bank Charges',     'bank_charges', 'expense', 'business', 70),
    ('Clearing',         'clearing',     'expense', 'business', 80),
    ('Other Business Expense', 'other_biz_expense', 'expense', 'business', 90);

-- Seed: PERSONAL INCOME
INSERT INTO categories (name, slug, direction, scope, sort_order) VALUES
    ('Salary credit',    'pers_salary',  'income', 'personal', 10),
    ('Dividend / Interest','dividend',   'income', 'personal', 20),
    ('Gift received',    'gift_in',      'income', 'personal', 30),
    ('Refund',           'refund_in',    'income', 'personal', 40),
    ('Other Personal Income', 'other_pers_income', 'income', 'personal', 90);

-- Seed: PERSONAL EXPENSE
INSERT INTO categories (name, slug, direction, scope, sort_order) VALUES
    ('Groceries',        'groceries',    'expense', 'personal', 10),
    ('Fuel (personal)',  'fuel_pers',    'expense', 'personal', 20),
    ('Family / Household','family',      'expense', 'personal', 30),
    ('Medical',          'medical',      'expense', 'personal', 40),
    ('Education',        'education',    'expense', 'personal', 50),
    ('Travel',           'travel',       'expense', 'personal', 60),
    ('Hospital',         'hospital',     'expense', 'personal', 70),
    ('Other Personal Expense', 'other_pers_expense', 'expense', 'personal', 90);

ALTER TABLE categories DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. DAILY_ENTRIES  (universal log)
-- =============================================================================
CREATE TABLE daily_entries (
    id                          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_date                  DATE         NOT NULL,         -- transaction date
    settlement_date             DATE,                          -- when bank actually credited (optional, sales w/ commission)
    -- Coarse type. Most entries are 'entry'; cash_count + transfer are utility types.
    txn_type                    VARCHAR(15)  NOT NULL CHECK (txn_type IN ('entry', 'cash_count', 'transfer')),
    -- Required for txn_type='entry', NULL for cash_count + transfer
    direction                   VARCHAR(10)  CHECK (direction IS NULL OR direction IN ('income', 'expense')),
    scope                       VARCHAR(10)  CHECK (scope IS NULL OR scope IN ('business', 'personal')),
    -- The account this entry touches (source for expense/transfer-out/cash_deposit-out, dest for income, the cash drawer for cash_count)
    account_id                  UUID         REFERENCES accounts(id),
    -- For txn_type='transfer' only: destination account
    transfer_to_account_id      UUID         REFERENCES accounts(id),
    -- For txn_type='entry': payment mode + category. NULL for non-'entry' types.
    mode_id                     UUID         REFERENCES payment_modes(id),
    category_id                 UUID         REFERENCES categories(id),
    -- Amounts
    txn_amount                  NUMERIC(14, 2) NOT NULL CHECK (txn_amount >= 0),
    settled_amount              NUMERIC(14, 2),   -- gross-minus-commission, when applicable
    -- Free-text fields
    narration                   TEXT,
    notes                       TEXT,
    -- For auto-created BANK CHARGES expense rows (settlement commissions)
    linked_entry_id             UUID         REFERENCES daily_entries(id) ON DELETE CASCADE,
    linked_role                 VARCHAR(30),                       -- 'auto_bank_charges' for now
    -- Audit
    created_at                  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  DEFAULT NOW(),
    created_by                  VARCHAR(50)  DEFAULT 'manager',
    -- Shape enforcement
    CHECK (
        (txn_type = 'entry'      AND direction IS NOT NULL AND scope IS NOT NULL AND account_id IS NOT NULL AND mode_id IS NOT NULL AND category_id IS NOT NULL) OR
        (txn_type = 'cash_count' AND direction IS NULL AND scope IS NULL AND account_id IS NOT NULL) OR
        (txn_type = 'transfer'   AND direction IS NULL AND scope IS NULL AND account_id IS NOT NULL AND transfer_to_account_id IS NOT NULL AND account_id <> transfer_to_account_id)
    )
);
CREATE INDEX idx_daily_entries_date            ON daily_entries(entry_date DESC);
CREATE INDEX idx_daily_entries_txn_type        ON daily_entries(txn_type);
CREATE INDEX idx_daily_entries_dir_scope       ON daily_entries(direction, scope) WHERE direction IS NOT NULL;
CREATE INDEX idx_daily_entries_account         ON daily_entries(account_id);
CREATE INDEX idx_daily_entries_transfer        ON daily_entries(transfer_to_account_id) WHERE transfer_to_account_id IS NOT NULL;
CREATE INDEX idx_daily_entries_settlement_date ON daily_entries(settlement_date) WHERE settlement_date IS NOT NULL;
CREATE INDEX idx_daily_entries_linked          ON daily_entries(linked_entry_id) WHERE linked_entry_id IS NOT NULL;

CREATE TRIGGER trg_daily_entries_updated_at
    BEFORE UPDATE ON daily_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE daily_entries DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. CASH_DENOMINATIONS  (per-day breakdown — same shape as before)
-- =============================================================================
CREATE TABLE cash_denominations (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    count_date          DATE         NOT NULL,
    denomination        INTEGER      NOT NULL CHECK (denomination IN (500, 200, 100, 50, 20, 10, 5, 2, 1)),
    count               INTEGER      NOT NULL DEFAULT 0 CHECK (count >= 0),
    daily_entry_id      UUID         REFERENCES daily_entries(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (count_date, denomination)
);
CREATE INDEX idx_cash_denominations_date ON cash_denominations(count_date DESC);

ALTER TABLE cash_denominations DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 5. TRIGGER — auto bank charges for INCOME entries with commission
-- =============================================================================
-- When an INCOME entry has a payment_mode.has_commission=TRUE AND
-- settled_amount < txn_amount, this trigger ensures a linked EXPENSE
-- (scope=same as the income, category=Bank Charges) exists for the difference.
-- The linked row sits on settlement_date (or entry_date fallback), against the
-- same account, with linked_entry_id pointing back to the source income.
-- On parent DELETE, ON DELETE CASCADE removes the linked row.
CREATE OR REPLACE FUNCTION sync_income_bank_charges()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_commission     NUMERIC(14, 2);
    v_settle_date    DATE;
    v_linked_id      UUID;
    v_bank_charges_cat UUID;
    v_mode_commission BOOLEAN;
BEGIN
    -- Only react to txn_type='entry' + direction='income' rows
    IF NEW.txn_type <> 'entry' THEN RETURN NEW; END IF;
    IF NEW.direction <> 'income' THEN RETURN NEW; END IF;

    -- Skip if this row IS a linked expense (avoid recursion via UPDATE)
    IF NEW.linked_entry_id IS NOT NULL THEN RETURN NEW; END IF;

    SELECT pm.has_commission INTO v_mode_commission
    FROM payment_modes pm WHERE pm.id = NEW.mode_id;

    SELECT id INTO v_linked_id
    FROM daily_entries WHERE linked_entry_id = NEW.id LIMIT 1;

    -- Conditions for no linked charge:
    IF NEW.settled_amount IS NULL
       OR NEW.settled_amount >= NEW.txn_amount
       OR NEW.account_id IS NULL
       OR COALESCE(v_mode_commission, FALSE) = FALSE THEN
        IF v_linked_id IS NOT NULL THEN
            DELETE FROM daily_entries WHERE id = v_linked_id;
        END IF;
        RETURN NEW;
    END IF;

    v_commission  := NEW.txn_amount - NEW.settled_amount;
    v_settle_date := COALESCE(NEW.settlement_date, NEW.entry_date);

    -- Bank Charges category (business scope) — the auto-row sits in the
    -- SAME scope as the parent income (matches user's mental model: a personal
    -- UPI receipt's commission is a personal expense). If the parent is
    -- business income, look up business bank_charges; if personal, look up
    -- personal "Other" expense (we don't seed a personal bank_charges).
    IF NEW.scope = 'business' THEN
        SELECT id INTO v_bank_charges_cat
        FROM categories
        WHERE direction = 'expense' AND scope = 'business' AND slug = 'bank_charges'
        LIMIT 1;
    ELSE
        SELECT id INTO v_bank_charges_cat
        FROM categories
        WHERE direction = 'expense' AND scope = 'personal' AND slug = 'other_pers_expense'
        LIMIT 1;
    END IF;

    IF v_bank_charges_cat IS NULL THEN
        RAISE WARNING 'sync_income_bank_charges: bank charges category missing for scope=%; skipping', NEW.scope;
        RETURN NEW;
    END IF;

    IF v_linked_id IS NULL THEN
        INSERT INTO daily_entries (
            entry_date, txn_type, direction, scope, narration, txn_amount,
            account_id, mode_id, category_id,
            linked_entry_id, linked_role, notes, created_by
        ) VALUES (
            v_settle_date, 'entry', 'expense', NEW.scope,
            'Auto: bank charges from ' || COALESCE(NEW.narration, 'income'),
            v_commission, NEW.account_id, NEW.mode_id, v_bank_charges_cat,
            NEW.id, 'auto_bank_charges',
            'Auto-managed. Edit the source income to change.',
            'system'
        );
    ELSE
        UPDATE daily_entries SET
            entry_date  = v_settle_date,
            txn_amount  = v_commission,
            account_id  = NEW.account_id,
            mode_id     = NEW.mode_id,
            category_id = v_bank_charges_cat,
            scope       = NEW.scope,
            narration   = 'Auto: bank charges from ' || COALESCE(NEW.narration, 'income'),
            updated_at  = NOW()
        WHERE id = v_linked_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_income_bank_charges
    AFTER INSERT OR UPDATE OF settled_amount, txn_amount, account_id, settlement_date, entry_date, narration, scope, mode_id
    ON daily_entries
    FOR EACH ROW
    WHEN (NEW.txn_type = 'entry' AND NEW.direction = 'income')
    EXECUTE FUNCTION sync_income_bank_charges();

-- =============================================================================
-- 6. VIEW — daily_book_account_balances
-- =============================================================================
-- Per-account current balance using inception opening + monthly opening
-- override (from migration 017) + sum of movements.
CREATE OR REPLACE VIEW daily_book_account_balances AS
WITH latest_opening AS (
    SELECT DISTINCT ON (account_id)
        account_id, amount, effective_date
    FROM account_opening_balances
    WHERE effective_date <= CURRENT_DATE
    ORDER BY account_id, effective_date DESC
),
movements AS (
    -- INCOME entries credit account on settlement_date (or entry_date) for txn_amount
    SELECT de.account_id, COALESCE(de.settlement_date, de.entry_date) AS movement_date, de.txn_amount AS net_change
    FROM daily_entries de
    WHERE de.txn_type = 'entry' AND de.direction = 'income' AND de.account_id IS NOT NULL

    UNION ALL
    -- EXPENSE entries debit account on entry_date
    SELECT de.account_id, de.entry_date, -de.txn_amount
    FROM daily_entries de
    LEFT JOIN categories c ON c.id = de.category_id
    WHERE de.txn_type = 'entry' AND de.direction = 'expense'
      AND (c.is_credit_note IS NULL OR c.is_credit_note = FALSE)

    UNION ALL
    -- EXPENSE entries with is_credit_note=TRUE are refunds — credit
    SELECT de.account_id, de.entry_date, de.txn_amount
    FROM daily_entries de
    JOIN categories c ON c.id = de.category_id
    WHERE de.txn_type = 'entry' AND de.direction = 'expense' AND c.is_credit_note = TRUE

    UNION ALL
    -- TRANSFER out
    SELECT de.account_id, de.entry_date, -de.txn_amount
    FROM daily_entries de
    WHERE de.txn_type = 'transfer'

    UNION ALL
    -- TRANSFER in
    SELECT de.transfer_to_account_id, de.entry_date, de.txn_amount
    FROM daily_entries de
    WHERE de.txn_type = 'transfer' AND de.transfer_to_account_id IS NOT NULL
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
           AND m.movement_date >= COALESCE(lo.effective_date, DATE '1900-01-01')),
        0
    ) AS movements_since_baseline,
    COALESCE(lo.amount, a.opening_balance) + COALESCE(
        (SELECT SUM(m.net_change) FROM movements m
         WHERE m.account_id = a.id
           AND m.movement_date >= COALESCE(lo.effective_date, DATE '1900-01-01')),
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

-- =============================================================================
-- 7. VIEW — daily_book_bank_ledger
-- =============================================================================
-- Per account, per date: credit / debit / running balance.
-- Same baseline logic as account_balances (monthly opening or inception).
CREATE OR REPLACE VIEW daily_book_bank_ledger AS
WITH movements AS (
    SELECT de.account_id, COALESCE(de.settlement_date, de.entry_date) AS entry_date,
           de.txn_amount AS credit, 0::NUMERIC AS debit
    FROM daily_entries de
    WHERE de.txn_type = 'entry' AND de.direction = 'income' AND de.account_id IS NOT NULL

    UNION ALL
    SELECT de.account_id, de.entry_date, 0::NUMERIC, de.txn_amount
    FROM daily_entries de
    LEFT JOIN categories c ON c.id = de.category_id
    WHERE de.txn_type = 'entry' AND de.direction = 'expense'
      AND (c.is_credit_note IS NULL OR c.is_credit_note = FALSE)

    UNION ALL
    SELECT de.account_id, de.entry_date, de.txn_amount, 0::NUMERIC
    FROM daily_entries de
    JOIN categories c ON c.id = de.category_id
    WHERE de.txn_type = 'entry' AND de.direction = 'expense' AND c.is_credit_note = TRUE

    UNION ALL
    SELECT de.account_id, de.entry_date, 0::NUMERIC, de.txn_amount
    FROM daily_entries de
    WHERE de.txn_type = 'transfer'

    UNION ALL
    SELECT de.transfer_to_account_id, de.entry_date, de.txn_amount, 0::NUMERIC
    FROM daily_entries de
    WHERE de.txn_type = 'transfer' AND de.transfer_to_account_id IS NOT NULL
),
daily AS (
    SELECT m.account_id, m.entry_date,
           SUM(m.credit) AS total_credit, SUM(m.debit) AS total_debit,
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
    wb.account_id, wb.account_name, wb.account_short_name, wb.account_kind,
    wb.entry_date, wb.total_credit, wb.total_debit, wb.net_change,
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
-- 8. VIEW — daily_book_summary (the unified replacement)
-- =============================================================================
-- For any date range, sum txn_amount by direction × scope × category.
-- Convenient single view for the new "Daily Book Summary" page.
CREATE OR REPLACE VIEW daily_book_summary AS
SELECT
    de.entry_date,
    de.direction,
    de.scope,
    de.category_id,
    c.name AS category_name,
    c.slug AS category_slug,
    de.mode_id,
    pm.name AS mode_name,
    SUM(de.txn_amount) AS total,
    COUNT(*) AS entry_count
FROM daily_entries de
JOIN categories c    ON c.id = de.category_id
JOIN payment_modes pm ON pm.id = de.mode_id
WHERE de.txn_type = 'entry'
GROUP BY de.entry_date, de.direction, de.scope,
         de.category_id, c.name, c.slug,
         de.mode_id, pm.name
ORDER BY de.entry_date DESC, de.direction, de.scope, c.sort_order, pm.sort_order;
