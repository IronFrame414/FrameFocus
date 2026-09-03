-- §1 [Josh, S103] — The DEDUPE that must run BEFORE the unique index
-- (20261270000000_contacts_email_unique). That index cannot be built over
-- existing duplicate (company_id, lower(email)) groups; on rebuild-test the
-- dedupe was done by hand and left NO repo record, so a production push of the
-- index would hit CREATE UNIQUE INDEX with production's duplicates still present
-- and FAIL. This migration is that missing step, made repeatable and safe.
--
-- TIMESTAMP: 20261265000000 orders this strictly before ...270000 (index) and
-- ...280000 (insurance). rebuild-test already has 270000/280000 applied and is
-- already deduped, so here this migration is a clean NO-OP; on production it runs
-- first and does the real work.
--
-- IDEMPOTENT: keyed entirely off live duplicate groups. Zero groups -> both DO
-- blocks loop zero times -> nothing happens. Safe to re-run.
--
-- ⚠️ WRITTEN BLIND AGAINST PRODUCTION DATA. Every repoint that can collide with a
-- unique constraint is handled explicitly (see each block). The one case that
-- CANNOT be auto-merged — two rows in a group that each own a portal login
-- (profiles.contact_id is UNIQUE) — is caught by a PRE-FLIGHT check that ABORTS
-- the whole migration before a single write, naming the groups to resolve by
-- hand. Aborting-clean beats dying-halfway on contact records.
--
-- RULE: keep the OLDEST row (created_at, then id) as canonical; repoint all nine
-- FKs to it BEFORE deleting anything; hard-delete the redundant rows; and write a
-- durable audit row per removal.

-- ---------------------------------------------------------------------------
-- 0. Durable audit of what was removed.
--    Your audit noted the s97 manual deletes are unrecoverable (no tombstone, no
--    archive). A NOTICE scrolls away; contact-row deletion on production needs a
--    row you can query afterward and say exactly what went and where it went. So:
--    a real, append-only table. RLS ENABLED with NO policies -> unreachable via
--    PostgREST (it holds emails/names); only service_role/superuser reads it.
CREATE TABLE IF NOT EXISTS public.contacts_dedupe_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at                timestamptz NOT NULL DEFAULT now(),
  company_id            uuid,
  email                 text,
  canonical_contact_id  uuid,
  removed_contact_id    uuid,
  removed_first_name    text,
  removed_last_name     text,
  removed_created_at    timestamptz,
  repoint_counts        jsonb
);
ALTER TABLE public.contacts_dedupe_log ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 1. PRE-FLIGHT. Refuse — before any mutation — if any duplicate group has two or
--    more rows that each own a portal login. Those cannot be merged automatically
--    (which login survives is not ours to decide), and silently leaving them would
--    just defeat the unique index later with a worse error.
DO $preflight$
DECLARE
  bad  record;
  msg  text := '';
BEGIN
  FOR bad IN
    SELECT c.company_id,
           lower(c.email) AS em,
           count(*) FILTER (WHERE p.id IS NOT NULL) AS logins
    FROM public.contacts c
    LEFT JOIN public.profiles p ON p.contact_id = c.id
    WHERE c.is_deleted = false
      AND c.email IS NOT NULL
      AND btrim(c.email) <> ''
    GROUP BY c.company_id, lower(c.email)
    HAVING count(*) > 1
       AND count(*) FILTER (WHERE p.id IS NOT NULL) > 1
  LOOP
    msg := msg || format(E'\n  company=%s  email=%s  logins=%s',
                         bad.company_id, bad.em, bad.logins);
  END LOOP;

  IF msg <> '' THEN
    RAISE EXCEPTION
      'contacts dedupe ABORTED (no changes made): duplicate group(s) own more than one portal login and cannot be auto-merged. Resolve these by hand, then re-run:%',
      msg;
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 2. The dedupe.
DO $dedupe$
DECLARE
  grp        record;
  canonical  uuid;
  r          record;
  c_proj int; c_pc int; c_pc_drop int; c_est int; c_pay int; c_ref int;
  c_prof int; c_addr int; c_inv int; c_crs int; c_crs_drop int;
