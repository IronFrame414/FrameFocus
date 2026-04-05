-- Migration 011: Add preferred, default_hourly_rate, and ein to subcontractors
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS ein TEXT;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS default_hourly_rate NUMERIC(10,2);
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS preferred BOOLEAN DEFAULT false;
