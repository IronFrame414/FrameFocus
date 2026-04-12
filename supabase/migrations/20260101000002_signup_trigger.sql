-- ============================================================
-- FrameFocus — Migration 002: Sign-Up Trigger
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_id UUID;
  meta JSONB;
BEGIN
  meta := NEW.raw_user_meta_data;

  INSERT INTO companies (name, slug, owner_id)
  VALUES (
    COALESCE(meta->>'company_name', 'My Company'),
    LOWER(REGEXP_REPLACE(COALESCE(meta->>'company_name', 'my-company'), '[^a-z0-9]+', '-', 'gi')) || '-' || SUBSTR(gen_random_uuid()::text, 1, 8),
    NEW.id
  )
  RETURNING id INTO new_company_id;

  INSERT INTO profiles (user_id, company_id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    new_company_id,
    NEW.email,
    COALESCE(meta->>'first_name', ''),
    COALESCE(meta->>'last_name', ''),
    'owner'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
