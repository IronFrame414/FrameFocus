-- ============================================================
-- FrameFocus — Migration 001: Foundation Tables
-- ============================================================

CREATE TABLE companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  owner_id        UUID,
  trade_type      TEXT,
  phone           TEXT,
  email           TEXT,
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  logo_url        TEXT,
  subscription_tier   TEXT NOT NULL DEFAULT 'starter' CHECK (subscription_tier IN ('starter', 'professional', 'business')),
  subscription_status TEXT NOT NULL DEFAULT 'trialing' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_companies_slug ON companies(slug);

CREATE TABLE profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'crew_member' CHECK (role IN ('owner', 'project_manager', 'foreman', 'crew_member', 'client')),
  phone           TEXT,
  avatar_url      TEXT,
  is_active       BOOLEAN DEFAULT true,
  is_deleted      BOOLEAN DEFAULT false,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  updated_by      UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_profiles_company_id ON profiles(company_id);
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_email ON profiles(email);

CREATE TABLE platform_admins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE user_id = auth.uid() AND is_deleted = false LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE user_id = auth.uid() AND is_deleted = false LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_select_own ON companies FOR SELECT TO authenticated USING (id = get_my_company_id() OR is_platform_admin());
CREATE POLICY companies_update_owner ON companies FOR UPDATE TO authenticated USING (id = get_my_company_id() AND get_my_role() = 'owner') WITH CHECK (id = get_my_company_id() AND get_my_role() = 'owner');
CREATE POLICY companies_insert_authenticated ON companies FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_company ON profiles FOR SELECT TO authenticated USING (company_id = get_my_company_id() OR is_platform_admin());
CREATE POLICY profiles_update_own ON profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY profiles_update_owner ON profiles FOR UPDATE TO authenticated USING (company_id = get_my_company_id() AND get_my_role() = 'owner') WITH CHECK (company_id = get_my_company_id() AND get_my_role() = 'owner');
CREATE POLICY profiles_insert_authenticated ON profiles FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_admins_select ON platform_admins FOR SELECT TO authenticated USING (is_platform_admin());
