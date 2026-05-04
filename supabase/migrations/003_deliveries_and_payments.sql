-- =============================================================================
-- Migration 003: Deliveries (credit/collection book)
-- =============================================================================
-- Extends sales_transactions with payment + delivery state, replacing the
-- DELIVERYBOOK_SSP.xlsx workbook. Idempotent: safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Drop & recreate the views that depend on sales_transactions so column
-- additions don't fight an old view definition.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS customer_with_groups   CASCADE;
DROP VIEW IF EXISTS customer_next_reminder CASCADE;
DROP VIEW IF EXISTS daily_collection       CASCADE;
DROP VIEW IF EXISTS pending_dues           CASCADE;
DROP VIEW IF EXISTS customer_balance       CASCADE;

-- ---------------------------------------------------------------------------
-- Add delivery + payment columns. ADD COLUMN IF NOT EXISTS keeps it idempotent.
-- ---------------------------------------------------------------------------
ALTER TABLE sales_transactions
  ADD COLUMN IF NOT EXISTS bill_no_label   VARCHAR(50),     -- "OLD" / receipt number for display
  ADD COLUMN IF NOT EXISTS delivery_date   DATE,             -- aliasing feed_date for clarity
  ADD COLUMN IF NOT EXISTS prev_pending    NUMERIC(10,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_due       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS customer_paid   NUMERIC(10,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_given    NUMERIC(10,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_left    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS payment_mode    VARCHAR(20),     -- 'cash' | 'online' | 'credit' | NULL
  ADD COLUMN IF NOT EXISTS payment_date    DATE,
  ADD COLUMN IF NOT EXISTS delivery_notes  TEXT;

-- Backfill: existing rows imported earlier from the billing-software sales
-- register (Jan-Feb 2026) are assumed settled; mark customer_paid = net_amount
-- so they don't pollute Outstanding totals. The 15 rows we'll import from the
-- delivery book overwrite this with their real values.
UPDATE sales_transactions
   SET customer_paid = COALESCE(net_amount, 0),
       payment_mode  = 'cash',
       payment_date  = feed_date,
       delivery_date = COALESCE(delivery_date, feed_date),
       bill_no_label = COALESCE(bill_no_label, feed_no)
 WHERE customer_paid IS NULL OR customer_paid = 0
   AND import_batch_id IS NOT NULL;   -- only the imported legacy ones

-- Always make delivery_date and bill_no_label populated for new rows
UPDATE sales_transactions SET delivery_date = feed_date  WHERE delivery_date IS NULL;
UPDATE sales_transactions SET bill_no_label = feed_no    WHERE bill_no_label IS NULL;

-- Helpful indexes for the views below
CREATE INDEX IF NOT EXISTS idx_sales_payment_date ON sales_transactions(payment_date);
CREATE INDEX IF NOT EXISTS idx_sales_payment_mode ON sales_transactions(payment_mode);
CREATE INDEX IF NOT EXISTS idx_sales_outstanding  ON sales_transactions(customer_id)
    WHERE customer_paid IS NULL OR customer_paid < net_amount;

-- ---------------------------------------------------------------------------
-- 1. customer_balance — one row per active customer with cumulative totals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW customer_balance AS
SELECT
    c.id                                          AS customer_id,
    c.name                                        AS customer_name,
    c.phone,
    c.alternate_phone,
    c.address,
    c.preferred_language,
    c.whatsapp_opt_out,
    COALESCE(SUM(st.net_amount),     0)::NUMERIC(10,2) AS total_billed,
    COALESCE(SUM(st.customer_paid),  0)::NUMERIC(10,2) AS total_collected,
    COALESCE(SUM(st.change_given),   0)::NUMERIC(10,2) AS total_change_given,
    (COALESCE(SUM(st.net_amount), 0) - COALESCE(SUM(st.customer_paid), 0))::NUMERIC(10,2)
                                                  AS outstanding,
    COUNT(st.id)                                  AS bill_count,
    MAX(st.delivery_date)                         AS last_delivery_date,
    MAX(st.payment_date)                          AS last_payment_date,
    CASE
      WHEN COALESCE(SUM(st.net_amount), 0) - COALESCE(SUM(st.customer_paid), 0) > 0
        THEN 'PENDING'
      ELSE 'CLEAR'
    END                                           AS balance_status
FROM customers c
LEFT JOIN sales_transactions st ON st.customer_id = c.id
WHERE c.is_active = true
GROUP BY c.id, c.name, c.phone, c.alternate_phone, c.address,
         c.preferred_language, c.whatsapp_opt_out;

-- ---------------------------------------------------------------------------
-- 2. pending_dues — only customers with outstanding > 0
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW pending_dues AS
SELECT *
  FROM customer_balance
 WHERE outstanding > 0
 ORDER BY outstanding DESC;

-- ---------------------------------------------------------------------------
-- 3. daily_collection — per-date roll-up
--    Bills counted by delivery_date; cash/online by payment_date so OLD-due
--    payments appear on the day cash was actually collected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW daily_collection AS
WITH all_dates AS (
  SELECT delivery_date AS d FROM sales_transactions WHERE delivery_date IS NOT NULL
  UNION
  SELECT payment_date  AS d FROM sales_transactions WHERE payment_date  IS NOT NULL
),
billed AS (
  SELECT delivery_date AS d,
         COUNT(*)                      AS bills_delivered,
         SUM(COALESCE(net_amount, 0))  AS total_billed,
         SUM(COALESCE(change_given,0)) AS change_given
    FROM sales_transactions
   WHERE delivery_date IS NOT NULL
   GROUP BY delivery_date
),
collected AS (
  SELECT payment_date AS d,
         SUM(CASE WHEN payment_mode = 'cash'   THEN customer_paid ELSE 0 END) AS cash_received,
         SUM(CASE WHEN payment_mode = 'online' THEN customer_paid ELSE 0 END) AS online_received,
         SUM(CASE WHEN payment_mode IS NULL OR payment_mode = 'credit'
                  THEN net_amount ELSE 0 END)                                 AS credit_given
    FROM sales_transactions
   WHERE payment_date IS NOT NULL
   GROUP BY payment_date
)
SELECT
    d.d                                            AS date,
    COALESCE(b.bills_delivered,  0)::INTEGER       AS bills_delivered,
    COALESCE(b.total_billed,     0)::NUMERIC(10,2) AS total_billed,
    COALESCE(b.change_given,     0)::NUMERIC(10,2) AS change_given,
    COALESCE(c.cash_received,    0)::NUMERIC(10,2) AS cash_received,
    COALESCE(c.online_received,  0)::NUMERIC(10,2) AS online_received,
    COALESCE(c.credit_given,     0)::NUMERIC(10,2) AS credit_given,
    (COALESCE(b.total_billed, 0)
     - COALESCE(c.cash_received, 0)
     - COALESCE(c.online_received, 0))::NUMERIC(10,2)
                                                   AS balance_left
FROM (SELECT DISTINCT d FROM all_dates) d
LEFT JOIN billed    b ON b.d = d.d
LEFT JOIN collected c ON c.d = d.d
ORDER BY d.d DESC;

-- ---------------------------------------------------------------------------
-- 4. Recreate customer_next_reminder (was dropped above) — now also exposes
--    outstanding so the main dashboard can show pending dues without a join.
-- ---------------------------------------------------------------------------
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
    latest.bill_no_label         AS last_bill_label,
    latest.delivery_date         AS last_purchase_date,
    latest.for_days              AS last_for_days,
    latest.reminder_date         AS reminder_date,
    latest.net_amount            AS last_amount,
    latest.balance_left          AS last_balance_left,
    (latest.reminder_date - (c.reminder_buffer_days || ' days')::INTERVAL)::DATE
                                 AS reminder_trigger_date,
    (latest.reminder_date - CURRENT_DATE)
                                 AS days_until_reminder,
    bal.outstanding,
    bal.total_billed,
    bal.total_collected,
    bal.balance_status,
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
    ORDER BY st.delivery_date DESC NULLS LAST, st.imported_at DESC
    LIMIT 1
) latest ON true
LEFT JOIN customer_balance bal ON bal.customer_id = c.id
WHERE c.is_active = true;

-- ---------------------------------------------------------------------------
-- 5. Recreate customer_with_groups (was dropped) — adds outstanding hint
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW customer_with_groups AS
SELECT
    c.*,
    COALESCE(
      (SELECT json_agg(json_build_object('id', g.id, 'name', g.name, 'slug', g.slug, 'color', g.color, 'icon', g.icon)
              ORDER BY g.sort_order)
         FROM customer_groups cg JOIN groups g ON g.id = cg.group_id
        WHERE cg.customer_id = c.id AND g.is_active = true),
      '[]'::json
    )                                          AS groups,
    bal.bill_count                              AS total_sales,
    bal.total_billed                            AS total_spent,
    bal.outstanding                             AS outstanding,
    bal.balance_status                          AS balance_status,
    bal.last_delivery_date                      AS last_purchase_date
FROM customers c
LEFT JOIN customer_balance bal ON bal.customer_id = c.id
WHERE c.is_active = true;

-- ---------------------------------------------------------------------------
-- 6. RLS — keep disabled for now (consistent with migration 002)
-- ---------------------------------------------------------------------------
ALTER TABLE sales_transactions  DISABLE ROW LEVEL SECURITY;
