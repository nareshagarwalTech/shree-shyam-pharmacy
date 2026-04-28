-- =============================================================================
-- Migration 001: Group + Sales-driven reminder model
-- =============================================================================
-- Replaces the medication-level reminder model with a customer-level,
-- sales-transaction-driven model matching the pharmacy's actual workflow.
--
-- Run this in Supabase SQL Editor on an empty / test project.
-- (Production deployment requires a backup + coordinated cutover.)
-- =============================================================================

-- Safety: ensure uuid generator is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Drop EVERYTHING (old + new) — idempotent re-run
-- =============================================================================
-- Views first (depend on tables)
DROP VIEW  IF EXISTS customer_with_groups   CASCADE;
DROP VIEW  IF EXISTS customer_next_reminder CASCADE;
DROP VIEW  IF EXISTS customer_reminders     CASCADE;

-- New tables
DROP TABLE IF EXISTS reminders          CASCADE;
DROP TABLE IF EXISTS import_batches     CASCADE;
DROP TABLE IF EXISTS sales_transactions CASCADE;
DROP TABLE IF EXISTS customer_groups    CASCADE;
DROP TABLE IF EXISTS groups             CASCADE;

-- Old tables
DROP TABLE IF EXISTS reminder_history   CASCADE;
DROP TABLE IF EXISTS medications        CASCADE;
DROP TABLE IF EXISTS customers          CASCADE;

-- Functions
DROP FUNCTION IF EXISTS compute_reminder_date()  CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- =============================================================================
-- 1. GROUPS (master list of customer groups / tags)
-- =============================================================================
CREATE TABLE groups (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) UNIQUE NOT NULL,
    slug        VARCHAR(100) UNIQUE NOT NULL,     -- url-friendly key, e.g. 'diabetes'
    description TEXT,
    color       VARCHAR(20)  DEFAULT '#1f6f4a',   -- tailwind hex for UI badges
    icon        VARCHAR(10),                       -- emoji for UI
    sort_order  INTEGER      DEFAULT 100,
    is_system   BOOLEAN      DEFAULT false,        -- seeded vs user-created
    is_active   BOOLEAN      DEFAULT true,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX idx_groups_slug ON groups(slug);

-- =============================================================================
-- 2. CUSTOMERS  (phone is the natural key)
-- =============================================================================
CREATE TABLE customers (
    id                      UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone                   VARCHAR(15)  NOT NULL,
    name                    VARCHAR(255) NOT NULL,
    alternate_phone         VARCHAR(15),
    address                 TEXT,
    email                   VARCHAR(255),
    preferred_language      VARCHAR(10)  DEFAULT 'en',     -- en / te / hi
    reminder_buffer_days    INTEGER      DEFAULT 2,         -- send reminder N days BEFORE reminder_date
    whatsapp_opt_out        BOOLEAN      DEFAULT false,
    whatsapp_opt_out_at     TIMESTAMPTZ,
    reminders_paused_until  DATE,
    notes                   TEXT,
    source                  VARCHAR(30)  DEFAULT 'manual', -- manual / master_import / sale_import
    is_active               BOOLEAN      DEFAULT true,
    created_at              TIMESTAMPTZ  DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  DEFAULT NOW()
);

-- Phone unique among active customers
CREATE UNIQUE INDEX customers_phone_active_uniq
    ON customers(phone) WHERE is_active = true;

CREATE INDEX idx_customers_name ON customers(name);

-- =============================================================================
-- 3. CUSTOMER_GROUPS  (many-to-many)
-- =============================================================================
CREATE TABLE customer_groups (
    customer_id  UUID REFERENCES customers(id) ON DELETE CASCADE,
    group_id     UUID REFERENCES groups(id)    ON DELETE CASCADE,
    assigned_at  TIMESTAMPTZ DEFAULT NOW(),
    assigned_by  VARCHAR(100) DEFAULT 'staff',
    PRIMARY KEY (customer_id, group_id)
);
CREATE INDEX idx_customer_groups_group    ON customer_groups(group_id);
CREATE INDEX idx_customer_groups_customer ON customer_groups(customer_id);

