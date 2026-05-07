-- =============================================================================
-- Migration 012: customer-level reminder fields
-- =============================================================================
-- Up to now, refill reminders were derived from rows in `sales_transactions`
-- (latest feed_date + for_days = next refill date). Real bills entered via
-- /deliveries/new and bulk Excel "sales" imports both lived in the same
-- table, which polluted Daily Collection / Pending / Aging with rows that
-- were never actually invoices.
--
-- Going forward, refill reminders are driven by two columns ON THE CUSTOMER:
--   - reminder_last_purchase_date  DATE
--   - reminder_for_days            INTEGER
--
-- These are populated by the new /dashboard/whatsapp/reminder-upload flow.
-- Each Excel upload upserts one row per phone, taking the LATEST
-- (feed_date, for_days) across duplicate rows.
--
-- The customer_next_reminder view now uses MAX(customer field, latest sale
-- field) so a real new bill via /deliveries/new still pushes the reminder
-- date forward even between Excel re-uploads.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add reminder fields to customers
-- ---------------------------------------------------------------------------
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS reminder_last_purchase_date DATE;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS reminder_for_days INTEGER
    CHECK (reminder_for_days IS NULL OR reminder_for_days BETWEEN 1 AND 365);

CREATE INDEX IF NOT EXISTS idx_customers_reminder_last_purchase
  ON customers(reminder_last_purchase_date)
  WHERE reminder_last_purchase_date IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Recreate customer_next_reminder
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS customer_next_reminder CASCADE;

CREATE VIEW customer_next_reminder AS
WITH latest_sale AS (
  SELECT DISTINCT ON (customer_id)
    customer_id,
    id              AS sale_id,
    feed_no,
    bill_no_label,
    delivery_date,
    for_days,
    net_amount,
    balance_left
  FROM sales_transactions
  WHERE customer_id IS NOT NULL
  ORDER BY customer_id, delivery_date DESC NULLS LAST, imported_at DESC
),
combined AS (
  SELECT
    c.id                          AS customer_id,
    c.phone,
    c.name                        AS customer_name,
    c.alternate_phone,
    c.address,
    c.preferred_language,
    c.reminder_buffer_days,
    c.whatsapp_opt_out,
    c.reminders_paused_until,
    c.notes,
    s.sale_id                     AS last_sale_id,
    s.feed_no                     AS last_feed_no,
    s.bill_no_label               AS last_bill_label,
    s.net_amount                  AS last_amount,
    s.balance_left                AS last_balance_left,
    -- Effective last-purchase date and for_days. Prefer whichever source
    -- has the LATER date so a fresh bill via /deliveries/new still pushes
    -- the reminder forward.
    GREATEST(c.reminder_last_purchase_date, s.delivery_date)            AS last_purchase_date,
    CASE
      WHEN c.reminder_last_purchase_date IS NOT NULL
           AND (s.delivery_date IS NULL OR c.reminder_last_purchase_date >= s.delivery_date)
        THEN c.reminder_for_days
      ELSE s.for_days
    END                                                                  AS last_for_days,
    bal.outstanding,
    bal.total_billed,
    bal.total_collected,
    bal.balance_status
  FROM customers c
  LEFT JOIN latest_sale s ON s.customer_id = c.id
  LEFT JOIN customer_balance bal ON bal.customer_id = c.id
  WHERE c.is_active = true
)
SELECT
  customer_id, phone, customer_name, alternate_phone, address,
  preferred_language, reminder_buffer_days, whatsapp_opt_out,
  reminders_paused_until, notes,
  last_sale_id, last_feed_no, last_bill_label,
  last_purchase_date, last_for_days, last_amount, last_balance_left,
  -- Reminder lands at last_purchase + for_days
  CASE
    WHEN last_purchase_date IS NULL OR last_for_days IS NULL THEN NULL
    ELSE (last_purchase_date + last_for_days * INTERVAL '1 day')::date
  END                                                       AS reminder_date,
  -- Trigger date = reminder_date minus customer's buffer days
  CASE
    WHEN last_purchase_date IS NULL OR last_for_days IS NULL THEN NULL
    ELSE (last_purchase_date + last_for_days * INTERVAL '1 day' - reminder_buffer_days * INTERVAL '1 day')::date
  END                                                       AS reminder_trigger_date,
  -- Days from today to the reminder date (negative = overdue)
  CASE
    WHEN last_purchase_date IS NULL OR last_for_days IS NULL THEN NULL
    ELSE ((last_purchase_date + last_for_days * INTERVAL '1 day')::date - CURRENT_DATE)
  END                                                       AS days_until_reminder,
  outstanding, total_billed, total_collected, balance_status,
  CASE
    WHEN whatsapp_opt_out = true                                                       THEN 'opted_out'
    WHEN reminders_paused_until IS NOT NULL AND reminders_paused_until >= CURRENT_DATE THEN 'paused'
    WHEN last_purchase_date IS NULL OR last_for_days IS NULL                           THEN 'no_sales'
    WHEN (last_purchase_date + last_for_days * INTERVAL '1 day')::date <  CURRENT_DATE                THEN 'overdue'
    WHEN (last_purchase_date + last_for_days * INTERVAL '1 day')::date <= CURRENT_DATE + INTERVAL '3 days' THEN 'urgent'
    WHEN (last_purchase_date + last_for_days * INTERVAL '1 day')::date <= CURRENT_DATE + INTERVAL '7 days' THEN 'soon'
    ELSE 'ok'
  END                                                       AS status,
  (SELECT MAX(sent_at) FROM reminders r
     WHERE r.customer_id = customer_id AND r.status IN ('sent','delivered','read')) AS last_reminder_sent,
  ARRAY(
    SELECT g.slug FROM customer_groups cg
    JOIN groups g ON g.id = cg.group_id
    WHERE cg.customer_id = combined.customer_id AND g.is_active = true
    ORDER BY g.sort_order
  )                                                         AS group_slugs,
  ARRAY(
    SELECT g.name FROM customer_groups cg
    JOIN groups g ON g.id = cg.group_id
    WHERE cg.customer_id = combined.customer_id AND g.is_active = true
    ORDER BY g.sort_order
  )                                                         AS group_names
FROM combined;
