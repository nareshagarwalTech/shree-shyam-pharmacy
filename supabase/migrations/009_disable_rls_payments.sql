-- =============================================================================
-- Migration 009: disable RLS on payments
-- =============================================================================
-- Migration 005 created the payments table with `ALTER TABLE payments DISABLE
-- ROW LEVEL SECURITY;` but Supabase's default behaviour re-enabled RLS at some
-- later point (same pattern we hit on message_templates -> migration 008).
--
-- Symptom from the UI: adding a payment from the Edit Delivery modal returns
--   "new row violates row-level security policy for table 'payments'"
-- because the anon key tries to INSERT but no policy grants writes, and RLS
-- is on with deny-by-default.
--
-- This migration just turns it off again to match the rest of the schema.
-- Idempotent: safe to re-run, and also belt-and-braces disables RLS on the
-- other write-target tables in case Supabase did the same re-enable on them.
-- =============================================================================

ALTER TABLE payments              DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_transactions    DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers             DISABLE ROW LEVEL SECURITY;
ALTER TABLE customer_groups       DISABLE ROW LEVEL SECURITY;
ALTER TABLE groups                DISABLE ROW LEVEL SECURITY;
ALTER TABLE reminders             DISABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates     DISABLE ROW LEVEL SECURITY;