BEGIN
  FOR grp IN
    SELECT company_id, lower(email) AS em
    FROM public.contacts
    WHERE is_deleted = false AND email IS NOT NULL AND btrim(email) <> ''
    GROUP BY company_id, lower(email)
    HAVING count(*) > 1
  LOOP
    -- canonical = OLDEST; id as a deterministic tiebreak on identical timestamps.
    SELECT id INTO canonical
    FROM public.contacts
    WHERE company_id = grp.company_id AND lower(email) = grp.em AND is_deleted = false
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    FOR r IN
      SELECT id, first_name, last_name, created_at
      FROM public.contacts
      WHERE company_id = grp.company_id AND lower(email) = grp.em
        AND is_deleted = false AND id <> canonical
    LOOP
      -- project_contacts: full unique (project_id, contact_id). Drop the redundant
      -- link on any project the canonical is already linked to, then repoint rest.
      DELETE FROM public.project_contacts
      WHERE contact_id = r.id
        AND EXISTS (
          SELECT 1 FROM public.project_contacts pc2
          WHERE pc2.project_id = public.project_contacts.project_id
            AND pc2.contact_id = canonical);
      GET DIAGNOSTICS c_pc_drop = ROW_COUNT;
      UPDATE public.project_contacts SET contact_id = canonical WHERE contact_id = r.id;
      GET DIAGNOSTICS c_pc = ROW_COUNT;

      -- contact_addresses: partial unique one active primary per contact. If the
      -- canonical already has one, demote the redundant's active primary first so
      -- the repoint cannot collide. No address is lost, only its primary flag.
      IF EXISTS (SELECT 1 FROM public.contact_addresses
                 WHERE contact_id = canonical AND is_primary AND is_deleted = false) THEN
        UPDATE public.contact_addresses SET is_primary = false
        WHERE contact_id = r.id AND is_primary AND is_deleted = false;
      END IF;
      UPDATE public.contact_addresses SET contact_id = canonical WHERE contact_id = r.id;
      GET DIAGNOSTICS c_addr = ROW_COUNT;

      -- client_reminder_settings: unique (contact_id). Canonical's settings win; a
      -- redundant's row is dropped when canonical already has one, else repointed.
      DELETE FROM public.client_reminder_settings
      WHERE contact_id = r.id
        AND EXISTS (SELECT 1 FROM public.client_reminder_settings s2 WHERE s2.contact_id = canonical);
      GET DIAGNOSTICS c_crs_drop = ROW_COUNT;
      UPDATE public.client_reminder_settings SET contact_id = canonical WHERE contact_id = r.id;
      GET DIAGNOSTICS c_crs = ROW_COUNT;

      -- profiles: unique (contact_id), SET NULL on delete — THE login. Pre-flight
      -- guarantees the group does not have two logins, so at most one of
      -- {canonical, this r, other rs} owns a profile. Move it onto the canonical
      -- only when the canonical has none; never orphan it to a delete.
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE contact_id = canonical) THEN
        UPDATE public.profiles SET contact_id = canonical WHERE contact_id = r.id;
        GET DIAGNOSTICS c_prof = ROW_COUNT;
      ELSE
        c_prof := 0;
      END IF;

      -- Plain repoints — no unique constraint on contact_id on these.
      UPDATE public.projects        SET contact_id = canonical WHERE contact_id = r.id;
      GET DIAGNOSTICS c_proj = ROW_COUNT;
      UPDATE public.estimates       SET contact_id = canonical WHERE contact_id = r.id;
      GET DIAGNOSTICS c_est = ROW_COUNT;
      UPDATE public.client_payments SET contact_id = canonical WHERE contact_id = r.id;
      GET DIAGNOSTICS c_pay = ROW_COUNT;
      UPDATE public.client_refunds  SET contact_id = canonical WHERE contact_id = r.id;
      GET DIAGNOSTICS c_ref = ROW_COUNT;
      UPDATE public.invitations     SET contact_id = canonical WHERE contact_id = r.id;
      GET DIAGNOSTICS c_inv = ROW_COUNT;

      -- Record, THEN delete. All nine FKs now point at canonical; the redundant
      -- row is referenced by nothing, so the hard delete cannot cascade or block.
      INSERT INTO public.contacts_dedupe_log (
        company_id, email, canonical_contact_id, removed_contact_id,
        removed_first_name, removed_last_name, removed_created_at, repoint_counts)
      VALUES (
        grp.company_id, grp.em, canonical, r.id,
        r.first_name, r.last_name, r.created_at,
        jsonb_build_object(
          'projects', c_proj, 'project_contacts', c_pc,
          'project_contacts_dropped', c_pc_drop, 'estimates', c_est,
          'client_payments', c_pay, 'client_refunds', c_ref, 'profiles', c_prof,
          'contact_addresses', c_addr, 'invitations', c_inv,
          'client_reminder_settings', c_crs, 'client_reminder_settings_dropped', c_crs_drop));

      DELETE FROM public.contacts WHERE id = r.id;
    END LOOP;
  END LOOP;
END
$dedupe$;
