-- =============================================================================
-- Migration 015: cheques — ledger_no + invoice period (from/to)
-- =============================================================================
-- Per user request, capture two more pieces of context per cheque:
--   - Ledger No: the accounting ledger reference for this payment
--   - Invoice period covered by the cheque (period_from .. period_to)
--     -- e.g. "this cheque clears all invoices from 01 Mar to 31 Mar"
--
-- All three are optional — most cheques don't need them.
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- =============================================================================

ALTER TABLE cheques ADD COLUMN IF NOT EXISTS ledger_no   VARCHAR(50);
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS period_from DATE;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS period_to   DATE;

-- Sanity: period_to should not be before period_from
ALTER TABLE cheques DROP CONSTRAINT IF EXISTS cheques_period_order;
ALTER TABLE cheques
  ADD CONSTRAINT cheques_period_order
  CHECK (
    period_from IS NULL
    OR period_to IS NULL
    OR period_to >= period_from
  );

-- Searchable / sortable index for the ledger field
CREATE INDEX IF NOT EXISTS idx_cheques_ledger_no
  ON cheques(ledger_no)
  WHERE ledger_no IS NOT NULL;
