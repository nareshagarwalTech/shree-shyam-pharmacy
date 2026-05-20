-- =============================================================================
-- Migration 016: Daily Book — operations-side accounting
-- =============================================================================
-- Replaces the manual Excel DAILYBOOK_SSP workbook with database-backed
-- entry, summaries, bank ledgers, and cash reconciliation.
--
-- Tables:
--   accounts             — funds locations (CASH, HDFC, MAHESH BANK…)
--   expense_categories   — buckets (PURCHASE, SALARY, …, CR.NOTE)
--   sale_channels        — sale categories (POS, QR, ONLINE, CREDIT, CASH)
--   daily_entries        — universal transaction log (sale/expense/cash_count/
--                          bank_transfer/cash_deposit)
--   cash_denominations   — per-day breakdown of physical cash counted
--
-- Views (computed off daily_entries):
--   daily_book_sales_summary       (by date × channel)
--   daily_book_expense_summary     (by date × category)
--   daily_book_bank_ledger         (running balance per bank account)
--   daily_book_closing_balance     (daily cash reconciliation)
--   daily_book_account_balances    (current balance snapshot per account)
--   daily_book_payment_reconciliation (vs existing payments table)
--
-- Run AFTER migration 015 in the SQL editor (or via psql).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Idempotency: drop dependents first.
DROP VIEW  IF EXISTS daily_book_payment_reconciliation CASCADE;
DROP VIEW  IF EXISTS daily_book_account_balances       CASCADE;
DROP VIEW  IF EXISTS daily_book_closing_balance        CASCADE;
DROP VIEW  IF EXISTS daily_book_bank_ledger            CASCADE;
DROP VIEW  IF EXISTS daily_book_expense_summary        CASCADE;
DROP VIEW  IF EXISTS daily_book_sales_summary          CASCADE;
DROP TABLE IF EXISTS cash_denominations                CASCADE;
DROP TABLE IF EXISTS daily_entries                     CASCADE;
DROP TABLE IF EXISTS sale_channels                     CASCADE;
DROP TABLE IF EXISTS expense_categories                CASCADE;
DROP TABLE IF EXISTS accounts                          CASCADE;

