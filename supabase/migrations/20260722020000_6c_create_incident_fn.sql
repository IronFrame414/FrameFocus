-- 6C UI build (S88): create_safety_incident() — atomic incident creation.
--
-- WHY THIS EXISTS (discovered at build, flagged in the build report): the
-- injury invariant is enforced by DEFERRABLE INITIALLY DEFERRED constraint
-- triggers (checked at COMMIT). PostgREST autocommits per statement, so a
-- client-side "insert incident, then insert injuries" fails at the first
-- commit for every injury-type incident. A function body runs in ONE
-- transaction, so the invariant sees the finished shape. SECURITY INVOKER —
-- RLS evaluates every insert against the caller exactly as direct inserts
-- would (approve_member_week precedent, 6A-2). Idempotent via OR REPLACE.

CREATE OR REPLACE FUNCTION create_safety_incident(
  p_project_id uuid,        -- nullable: shop/yard incident (Phase 3 Q3)
  p_incident_date date,
  p_incident_type text,
  p_description text,
  p_prevention_notes text,
  p_injuries jsonb,         -- [{member_id?, injured_name?, treatment_sought?, treatment_notes?}]
  p_witnesses jsonb         -- [{member_id?, witness_name?}]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  r record;
BEGIN
  INSERT INTO safety_incidents (project_id, incident_date, incident_type, description, prevention_notes)
  VALUES (p_project_id, p_incident_date, p_incident_type, p_description, NULLIF(p_prevention_notes, ''))
  RETURNING id INTO v_id;

  FOR r IN SELECT value FROM jsonb_array_elements(COALESCE(p_injuries, '[]'::jsonb)) LOOP
    INSERT INTO safety_incident_injuries (incident_id, member_id, injured_name, treatment_sought, treatment_notes)
    VALUES (
      v_id,
      NULLIF(r.value->>'member_id', '')::uuid,
      NULLIF(r.value->>'injured_name', ''),
      COALESCE((r.value->>'treatment_sought')::boolean, false),
      NULLIF(r.value->>'treatment_notes', '')
    );
  END LOOP;

  FOR r IN SELECT value FROM jsonb_array_elements(COALESCE(p_witnesses, '[]'::jsonb)) LOOP
    INSERT INTO safety_incident_witnesses (incident_id, member_id, witness_name)
    VALUES (
      v_id,
      NULLIF(r.value->>'member_id', '')::uuid,
      NULLIF(r.value->>'witness_name', '')
    );
  END LOOP;

  RETURN v_id;
END;
$$;
