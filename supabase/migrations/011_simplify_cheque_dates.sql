-- =============================================================================
-- Migration 011: simplify cheque dates
-- =============================================================================
-- Per user request, the cheque tracker maintains only TWO dates:
--   - issue_date    (renamed in UI to "Cheque Date")
--   - deposit_date  (mandatory once status moves past 'pending')
--
-- The third column from migration 010, clearance_date, is dropped. Any
-- non-null clearance_date values are first copied into deposit_date when
-- deposit_date is empty, so we don't lose information.
--
-- New rule: deposit_date must be set when status is one of
--   deposited / cleared / bounced
-- (the user can only know these states AFTER the cheque went into the
-- bank, so the deposit date is known by definition).
--
-- Idempotent: views are dropped + recreated; column drop uses IF EXISTS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Drop dependent views first (they reference clearance_date)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS cheque_deposit_schedule CASCADE;
DROP VIEW IF EXISTS cheque_party_summary    CASCADE;
DROP VIEW IF EXISTS cheque_summary          CASCADE;

-- ---------------------------------------------------------------------------
-- 1. Backfill deposit_date in two passes so the new CHECK constraint is met
--    a) prefer the existing clearance_date if we have one
--    b) for any row that's still missing one, fall back to issue_date so the
--       row stays valid (the cheque must have been deposited at some point;
--       issue_date is an honest lower bound when the actual date is unknown)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Pass (a) only runs if clearance_date still exists on the table
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'cheques' AND column_name = 'clearance_date'
  ) THEN
    EXECUTE $sql$
      UPDATE cheques
         SET deposit_date = clearance_date
       WHERE deposit_date IS NULL
         AND clearance_date IS NOT NULL
    $sql$;
  END IF;
END $$;

-- Pass (b): cleared / deposited / bounced rows that still have a NULL
-- deposit_date get the issue_date as the deposit_date.
UPDATE cheques
   SET deposit_date = issue_date
 WHERE deposit_date IS NULL
   AND status IN ('deposited', 'cleared', 'bounced');

-- ---------------------------------------------------------------------------
-- 2. Drop clearance_date column (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE cheques DROP COLUMN IF EXISTS clearance_date;

-- ---------------------------------------------------------------------------
-- 3. Add the deposit_date-required-when-not-pending constraint
-- ---------------------------------------------------------------------------
-- Drop any existing version of the constraint first so re-runs are safe.
ALTER TABLE cheques DROP CONSTRAINT IF EXISTS cheques_deposit_required_for_advanced_status;

ALTER TABLE cheques
  ADD CONSTRAINT cheques_deposit_required_for_advanced_status
  CHECK (
    status IN ('pending', 'cancelled')
    OR deposit_date IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- 4. Recreate the views (drop clearance_date references)
-- ---------------------------------------------------------------------------

CREATE VIEW cheque_summary AS
SELECT
  COUNT(*) FILTER (WHERE status IN ('pending', 'deposited'))                          AS pending_count,
  COALESCE(SUM(amount) FILTER (WHERE status IN ('pending', 'deposited')), 0)::numeric AS pending_amount,
  COUNT(*) FILTER (WHERE status = 'cleared')                                          AS cleared_count,
  COALESCE(SUM(amount) FILTER (WHERE status = 'cleared'), 0)::numeric                 AS cleared_amount,
  COUNT(*) FILTER (WHERE status = 'bounced')                                          AS bounced_count,
  COALESCE(SUM(amount) FILTER (WHERE status = 'bounced'), 0)::numeric                 AS bounced_amount,
  COUNT(*) FILTER (WHERE status = 'cancelled')                                        AS cancelled_count,
  COUNT(*)                                                                            AS total_count,
  COALESCE(SUM(amount) FILTER (WHERE status != 'cancelled'), 0)::numeric              AS total_amount
FROM cheques;

CREATE VIEW cheque_party_summary AS
SELECT
  p.id                                                                                  AS party_id,
  p.name                                                                                AS party_name,
  p.short_name,
  p.category,
  p.contact_phone,
  p.is_active,
  COUNT(c.id)                                                                           AS total_cheques,
  COALESCE(SUM(c.amount) FILTER (WHERE c.status != 'cancelled'), 0)::numeric            AS total_issued,
  COUNT(c.id) FILTER (WHERE c.status = 'cleared')                                       AS cleared_count,
  COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'cleared'), 0)::numeric               AS cleared_amount,
  COUNT(c.id) FILTER (WHERE c.status IN ('pending', 'deposited'))                       AS pending_count,
  COALESCE(SUM(c.amount) FILTER (WHERE c.status IN ('pending', 'deposited')), 0)::numeric AS pending_amount,
  COUNT(c.id) FILTER (WHERE c.status = 'bounced')                                       AS bounced_count,
  COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'bounced'), 0)::numeric               AS bounced_amount,
  MAX(c.issue_date)                                                                     AS last_cheque_date,
  MAX(c.deposit_date)                                                                   AS last_deposit_date
FROM parties p
LEFT JOIN cheques c ON c.party_id = p.id
GROUP BY p.id, p.name, p.short_name, p.category, p.contact_phone, p.is_active;

-- Pending-by-deposit-date schedule. If deposit_date is null, fall back to
-- issue_date so the row still appears somewhere on the timeline.
CREATE VIEW cheque_deposit_schedule AS
SELECT
  COALESCE(c.deposit_date, c.issue_date)              AS deposit_date,
  COUNT(*)                                            AS cheque_count,
  SUM(c.amount)::numeric                              AS total_amount,
  ARRAY_AGG(
    json_build_object(
      'id',         c.id,
      'cheque_no',  c.cheque_no,
      'is_online',  c.is_online,
      'amount',     c.amount,
      'party_name', p.name,
      'status',     c.status
    ) ORDER BY p.name
  ) FILTER (WHERE c.id IS NOT NULL)                   AS cheques
FROM cheques c
JOIN parties p ON p.id = c.party_id
WHERE c.status IN ('pending', 'deposited')
GROUP BY COALESCE(c.deposit_date, c.issue_date)
ORDER BY 1;
