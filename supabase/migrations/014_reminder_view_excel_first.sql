-- =============================================================================
-- Migration 014: customer_next_reminder — Excel-data first
-- =============================================================================
-- Migration 012's view used GREATEST(reminder_last_purchase_date, sale_date)
-- so a fresh bill via /deliveries/new could push the reminder forward.
-- Problem: real bills entered via the deliveries flow rarely have a for_days
-- set, so when they were the more recent source, last_for_days came out
-- NULL — and the customer fell into the 'no_sales' status with no
-- reminder ever computed.
--
-- New behaviour (matches user intent — re-upload the reminder Excel
-- periodically to refresh):
--   - Prefer the customer-level reminder fields when present (set by
--     /dashboard/whatsapp/reminder-upload).
--   - Fall back to the latest sales_transactions row only when the
--     customer has no reminder data yet.
--
-- Idempotent: drop + create.
-- =============================================================================

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
    -- Excel data wins. Sales-transactions data is only the fallback.
    COALESCE(c.reminder_last_purchase_date, s.delivery_date) AS last_purchase_date,
    COALESCE(c.reminder_for_days,           s.for_days)      AS last_for_days,
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
  CASE
    WHEN last_purchase_date IS NULL OR last_for_days IS NULL THEN NULL
    ELSE (last_purchase_date + last_for_days * INTERVAL '1 day')::date
  END                                                       AS reminder_date,
  CASE
    WHEN last_purchase_date IS NULL OR last_for_days IS NULL THEN NULL
    ELSE (last_purchase_date + last_for_days * INTERVAL '1 day' - reminder_buffer_days * INTERVAL '1 day')::date
  END                                                       AS reminder_trigger_date,
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
     WHERE r.customer_id = combined.customer_id AND r.status IN ('sent','delivered','read')) AS last_reminder_sent,
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
