-- §4 [Josh, S103] — Approach A: subcontractors.insurance_expiry becomes a DERIVED
-- cache of the COI expiry, maintained by triggers. One input (uploading a COI),
-- one derived date. The floored compliance store
-- (subcontractor_compliance_documents, Owner/Admin on all three verbs, S140) stays
-- the survivor; crew keep reading the loose column on /m and never touch the
-- floored store. A COI-less sub has NO derivable date, and that is RULED CORRECT
-- ("an insurance expiry date without a document is useless").
--
-- ⚠️ member_id is NOT unique on subcontractors, so a member's COI change may touch
-- more than one sub row. Nothing enforces 1:1; the triggers act on all matches.
-- ⚠️ MAX answers "may this sub be on site today?" — the furthest-out current COI.
-- A desktop alert may instead key on the SOONEST expiry; different questions,
-- both legitimate. This cache answers the first.

-- 1. The derivation, one place. SECURITY DEFINER: it reads the Owner/Admin-floored
--    compliance store, and it is called from triggers that fire under any role
--    (a PM may UPDATE a sub). It returns only a date — it never exposes a
--    compliance row — so the S140 floor is untouched.
CREATE OR REPLACE FUNCTION compute_member_coi_expiry(p_member_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MAX(expiration_date)
  FROM subcontractor_compliance_documents
  WHERE member_id = p_member_id
    AND doc_type = 'coi'
    AND is_deleted = false;
$$;

-- 2. The GUARD, on subcontractors. BEFORE INSERT OR UPDATE, it PINS
--    insurance_expiry to the derived value — so the column cannot be hand-written
--    (a stray PM edit is silently overridden, not honoured), and a member_id
--    change re-derives. Runs after subcontractors_create_member (which sets
--    member_id on INSERT) — 'pin' sorts after 'create_member'.
CREATE OR REPLACE FUNCTION pin_subcontractor_insurance_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.insurance_expiry := compute_member_coi_expiry(NEW.member_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subcontractors_pin_insurance_expiry ON subcontractors;
CREATE TRIGGER subcontractors_pin_insurance_expiry
  BEFORE INSERT OR UPDATE ON subcontractors
  FOR EACH ROW EXECUTE FUNCTION pin_subcontractor_insurance_expiry();

-- 3. The PUSH, on the compliance store. AFTER INSERT OR UPDATE (a soft-delete is
--    an UPDATE), it re-derives every sub on that member. SECURITY DEFINER so no
--    COI write path — whoever is allowed to write a COI — can bypass it. The
--    UPDATE it issues re-fires the pin guard above, which recomputes the same
--    value; no recursion (the guard writes only NEW, in place).
CREATE OR REPLACE FUNCTION sync_subcontractor_insurance_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE subcontractors
    SET insurance_expiry = compute_member_coi_expiry(NEW.member_id)
    WHERE member_id = NEW.member_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS compliance_docs_sync_insurance ON subcontractor_compliance_documents;
CREATE TRIGGER compliance_docs_sync_insurance
  AFTER INSERT OR UPDATE ON subcontractor_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION sync_subcontractor_insurance_expiry();

-- 4. One-time backfill. ⚠️ This CLEARS any hand-entered insurance_expiry that has
--    no COI backing (sets it to NULL) — the ruled behaviour: the date is now
--    maintained by uploading a COI, not by typing. The pin guard fires here too
--    and agrees.
UPDATE subcontractors SET insurance_expiry = compute_member_coi_expiry(member_id);