-- =============================================================================
-- 1. ACCOUNTS  (where money lives)
-- =============================================================================
CREATE TABLE accounts (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(50)  UNIQUE NOT NULL,
    short_name      VARCHAR(20),
    kind            VARCHAR(20)  NOT NULL CHECK (kind IN ('cash', 'bank', 'pos', 'qr', 'other')),
    opening_balance NUMERIC(14, 2) DEFAULT 0,
    sort_order      INTEGER      DEFAULT 100,
    is_active       BOOLEAN      DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX idx_accounts_kind ON accounts(kind) WHERE is_active = TRUE;

INSERT INTO accounts (name, short_name, kind, sort_order, opening_balance) VALUES
    ('CASH',        'Cash',   'cash', 10, 0),
    ('HDFC',        'HDFC',   'bank', 20, 0),
    ('MAHESH BANK', 'Mahesh', 'bank', 30, 0);

-- =============================================================================
-- 2. EXPENSE_CATEGORIES
-- =============================================================================
CREATE TABLE expense_categories (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(50)  UNIQUE NOT NULL,
    slug            VARCHAR(50)  UNIQUE NOT NULL,
    sort_order      INTEGER      DEFAULT 100,
    is_credit_note  BOOLEAN      DEFAULT FALSE,   -- CR.NOTE → money received back; subtracted from totals
    is_active       BOOLEAN      DEFAULT TRUE,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

INSERT INTO expense_categories (name, slug, sort_order, is_credit_note) VALUES
    ('PURCHASE',      'purchase',      10, FALSE),
    ('SALARY',        'salary',        20, FALSE),
    ('RENT',          'rent',          30, FALSE),
    ('ELECTRICITY',   'electricity',   40, FALSE),
    ('TRANSPORT',     'transport',     50, FALSE),
    ('DIESEL',        'diesel',        60, FALSE),
    ('HOME EXPENSES', 'home_expenses', 70, FALSE),
    ('BANK CHARGES',  'bank_charges',  80, FALSE),
    ('OTHER',         'other',         90, FALSE),
    ('CLEARING',      'clearing',     100, FALSE),
    ('CR.NOTE',       'cr_note',      999, TRUE);

-- =============================================================================
-- 3. SALE_CHANNELS  (POS / QR / ONLINE / CREDIT / CASH)
-- =============================================================================
CREATE TABLE sale_channels (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(50)  UNIQUE NOT NULL,
    slug                VARCHAR(50)  UNIQUE NOT NULL,
    default_account_id  UUID         REFERENCES accounts(id),
    has_commission      BOOLEAN      DEFAULT FALSE,    -- POS/QR may have commission; ONLINE/CREDIT/CASH don't
    sort_order          INTEGER      DEFAULT 100,
    is_active           BOOLEAN      DEFAULT TRUE,
    created_at          TIMESTAMPTZ  DEFAULT NOW()
);

-- Seed sale channels, wiring their default account at insert time.
INSERT INTO sale_channels (name, slug, default_account_id, has_commission, sort_order)
SELECT 'POS',    'pos',    (SELECT id FROM accounts WHERE name = 'HDFC'), TRUE,  10
UNION ALL SELECT 'QR',     'qr',     (SELECT id FROM accounts WHERE name = 'HDFC'), TRUE,  20
UNION ALL SELECT 'ONLINE', 'online', (SELECT id FROM accounts WHERE name = 'HDFC'), FALSE, 30
UNION ALL SELECT 'CREDIT', 'credit', NULL,                                          FALSE, 40
UNION ALL SELECT 'CASH',   'cash',   (SELECT id FROM accounts WHERE name = 'CASH'), FALSE, 50;

-- =============================================================================
-- 4. DAILY_ENTRIES  (universal transaction log)
-- =============================================================================
CREATE TABLE daily_entries (
    id                          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_date                  DATE         NOT NULL,
    entry_type                  VARCHAR(20)  NOT NULL CHECK (entry_type IN ('sale', 'expense', 'cash_count', 'bank_transfer', 'cash_deposit')),
    narration                   TEXT,
    txn_amount                  NUMERIC(14, 2) NOT NULL,
    settled_amount              NUMERIC(14, 2),                 -- for SALE rows with commission; NULL otherwise
    -- Polymorphic FKs — only one set per entry_type:
    account_id                  UUID REFERENCES accounts(id),            -- primary account touched (cash account for cash_count; source for transfer/deposit; settled-to for sale; from for expense)
    transfer_to_account_id      UUID REFERENCES accounts(id),            -- destination for bank_transfer / cash_deposit
    expense_category_id         UUID REFERENCES expense_categories(id),  -- expense entries
    sale_channel_id             UUID REFERENCES sale_channels(id),       -- sale entries
    notes                       TEXT,
    created_at                  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  DEFAULT NOW(),
    created_by                  VARCHAR(50)  DEFAULT 'manager',
    -- Light shape enforcement; UI applies the strict version:
    CHECK (
        (entry_type = 'sale'          AND sale_channel_id     IS NOT NULL) OR
        (entry_type = 'expense'       AND expense_category_id IS NOT NULL AND account_id IS NOT NULL) OR
        (entry_type = 'cash_count'    AND account_id          IS NOT NULL) OR
        (entry_type = 'bank_transfer' AND account_id          IS NOT NULL AND transfer_to_account_id IS NOT NULL) OR
        (entry_type = 'cash_deposit'  AND account_id          IS NOT NULL AND transfer_to_account_id IS NOT NULL)
    )
);
CREATE INDEX idx_daily_entries_date     ON daily_entries(entry_date DESC);
CREATE INDEX idx_daily_entries_type     ON daily_entries(entry_type);
CREATE INDEX idx_daily_entries_account  ON daily_entries(account_id);
CREATE INDEX idx_daily_entries_transfer ON daily_entries(transfer_to_account_id) WHERE transfer_to_account_id IS NOT NULL;

-- =============================================================================
-- 5. CASH_DENOMINATIONS  (daily breakdown of physical cash counted)
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

-- =============================================================================
-- updated_at triggers (reuses function from migration 001)
-- =============================================================================
CREATE TRIGGER trg_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_daily_entries_updated_at
    BEFORE UPDATE ON daily_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS disabled — matches existing single-tenant pattern (migrations 002/008/009)
-- =============================================================================
ALTER TABLE accounts              DISABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories    DISABLE ROW LEVEL SECURITY;
ALTER TABLE sale_channels         DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_entries         DISABLE ROW LEVEL SECURITY;
ALTER TABLE cash_denominations    DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- VIEW: daily_book_sales_summary  (pivot SALEs by date × channel)
-- =============================================================================
CREATE OR REPLACE VIEW daily_book_sales_summary AS
SELECT
    de.entry_date,
    COALESCE(SUM(de.txn_amount)     FILTER (WHERE sc.slug = 'pos'),    0) AS pos_txn,
    COALESCE(SUM(de.settled_amount) FILTER (WHERE sc.slug = 'pos'),    0) AS pos_settled,
    COALESCE(SUM(de.txn_amount - COALESCE(de.settled_amount, de.txn_amount)) FILTER (WHERE sc.slug = 'pos'), 0) AS pos_commission,
    COALESCE(SUM(de.txn_amount)     FILTER (WHERE sc.slug = 'qr'),     0) AS qr_txn,
    COALESCE(SUM(de.settled_amount) FILTER (WHERE sc.slug = 'qr'),     0) AS qr_settled,
    COALESCE(SUM(de.txn_amount - COALESCE(de.settled_amount, de.txn_amount)) FILTER (WHERE sc.slug = 'qr'), 0) AS qr_commission,
    COALESCE(SUM(de.txn_amount)     FILTER (WHERE sc.slug = 'online'), 0) AS online_amt,
    COALESCE(SUM(de.txn_amount)     FILTER (WHERE sc.slug = 'credit'), 0) AS credit_amt,
    COALESCE(SUM(de.txn_amount)     FILTER (WHERE sc.slug = 'cash'),   0) AS cash_sales,
    COALESCE(SUM(de.txn_amount),                                       0) AS total_sales,
    COUNT(*) AS entry_count
FROM daily_entries de
LEFT JOIN sale_channels sc ON sc.id = de.sale_channel_id
WHERE de.entry_type = 'sale'
GROUP BY de.entry_date
ORDER BY de.entry_date DESC;

-- =============================================================================
-- VIEW: daily_book_expense_summary  (pivot EXPENSEs by date × category)
-- =============================================================================
CREATE OR REPLACE VIEW daily_book_expense_summary AS
SELECT
    de.entry_date,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.slug = 'purchase'),      0) AS purchase,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.slug = 'salary'),        0) AS salary,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.slug = 'rent'),          0) AS rent,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.slug = 'electricity'),   0) AS electricity,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.slug = 'transport'),     0) AS transport,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.slug = 'diesel'),        0) AS diesel,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.slug = 'home_expenses'), 0) AS home_expenses,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.slug = 'bank_charges'),  0) AS bank_charges,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.slug = 'other'),         0) AS other,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.slug = 'clearing'),      0) AS clearing,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.is_credit_note = FALSE), 0) AS total_expense,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.is_credit_note = TRUE),  0) AS cr_note,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.is_credit_note = FALSE), 0)
      - COALESCE(SUM(de.txn_amount) FILTER (WHERE ec.is_credit_note = TRUE), 0) AS net_expense
