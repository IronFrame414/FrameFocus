-- S120 PART 4 — who a proposal goes to: the "Also send to" contacts (4-A) and a
-- typed "Also send to" address (4-B).
--
-- ⚠️ MEASURED S120, BEFORE BUILDING: 4-A ALREADY HAS A STORE. `estimates.also_send_to`
-- (jsonb list of {contact_id, name, email}, 20261150000000 / 20261260000000,
-- frozen on send by the immutability allowlist) is the "one estimate to many
-- contacts" the spec asks for, with a details-page field (also-send-to-field.tsx).
-- It is NOT duplicated into a new join table — a second store for the same list
-- is the divergence PARITY forbids. What it lacked is fixed here and in the send
-- routes:
--   * NO SEND ROUTE READ IT. Every recipient saved there was silently never
--     emailed (production: 1 estimate, a draft, so nobody has missed one yet).
--     The send and resend routes now mail every recipient (lib/services/
--     proposal-copies.ts) and record one send event listing every address.
--   * Nothing checked its contacts were the company's own (the #177 shape, in
--     jsonb), and anyone who could edit the estimate could change it.
--
-- RULES ADDED (a trigger — writes only; NOT a constraint over existing rows):
--   1. Changing who a proposal goes to is OWNER/ADMIN only (S120 ASK-8 default:
--      adding a recipient is part of sending, and sending is Owner/Admin).
--   2. Every also_send_to contact must be a live contact of the ESTIMATE's own
--      company; a foreign id and a missing id get the same refusal.
--   3. also_send_to_email is ONE well-formed address (ASK-2 default: one),
--      trimmed and lower-cased; blank means none. A malformed value is REFUSED,
--      never silently dropped.
--
-- The typed address is NOT a contact and gets NO read path: it receives a COPY
-- of the proposal email (no signing link — see proposal-copies.ts), and nothing
-- else. Frozen on send by the existing ALLOWLIST in enforce_estimate_immutability
-- (every column not on its permitted list freezes, including this new one).
--
-- Service role (auth.uid() IS NULL) passes: the clone/convert functions never
-- copy these columns (measured: clone_estimate and create_site_visit do not
-- mention also_send_to), and a new estimate starts with none.

ALTER TABLE public.estimates ADD COLUMN also_send_to_email text;

COMMENT ON COLUMN public.estimates.also_send_to_email IS
  'S120 4-B: ONE typed extra address that receives a COPY of the proposal email '
  '(no signing link, no portal access). Owner/Admin only; validated by '
  'enforce_estimate_recipients; frozen on send by the immutability allowlist.';

CREATE OR REPLACE FUNCTION public.enforce_estimate_recipients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entry jsonb;
  v_contact uuid;
BEGIN
  -- Normalise the typed address first: trimmed, lower-cased, blank = none.
  IF NEW.also_send_to_email IS NOT NULL THEN
    NEW.also_send_to_email := NULLIF(lower(btrim(NEW.also_send_to_email)), '');
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.also_send_to IS NOT DISTINCT FROM OLD.also_send_to
     AND NEW.also_send_to_email IS NOT DISTINCT FROM OLD.also_send_to_email THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT'
     AND COALESCE(NEW.also_send_to, '[]'::jsonb) = '[]'::jsonb
     AND NEW.also_send_to_email IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]), false) THEN
    RAISE EXCEPTION 'Only an Owner or Admin can change who a proposal is sent to.'
      USING ERRCODE = '42501';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.also_send_to, '[]'::jsonb))
  LOOP
    BEGIN
      v_contact := (v_entry ->> 'contact_id')::uuid;
    EXCEPTION WHEN others THEN
      v_contact := NULL;
    END;
    PERFORM 1 FROM contacts c
     WHERE c.id = v_contact
       AND c.company_id = NEW.company_id
       AND c.is_deleted = false;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That contact is not one of this company''s contacts.'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF NEW.also_send_to_email IS NOT NULL
     AND NEW.also_send_to_email !~ '^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$' THEN
    RAISE EXCEPTION 'Also send to must be one valid email address.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER estimates_recipients_check
  BEFORE INSERT OR UPDATE OF also_send_to, also_send_to_email ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_estimate_recipients();
