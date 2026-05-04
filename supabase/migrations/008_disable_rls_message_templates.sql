-- =============================================================================
-- Migration 008: disable RLS on message_templates
-- =============================================================================
-- Migrations 006 + 007 included `ALTER TABLE message_templates DISABLE ROW
-- LEVEL SECURITY;` but Supabase's default behaviour re-enabled RLS for the
-- newly created table on at least one project. Without policies, the anon
-- key returns 0 rows even though service-role can see all 10 templates.
--
-- This migration ensures RLS stays off, matching the rest of the schema.
-- Idempotent: safe to re-run.
-- =============================================================================

ALTER TABLE message_templates DISABLE ROW LEVEL SECURITY;