FROM daily_entries de
JOIN expense_categories ec ON ec.id = de.expense_category_id
WHERE de.entry_type = 'expense'
GROUP BY de.entry_date
ORDER BY de.entry_date DESC;

-- =============================================================================
-- VIEW: daily_book_bank_ledger  (running balance per account per date)
-- =============================================================================
-- Per account, per date: total credits (money IN) and debits (money OUT), plus
-- a running balance using opening_balance as the start.
-- Credits: sale (settled into this account), bank_transfer/cash_deposit INTO
-- this account, expense's CR.NOTE refunded into this account (currently expense
-- category w/ is_credit_note).
-- Debits: expense FROM this account, bank_transfer/cash_deposit OUT of this
-- account.
CREATE OR REPLACE VIEW daily_book_bank_ledger AS
WITH movements AS (
    -- Sale settled into account_id (credit)
    SELECT de.entry_date, de.account_id, COALESCE(de.settled_amount, de.txn_amount) AS credit, 0::NUMERIC AS debit
    FROM daily_entries de
    WHERE de.entry_type = 'sale' AND de.account_id IS NOT NULL

    UNION ALL
    -- Expense from account_id (debit)
    SELECT de.entry_date, de.account_id, 0::NUMERIC, de.txn_amount
    FROM daily_entries de
    JOIN expense_categories ec ON ec.id = de.expense_category_id
    WHERE de.entry_type = 'expense' AND ec.is_credit_note = FALSE

    UNION ALL
    -- CR.NOTE refund back INTO account_id (credit)
    SELECT de.entry_date, de.account_id, de.txn_amount, 0::NUMERIC
    FROM daily_entries de
    JOIN expense_categories ec ON ec.id = de.expense_category_id
    WHERE de.entry_type = 'expense' AND ec.is_credit_note = TRUE

    UNION ALL
    -- Bank transfer / cash deposit: OUT of source account (debit)
    SELECT de.entry_date, de.account_id, 0::NUMERIC, de.txn_amount
    FROM daily_entries de
    WHERE de.entry_type IN ('bank_transfer', 'cash_deposit') AND de.account_id IS NOT NULL

    UNION ALL
    -- Bank transfer / cash deposit: INTO destination account (credit)
    SELECT de.entry_date, de.transfer_to_account_id, de.txn_amount, 0::NUMERIC
    FROM daily_entries de
    WHERE de.entry_type IN ('bank_transfer', 'cash_deposit') AND de.transfer_to_account_id IS NOT NULL
),
daily AS (
    SELECT
        a.id          AS account_id,
        a.name        AS account_name,
        a.short_name  AS account_short_name,
        a.kind        AS account_kind,
        m.entry_date,
        SUM(m.credit) AS total_credit,
        SUM(m.debit)  AS total_debit,
        SUM(m.credit) - SUM(m.debit) AS net_change
    FROM movements m
    JOIN accounts a ON a.id = m.account_id
    GROUP BY a.id, a.name, a.short_name, a.kind, m.entry_date
)
SELECT
    d.account_id,
    d.account_name,
    d.account_short_name,
    d.account_kind,
    d.entry_date,
    d.total_credit,
    d.total_debit,
    d.net_change,
    a.opening_balance
      + SUM(d.net_change) OVER (PARTITION BY d.account_id ORDER BY d.entry_date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS opening_bal,
    a.opening_balance
      + SUM(d.net_change) OVER (PARTITION BY d.account_id ORDER BY d.entry_date)                                                  AS closing_bal
FROM daily d
JOIN accounts a ON a.id = d.account_id
ORDER BY d.account_id, d.entry_date DESC;

-- =============================================================================
-- VIEW: daily_book_account_balances  (current snapshot — one row per account)
-- =============================================================================
CREATE OR REPLACE VIEW daily_book_account_balances AS
WITH movements AS (
    SELECT account_id, SUM(net_change) AS lifetime_net FROM (
        -- (reuse same union shape as bank_ledger but un-grouped by date)
        SELECT de.account_id, COALESCE(de.settled_amount, de.txn_amount) AS net_change
        FROM daily_entries de WHERE de.entry_type = 'sale' AND de.account_id IS NOT NULL
        UNION ALL
        SELECT de.account_id, -de.txn_amount
        FROM daily_entries de
        JOIN expense_categories ec ON ec.id = de.expense_category_id
        WHERE de.entry_type = 'expense' AND ec.is_credit_note = FALSE
        UNION ALL
        SELECT de.account_id, de.txn_amount
        FROM daily_entries de
        JOIN expense_categories ec ON ec.id = de.expense_category_id
        WHERE de.entry_type = 'expense' AND ec.is_credit_note = TRUE
        UNION ALL
        SELECT de.account_id, -de.txn_amount
        FROM daily_entries de WHERE de.entry_type IN ('bank_transfer', 'cash_deposit') AND de.account_id IS NOT NULL
        UNION ALL
        SELECT de.transfer_to_account_id AS account_id, de.txn_amount
        FROM daily_entries de WHERE de.entry_type IN ('bank_transfer', 'cash_deposit') AND de.transfer_to_account_id IS NOT NULL
    ) x
    GROUP BY account_id
)
SELECT
    a.id            AS account_id,
    a.name          AS account_name,
    a.short_name    AS account_short_name,
    a.kind          AS account_kind,
    a.opening_balance,
    COALESCE(m.lifetime_net, 0) AS lifetime_net,
    a.opening_balance + COALESCE(m.lifetime_net, 0) AS current_balance,
    a.is_active,
    a.sort_order
FROM accounts a
LEFT JOIN movements m ON m.account_id = a.id
ORDER BY a.sort_order, a.name;

-- =============================================================================
-- VIEW: daily_book_closing_balance  (daily cash reconciliation)
-- =============================================================================
-- For each date with activity in CASH account: opening cash, cash sales, cash
-- expenses, cash deposits (out), latest cash count (actual), expected vs actual.
CREATE OR REPLACE VIEW daily_book_closing_balance AS
WITH cash_acct AS (SELECT id, opening_balance FROM accounts WHERE name = 'CASH'),
daily_cash AS (
    SELECT
        de.entry_date,
        COALESCE(SUM(de.txn_amount) FILTER (WHERE de.entry_type = 'sale'    AND sc.slug = 'cash'),      0) AS cash_sales,
        COALESCE(SUM(de.txn_amount) FILTER (WHERE de.entry_type = 'expense' AND ec.is_credit_note = FALSE AND de.account_id = ca.id), 0) AS cash_expenses,
        COALESCE(SUM(de.txn_amount) FILTER (WHERE de.entry_type = 'expense' AND ec.is_credit_note = TRUE  AND de.account_id = ca.id), 0) AS cash_cr_note,
        COALESCE(SUM(de.txn_amount) FILTER (WHERE de.entry_type IN ('bank_transfer', 'cash_deposit') AND de.account_id = ca.id), 0) AS cash_deposits_out,
        MAX(de.txn_amount)          FILTER (WHERE de.entry_type = 'cash_count') AS actual_cash
    FROM daily_entries de
    CROSS JOIN cash_acct ca
    LEFT JOIN sale_channels sc      ON sc.id = de.sale_channel_id
    LEFT JOIN expense_categories ec ON ec.id = de.expense_category_id
    GROUP BY de.entry_date
)
SELECT
    dc.entry_date,
    ca.opening_balance
      + COALESCE(SUM(dc.cash_sales - dc.cash_expenses + dc.cash_cr_note - dc.cash_deposits_out)
                 OVER (ORDER BY dc.entry_date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS opening_cash,
    dc.cash_sales,
    dc.cash_expenses,
    dc.cash_cr_note,
    dc.cash_deposits_out,
    dc.actual_cash,
    ca.opening_balance
      + SUM(dc.cash_sales - dc.cash_expenses + dc.cash_cr_note - dc.cash_deposits_out)
        OVER (ORDER BY dc.entry_date) AS expected_cash,
    dc.actual_cash - (
        ca.opening_balance
        + SUM(dc.cash_sales - dc.cash_expenses + dc.cash_cr_note - dc.cash_deposits_out)
          OVER (ORDER BY dc.entry_date)
    ) AS cash_diff
FROM daily_cash dc
CROSS JOIN cash_acct ca
ORDER BY dc.entry_date DESC;

-- =============================================================================
-- VIEW: daily_book_payment_reconciliation
--   Compare DAILY BOOK sales (aggregate by date) vs existing payments table
--   (per-customer payments). Same date should sum to roughly the same totals.
-- =============================================================================
CREATE OR REPLACE VIEW daily_book_payment_reconciliation AS
WITH db_sales AS (
    SELECT
        de.entry_date AS day,
        SUM(CASE WHEN sc.slug = 'cash'   THEN de.txn_amount ELSE 0 END) AS db_cash,
        SUM(CASE WHEN sc.slug = 'online' THEN de.txn_amount ELSE 0 END) AS db_online,
        SUM(CASE WHEN sc.slug IN ('pos', 'qr') THEN de.txn_amount ELSE 0 END) AS db_pos_qr,
        SUM(de.txn_amount) AS db_total
    FROM daily_entries de
    JOIN sale_channels sc ON sc.id = de.sale_channel_id
    WHERE de.entry_type = 'sale'
    GROUP BY de.entry_date
),
pmt AS (
    SELECT
        payment_date AS day,
        SUM(CASE WHEN mode = 'cash'   THEN amount ELSE 0 END) AS pmt_cash,
        SUM(CASE WHEN mode = 'online' THEN amount ELSE 0 END) AS pmt_online,
        SUM(CASE WHEN mode IN ('card', 'cheque', 'other') THEN amount ELSE 0 END) AS pmt_pos_qr,
        SUM(amount) AS pmt_total
    FROM payments
    GROUP BY payment_date
)
SELECT
    COALESCE(db.day, pmt.day) AS entry_date,
    COALESCE(db.db_cash,   0) AS daily_book_cash,
    COALESCE(pmt.pmt_cash, 0) AS payments_cash,
    COALESCE(db.db_cash, 0) - COALESCE(pmt.pmt_cash, 0) AS cash_diff,
    COALESCE(db.db_online,   0) AS daily_book_online,
    COALESCE(pmt.pmt_online, 0) AS payments_online,
    COALESCE(db.db_online, 0) - COALESCE(pmt.pmt_online, 0) AS online_diff,
    COALESCE(db.db_pos_qr,   0) AS daily_book_pos_qr,
    COALESCE(pmt.pmt_pos_qr, 0) AS payments_pos_qr,
    COALESCE(db.db_pos_qr, 0) - COALESCE(pmt.pmt_pos_qr, 0) AS pos_qr_diff,
    COALESCE(db.db_total,   0) AS daily_book_total,
    COALESCE(pmt.pmt_total, 0) AS payments_total,
    COALESCE(db.db_total, 0) - COALESCE(pmt.pmt_total, 0) AS total_diff
FROM db_sales db
FULL OUTER JOIN pmt ON db.day = pmt.day
ORDER BY entry_date DESC;
