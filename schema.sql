-- =============================================================
-- ImportLedger Pro — Complete Database Schema
-- Run this in your Supabase SQL Editor (in order)
-- =============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- 1. GLOBAL SETTINGS (key-value store for all admin variables)
-- =============================================================
CREATE TABLE IF NOT EXISTS global_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT UNIQUE NOT NULL,
  value        NUMERIC(10, 4) NOT NULL,
  description  TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default global settings
INSERT INTO global_settings (key, value, description) VALUES
  ('annual_interest_rate',        12.00, 'Annual interest rate (%) applied daily to unit cost'),
  ('risk_buffer_percentage',       3.00, 'Risk buffer (%) for rejections / cancellations'),
  ('default_currency_conversion',  11.80, 'Default CNY to INR conversion rate'),
  ('standard_platform_fee_pct',   10.00, 'Platform fee (%) deducted from selling price')
ON CONFLICT (key) DO NOTHING;

-- =============================================================
-- 2. SHIPMENTS
-- =============================================================
CREATE TABLE IF NOT EXISTS shipments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_code  TEXT UNIQUE NOT NULL,
  date           DATE NOT NULL,
  total_units    INTEGER DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'In-Transit'
                   CHECK (status IN ('In-Transit','In-Warehouse','Completed','Cancelled')),
  origin_country TEXT DEFAULT 'China',
  destination    TEXT DEFAULT 'India',
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- 3. UNITS (individual serialised products)
-- =============================================================
CREATE TABLE IF NOT EXISTS units (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number         TEXT UNIQUE NOT NULL,
  shipment_id           UUID REFERENCES shipments(id) ON DELETE SET NULL,
  product_name          TEXT NOT NULL,
  category              TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'In-Transit'
                          CHECK (status IN ('In-Transit','In-Warehouse','Sold','Cash-Received','Rejected')),
  purchase_price_cny    NUMERIC(12, 2) DEFAULT 0,   -- Original price in CNY
  purchase_price_inr    NUMERIC(12, 2) DEFAULT 0,   -- Converted to INR at time of purchase
  selling_price         NUMERIC(12, 2),
  platform_fee_override NUMERIC(5, 2),              -- If null, use global setting
  date_advance_paid     DATE,                        -- Interest start date
  date_arrived          DATE,                        -- Arrived in warehouse
  date_sold             DATE,
  date_cash_received    DATE,                        -- Interest stop date
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_units_shipment    ON units(shipment_id);
CREATE INDEX IF NOT EXISTS idx_units_status      ON units(status);
CREATE INDEX IF NOT EXISTS idx_units_category    ON units(category);

-- =============================================================
-- 4. EXPENSES
-- =============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount           NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  category         TEXT NOT NULL,
  -- Liability rule determines how this expense is distributed
  expense_type     TEXT NOT NULL DEFAULT 'Global'
                     CHECK (expense_type IN ('Shipment','Global','Category')),
  shipment_id      UUID REFERENCES shipments(id) ON DELETE SET NULL, -- For Shipment-type
  category_target  TEXT,                                              -- For Category-type
  date             DATE NOT NULL,
  description      TEXT,
  distributed      BOOLEAN DEFAULT FALSE,  -- Has distribution been run?
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date          ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_type          ON expenses(expense_type);
CREATE INDEX IF NOT EXISTS idx_expenses_shipment      ON expenses(shipment_id);
CREATE INDEX IF NOT EXISTS idx_expenses_distributed   ON expenses(distributed);

-- =============================================================
-- 5. EXPENSE ALLOCATIONS (computed ledger entries)
-- =============================================================
CREATE TABLE IF NOT EXISTS expense_allocations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id       UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  unit_id          UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  allocated_amount NUMERIC(12, 4) NOT NULL,
  allocation_date  DATE NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (expense_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_allocations_unit    ON expense_allocations(unit_id);
CREATE INDEX IF NOT EXISTS idx_allocations_expense ON expense_allocations(expense_id);

-- =============================================================
-- 6. INTEREST ACCRUAL LOG (daily snapshots — optional audit trail)
-- =============================================================
CREATE TABLE IF NOT EXISTS interest_accrual_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id          UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  accrual_date     DATE NOT NULL,
  daily_interest   NUMERIC(12, 4) NOT NULL,
  base_cost        NUMERIC(12, 4) NOT NULL,
  rate_used        NUMERIC(8, 4) NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (unit_id, accrual_date)
);

CREATE INDEX IF NOT EXISTS idx_accrual_unit ON interest_accrual_log(unit_id);

-- =============================================================
-- 7. AUTO-UPDATE updated_at TRIGGER
-- =============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_units_updated_at
  BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- 8. HELPER VIEW — unit cost summary (base + allocations)
-- =============================================================
CREATE OR REPLACE VIEW unit_cost_summary AS
SELECT
  u.id,
  u.serial_number,
  u.product_name,
  u.category,
  u.status,
  u.purchase_price_inr                          AS base_cost,
  COALESCE(SUM(ea.allocated_amount), 0)         AS total_allocated_expenses,
  u.purchase_price_inr
    + COALESCE(SUM(ea.allocated_amount), 0)     AS total_base_plus_expenses,
  u.date_advance_paid,
  u.date_cash_received,
  u.selling_price,
  u.shipment_id
FROM units u
LEFT JOIN expense_allocations ea ON ea.unit_id = u.id
GROUP BY u.id;

-- =============================================================
-- Row Level Security (enable in Supabase Dashboard → Auth → RLS)
-- For now, policies allow authenticated users full access.
-- =============================================================
ALTER TABLE global_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE units              ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE interest_accrual_log ENABLE ROW LEVEL SECURITY;

-- Allow full access to authenticated users
CREATE POLICY "Authenticated full access" ON global_settings    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON shipments          FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON units              FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON expenses           FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON expense_allocations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON interest_accrual_log FOR ALL USING (auth.role() = 'authenticated');

-- For DEVELOPMENT ONLY: Allow anonymous access (remove in production)
-- Comment these out once you add auth
CREATE POLICY "Anon read" ON global_settings      FOR ALL USING (true);
CREATE POLICY "Anon read" ON shipments            FOR ALL USING (true);
CREATE POLICY "Anon read" ON units                FOR ALL USING (true);
CREATE POLICY "Anon read" ON expenses             FOR ALL USING (true);
CREATE POLICY "Anon read" ON expense_allocations  FOR ALL USING (true);
CREATE POLICY "Anon read" ON interest_accrual_log FOR ALL USING (true);
