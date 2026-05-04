-- =============================================================================
-- Migration 002: disable RLS on the new tables (one-shot, idempotent)
-- =============================================================================
-- Newer Supabase projects enable RLS by default on tables in the public schema.
-- Without policies, anon-key reads return 0 rows even when data exists.
-- This app is staff-only behind a password, so we disable RLS until the
-- proper server-API + Supabase Auth refactor lands in a later phase.
--
-- This is also baked into 001 going forward so a fresh re-run is clean;
-- this file exists for projects already mid-flight that just need the unblock.
-- =============================================================================

ALTER TABLE groups              DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers           DISABLE ROW LEVEL SECURITY;
ALTER TABLE customer_groups     DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_transactions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches      DISABLE ROW LEVEL SECURITY;
ALTER TABLE reminders           DISABLE ROW LEVEL SECURITY;
