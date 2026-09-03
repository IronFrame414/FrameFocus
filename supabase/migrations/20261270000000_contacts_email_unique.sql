-- §1c [Josh, S103] — one contact per (company, email). The portal-invite and
-- inline "add a contact" paths minted a fresh contacts row every run, with no
-- guard; rebuild-test had 7 duplicate (company_id, lower(email)) groups (28 rows
-- collapsing to 7). The dedupe ran first (it must — a unique index cannot be
-- built over existing duplicates); this is the constraint that keeps them gone.
--
-- A PARTIAL, EXPRESSION unique index, three predicates:
--   · lower(email)         — CASE-INSENSITIVE. Josh@WorthProp.com and
--                            josh@worthprop.com are the same person, and both
--                            spellings exist in this data.
--   · email IS NOT NULL AND btrim(email) <> ''
--                          — NULL/blank are EXEMPT. A contact with no email is
--                            legitimate, and two of them must not collide.
--   · is_deleted = false   — ⚠️ DEVIATION FROM THE LITERAL PROMPT, recorded:
--                            the prompt's WHERE clause named only the email
--                            predicates. Added `is_deleted = false` because this
--                            codebase is soft-delete throughout (trash-bin
--                            pattern): soft-deleting a contact and later re-adding
--                            the same email is a legitimate flow, and an index
--                            that counted trashed rows would reject that insert.
--                            Flagged for review.
--
-- ⚠️ REBUILD-TEST ONLY. Production duplicate load is UNKNOWN — it was not
-- reachable during this work. The SAME dedupe must be run on production BEFORE
-- this migration is pushed there, or CREATE UNIQUE INDEX will fail. Count with:
--   SELECT count(*) FROM (
--     SELECT company_id, lower(email)
--     FROM contacts WHERE is_deleted=false AND email IS NOT NULL AND btrim(email)<>''
--     GROUP BY 1,2 HAVING count(*) > 1) g;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_company_email_unique
  ON public.contacts (company_id, lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '' AND is_deleted = false;
