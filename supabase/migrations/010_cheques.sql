-- =============================================================================
-- Migration 010: cheques + parties + banks
-- =============================================================================
-- New feature: track cheques + online payments issued by the pharmacy to
-- vendors (parties). Modelled after the user's existing Excel workbook
-- (Cheque Status / Daily_Cheque / PartyList sheets) but normalised into
-- proper relational tables.
--
-- Tables added:
--   - banks      master list of bank accounts (one default flag)
--   - parties    master list of payees (vendors / staff / services)
--   - cheques    every cheque OR online transfer issued
--
-- Views added:
--   - cheque_summary           top-level KPI tile counts + totals
--   - cheque_party_summary     per-party rollup (issued / cleared / pending /
--                              bounced / cancelled, with last cheque date)
--   - cheque_deposit_schedule  pending cheques grouped by deposit_date
--
-- Idempotent: drops existing objects first.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Drop dependents first (CASCADE cleans the rest)
-- ---------------------------------------------------------------------------
DROP VIEW  IF EXISTS cheque_deposit_schedule CASCADE;
DROP VIEW  IF EXISTS cheque_party_summary    CASCADE;
DROP VIEW  IF EXISTS cheque_summary          CASCADE;
DROP TABLE IF EXISTS cheques                 CASCADE;
DROP TABLE IF EXISTS parties                 CASCADE;
DROP TABLE IF EXISTS banks                   CASCADE;

-- ---------------------------------------------------------------------------
-- 1. banks — master list of accounts the pharmacy issues cheques from
-- ---------------------------------------------------------------------------
CREATE TABLE banks (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL UNIQUE,    -- e.g. "HDFC Bank"
    short_name  VARCHAR(20),                     -- e.g. "HDFC" — for chart axes
    account_no  VARCHAR(30),                     -- last-4 OK; staff convenience only
    is_default  BOOLEAN      NOT NULL DEFAULT false,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    notes       TEXT,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Only one default bank at a time
CREATE UNIQUE INDEX banks_only_one_default
    ON banks (is_default) WHERE is_default = true;

CREATE TRIGGER update_banks_updated_at
    BEFORE UPDATE ON banks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed one row so the cheque modal has a sensible default. Edit later in
-- /dashboard/cheques/banks.
INSERT INTO banks (name, short_name, is_default)
VALUES ('Primary Bank', 'BANK', true);

ALTER TABLE banks DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. parties — vendors, staff, services we issue cheques to
-- ---------------------------------------------------------------------------
CREATE TABLE parties (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(200) NOT NULL UNIQUE,
    short_name    VARCHAR(100),                  -- nickname for narrow UI
    category      VARCHAR(20)  NOT NULL DEFAULT 'pharma'
                  CHECK (category IN ('pharma', 'staff', 'service', 'utility', 'other')),
    contact_phone VARCHAR(15),
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    notes         TEXT,
    created_at    TIMESTAMPTZ  DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_parties_active   ON parties(is_active);
CREATE INDEX idx_parties_category ON parties(category);
CREATE INDEX idx_parties_name     ON parties(LOWER(name));

CREATE TRIGGER update_parties_updated_at
    BEFORE UPDATE ON parties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE parties DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. cheques — every cheque or online transfer the pharmacy issued
-- ---------------------------------------------------------------------------
CREATE TABLE cheques (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id        UUID         REFERENCES parties(id) ON DELETE RESTRICT,
    bank_id         UUID         REFERENCES banks(id)   ON DELETE SET NULL,

    -- Cheque vs online
    is_online       BOOLEAN      NOT NULL DEFAULT false,
    cheque_no       VARCHAR(20),         -- physical cheque #, NULL when is_online=true
    online_ref      VARCHAR(50),         -- UPI ref / NEFT UTR / transaction id, optional

    -- Money
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),

    -- Dates
    issue_date      DATE         NOT NULL,                  -- date written on cheque
    deposit_date    DATE,                                   -- planned bank deposit date
    clearance_date  DATE,                                   -- actual clearance / settlement

    -- Status
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'deposited', 'cleared', 'bounced', 'cancelled')),

    -- Bookkeeping
    remarks         TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW(),
    created_by      VARCHAR(100) DEFAULT 'staff'
);

-- Sensible XOR: physical cheques have a number; online has a (optional) ref
ALTER TABLE cheques
  ADD CONSTRAINT cheques_id_consistency
  CHECK (
      (is_online = false AND cheque_no IS NOT NULL) OR
      (is_online = true)
  );

-- A cheque number, when present, must be unique within a single bank
CREATE UNIQUE INDEX cheques_unique_no_per_bank
    ON cheques (bank_id, cheque_no)
    WHERE is_online = false AND cheque_no IS NOT NULL;

CREATE INDEX idx_cheques_party        ON cheques(party_id);
CREATE INDEX idx_cheques_bank         ON cheques(bank_id);
CREATE INDEX idx_cheques_status       ON cheques(status);
CREATE INDEX idx_cheques_issue_date   ON cheques(issue_date);
CREATE INDEX idx_cheques_deposit_date ON cheques(deposit_date) WHERE deposit_date IS NOT NULL;

CREATE TRIGGER update_cheques_updated_at
    BEFORE UPDATE ON cheques
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE cheques DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. cheque_summary — top-of-page KPI tiles
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

-- ---------------------------------------------------------------------------
-- 5. cheque_party_summary — per-party rollup
-- ---------------------------------------------------------------------------
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
  MAX(c.clearance_date)                                                                 AS last_clearance_date
FROM parties p
LEFT JOIN cheques c ON c.party_id = p.id
GROUP BY p.id, p.name, p.short_name, p.category, p.contact_phone, p.is_active;

-- ---------------------------------------------------------------------------
-- 6. cheque_deposit_schedule — what is hitting the bank when
-- ---------------------------------------------------------------------------
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
      'party_name', p.name
    ) ORDER BY p.name
  ) FILTER (WHERE c.id IS NOT NULL)                   AS cheques
FROM cheques c
JOIN parties p ON p.id = c.party_id
WHERE c.status IN ('pending', 'deposited')
GROUP BY COALESCE(c.deposit_date, c.issue_date)
ORDER BY 1;
