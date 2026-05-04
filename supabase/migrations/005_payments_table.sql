-- =============================================================================
-- Migration 005: payments table — partial payment support
-- =============================================================================
-- Splits the implicit "one payment per bill" model out into a dedicated
-- payments table. A bill can now have 0..N payments, each on its own date,
-- in cash/online/cheque, with optional notes.
--
-- Outstanding per customer = SUM(bills.net_amount) - SUM(payments.amount).
-- Aging is computed via FIFO: payments clear oldest bill first.
--
-- Idempotent: drops & recreates payments table + all dependent views.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Drop dependent views first (CASCADE handles their dependents)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS customer_with_groups   CASCADE;
DROP VIEW IF EXISTS customer_next_reminder CASCADE;
DROP VIEW IF EXISTS top_customers          CASCADE;
DROP VIEW IF EXISTS customer_aging         CASCADE;
DROP VIEW IF EXISTS monthly_collection     CASCADE;
DROP VIEW IF EXISTS daily_collection       CASCADE;
DROP VIEW IF EXISTS pending_dues           CASCADE;
DROP VIEW IF EXISTS customer_balance       CASCADE;

-- ---------------------------------------------------------------------------
-- 1. payments table
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS payments CASCADE;

CREATE TABLE payments (
    id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id           UUID         NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    sales_transaction_id  UUID         REFERENCES sales_transactions(id) ON DELETE SET NULL,
    amount                NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    mode                  VARCHAR(20)   NOT NULL DEFAULT 'cash'
                          CHECK (mode IN ('cash', 'online', 'cheque', 'card', 'other')),
    payment_date          DATE          NOT NULL,
    notes                 TEXT,
    created_at            TIMESTAMPTZ   DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   DEFAULT NOW(),
    created_by            VARCHAR(100)  DEFAULT 'staff'
);
CREATE INDEX idx_payments_customer  ON payments(customer_id);
CREATE INDEX idx_payments_date      ON payments(payment_date);
CREATE INDEX idx_payments_sale      ON payments(sales_transaction_id);
CREATE INDEX idx_payments_mode      ON payments(mode);

ALTER TABLE payments DISABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Migrate existing data: every sales_transactions row with customer_paid > 0
--    becomes a payment row. amount = net retained = customer_paid - change_given.
-- ---------------------------------------------------------------------------
INSERT INTO payments (customer_id, sales_transaction_id, amount, mode, payment_date, notes, created_at)
SELECT
    st.customer_id,
    st.id,
    GREATEST(COALESCE(st.customer_paid, 0) - COALESCE(st.change_given, 0), 0),
    COALESCE(st.payment_mode, 'cash'),
    COALESCE(st.payment_date, st.delivery_date, st.feed_date),
    'migrated from sales_transactions row',
    st.imported_at
FROM sales_transactions st
WHERE st.customer_id IS NOT NULL
  AND COALESCE(st.customer_paid, 0) - COALESCE(st.change_given, 0) > 0;

-- ---------------------------------------------------------------------------
-- 3. customer_balance — sources money from payments
-- ---------------------------------------------------------------------------
CREATE VIEW customer_balance AS
SELECT
    c.id                                                AS customer_id,
    c.name                                              AS customer_name,
    c.phone,
    c.alternate_phone,
    c.address,
    c.preferred_language,
    c.whatsapp_opt_out,
    COALESCE(b.total_billed,    0)::NUMERIC(10,2)       AS total_billed,
    COALESCE(p.total_collected, 0)::NUMERIC(10,2)       AS total_collected,
    COALESCE(b.total_change,    0)::NUMERIC(10,2)       AS total_change_given,
    (COALESCE(b.total_billed, 0) - COALESCE(p.total_collected, 0))::NUMERIC(10,2)
                                                         AS outstanding,
    COALESCE(b.bill_count, 0)                            AS bill_count,
    COALESCE(p.payment_count, 0)                         AS payment_count,
    b.last_delivery_date,
    p.last_payment_date,
    CASE WHEN COALESCE(b.total_billed, 0) - COALESCE(p.total_collected, 0) > 0
         THEN 'PENDING' ELSE 'CLEAR' END                 AS balance_status
