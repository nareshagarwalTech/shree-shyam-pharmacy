-- =============================================================================
-- Migration 026: Unify cheques.bank_id → accounts.id, drop banks table
-- =============================================================================
-- The Cheques module had its own banks table (migration 010), separate from
-- the Daily Book's accounts table (migration 016). Two records for the same
-- physical bank account meant cheque activity never showed up on the Daily
-- Book bank ledger.
--
-- This migration:
--   1. Adds cheques.account_id REFERENCES accounts(id)
--   2. Backfills all existing cheques to MAHESH BANK (the user's confirmed
--      mapping for the single legacy "Primary Bank" record)
--   3. Drops the bank-related index + constraint, then the bank_id column
--   4. Drops the banks table (no views or other tables reference it)
--   5. Recreates the unique-cheque-no index, now scoped per ACCOUNT
--
-- Run AFTER migration 025.
-- =============================================================================

BEGIN;

-- Step 1: add the new column
ALTER TABLE cheques ADD COLUMN account_id UUID REFERENCES accounts(id);

-- Step 2: backfill — all 73 cheques → MAHESH BANK
UPDATE cheques
SET account_id = (SELECT id FROM accounts WHERE name = 'MAHESH BANK' AND is_active = TRUE LIMIT 1);

-- Verify no cheques are left without an account assignment.
DO $unmapped$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM cheques WHERE account_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Cannot proceed: % cheques have NULL account_id after backfill. '
                    'Make sure MAHESH BANK exists in accounts.', n;
  END IF;
END $unmapped$;

-- Step 3: enforce NOT NULL going forward
ALTER TABLE cheques ALTER COLUMN account_id SET NOT NULL;

-- Step 4: drop indexes that depend on bank_id, then drop the column
DROP INDEX IF EXISTS cheques_unique_no_per_bank;
DROP INDEX IF EXISTS idx_cheques_bank;
ALTER TABLE cheques DROP COLUMN bank_id;

-- Step 5: drop the now-orphan banks table
DROP TABLE banks CASCADE;

-- Step 6: recreate the per-account unique cheque-no index + a plain account index
CREATE UNIQUE INDEX cheques_unique_no_per_account
    ON cheques (account_id, cheque_no)
    WHERE is_online = FALSE AND cheque_no IS NOT NULL;

CREATE INDEX idx_cheques_account ON cheques(account_id);

COMMIT;
