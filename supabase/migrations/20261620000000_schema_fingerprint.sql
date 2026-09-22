-- ============================================================================
-- S108 C2 — SCHEMA DRIFT DETECTION: the fingerprint the cron route reads.
-- ============================================================================
--
-- ⚠️ WHY THIS EXISTS. Production has been written by hand. Two S104 migrations
-- were applied through the SQL Editor, silently truncated, and left LEDGER ROWS
-- FOR WORK THAT NEVER RAN. So the ledger can lie, and any check worth having
-- must read the OBJECTS.
--
-- ⚠️ WHY A DATABASE FUNCTION AND NOT A QUERY IN THE ROUTE. The cron route
-- reaches the database through PostgREST with the service-role key, and
-- PostgREST cannot run arbitrary SQL. An RPC is the only way to ask the catalog
-- a question from a Vercel route. It is SECURITY DEFINER for the same reason
-- every catalog read is: `pg_get_functiondef` on a function you do not own is
-- refused, and the service role does not own the migration-created objects.
--
-- ⚠️ WHAT IT DELIBERATELY DOES **NOT** COVER, and this list is the point rather
-- than a disclaimer. `npm run db:verify` already replays the migration FILES and
-- compares tables, columns, NOT NULL, CHECK, UNIQUE and FK. Its own docstring
-- names what it cannot see: "FUNCTION BODIES, RLS POLICIES, TRIGGERS, INDEXES,
-- DEFAULTS, GRANTS." This function covers the first three of those, plus
-- constraints as a cross-check against the replay. INDEXES, DEFAULTS and GRANTS
-- are still uncovered — a decision, not an oversight.
--
-- ⚠️ AND WHAT NO FINGERPRINT CAN CATCH:
--   1. A statement hand-applied and REVERTED between two daily runs.
--   2. DDL executed at runtime by a function built with format()/EXECUTE. The
--      function BODY is fingerprinted, so editing the body is caught; what that
--      body executes is not attributable to it.
--   3. DATA drift. This reads pg_catalog, never a tenant row.
--   4. A constraint that is WRONG rather than MISSING — it appears in both the
--      tree and the database and reports perfectly clean. That is exactly what
--      #3-deliv was. Only a test that performs the operation catches it.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The comment normaliser.
-- ---------------------------------------------------------------------------
-- ⚠️ THIS EXISTS BECAUSE MCP `apply_migration` STRIPS COMMENTS FROM FUNCTION
-- BODIES. Without normalisation every MCP-deployed function would report as
-- drift forever, and the detector would be ignored inside a week.
--
-- ⚠️ AND THE NAIVE IMPLEMENTATION IS MEASURABLY WRONG. "Strip everything after
-- `--`" looks right and is not. Measured against this catalogue on 2026-09-22
-- by counting single quotes before the `--` on each line:
--
--     `--` that is a real comment ............ 391 occurrences
--     `--` INSIDE a string literal ...........   2 occurrences, 1 function
--
-- Both live in `qb_vault_put`, inside RAISE message text:
--     '[7G] refusing to overwrite the QuickBooks token for company % -- a
--      company row still points at this secret, so it is in use, not orphaned.'
--
-- A naive strip truncates those messages, so an edit to the text AFTER the `--`
-- would be invisible to the detector. So: a line comment is stripped only when
-- the number of single quotes before it on that line is EVEN.
--
-- ⚠️ KNOWN LIMIT, stated rather than hidden: `position()` finds only the FIRST
-- `--` on a line. A line carrying a `--` inside a literal AND a real trailing
-- comment after it keeps both. No such line exists today; if one appears, the
-- cost is a false NEGATIVE on that line, never a false alarm.
CREATE OR REPLACE FUNCTION public.strip_sql_line_comments(p_src text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT coalesce(string_agg(stripped, E'\n' ORDER BY ord), '')
  FROM (
    SELECT
      ord,
      CASE
        WHEN position('--' IN ln) = 0 THEN ln
        -- Odd number of quotes before the `--` means we are inside a string
        -- literal. Keep the line whole.
        WHEN (
          length(left(ln, position('--' IN ln)))
          - length(replace(left(ln, position('--' IN ln)), '''', ''))
        ) % 2 = 1 THEN ln
        ELSE left(ln, position('--' IN ln) - 1)
      END AS stripped
    FROM unnest(string_to_array(p_src, E'\n')) WITH ORDINALITY AS t(ln, ord)
  ) s;
$fn$;

COMMENT ON FUNCTION public.strip_sql_line_comments(text) IS
  'S108 C2. Strips SQL line comments for fingerprint normalisation, skipping a '
  '`--` that sits inside a string literal (quote parity). Exists because MCP '
  'apply_migration strips comments from function bodies; without this every '
  'MCP-deployed function would report as permanent drift.';


-- ---------------------------------------------------------------------------
-- 2. The fingerprint.
-- ---------------------------------------------------------------------------
-- Four dimensions, each a COUNT and an md5 over a stably ordered rendering, so
-- a mismatch names the dimension rather than just saying "something changed".
--
-- ⚠️ ORDER BY IS LOAD-BEARING IN EVERY string_agg HERE. Without it the
-- aggregate takes heap order, which shifts whenever any row is updated — the
-- `.limit(1)` class from CLAUDE.md, applied to an aggregate. An unordered
-- fingerprint would alarm at random and be switched off.
CREATE OR REPLACE FUNCTION public.schema_fingerprint()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $fn$
  WITH pol AS (
    SELECT
      count(*) AS n,
      md5(coalesce(string_agg(
        schemaname || '.' || tablename || '.' || policyname
          || '|' || cmd
          || '|' || coalesce(array_to_string(roles, ','), '')
          || '|' || coalesce(qual, '')
          || '|' || coalesce(with_check, ''),
        E'\n' ORDER BY schemaname, tablename, policyname, cmd
      ), '')) AS h
    FROM pg_policies WHERE schemaname = 'public'
  ), trg AS (
    SELECT
      count(*) AS n,
      md5(coalesce(string_agg(
        c.relname || '.' || t.tgname || '|' || pg_get_triggerdef(t.oid),
        E'\n' ORDER BY c.relname, t.tgname
      ), '')) AS h
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
  ), fn AS (
    SELECT
      count(*) AS n,
      md5(coalesce(string_agg(
        p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|'
          || md5(regexp_replace(
               trim(strip_sql_line_comments(pg_get_functiondef(p.oid))),
               '\s+', ' ', 'g')),
        E'\n' ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
      ), '')) AS h
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ), con AS (
    SELECT
      count(*) AS n,
      md5(coalesce(string_agg(
        cl.relname || '.' || pc.conname || '|' || pc.contype::text
          || '|' || pg_get_constraintdef(pc.oid),
        E'\n' ORDER BY cl.relname, pc.conname
      ), '')) AS h
    FROM pg_constraint pc
    JOIN pg_class cl ON cl.oid = pc.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public' AND pc.contype IN ('c', 'u', 'f', 'p')
  )
  SELECT jsonb_build_object(
    'policies',    jsonb_build_object('n', pol.n, 'md5', pol.h),
    'triggers',    jsonb_build_object('n', trg.n, 'md5', trg.h),
    'functions',   jsonb_build_object('n', fn.n,  'md5', fn.h),
    'constraints', jsonb_build_object('n', con.n, 'md5', con.h),
    'latest_migration', (SELECT max(version) FROM supabase_migrations.schema_migrations)
  )
  FROM pol, trg, fn, con;
$fn$;

COMMENT ON FUNCTION public.schema_fingerprint() IS
  'S108 C2. Four md5 digests + counts over RLS policies, triggers, function '
  'bodies and constraints, read from pg_catalog. Consumed by '
  '/api/cron/schema-drift and by npm run db:fingerprint. Reads no tenant row, '
  'so its cost does not grow with data volume (measured 0.5s wall including '
  'the network round trip).';


-- ---------------------------------------------------------------------------
-- 3. Grants.
-- ---------------------------------------------------------------------------
-- ⚠️ SECURITY DEFINER + PUBLIC EXECUTE WOULD HAND EVERY SIGNED-IN USER A
-- COMPLETE MAP OF EVERY RLS POLICY IN THE DATABASE, including the exact
-- predicates of the Financial Visibility Floor. Revoke first, then grant only
-- to the role the cron route actually uses. REVOKE FROM PUBLIC is not implied
-- by the CREATE — Postgres grants EXECUTE to PUBLIC by default on functions.
REVOKE ALL ON FUNCTION public.schema_fingerprint() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schema_fingerprint() FROM anon;
REVOKE ALL ON FUNCTION public.schema_fingerprint() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.schema_fingerprint() TO service_role;

REVOKE ALL ON FUNCTION public.strip_sql_line_comments(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.strip_sql_line_comments(text) FROM anon;
REVOKE ALL ON FUNCTION public.strip_sql_line_comments(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.strip_sql_line_comments(text) TO service_role;


-- ---------------------------------------------------------------------------
-- 4. The notification type.
-- ---------------------------------------------------------------------------
-- ⚠️ THREE REGISTRIES MOVE TOGETHER for a notified type — this CHECK, the
-- `NotificationType` union in lib/notify/notify.ts, and `email_types`/
-- `EmailType` IF it is emailed. This one is NOT emailed (in-app + push only),
-- matching selection_approved / po_item_missing / qb_sync_blocked, so
-- `email_types` is deliberately untouched and no second CHECK widens.
--
-- ⚠️ RECIPIENT IS ONE OWNER, NOT EVERY TENANT'S OWNER [Josh, S108 FILL-C6].
-- notify() is tenant-scoped and schema drift is not. A contractor cannot act on
-- a platform-integrity alert and should not be shown one. The route resolves a
-- single company BY ID (a slug is editable; a renamed company must not silently
-- stop reporting) and writes to that Owner only. The body carries NO drift
-- detail — which dimension moved is read from the route response and the log.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'mention',
    'assignment',
    'incident',
    'signed',
    'reminders_exhausted',
    'discrepancy',
    'timesheet_ready',
    'daily_log_missing',
    'still_clocked_in',
    'contract_signed',
    'punch_assigned',
    'low_stock',
    'trial_warning',
    'selection_approved',
    'selection_denied',
    'po_item_missing',
    'qb_sync_blocked',
    -- S108 C2. The daily schema-drift check found the live catalogue no longer
    -- matching the committed fingerprint. Platform integrity, not tenant data:
    -- one Owner, resolved by company id, and no drift detail in the body.
    'schema_drift'
  ));

COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS
  'S108 C2 added schema_drift. ⚠️ This CHECK is an ALLOWLIST rebuilt in full on '
  'every change — adding a value means restating the others, and dropping one '
  'silently orphans existing rows of that type.';