FROM customers c
LEFT JOIN (
    SELECT customer_id,
           COUNT(*)            AS bill_count,
           SUM(net_amount)     AS total_billed,
           SUM(change_given)   AS total_change,
           MAX(delivery_date)  AS last_delivery_date
    FROM sales_transactions
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
) b ON b.customer_id = c.id
LEFT JOIN (
    SELECT customer_id,
           COUNT(*)            AS payment_count,
           SUM(amount)         AS total_collected,
           MAX(payment_date)   AS last_payment_date
    FROM payments
    GROUP BY customer_id
) p ON p.customer_id = c.id
WHERE c.is_active = true;

-- ---------------------------------------------------------------------------
-- 4. pending_dues
-- ---------------------------------------------------------------------------
CREATE VIEW pending_dues AS
SELECT * FROM customer_balance WHERE outstanding > 0 ORDER BY outstanding DESC;

-- ---------------------------------------------------------------------------
-- 5. daily_collection — purely from payments.payment_date
--    "billed_same_day" = payment landed on a day when the same customer had
--    a delivery (cash-on-delivery feel). "old_due_collected" otherwise.
-- ---------------------------------------------------------------------------
CREATE VIEW daily_collection AS
SELECT
    p.payment_date                                     AS date,
    COUNT(*)                                            AS payment_count,
    COUNT(DISTINCT p.customer_id)                       AS unique_customers,
    SUM(CASE WHEN p.mode = 'cash'
             THEN p.amount ELSE 0 END)::NUMERIC(10,2)   AS cash_received,
    SUM(CASE WHEN p.mode = 'online'
             THEN p.amount ELSE 0 END)::NUMERIC(10,2)   AS online_received,
    SUM(CASE WHEN p.mode NOT IN ('cash','online')
             THEN p.amount ELSE 0 END)::NUMERIC(10,2)   AS other_received,
    SUM(p.amount)::NUMERIC(10,2)                        AS total_collected,
    -- change_given on bills delivered same date (independent of the payment)
    COALESCE((
        SELECT SUM(COALESCE(change_given, 0))
        FROM sales_transactions st
        WHERE st.delivery_date = p.payment_date
    ), 0)::NUMERIC(10,2)                                AS change_given,
    -- "Same-day" heuristic: payment customer also had a delivery on this date
    SUM(CASE WHEN EXISTS (
        SELECT 1 FROM sales_transactions st
        WHERE st.customer_id   = p.customer_id
          AND st.delivery_date = p.payment_date
    ) THEN p.amount ELSE 0 END)::NUMERIC(10,2)          AS billed_same_day,
    SUM(CASE WHEN NOT EXISTS (
        SELECT 1 FROM sales_transactions st
        WHERE st.customer_id   = p.customer_id
          AND st.delivery_date = p.payment_date
    ) THEN p.amount ELSE 0 END)::NUMERIC(10,2)          AS old_due_collected
FROM payments p
GROUP BY p.payment_date
ORDER BY p.payment_date DESC;

-- Backwards-compat alias for any old code reading bills_paid
-- (we expose payment_count under the same name so existing UI keeps working)
COMMENT ON VIEW daily_collection IS
  'payment_count is the number of payment events that day (one customer can have multiple).';

-- ---------------------------------------------------------------------------
-- 6. monthly_collection
-- ---------------------------------------------------------------------------
CREATE VIEW monthly_collection AS
SELECT
    DATE_TRUNC('month', payment_date)::DATE              AS month,
    TO_CHAR(payment_date, 'YYYY-MM')                     AS month_label,
    COUNT(*)                                              AS payment_count,
    COUNT(DISTINCT customer_id)                           AS unique_customers,
    SUM(CASE WHEN mode = 'cash'
             THEN amount ELSE 0 END)::NUMERIC(12,2)       AS cash_received,
    SUM(CASE WHEN mode = 'online'
             THEN amount ELSE 0 END)::NUMERIC(12,2)       AS online_received,
    SUM(amount)::NUMERIC(12,2)                            AS total_collected,
    AVG(amount)::NUMERIC(10,2)                            AS avg_per_payment
FROM payments
GROUP BY 1, 2
ORDER BY 1 DESC;

