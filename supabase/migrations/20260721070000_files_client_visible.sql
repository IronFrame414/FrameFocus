-- 6B UI build (S87, Q4 REVISED): files.client_visible
--
-- Daily-log photo uploads store category 'daily_logs' and stay OUT of the
-- client-facing photo library by default. client_visible marks an individual
-- file as shareable to the client portal (Module 9). v1 is FLAG ONLY — no
-- portal enforcement exists yet; the M9 build adds the client-role RLS that
-- consumes this column. Toggled from the daily-log photo grid (Module 6B UI).
--
-- IF NOT EXISTS keeps this idempotent: the column is applied to rebuild-test
-- ahead of the batched prod push.

ALTER TABLE files ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT false;
