-- =============================================================================
-- Migration 027: Cheques ↔ daily_entries expense integration
-- =============================================================================
-- Every cheque issued by the pharmacy that has been deposited or cleared
-- should automatically appear as a Business Expense in the Daily Book so
-- that bank ledgers, expense totals, and the Daily Report all reflect it.
-- Pending / bounced / cancelled cheques do not affect the books.
--
-- Schema:
--   * cheques.expense_category_id  — the Business Expense category the
--                                    cheque is paying into (Purchase,
--                                    Salary, Rent, etc.). Picked at the
--                                    time of cheque creation.
--   * cheques.linked_entry_id      — managed by the trigger. Points at the
--                                    auto-created daily_entries row for
--                                    this cheque.
--
-- Trigger behaviour (BEFORE INSERT/UPDATE on cheques):
--   * IF status IN ('deposited','cleared') AND category set AND amount > 0:
--       insert/update the linked daily_entries row.
--   * ELSE (pending / bounced / cancelled / missing category):
--       delete any existing linked daily_entries row.
--
-- Trigger behaviour (BEFORE DELETE on cheques):
--   * Delete the linked daily_entries row.
--
-- Backfill (Phase D):
--   * Set expense_category_id = 'Other Business Expense' on every existing
--     cheque whose status is currently 'cleared' or 'deposited' — the
--     trigger then auto-creates a linked expense entry for each.
--   * User can re-tag any of them later via the UI.
--
-- Run AFTER migration 026.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Phase A: schema additions
-- ----------------------------------------------------------------------------
ALTER TABLE cheques
    ADD COLUMN expense_category_id UUID REFERENCES categories(id),
    ADD COLUMN linked_entry_id     UUID REFERENCES daily_entries(id) ON DELETE SET NULL;

CREATE INDEX idx_cheques_linked_entry
    ON cheques(linked_entry_id)
    WHERE linked_entry_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Phase B: sync function + triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_cheque_expense_entry()
RETURNS TRIGGER LANGUAGE plpgsql AS $sce$
DECLARE
    v_cheque_mode_id UUID;
    v_party_name     TEXT;
    v_narration      TEXT;
    v_entry_date     DATE;
    v_should_have    BOOLEAN;
BEGIN
    -- Resolve the "Cheque" payment mode once.
    SELECT id INTO v_cheque_mode_id
    FROM payment_modes WHERE slug = 'cheque' LIMIT 1;

    IF v_cheque_mode_id IS NULL THEN
        RAISE WARNING 'sync_cheque_expense_entry: payment_modes slug=cheque missing; skipping';
        RETURN NEW;
    END IF;

    -- Decide whether this cheque SHOULD have a linked expense entry.
    v_should_have := (NEW.status IN ('deposited', 'cleared')
                      AND NEW.account_id IS NOT NULL
                      AND NEW.expense_category_id IS NOT NULL
                      AND NEW.amount > 0);

    IF v_should_have THEN
        -- Build a readable narration.
        SELECT name INTO v_party_name FROM parties WHERE id = NEW.party_id;
        v_party_name := COALESCE(v_party_name, '?');
        v_narration := CASE
            WHEN NEW.is_online THEN
                'Online ref ' || COALESCE(NEW.online_ref, '?') || ' → ' || v_party_name
            ELSE
                'Cheque #' || COALESCE(NEW.cheque_no, '?') || ' → ' || v_party_name
        END;
        -- Use deposit_date when set; fall back to issue_date.
        v_entry_date := COALESCE(NEW.deposit_date, NEW.issue_date);

        IF NEW.linked_entry_id IS NULL THEN
            -- Create a new linked daily_entries row, capture its id.
            INSERT INTO daily_entries (
                entry_date, txn_type, direction, scope,
                account_id, mode_id, category_id,
                txn_amount, narration, notes,
                linked_role, created_by
            ) VALUES (
                v_entry_date, 'entry', 'expense', 'business',
                NEW.account_id, v_cheque_mode_id, NEW.expense_category_id,
                NEW.amount, v_narration,
                'Auto-managed by cheque module. Edit the cheque to change.',
                'cheque_payment', 'system'
            )
            RETURNING id INTO NEW.linked_entry_id;
        ELSE
            -- Update the existing linked row in place.
            UPDATE daily_entries SET
                entry_date  = v_entry_date,
                account_id  = NEW.account_id,
                mode_id     = v_cheque_mode_id,
                category_id = NEW.expense_category_id,
                txn_amount  = NEW.amount,
                narration   = v_narration,
                updated_at  = NOW()
            WHERE id = NEW.linked_entry_id;
        END IF;
    ELSE
        -- Should NOT have a linked entry — remove it if one exists.
        IF NEW.linked_entry_id IS NOT NULL THEN
            DELETE FROM daily_entries WHERE id = NEW.linked_entry_id;
            NEW.linked_entry_id := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$sce$;

DROP TRIGGER IF EXISTS trg_sync_cheque_expense ON cheques;
CREATE TRIGGER trg_sync_cheque_expense
    BEFORE INSERT OR UPDATE OF status, amount, account_id, expense_category_id,
                                deposit_date, issue_date, party_id, cheque_no, online_ref
    ON cheques
    FOR EACH ROW
    EXECUTE FUNCTION sync_cheque_expense_entry();

-- BEFORE DELETE: clean up the linked row so it doesn't outlive its source.
CREATE OR REPLACE FUNCTION sync_cheque_expense_on_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.linked_entry_id IS NOT NULL THEN
        DELETE FROM daily_entries WHERE id = OLD.linked_entry_id;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cheque_expense_delete ON cheques;
CREATE TRIGGER trg_sync_cheque_expense_delete
    BEFORE DELETE ON cheques
    FOR EACH ROW
    EXECUTE FUNCTION sync_cheque_expense_on_delete();

-- ----------------------------------------------------------------------------
-- Phase C: backfill existing cleared / deposited cheques
-- ----------------------------------------------------------------------------
-- Set a default category for any cheque that's already past pending. The
-- trigger fires for each row, auto-creating the linked expense entry.
-- User can re-tag categories from the Cheques UI later.
UPDATE cheques
SET expense_category_id = (
    SELECT id FROM categories
    WHERE direction = 'expense' AND scope = 'business' AND slug = 'other_biz_expense'
    LIMIT 1
)
WHERE status IN ('deposited', 'cleared')
  AND expense_category_id IS NULL;

-- Sanity check
DO $$
DECLARE
    v_cheques_with_entry INT;
    v_cleared_total      INT;
BEGIN
    SELECT COUNT(*) INTO v_cheques_with_entry
    FROM cheques
    WHERE status IN ('deposited', 'cleared') AND linked_entry_id IS NOT NULL;

    SELECT COUNT(*) INTO v_cleared_total
    FROM cheques WHERE status IN ('deposited', 'cleared');

    RAISE NOTICE 'Backfill: % of % cleared/deposited cheques now linked to daily_entries.',
                 v_cheques_with_entry, v_cleared_total;
END $$;