-- ---------------------------------------------------------------------------
-- 7. customer_aging — FIFO allocation of payments against oldest bills
-- ---------------------------------------------------------------------------
CREATE VIEW customer_aging AS
WITH bill_running AS (
    SELECT
        st.id                                            AS bill_id,
        st.customer_id,
        st.delivery_date,
        st.net_amount,
        SUM(st.net_amount) OVER (
            PARTITION BY st.customer_id
            ORDER BY st.delivery_date, st.id
            ROWS UNBOUNDED PRECEDING
        )                                                AS cumulative_billed,
        (SELECT COALESCE(SUM(amount), 0)
         FROM payments p
         WHERE p.customer_id = st.customer_id)           AS total_paid
    FROM sales_transactions st
    WHERE st.customer_id IS NOT NULL AND st.net_amount > 0
),
unpaid AS (
    SELECT
        customer_id, bill_id, delivery_date, net_amount,
        GREATEST(0, LEAST(
            net_amount,
            cumulative_billed - total_paid
        ))                                              AS unpaid_amount,
        (CURRENT_DATE - delivery_date)                  AS age_days
    FROM bill_running
)
SELECT
    c.id                                                AS customer_id,
    c.name                                              AS customer_name,
    c.phone,
    MAX(u.age_days)                                     AS oldest_age_days,
    MIN(u.delivery_date)                                AS oldest_unpaid_date,
    SUM(u.unpaid_amount)::NUMERIC(10,2)                 AS outstanding,
    SUM(CASE WHEN u.age_days <= 30
             THEN u.unpaid_amount ELSE 0 END)::NUMERIC(10,2)  AS bucket_0_30,
    SUM(CASE WHEN u.age_days BETWEEN 31 AND 60
             THEN u.unpaid_amount ELSE 0 END)::NUMERIC(10,2)  AS bucket_31_60,
    SUM(CASE WHEN u.age_days BETWEEN 61 AND 90
             THEN u.unpaid_amount ELSE 0 END)::NUMERIC(10,2)  AS bucket_61_90,
    SUM(CASE WHEN u.age_days > 90
             THEN u.unpaid_amount ELSE 0 END)::NUMERIC(10,2)  AS bucket_90_plus,
    COUNT(*) FILTER (WHERE u.unpaid_amount > 0)         AS unpaid_bill_count
FROM customers c
JOIN unpaid u ON u.customer_id = c.id
WHERE c.is_active = true AND u.unpaid_amount > 0
GROUP BY c.id, c.name, c.phone
ORDER BY oldest_age_days DESC NULLS LAST;

-- ---------------------------------------------------------------------------
-- 8. top_customers
-- ---------------------------------------------------------------------------
CREATE VIEW top_customers AS
SELECT
    c.id                                                AS customer_id,
    c.name                                              AS customer_name,
    c.phone,
    COALESCE(b.bill_count, 0)                           AS bill_count,
    COALESCE(p.payment_count, 0)                        AS payment_count,
    COALESCE(b.total_billed,    0)::NUMERIC(12,2)       AS total_billed,
    COALESCE(p.total_collected, 0)::NUMERIC(12,2)       AS total_collected,
    (COALESCE(b.total_billed, 0) - COALESCE(p.total_collected, 0))::NUMERIC(10,2)
                                                         AS outstanding,
    b.last_delivery_date,
    p.last_payment_date,
    -- avg_days_to_pay: across payments, days from earliest unpaid bill to payment date
    -- (placeholder for now — proper computation requires per-payment allocation)
    NULL::NUMERIC(8,2)                                  AS avg_days_to_pay
FROM customers c
LEFT JOIN (
    SELECT customer_id,
           COUNT(*) AS bill_count,
           SUM(net_amount) AS total_billed,
           MAX(delivery_date) AS last_delivery_date
    FROM sales_transactions
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
) b ON b.customer_id = c.id
LEFT JOIN (
    SELECT customer_id,
           COUNT(*) AS payment_count,
           SUM(amount) AS total_collected,
           MAX(payment_date) AS last_payment_date
    FROM payments
    GROUP BY customer_id
) p ON p.customer_id = c.id
WHERE c.is_active = true
ORDER BY total_billed DESC NULLS LAST;

-- ---------------------------------------------------------------------------
-- 9. customer_next_reminder — recreated, now reads outstanding from new balance
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
-- 10. customer_with_groups — recreated
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
