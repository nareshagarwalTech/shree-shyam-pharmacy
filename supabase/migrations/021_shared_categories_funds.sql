-- =============================================================================
-- Migration 021: Shared-direction categories (= Funds / earmarked pools)
-- =============================================================================
-- Some real-world pools of money flow BOTH IN and OUT through the same logical
-- bucket (e.g., a Chit Fund collection: ₹50K received, then ₹10K withdrawn
-- five times). With direction-locked categories you'd need two separate
-- categories (one income, one expense) to model this, which loses the link.
--
-- This migration adds a third valid direction: 'shared'. A shared category
-- can be tagged on income AND expense entries, and the running balance is
-- computed as sum(income tags) − sum(expense tags) on the same category.
--
-- The fund_balances view powers a new Dashboard panel that shows each
-- shared category's IN / OUT / REMAINING totals.
--
-- Run AFTER migration 020.
-- =============================================================================

-- Allow 'shared' on the categories.direction check.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_direction_check;
ALTER TABLE categories
    ADD CONSTRAINT categories_direction_check
    CHECK (direction IN ('income', 'expense', 'shared'));

-- The UNIQUE (direction, scope, slug) constraint stays; shared categories get
-- their own (shared, business, …) and (shared, personal, …) slug namespaces.

-- View: per-shared-category running balance
DROP VIEW IF EXISTS daily_book_fund_balances CASCADE;
CREATE OR REPLACE VIEW daily_book_fund_balances AS
SELECT
    c.id                                            AS category_id,
    c.name                                          AS category_name,
    c.slug                                          AS category_slug,
    c.scope,
    c.sort_order,
    c.is_active,
    c.notes,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE de.direction = 'income'),  0)                              AS total_in,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE de.direction = 'expense'), 0)                              AS total_out,
    COALESCE(SUM(de.txn_amount) FILTER (WHERE de.direction = 'income'),  0)
      - COALESCE(SUM(de.txn_amount) FILTER (WHERE de.direction = 'expense'), 0)                          AS current_balance,
    COUNT(de.id) FILTER (WHERE de.id IS NOT NULL)                                                        AS entry_count,
    MAX(de.entry_date)                                                                                   AS last_activity_date
FROM categories c
LEFT JOIN daily_entries de
    ON de.category_id = c.id AND de.txn_type = 'entry'
WHERE c.direction = 'shared'
GROUP BY c.id, c.name, c.slug, c.scope, c.sort_order, c.is_active, c.notes
ORDER BY c.scope, c.sort_order, c.name;

GRANT SELECT ON daily_book_fund_balances TO anon, authenticated;
