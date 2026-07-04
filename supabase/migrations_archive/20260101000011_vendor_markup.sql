-- Migration 012: Add default_markup_percent to subcontractors
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS default_markup_percent NUMERIC(5,2);
