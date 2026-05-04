-- =============================================================================
-- Migration 004: payment-centric reports
-- =============================================================================
-- Rebuilds daily_collection to be entirely payment-date driven (matches the
-- user's mental model: "what came in each day"), and adds monthly_collection,
-- customer_aging, and top_customers views for the new reports hub.
-- Idempotent: DROP VIEW IF EXISTS at the top.
-- =============================================================================

DROP VIEW IF EXISTS top_customers     CASCADE;
DROP VIEW IF EXISTS customer_aging    CASCADE;
DROP VIEW IF EXISTS monthly_collection CASCADE;
DROP VIEW IF EXISTS daily_collection  CASCADE;

-- ---------------------------------------------------------------------------
-- 1. daily_collection — purely payment-date driven
--     Each row = one date on which money was received.
--     bills_paid       = number of bills settled (in full or partial) that day
--     cash_received    = sum of customer_paid where mode=cash
--     online_received  = sum of customer_paid where mode=online
--     total_collected  = cash + online (any non-credit)
--     change_given     = total change handed back that day
--     billed_same_day  = of the money collected, how much was for bills
--                        delivered the same day (impulse / cash-on-delivery)
--     old_due_collected = how much was for bills delivered on earlier dates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW daily_collection AS
SELECT
    payment_date                                           AS date,
    COUNT(*) FILTER (WHERE customer_paid > 0)              AS bills_paid,
    SUM(CASE WHEN payment_mode = 'cash'
             THEN customer_paid ELSE 0 END)::NUMERIC(10,2) AS cash_received,
    SUM(CASE WHEN payment_mode = 'online'
             THEN customer_paid ELSE 0 END)::NUMERIC(10,2) AS online_received,
    SUM(COALESCE(customer_paid, 0))::NUMERIC(10,2)         AS total_collected,
    SUM(COALESCE(change_given, 0))::NUMERIC(10,2)          AS change_given,
    SUM(CASE WHEN delivery_date = payment_date
             THEN COALESCE(customer_paid, 0) ELSE 0 END)::NUMERIC(10,2)
                                                           AS billed_same_day,
    SUM(CASE WHEN delivery_date < payment_date
             THEN COALESCE(customer_paid, 0) ELSE 0 END)::NUMERIC(10,2)
                                                           AS old_due_collected
FROM sales_transactions
WHERE payment_date IS NOT NULL AND customer_paid > 0
GROUP BY payment_date
ORDER BY payment_date DESC;

-- ---------------------------------------------------------------------------
-- 2. monthly_collection — month-over-month rollup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW monthly_collection AS
SELECT
    DATE_TRUNC('month', payment_date)::DATE                AS month,
    TO_CHAR(payment_date, 'YYYY-MM')                       AS month_label,
    COUNT(*) FILTER (WHERE customer_paid > 0)              AS bills_paid,
    COUNT(DISTINCT customer_id)                            AS unique_customers,
    SUM(CASE WHEN payment_mode = 'cash'
             THEN customer_paid ELSE 0 END)::NUMERIC(12,2) AS cash_received,
    SUM(CASE WHEN payment_mode = 'online'
             THEN customer_paid ELSE 0 END)::NUMERIC(12,2) AS online_received,
    SUM(COALESCE(customer_paid, 0))::NUMERIC(12,2)         AS total_collected,
    SUM(COALESCE(change_given, 0))::NUMERIC(12,2)          AS change_given,
    AVG(COALESCE(customer_paid, 0))::NUMERIC(10,2)         AS avg_per_bill
FROM sales_transactions
WHERE payment_date IS NOT NULL AND customer_paid > 0
GROUP BY 1, 2
ORDER BY 1 DESC;

-- ---------------------------------------------------------------------------
-- 3. customer_aging — debt-age buckets per customer (for aging report)
--     bucket_0_30      = balance owed for bills delivered 0–30 days ago
--     bucket_31_60     = 31–60 days
--     bucket_61_90     = 61–90 days
--     bucket_90_plus   = >90 days (severely overdue)
--     oldest_age_days  = how long their oldest unpaid bill has been pending
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW customer_aging AS
WITH unpaid AS (
    SELECT
        st.customer_id,
        st.delivery_date,
        COALESCE(st.net_amount, 0) - COALESCE(st.customer_paid, 0) AS balance,
        CURRENT_DATE - st.delivery_date AS age_days
    FROM sales_transactions st
    WHERE COALESCE(st.net_amount, 0) - COALESCE(st.customer_paid, 0) > 0
      AND st.customer_id IS NOT NULL
)
SELECT
    c.id                                          AS customer_id,
    c.name                                        AS customer_name,
    c.phone,
    MAX(u.age_days)                               AS oldest_age_days,
    MIN(u.delivery_date)                          AS oldest_unpaid_date,
    SUM(u.balance)::NUMERIC(10,2)                 AS outstanding,
    SUM(CASE WHEN u.age_days <= 30
             THEN u.balance ELSE 0 END)::NUMERIC(10,2)   AS bucket_0_30,
    SUM(CASE WHEN u.age_days BETWEEN 31 AND 60
             THEN u.balance ELSE 0 END)::NUMERIC(10,2)   AS bucket_31_60,
    SUM(CASE WHEN u.age_days BETWEEN 61 AND 90
             THEN u.balance ELSE 0 END)::NUMERIC(10,2)   AS bucket_61_90,
    SUM(CASE WHEN u.age_days > 90
             THEN u.balance ELSE 0 END)::NUMERIC(10,2)   AS bucket_90_plus,
    COUNT(*)                                      AS unpaid_bill_count
FROM customers c
JOIN unpaid u ON u.customer_id = c.id
WHERE c.is_active = true
GROUP BY c.id, c.name, c.phone
ORDER BY oldest_age_days DESC NULLS LAST;

-- ---------------------------------------------------------------------------
-- 4. top_customers — by lifetime spend (paid + unpaid)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW top_customers AS
SELECT
    c.id                                          AS customer_id,
    c.name                                        AS customer_name,
    c.phone,
    COUNT(st.id)                                  AS bill_count,
    SUM(COALESCE(st.net_amount, 0))::NUMERIC(12,2) AS total_billed,
    SUM(COALESCE(st.customer_paid, 0))::NUMERIC(12,2) AS total_collected,
    (SUM(COALESCE(st.net_amount, 0)) - SUM(COALESCE(st.customer_paid, 0)))::NUMERIC(10,2) AS outstanding,
    MAX(st.delivery_date)                         AS last_purchase_date,
    MAX(st.payment_date)                          AS last_payment_date,
    AVG(st.payment_date - st.delivery_date) FILTER (WHERE st.payment_date IS NOT NULL AND st.delivery_date IS NOT NULL)::NUMERIC(8,2)
                                                  AS avg_days_to_pay
FROM customers c
LEFT JOIN sales_transactions st ON st.customer_id = c.id
WHERE c.is_active = true
GROUP BY c.id, c.name, c.phone
ORDER BY total_billed DESC NULLS LAST;