-- =============================================================================
-- 4. SALES_TRANSACTIONS  (daily upload target)
-- =============================================================================
CREATE TABLE sales_transactions (
    id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    feed_no              VARCHAR(50)  UNIQUE NOT NULL,   -- bill/receipt number from billing system
    feed_date            DATE         NOT NULL,
    customer_phone       VARCHAR(15)  NOT NULL,
    customer_id          UUID         REFERENCES customers(id) ON DELETE SET NULL,
    customer_name_raw    VARCHAR(255),                    -- name as on bill
    address_raw          TEXT,
    net_amount           NUMERIC(10,2),
    for_days             INTEGER,
    reminder_date        DATE,                            -- feed_date + for_days (generated)
    match_confidence     VARCHAR(20)   DEFAULT 'exact',   -- exact / fuzzy / unmatched / auto_created
    fuzzy_match_score    NUMERIC(4,2),                    -- 0.00 - 1.00 when fuzzy
    notes                TEXT,
    import_batch_id      UUID,
    imported_at          TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX idx_sales_phone         ON sales_transactions(customer_phone);
CREATE INDEX idx_sales_customer      ON sales_transactions(customer_id);
CREATE INDEX idx_sales_reminder_date ON sales_transactions(reminder_date);
CREATE INDEX idx_sales_feed_date     ON sales_transactions(feed_date DESC);
CREATE INDEX idx_sales_batch         ON sales_transactions(import_batch_id);

-- =============================================================================
-- 5. IMPORT_BATCHES (audit trail of every daily upload)
-- =============================================================================
CREATE TABLE import_batches (
    id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename         VARCHAR(255),
    source_type      VARCHAR(30),                         -- master_customers / daily_sales
    uploaded_by      VARCHAR(100) DEFAULT 'staff',
    row_count        INTEGER      DEFAULT 0,
    success_count    INTEGER      DEFAULT 0,
    skipped_count    INTEGER      DEFAULT 0,
    error_count      INTEGER      DEFAULT 0,
    notes            TEXT,
    created_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- =============================================================================
-- 6. REMINDERS  (replaces old reminder_history, richer schema)
-- =============================================================================
CREATE TABLE reminders (
    id                     UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id            UUID         REFERENCES customers(id)         ON DELETE CASCADE,
    sales_transaction_id   UUID         REFERENCES sales_transactions(id) ON DELETE SET NULL,
    scheduled_for          DATE,                                          -- reminder_date - buffer
    channel                VARCHAR(20)  DEFAULT 'whatsapp',               -- whatsapp / sms / call
    send_method            VARCHAR(30)  DEFAULT 'manual_walink',          -- manual_walink / api_automated / api_bulk_manual
    status                 VARCHAR(20)  DEFAULT 'queued',                  -- queued / sent / delivered / read / failed / cancelled
    wa_message_id          VARCHAR(100),
    template_name          VARCHAR(100),
    template_language      VARCHAR(10)  DEFAULT 'en',
    message_content        TEXT,
    sent_at                TIMESTAMPTZ,
    delivered_at           TIMESTAMPTZ,
    read_at                TIMESTAMPTZ,
    failed_reason          TEXT,
    sent_by                VARCHAR(100) DEFAULT 'staff',
    created_at             TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX idx_reminders_customer      ON reminders(customer_id);
CREATE INDEX idx_reminders_scheduled_for ON reminders(scheduled_for);
CREATE INDEX idx_reminders_sent_at       ON reminders(sent_at DESC);
CREATE INDEX idx_reminders_status        ON reminders(status);

-- =============================================================================
-- 7. updated_at triggers
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 8. reminder_date auto-compute trigger on sales_transactions
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_reminder_date() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.for_days IS NOT NULL AND NEW.for_days > 0 THEN
        NEW.reminder_date = NEW.feed_date + NEW.for_days;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sales_transactions_reminder_date
    BEFORE INSERT OR UPDATE OF feed_date, for_days ON sales_transactions
    FOR EACH ROW EXECUTE FUNCTION compute_reminder_date();

-- =============================================================================
-- 9. VIEW: customer_next_reminder
--    One row per customer, showing their latest sale + computed reminder status.
--    This is what the dashboard reads.
-- =============================================================================
CREATE OR REPLACE VIEW customer_next_reminder AS
SELECT
    c.id                         AS customer_id,
    c.phone,
    c.name                       AS customer_name,
    c.alternate_phone,
    c.address,
    c.preferred_language,
    c.reminder_buffer_days,
    c.whatsapp_opt_out,
    c.reminders_paused_until,
    c.notes,
    latest.id                    AS last_sale_id,
    latest.feed_no               AS last_feed_no,
    latest.feed_date             AS last_purchase_date,
    latest.for_days              AS last_for_days,
    latest.reminder_date         AS reminder_date,
    latest.net_amount            AS last_amount,
    (latest.reminder_date - (c.reminder_buffer_days || ' days')::INTERVAL)::DATE
                                 AS reminder_trigger_date,
    (latest.reminder_date - CURRENT_DATE)
                                 AS days_until_reminder,
    CASE
        WHEN c.whatsapp_opt_out = true                                              THEN 'opted_out'
        WHEN c.reminders_paused_until IS NOT NULL
             AND c.reminders_paused_until >= CURRENT_DATE                           THEN 'paused'
        WHEN latest.reminder_date IS NULL                                           THEN 'no_sales'
        WHEN latest.reminder_date <  CURRENT_DATE                                   THEN 'overdue'
        WHEN latest.reminder_date <= CURRENT_DATE + INTERVAL '3 days'               THEN 'urgent'
        WHEN latest.reminder_date <= CURRENT_DATE + INTERVAL '7 days'               THEN 'soon'
        ELSE 'ok'
    END                          AS status,
    (SELECT MAX(sent_at) FROM reminders r
      WHERE r.customer_id = c.id AND r.status IN ('sent','delivered','read'))
                                 AS last_reminder_sent,
    ARRAY(
        SELECT g.slug FROM customer_groups cg
        JOIN groups g ON g.id = cg.group_id
        WHERE cg.customer_id = c.id AND g.is_active = true
        ORDER BY g.sort_order
    )                            AS group_slugs,
    ARRAY(
        SELECT g.name FROM customer_groups cg
        JOIN groups g ON g.id = cg.group_id
        WHERE cg.customer_id = c.id AND g.is_active = true
        ORDER BY g.sort_order
    )                            AS group_names
FROM customers c
LEFT JOIN LATERAL (
    SELECT st.*
    FROM sales_transactions st
    WHERE st.customer_id = c.id
    ORDER BY st.feed_date DESC, st.imported_at DESC
    LIMIT 1
) latest ON true
WHERE c.is_active = true;

-- =============================================================================
-- 10. VIEW: customer_with_groups  (flat customer list for management UI)
-- =============================================================================
CREATE OR REPLACE VIEW customer_with_groups AS
SELECT
    c.*,
    COALESCE(
      (SELECT json_agg(json_build_object('id', g.id, 'name', g.name, 'slug', g.slug, 'color', g.color, 'icon', g.icon)
              ORDER BY g.sort_order)
         FROM customer_groups cg JOIN groups g ON g.id = cg.group_id
        WHERE cg.customer_id = c.id AND g.is_active = true),
      '[]'::json
    ) AS groups,
    (SELECT COUNT(*) FROM sales_transactions st WHERE st.customer_id = c.id)
        AS total_sales,
    (SELECT SUM(net_amount) FROM sales_transactions st WHERE st.customer_id = c.id)
        AS total_spent,
    (SELECT MAX(feed_date) FROM sales_transactions st WHERE st.customer_id = c.id)
        AS last_purchase_date
FROM customers c
WHERE c.is_active = true;

-- =============================================================================
-- 11. SEED: default groups
-- =============================================================================
INSERT INTO groups (slug, name, description, color, icon, sort_order, is_system) VALUES
    ('regular',          'Regular Customers', 'Walk-in and returning customers',           '#2f8658', '🛒', 10, true),
    ('diabetes',         'Diabetes',          'Diabetic patients on regular meds',          '#dc2626', '🩸', 20, true),
    ('bp-heart',         'BP & Heart',        'Hypertension / cardiac patients',            '#d4a843', '❤️', 30, true),
    ('thyroid',          'Thyroid',           'Thyroid medication patients',                '#06b6d4', '🦋', 40, true),
    ('chronic-other',    'Chronic - Other',   'Other chronic conditions',                    '#8b5cf6', '💊', 50, true),
    ('senior',           'Senior Citizens',   'Customers aged 65+',                          '#f59e0b', '👴', 60, true),
    ('family',           'Family Account',    'Household-level account / multi-member',      '#1f6f4a', '👨‍👩‍👧', 70, true),
    ('staff-doctor',     'Staff / Doctor',    'Medical professionals, B2B orders',           '#0ea5e9', '👨‍⚕️', 80, true),
    ('walkin',           'One-time / Walk-in','Non-regular, no reminders',                    '#64748b', '🚶', 90, true)
ON CONFLICT (slug) DO NOTHING;
