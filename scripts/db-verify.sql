-- Companion to scripts/db-replay-schema.py (npm run db:verify).
--
-- Run this against the target database and compare the six counts with what the
-- replay printed. They must be identical. Any mismatch names the dimension;
-- drill in per table from there.
--
-- ⚠️ READ THE REPLAY SCRIPT'S DOCSTRING FIRST. It lists what this comparison
-- cannot catch — most importantly a constraint that is WRONG rather than
-- missing, which appears in both sides and reports perfectly clean.
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE')                        AS tables,
  (SELECT count(*) FROM information_schema.columns c
     JOIN information_schema.tables t ON t.table_schema=c.table_schema
      AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
    WHERE c.table_schema='public')                                                  AS columns,
  (SELECT count(*) FROM information_schema.columns c
     JOIN information_schema.tables t ON t.table_schema=c.table_schema
      AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
    WHERE c.table_schema='public' AND c.is_nullable='NO')                           AS not_null,
  (SELECT count(*) FROM pg_constraint pc JOIN pg_class cl ON cl.oid=pc.conrelid
     JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE n.nspname='public' AND pc.contype='c')                                    AS checks,
  (SELECT count(*) FROM pg_constraint pc JOIN pg_class cl ON cl.oid=pc.conrelid
     JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE n.nspname='public' AND pc.contype='u')                                    AS uniques,
  (SELECT count(*) FROM pg_constraint pc JOIN pg_class cl ON cl.oid=pc.conrelid
     JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE n.nspname='public' AND pc.contype='f')                                    AS fks,
  (SELECT max(version) FROM supabase_migrations.schema_migrations)                   AS latest_migration;

-- Per-table fingerprint — use this to find WHICH table differs once a count does.
-- SELECT string_agg(t || ':' || md5(names), ',' ORDER BY t) FROM (
--   SELECT cl.relname::text AS t,
--          string_agg(pc.contype::text || ':' || pc.conname::text, ',' ORDER BY pc.contype::text, pc.conname::text) AS names
--   FROM pg_constraint pc JOIN pg_class cl ON cl.oid = pc.conrelid
--   JOIN pg_namespace ns ON ns.oid = cl.relnamespace
--   WHERE ns.nspname = 'public' AND pc.contype IN ('c','u','f') GROUP BY 1) s;
