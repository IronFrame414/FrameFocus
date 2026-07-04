--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Debian 17.10-0+deb13u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: clone_estimate(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clone_estimate(p_source_id uuid, p_contact_id uuid, p_contact_address_id uuid, p_name text) RETURNS TABLE(new_estimate_id uuid, new_estimate_number text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_role TEXT := get_my_role();
  v_source estimates%ROWTYPE;
  v_new_id UUID;
  v_new_number TEXT;
  v_cat RECORD;
  v_sub RECORD;
  v_line estimate_line_items%ROWTYPE;
  v_new_cat_id UUID;
  v_new_sub_id UUID;
  v_new_line_id UUID;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner, Admin, or PM can clone an estimate';
  END IF;

  SELECT * INTO v_source FROM estimates WHERE id = p_source_id;
  IF NOT FOUND OR v_source.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Source estimate not found';
  END IF;

  IF v_role = 'project_manager' AND v_source.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'PMs can only clone their own estimates';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'New estimate name is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM contacts
    WHERE id = p_contact_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  IF p_contact_address_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact_addresses
    WHERE id = p_contact_address_id
      AND company_id = v_company_id
      AND contact_id = p_contact_id
  ) THEN
    RAISE EXCEPTION 'Address not found for this contact';
  END IF;

  INSERT INTO estimates (
    company_id, name, contact_id, contact_address_id,
    cloned_from_estimate_id,
    pricing_mode, tax_rate,
    subcontractor_markup_percent, material_markup_percent, labor_markup_percent,
    discount_type, discount_amount,
    subtotal, tax_total, discount_total, grand_total,
    proposal_pricing_level, cover_letter, scope_summary, scope_sections, terms_sections,
    expiration_days
  ) VALUES (
    v_company_id, trim(p_name), p_contact_id, p_contact_address_id,
    p_source_id,
    v_source.pricing_mode, v_source.tax_rate,
    v_source.subcontractor_markup_percent, v_source.material_markup_percent, v_source.labor_markup_percent,
    v_source.discount_type, v_source.discount_amount,
    v_source.subtotal, v_source.tax_total, v_source.discount_total, v_source.grand_total,
    v_source.proposal_pricing_level, v_source.cover_letter, v_source.scope_summary, v_source.scope_sections, v_source.terms_sections,
    v_source.expiration_days
  )
  RETURNING id, estimate_number INTO v_new_id, v_new_number;

  FOR v_cat IN
    SELECT * FROM estimate_categories
    WHERE estimate_id = p_source_id
    ORDER BY sort_order
  LOOP
    INSERT INTO estimate_categories (company_id, estimate_id, name, sort_order)
    VALUES (v_company_id, v_new_id, v_cat.name, v_cat.sort_order)
    RETURNING id INTO v_new_cat_id;

    FOR v_line IN
      SELECT * FROM estimate_line_items
      WHERE category_id = v_cat.id AND subcategory_id IS NULL
      ORDER BY sort_order
    LOOP
      v_new_line_id := clone_estimate_line(v_line, v_new_id, v_new_cat_id, NULL, v_company_id);
    END LOOP;

    FOR v_sub IN
      SELECT * FROM estimate_subcategories
      WHERE category_id = v_cat.id
      ORDER BY sort_order
    LOOP
      INSERT INTO estimate_subcategories (company_id, estimate_id, category_id, name, sort_order)
      VALUES (v_company_id, v_new_id, v_new_cat_id, v_sub.name, v_sub.sort_order)
      RETURNING id INTO v_new_sub_id;

      FOR v_line IN
        SELECT * FROM estimate_line_items
        WHERE subcategory_id = v_sub.id
        ORDER BY sort_order
      LOOP
        v_new_line_id := clone_estimate_line(v_line, v_new_id, v_new_cat_id, v_new_sub_id, v_company_id);
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_new_id, v_new_number;
END;
$$;


--
-- Name: get_my_company_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_company_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT company_id
  FROM profiles
  WHERE user_id = auth.uid()
  AND is_deleted = false
  LIMIT 1;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: estimate_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    estimate_id uuid NOT NULL,
    category_id uuid NOT NULL,
    subcategory_id uuid,
    name text NOT NULL,
    description text,
    discount_type text,
    discount_amount numeric,
    total_price numeric DEFAULT 0 NOT NULL,
    notes text,
    sort_order integer NOT NULL,
    total_price_override numeric,
    CONSTRAINT estimate_line_items_discount_type_check CHECK ((discount_type = ANY (ARRAY['percent'::text, 'fixed'::text])))
);


--
-- Name: clone_estimate_line(public.estimate_line_items, uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clone_estimate_line(p_line public.estimate_line_items, p_new_estimate_id uuid, p_new_category_id uuid, p_new_subcategory_id uuid, p_company_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_new_line_id UUID;
BEGIN
  INSERT INTO estimate_line_items (
    company_id, estimate_id, category_id, subcategory_id,
    name, description,
    discount_type, discount_amount,
    total_price, total_price_override, notes, sort_order
  ) VALUES (
    p_company_id, p_new_estimate_id, p_new_category_id, p_new_subcategory_id,
    p_line.name, p_line.description,
    p_line.discount_type, p_line.discount_amount,
    p_line.total_price, p_line.total_price_override, p_line.notes, p_line.sort_order
  )
  RETURNING id INTO v_new_line_id;

  INSERT INTO estimate_line_rows (
    company_id, line_item_id, row_type, name, sort_order,
    markup_percent, apply_tax, total,
    rate, quantity, labor_unit,
    catalog_item_id, unit_of_measure, unit_cost,
    amount, subcontractor_id
  )
  SELECT
    p_company_id, v_new_line_id, r.row_type, r.name, r.sort_order,
    r.markup_percent, r.apply_tax, r.total,
    r.rate, r.quantity, r.labor_unit,
    r.catalog_item_id, r.unit_of_measure, r.unit_cost,
    r.amount, r.subcontractor_id
  FROM estimate_line_rows r
  WHERE r.line_item_id = p_line.id;

  RETURN v_new_line_id;
END;
$$;


--
-- Name: get_invitation_by_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_invitation_by_token(invite_token uuid) RETURNS TABLE(id uuid, company_name text, email text, role text, expires_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    i.id,
    c.name AS company_name,
    i.email,
    i.role,
    i.expires_at
  FROM invitations i
  JOIN companies c ON c.id = i.company_id
  WHERE i.token = invite_token
    AND i.status = 'pending'
    AND i.is_deleted = false
    AND i.expires_at > now();
$$;


--
-- Name: get_invitation_for_signup(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_invitation_for_signup(invite_token uuid) RETURNS TABLE(id uuid, company_id uuid, role text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT i.id, i.company_id, i.role
  FROM invitations i
  WHERE i.token = invite_token
    AND i.status = 'pending'
    AND i.is_deleted = false
    AND i.expires_at > now();
$$;


--
-- Name: get_my_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT role
  FROM profiles
  WHERE user_id = auth.uid()
  AND is_deleted = false
  LIMIT 1;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID;
  v_invitation RECORD;
  v_token UUID;
  v_had_trial BOOLEAN;
  v_slug TEXT;
  v_company_name TEXT;
BEGIN
  -- Parse invitation token from user metadata
  BEGIN
    v_token := (NEW.raw_user_meta_data ->> 'invitation_token')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  -- INVITE PATH
  IF v_token IS NOT NULL THEN
    SELECT gi.id, gi.company_id, gi.role
    INTO v_invitation
    FROM public.get_invitation_for_signup(v_token) gi;

    IF v_invitation.id IS NOT NULL THEN
      INSERT INTO profiles (user_id, company_id, role, first_name, last_name, email)
      VALUES (
        NEW.id,
        v_invitation.company_id,
        v_invitation.role,
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
        NEW.email
      );

      UPDATE invitations
      SET status = 'accepted',
          updated_at = now()
      WHERE id = v_invitation.id;

      RETURN NEW;
    END IF;
  END IF;

  -- OWNER PATH
  v_company_name := COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'My Company');
  v_slug := LOWER(REGEXP_REPLACE(v_company_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := TRIM(BOTH '-' FROM v_slug);
  v_slug := v_slug || '-' || SUBSTR(gen_random_uuid()::text, 1, 8);

  INSERT INTO companies (name, slug)
  VALUES (v_company_name, v_slug)
  RETURNING id INTO v_company_id;

  INSERT INTO profiles (user_id, company_id, role, first_name, last_name, email)
  VALUES (
    NEW.id,
    v_company_id,
    'owner',
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    NEW.email
  );

  SELECT EXISTS(
    SELECT 1 FROM trial_emails WHERE email = LOWER(NEW.email)
  ) INTO v_had_trial;

  IF v_had_trial THEN
    INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit)
    VALUES (v_company_id, 'starter', 'incomplete', 2);
  ELSE
    INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit, trial_start, trial_end)
    VALUES (v_company_id, 'starter', 'trialing', 2, now(), now() + INTERVAL '30 days');
    INSERT INTO trial_emails (email) VALUES (LOWER(NEW.email));
  END IF;

  -- Seed default tag list for the new company (Module 3H)
  PERFORM public.seed_default_tags(v_company_id);

  RETURN NEW;
END;
$$;


--
-- Name: is_platform_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform_admins
    WHERE user_id = auth.uid()
  );
$$;


--
-- Name: next_estimate_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_estimate_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_prefix TEXT;
  v_seq INTEGER;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'next_estimate_number: no company for caller';
  END IF;

  UPDATE companies
  SET estimate_number_sequence = estimate_number_sequence + 1
  WHERE id = v_company_id
  RETURNING estimate_number_prefix, estimate_number_sequence
  INTO v_prefix, v_seq;

  -- lpad() truncates beyond the target length — guard so 4-digit
  -- sequences pass through unchanged (3-digit minimum, then grow).
  RETURN v_prefix || '-' ||
    CASE
      WHEN length(v_seq::text) >= 3 THEN v_seq::text
      ELSE lpad(v_seq::text, 3, '0')
    END;
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: seed_default_tags(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_default_tags(p_company_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO tag_options (company_id, name, category, sort_order) VALUES
    -- Trade
    (p_company_id, 'framing', 'trade', 100),
    (p_company_id, 'foundation', 'trade', 110),
    (p_company_id, 'concrete', 'trade', 120),
    (p_company_id, 'masonry', 'trade', 130),
    (p_company_id, 'roofing', 'trade', 140),
    (p_company_id, 'siding', 'trade', 150),
    (p_company_id, 'windows', 'trade', 160),
    (p_company_id, 'doors', 'trade', 170),
    (p_company_id, 'insulation', 'trade', 180),
    (p_company_id, 'drywall', 'trade', 190),
    (p_company_id, 'painting', 'trade', 200),
    (p_company_id, 'flooring', 'trade', 210),
    (p_company_id, 'tile', 'trade', 220),
    (p_company_id, 'cabinets', 'trade', 230),
    (p_company_id, 'countertops', 'trade', 240),
    (p_company_id, 'trim-and-millwork', 'trade', 250),
    (p_company_id, 'electrical', 'trade', 260),
    (p_company_id, 'plumbing', 'trade', 270),
    (p_company_id, 'hvac', 'trade', 280),
    (p_company_id, 'landscaping', 'trade', 290),
    (p_company_id, 'demolition', 'trade', 300),
    (p_company_id, 'excavation', 'trade', 310),
    -- Stage
    (p_company_id, 'pre-construction', 'stage', 400),
    (p_company_id, 'site-prep', 'stage', 410),
    (p_company_id, 'rough-in', 'stage', 420),
    (p_company_id, 'inspection', 'stage', 430),
    (p_company_id, 'punch-list', 'stage', 440),
    (p_company_id, 'final-walkthrough', 'stage', 450),
    (p_company_id, 'post-completion', 'stage', 460),
    -- Area
    (p_company_id, 'kitchen', 'area', 500),
    (p_company_id, 'bathroom', 'area', 510),
    (p_company_id, 'bedroom', 'area', 520),
    (p_company_id, 'living-room', 'area', 530),
    (p_company_id, 'dining-room', 'area', 540),
    (p_company_id, 'basement', 'area', 550),
    (p_company_id, 'attic', 'area', 560),
    (p_company_id, 'garage', 'area', 570),
    (p_company_id, 'exterior', 'area', 580),
    (p_company_id, 'yard', 'area', 590),
    (p_company_id, 'driveway', 'area', 600),
    (p_company_id, 'deck-or-patio', 'area', 610),
    (p_company_id, 'stairs', 'area', 620),
    (p_company_id, 'hallway', 'area', 630),
    (p_company_id, 'laundry-room', 'area', 640),
    (p_company_id, 'office', 'area', 650),
    (p_company_id, 'mechanical-room', 'area', 660),
    -- Condition
    (p_company_id, 'damage', 'condition', 700),
    (p_company_id, 'water-damage', 'condition', 710),
    (p_company_id, 'mold', 'condition', 720),
    (p_company_id, 'pest-damage', 'condition', 730),
    (p_company_id, 'code-violation', 'condition', 740),
    (p_company_id, 'safety-hazard', 'condition', 750),
    (p_company_id, 'defect', 'condition', 760),
    (p_company_id, 'existing-condition', 'condition', 770),
    (p_company_id, 'progress', 'condition', 780),
    (p_company_id, 'completed-work', 'condition', 790),
    (p_company_id, 'before', 'condition', 800),
    (p_company_id, 'after', 'condition', 810),
    -- Documentation
    (p_company_id, 'receipt', 'documentation', 900),
    (p_company_id, 'delivery', 'documentation', 910),
    (p_company_id, 'material-sample', 'documentation', 920),
    (p_company_id, 'selection', 'documentation', 930),
    (p_company_id, 'change-order-evidence', 'documentation', 940),
    (p_company_id, 'warranty-claim', 'documentation', 950),
    (p_company_id, 'daily-log', 'documentation', 960),
    (p_company_id, 'client-requested', 'documentation', 970)
  ON CONFLICT (company_id, name) DO NOTHING;
END;
$$;


--
-- Name: set_contact_addresses_updated_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_contact_addresses_updated_by() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: set_contacts_updated_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_contacts_updated_by() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: set_cost_catalog_updated_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_cost_catalog_updated_by() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: set_estimate_categories_updated_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_estimate_categories_updated_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: set_estimate_files_updated_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_estimate_files_updated_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: set_estimate_line_items_updated_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_estimate_line_items_updated_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: set_estimate_line_rows_updated_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_estimate_line_rows_updated_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: set_estimate_sub_bids_updated_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_estimate_sub_bids_updated_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: set_estimate_subcategories_updated_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_estimate_subcategories_updated_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: set_estimates_updated_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_estimates_updated_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: set_files_updated_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_files_updated_by() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: set_subcontractors_updated_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_subcontractors_updated_by() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: set_tag_options_updated_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_tag_options_updated_by() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: set_winning_bid(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_winning_bid(p_line_item_id uuid, p_sub_bid_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_role TEXT := get_my_role();
  v_line estimate_line_items%ROWTYPE;
  v_bid estimate_sub_bids%ROWTYPE;
  v_estimate estimates%ROWTYPE;
  v_sub_row_count INTEGER;
  v_sub_row_id UUID;
  v_next_sort INTEGER;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner, Admin, or PM can set a winning bid';
  END IF;

  SELECT * INTO v_line FROM estimate_line_items WHERE id = p_line_item_id;
  IF NOT FOUND OR v_line.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Line item not found';
  END IF;

  SELECT * INTO v_bid FROM estimate_sub_bids WHERE id = p_sub_bid_id;
  IF NOT FOUND OR v_bid.company_id <> v_company_id
     OR v_bid.line_item_id <> p_line_item_id OR v_bid.is_deleted THEN
    RAISE EXCEPTION 'Sub bid not found for this line item';
  END IF;

  SELECT * INTO v_estimate FROM estimates WHERE id = v_line.estimate_id;
  IF v_estimate.status <> 'draft' THEN
    RAISE EXCEPTION 'Estimate is not editable (status: %)', v_estimate.status;
  END IF;

  -- D2: PMs can only act on estimates they created
  IF v_role = 'project_manager' AND v_estimate.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'PMs can only modify their own estimates';
  END IF;

  -- Flip the winner on the audit table (clear first so the partial
  -- unique index never sees two winners).
  UPDATE estimate_sub_bids
  SET is_winner = false
  WHERE line_item_id = p_line_item_id AND is_winner = true;

  UPDATE estimate_sub_bids SET is_winner = true WHERE id = p_sub_bid_id;

  -- Upsert exactly one subcontractor row on the line (Rev 2 §2.5).
  SELECT count(*) INTO v_sub_row_count
  FROM estimate_line_rows
  WHERE line_item_id = p_line_item_id AND row_type = 'subcontractor';

  IF v_sub_row_count >= 2 THEN
    RAISE EXCEPTION 'Line has % subcontractor rows; winning-bid auto-management requires 0 or 1', v_sub_row_count;
  ELSIF v_sub_row_count = 1 THEN
    UPDATE estimate_line_rows
    SET amount = v_bid.bid_amount,
        subcontractor_id = v_bid.subcontractor_id,
        total = v_bid.bid_amount   -- service recomputes with markup/tax
    WHERE line_item_id = p_line_item_id AND row_type = 'subcontractor';
  ELSE
    SELECT COALESCE(max(sort_order) + 1, 0) INTO v_next_sort
    FROM estimate_line_rows WHERE line_item_id = p_line_item_id;

    INSERT INTO estimate_line_rows (
      company_id, line_item_id, row_type, name, sort_order,
      markup_percent, apply_tax, total, amount, subcontractor_id
    ) VALUES (
      v_company_id, p_line_item_id, 'subcontractor', 'Subcontractor bid', v_next_sort,
      NULL, false, v_bid.bid_amount, v_bid.bid_amount, v_bid.subcontractor_id
    );
  END IF;
END;
$$;


--
-- Name: switch_pricing_mode(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.switch_pricing_mode(p_estimate_id uuid, p_new_mode text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_role TEXT := get_my_role();
  v_estimate estimates%ROWTYPE;
  v_company companies%ROWTYPE;
  v_active_sub NUMERIC;
  v_active_mat NUMERIC;
  v_active_lab NUMERIC;
  v_new_sub NUMERIC;
  v_new_mat NUMERIC;
  v_new_lab NUMERIC;
BEGIN
  IF p_new_mode NOT IN ('markup', 'margin') THEN
    RAISE EXCEPTION 'Invalid pricing mode: %', p_new_mode;
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner, Admin, or PM can change pricing mode';
  END IF;

  SELECT * INTO v_estimate FROM estimates WHERE id = p_estimate_id;
  IF NOT FOUND OR v_estimate.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Estimate not found';
  END IF;

  IF v_role = 'project_manager' AND v_estimate.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'PMs can only modify their own estimates';
  END IF;

  IF v_estimate.status <> 'draft' THEN
    RAISE EXCEPTION 'Estimate is not editable (status: %)', v_estimate.status;
  END IF;

  IF v_estimate.pricing_mode = p_new_mode THEN
    RETURN;  -- no-op
  END IF;

  SELECT * INTO v_company FROM companies WHERE id = v_company_id;

  IF v_estimate.pricing_mode = 'markup' THEN
    v_active_sub := v_company.default_subcontractor_markup_percent;
    v_active_mat := v_company.default_material_markup_percent;
    v_active_lab := v_company.default_labor_markup_percent;
  ELSE
    v_active_sub := v_company.default_subcontractor_margin_percent;
    v_active_mat := v_company.default_material_margin_percent;
    v_active_lab := v_company.default_labor_margin_percent;
  END IF;

  IF p_new_mode = 'markup' THEN
    v_new_sub := v_company.default_subcontractor_markup_percent;
    v_new_mat := v_company.default_material_markup_percent;
    v_new_lab := v_company.default_labor_markup_percent;
  ELSE
    v_new_sub := v_company.default_subcontractor_margin_percent;
    v_new_mat := v_company.default_material_margin_percent;
    v_new_lab := v_company.default_labor_margin_percent;
  END IF;

  -- Estimate-level %s: swap only the ones still at the active-mode
  -- default (IS NOT DISTINCT FROM treats NULL=NULL as "at default").
  UPDATE estimates
  SET pricing_mode = p_new_mode,
      subcontractor_markup_percent = CASE
        WHEN subcontractor_markup_percent IS NOT DISTINCT FROM v_active_sub THEN v_new_sub
        ELSE subcontractor_markup_percent END,
      material_markup_percent = CASE
        WHEN material_markup_percent IS NOT DISTINCT FROM v_active_mat THEN v_new_mat
        ELSE material_markup_percent END,
      labor_markup_percent = CASE
        WHEN labor_markup_percent IS NOT DISTINCT FROM v_active_lab THEN v_new_lab
        ELSE labor_markup_percent END
  WHERE id = p_estimate_id;

  -- Row-level markups: NULL means "inherit from estimate" and stays
  -- NULL; non-NULL values equal to the active default (for that row's
  -- type) swap to the new default.
  UPDATE estimate_line_rows r
  SET markup_percent = CASE
        WHEN r.markup_percent IS NULL THEN NULL
        WHEN r.row_type = 'labor'
             AND r.markup_percent IS NOT DISTINCT FROM v_active_lab THEN v_new_lab
        WHEN r.row_type = 'material'
             AND r.markup_percent IS NOT DISTINCT FROM v_active_mat THEN v_new_mat
        WHEN r.row_type IN ('subcontractor', 'other')
             AND r.markup_percent IS NOT DISTINCT FROM v_active_sub THEN v_new_sub
        ELSE r.markup_percent END
  FROM estimate_line_items li
  WHERE r.line_item_id = li.id AND li.estimate_id = p_estimate_id;
END;
$$;


--
-- Name: test_invite_lookup(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.test_invite_lookup(p_token uuid) RETURNS TABLE(found_id uuid, found_email text, found_role text, found_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
BEGIN
  RETURN QUERY
  SELECT i.id, i.email, i.role, i.status
  FROM invitations i
  WHERE i.token = p_token
    AND i.status = 'pending'
    AND i.expires_at > now()
    AND i.is_deleted = false;
END;
$$;


--
-- Name: transfer_ownership(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transfer_ownership(p_new_owner_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  caller profiles%ROWTYPE;
  target profiles%ROWTYPE;
BEGIN
  SELECT * INTO caller FROM profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  IF caller.role <> 'owner' THEN
    RAISE EXCEPTION 'Only the Owner can transfer ownership';
  END IF;

  SELECT * INTO target FROM profiles WHERE id = p_new_owner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target admin not found';
  END IF;

  IF target.company_id <> caller.company_id THEN
    RAISE EXCEPTION 'Target is not in your company';
  END IF;

  IF target.is_deleted THEN
    RAISE EXCEPTION 'Target admin is deleted';
  END IF;

  IF target.role <> 'admin' THEN
    RAISE EXCEPTION 'Target must currently be an Admin';
  END IF;

  UPDATE profiles
    SET role = 'admin',
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = caller.id;

  UPDATE profiles
    SET role = 'owner',
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = p_new_owner_id;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: ai_tag_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_tag_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    file_id uuid,
    model text NOT NULL,
    input_tokens integer,
    output_tokens integer,
    estimated_cost_usd numeric(10,6),
    success boolean DEFAULT true NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    trade_type text,
    phone text,
    email text,
    address_line1 text,
    address_line2 text,
    city text,
    state text,
    zip text,
    logo_url text,
    subscription_tier text DEFAULT 'starter'::text NOT NULL,
    subscription_status text DEFAULT 'trialing'::text NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    website text,
    license_number text,
    ai_tagging_enabled boolean DEFAULT false NOT NULL,
    estimate_number_prefix text DEFAULT 'EST'::text NOT NULL,
    estimate_number_sequence integer DEFAULT 99 NOT NULL,
    default_subcontractor_markup_percent numeric,
    default_material_markup_percent numeric,
    default_labor_markup_percent numeric,
    default_terms_sections jsonb DEFAULT '[{"name": "Payment Terms", "content": ""}, {"name": "Warranty", "content": ""}, {"name": "Exclusions", "content": ""}, {"name": "Cancellation", "content": ""}]'::jsonb,
    default_tax_rate numeric,
    default_pricing_mode text DEFAULT 'markup'::text NOT NULL,
    default_subcontractor_margin_percent numeric,
    default_material_margin_percent numeric,
    default_labor_margin_percent numeric,
    brand_color text DEFAULT '#1a56db'::text,
    default_proposal_email_subject text,
    default_proposal_email_body text,
    default_reminder_email_subject text,
    default_reminder_email_body text,
    default_reminder_schedule jsonb DEFAULT '[3, 7, 14]'::jsonb,
    default_expiration_days integer DEFAULT 30 NOT NULL,
    default_proposal_pricing_level text DEFAULT 'category_with_price'::text NOT NULL,
    default_labor_rate numeric,
    CONSTRAINT companies_default_pricing_mode_check CHECK ((default_pricing_mode = ANY (ARRAY['markup'::text, 'margin'::text]))),
    CONSTRAINT companies_default_proposal_pricing_level_check CHECK ((default_proposal_pricing_level = ANY (ARRAY['lump_sum'::text, 'category_with_price'::text, 'category_no_price'::text, 'detail_with_price_qty'::text, 'detail_no_price'::text]))),
    CONSTRAINT companies_subscription_status_check CHECK ((subscription_status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'unpaid'::text]))),
    CONSTRAINT companies_subscription_tier_check CHECK ((subscription_tier = ANY (ARRAY['starter'::text, 'professional'::text, 'business'::text])))
);


--
-- Name: contact_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    contact_id uuid NOT NULL,
    label text,
    address_line1 text NOT NULL,
    address_line2 text,
    city text NOT NULL,
    state text NOT NULL,
    zip text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    contact_type text DEFAULT 'lead'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    company_name text,
    email text,
    phone text,
    mobile text,
    source text,
    notes text,
    tags text[] DEFAULT '{}'::text[],
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    CONSTRAINT contacts_contact_type_check CHECK ((contact_type = ANY (ARRAY['lead'::text, 'client'::text]))),
    CONSTRAINT contacts_source_check CHECK (((source IS NULL) OR (source = ANY (ARRAY['referral'::text, 'website'::text, 'google'::text, 'social_media'::text, 'repeat'::text, 'other'::text])))),
    CONSTRAINT contacts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])))
);


--
-- Name: cost_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cost_catalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    name text NOT NULL,
    category text NOT NULL,
    unit_of_measure text NOT NULL,
    unit_cost numeric(12,2) NOT NULL,
    default_vendor_id uuid,
    product_url text,
    last_verified_at timestamp with time zone,
    notes text,
    CONSTRAINT cost_catalog_category_check CHECK ((category = ANY (ARRAY['lumber'::text, 'fasteners'::text, 'electrical'::text, 'plumbing'::text, 'finishes'::text, 'concrete'::text, 'drywall'::text, 'roofing'::text, 'paint'::text, 'hardware'::text, 'insulation'::text, 'other'::text]))),
    CONSTRAINT cost_catalog_unit_of_measure_check CHECK ((unit_of_measure = ANY (ARRAY['each'::text, 'sq_ft'::text, 'linear_ft'::text, 'box'::text, 'bundle'::text, 'bag'::text, 'gallon'::text, 'pair'::text, 'set'::text, 'other'::text])))
);


--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    estimate_id uuid,
    signing_session_id uuid,
    resend_message_id text,
    email_type text NOT NULL,
    recipient_email text NOT NULL,
    sender_email text NOT NULL,
    subject text NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone,
    opened_at timestamp with time zone,
    bounced_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_logs_email_type_check CHECK ((email_type = ANY (ARRAY['proposal'::text, 'reminder'::text, 'signature_complete'::text, 'signature_declined'::text, 'estimate_expired'::text]))),
    CONSTRAINT email_logs_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'delivered'::text, 'opened'::text, 'bounced'::text, 'complained'::text, 'failed'::text])))
);


--
-- Name: estimate_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    estimate_id uuid NOT NULL,
    name text NOT NULL,
    sort_order integer NOT NULL
);


--
-- Name: estimate_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    estimate_id uuid NOT NULL,
    file_id uuid NOT NULL,
    attachment_type text NOT NULL,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT estimate_files_attachment_type_check CHECK ((attachment_type = ANY (ARRAY['site_photo'::text, 'plan'::text, 'sub_bid'::text, 'other'::text])))
);


--
-- Name: estimate_line_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_line_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    line_item_id uuid NOT NULL,
    row_type text NOT NULL,
    name text NOT NULL,
    sort_order integer NOT NULL,
    markup_percent numeric,
    apply_tax boolean DEFAULT false NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    rate numeric,
    quantity numeric,
    labor_unit text,
    catalog_item_id uuid,
    unit_of_measure text,
    unit_cost numeric,
    amount numeric,
    subcontractor_id uuid,
    CONSTRAINT estimate_line_rows_labor_unit_check CHECK (((labor_unit IS NULL) OR (labor_unit = ANY (ARRAY['hours'::text, 'days'::text])))),
    CONSTRAINT estimate_line_rows_row_type_check CHECK ((row_type = ANY (ARRAY['labor'::text, 'material'::text, 'subcontractor'::text, 'other'::text]))),
    CONSTRAINT estimate_line_rows_type_columns CHECK (
CASE row_type
    WHEN 'labor'::text THEN ((amount IS NULL) AND (subcontractor_id IS NULL) AND (catalog_item_id IS NULL) AND (unit_of_measure IS NULL) AND (unit_cost IS NULL) AND (apply_tax = false))
    WHEN 'material'::text THEN ((rate IS NULL) AND (labor_unit IS NULL) AND (amount IS NULL) AND (subcontractor_id IS NULL))
    WHEN 'subcontractor'::text THEN ((rate IS NULL) AND (quantity IS NULL) AND (labor_unit IS NULL) AND (catalog_item_id IS NULL) AND (unit_of_measure IS NULL) AND (unit_cost IS NULL))
    WHEN 'other'::text THEN ((rate IS NULL) AND (quantity IS NULL) AND (labor_unit IS NULL) AND (catalog_item_id IS NULL) AND (unit_of_measure IS NULL) AND (unit_cost IS NULL) AND (subcontractor_id IS NULL))
    ELSE NULL::boolean
END),
    CONSTRAINT estimate_line_rows_unit_of_measure_check CHECK (((unit_of_measure IS NULL) OR (unit_of_measure = ANY (ARRAY['each'::text, 'sq_ft'::text, 'linear_ft'::text, 'box'::text, 'bundle'::text, 'bag'::text, 'gallon'::text, 'pair'::text, 'set'::text, 'allowance'::text, 'other'::text]))))
);


--
-- Name: estimate_sub_bids; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_sub_bids (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    estimate_id uuid NOT NULL,
    line_item_id uuid NOT NULL,
    subcontractor_id uuid NOT NULL,
    bid_amount numeric NOT NULL,
    bid_document_file_id uuid,
    notes text,
    is_winner boolean DEFAULT false NOT NULL,
    received_at timestamp with time zone
);


--
-- Name: estimate_subcategories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_subcategories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    estimate_id uuid NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    sort_order integer NOT NULL
);


--
-- Name: estimates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    estimate_number text DEFAULT public.next_estimate_number() NOT NULL,
    name text NOT NULL,
    contact_id uuid NOT NULL,
    contact_address_id uuid,
    project_id uuid,
    parent_estimate_id uuid,
    cloned_from_estimate_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    version_number text DEFAULT 'v1.1'::text NOT NULL,
    tax_rate numeric,
    subcontractor_markup_percent numeric,
    material_markup_percent numeric,
    labor_markup_percent numeric,
    discount_type text,
    discount_amount numeric,
    subtotal numeric DEFAULT 0 NOT NULL,
    tax_total numeric DEFAULT 0 NOT NULL,
    discount_total numeric DEFAULT 0 NOT NULL,
    grand_total numeric DEFAULT 0 NOT NULL,
    proposal_pricing_level text DEFAULT 'lump_sum'::text NOT NULL,
    cover_letter text,
    terms_sections jsonb,
    expiration_days integer DEFAULT 30 NOT NULL,
    expires_at timestamp with time zone,
    sent_at timestamp with time zone,
    viewed_at timestamp with time zone,
    accepted_at timestamp with time zone,
    declined_at timestamp with time zone,
    decline_reason_code text,
    decline_reason_notes text,
    signed_proposal_file_id uuid,
    created_by_role text DEFAULT public.get_my_role() NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    pricing_mode text DEFAULT 'markup'::text NOT NULL,
    internal_notes text,
    reminder_schedule jsonb,
    reminder_count integer DEFAULT 0 NOT NULL,
    last_reminder_sent_at timestamp with time zone,
    client_unsubscribed_at timestamp with time zone,
    scope_summary text,
    scope_sections jsonb,
    CONSTRAINT estimates_decline_reason_code_check CHECK ((decline_reason_code = ANY (ARRAY['too_expensive'::text, 'chose_competitor'::text, 'project_canceled'::text, 'timing'::text, 'scope_changed'::text, 'other'::text]))),
    CONSTRAINT estimates_discount_type_check CHECK ((discount_type = ANY (ARRAY['percent'::text, 'fixed'::text]))),
    CONSTRAINT estimates_pricing_mode_check CHECK ((pricing_mode = ANY (ARRAY['markup'::text, 'margin'::text]))),
    CONSTRAINT estimates_proposal_pricing_level_check CHECK ((proposal_pricing_level = ANY (ARRAY['lump_sum'::text, 'category_with_price'::text, 'category_no_price'::text, 'detail_with_price_qty'::text, 'detail_no_price'::text]))),
    CONSTRAINT estimates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'sent'::text, 'viewed'::text, 'accepted'::text, 'declined'::text, 'expired'::text, 'revised'::text])))
);


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    project_id uuid,
    category text NOT NULL,
    file_name text NOT NULL,
    file_path text NOT NULL,
    file_size bigint NOT NULL,
    mime_type text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    ai_tags text[] DEFAULT '{}'::text[],
    version integer DEFAULT 1,
    supersedes_id uuid,
    markup_data jsonb,
    is_favorite boolean DEFAULT false NOT NULL,
    CONSTRAINT files_category_check CHECK ((category = ANY (ARRAY['photos'::text, 'contracts'::text, 'plans'::text, 'permits'::text, 'invoices'::text, 'change_orders'::text, 'daily_logs'::text, 'receipts'::text, 'other'::text]))),
    CONSTRAINT files_mime_type_not_empty CHECK ((mime_type <> ''::text))
);


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    invited_by uuid NOT NULL,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
    created_by uuid,
    updated_by uuid,
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    CONSTRAINT invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text, 'client'::text]))),
    CONSTRAINT invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    email text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    role text DEFAULT 'crew_member'::text NOT NULL,
    phone text,
    avatar_url text,
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    notes text,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text, 'client'::text])))
);


--
-- Name: signing_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signing_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    estimate_id uuid NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    recipient_email text NOT NULL,
    recipient_name text,
    expires_at timestamp with time zone NOT NULL,
    signed_at timestamp with time zone,
    signature_type text,
    signature_data text,
    signer_name text,
    declined_at timestamp with time zone,
    decline_reason text,
    decline_notes text,
    signer_ip text,
    signer_user_agent text,
    consent_given boolean DEFAULT false NOT NULL,
    consent_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT signing_sessions_decline_reason_check CHECK ((decline_reason = ANY (ARRAY['too_expensive'::text, 'chose_competitor'::text, 'project_canceled'::text, 'timing'::text, 'scope_changed'::text, 'other'::text]))),
    CONSTRAINT signing_sessions_signature_type_check CHECK ((signature_type = ANY (ARRAY['draw'::text, 'type'::text]))),
    CONSTRAINT signing_sessions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'declined'::text, 'expired'::text, 'invalidated'::text])))
);


--
-- Name: subcontractors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcontractors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    sub_type text DEFAULT 'subcontractor'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    company_name text NOT NULL,
    contact_first_name text,
    contact_last_name text,
    email text,
    phone text,
    mobile text,
    address_line1 text,
    address_line2 text,
    city text,
    state text,
    zip text,
    trade_type text,
    license_number text,
    insurance_expiry date,
    rating integer,
    rating_notes text,
    notes text,
    tags text[] DEFAULT '{}'::text[],
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    ein text,
    default_hourly_rate numeric(10,2),
    preferred boolean DEFAULT false,
    default_markup_percent numeric(5,2),
    CONSTRAINT subcontractors_rating_check CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5)))),
    CONSTRAINT subcontractors_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))),
    CONSTRAINT subcontractors_sub_type_check CHECK ((sub_type = ANY (ARRAY['subcontractor'::text, 'vendor'::text])))
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    stripe_subscription_id text,
    plan_tier text DEFAULT 'starter'::text NOT NULL,
    status text DEFAULT 'trialing'::text NOT NULL,
    seat_limit integer DEFAULT 2 NOT NULL,
    trial_start timestamp with time zone,
    trial_end timestamp with time zone,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT subscriptions_plan_tier_check CHECK ((plan_tier = ANY (ARRAY['starter'::text, 'professional'::text, 'business'::text]))),
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'unpaid'::text, 'incomplete'::text])))
);


--
-- Name: tag_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tag_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    CONSTRAINT tag_options_category_check CHECK ((category = ANY (ARRAY['trade'::text, 'stage'::text, 'area'::text, 'condition'::text, 'documentation'::text])))
);


--
-- Name: trial_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_tag_logs ai_tag_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_tag_logs
    ADD CONSTRAINT ai_tag_logs_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: companies companies_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_slug_key UNIQUE (slug);


--
-- Name: contact_addresses contact_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_addresses
    ADD CONSTRAINT contact_addresses_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: cost_catalog cost_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_catalog
    ADD CONSTRAINT cost_catalog_pkey PRIMARY KEY (id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: estimate_categories estimate_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_categories
    ADD CONSTRAINT estimate_categories_pkey PRIMARY KEY (id);


--
-- Name: estimate_files estimate_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_files
    ADD CONSTRAINT estimate_files_pkey PRIMARY KEY (id);


--
-- Name: estimate_line_items estimate_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_items
    ADD CONSTRAINT estimate_line_items_pkey PRIMARY KEY (id);


--
-- Name: estimate_line_rows estimate_line_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_rows
    ADD CONSTRAINT estimate_line_rows_pkey PRIMARY KEY (id);


--
-- Name: estimate_sub_bids estimate_sub_bids_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_sub_bids
    ADD CONSTRAINT estimate_sub_bids_pkey PRIMARY KEY (id);


--
-- Name: estimate_subcategories estimate_subcategories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcategories
    ADD CONSTRAINT estimate_subcategories_pkey PRIMARY KEY (id);


--
-- Name: estimates estimates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_pkey PRIMARY KEY (id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_token_key UNIQUE (token);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_key UNIQUE (user_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: signing_sessions signing_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_sessions
    ADD CONSTRAINT signing_sessions_pkey PRIMARY KEY (id);


--
-- Name: signing_sessions signing_sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_sessions
    ADD CONSTRAINT signing_sessions_token_key UNIQUE (token);


--
-- Name: subcontractors subcontractors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractors
    ADD CONSTRAINT subcontractors_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_company_id_key UNIQUE (company_id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_stripe_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);


--
-- Name: tag_options tag_options_company_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_options
    ADD CONSTRAINT tag_options_company_id_name_key UNIQUE (company_id, name);


--
-- Name: tag_options tag_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_options
    ADD CONSTRAINT tag_options_pkey PRIMARY KEY (id);


--
-- Name: trial_emails trial_emails_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_emails
    ADD CONSTRAINT trial_emails_email_key UNIQUE (email);


--
-- Name: trial_emails trial_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_emails
    ADD CONSTRAINT trial_emails_pkey PRIMARY KEY (id);


--
-- Name: idx_ai_tag_logs_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_tag_logs_company_id ON public.ai_tag_logs USING btree (company_id);


--
-- Name: idx_ai_tag_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_tag_logs_created_at ON public.ai_tag_logs USING btree (created_at DESC);


--
-- Name: idx_companies_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_slug ON public.companies USING btree (slug);


--
-- Name: idx_contact_addresses_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_addresses_company_id ON public.contact_addresses USING btree (company_id);


--
-- Name: idx_contact_addresses_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_addresses_contact_id ON public.contact_addresses USING btree (contact_id);


--
-- Name: idx_contact_addresses_one_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_contact_addresses_one_primary ON public.contact_addresses USING btree (contact_id) WHERE ((is_primary = true) AND (is_deleted = false));


--
-- Name: idx_contacts_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_company_id ON public.contacts USING btree (company_id);


--
-- Name: idx_contacts_contact_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_contact_type ON public.contacts USING btree (company_id, contact_type);


--
-- Name: idx_contacts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_status ON public.contacts USING btree (company_id, status);


--
-- Name: idx_cost_catalog_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_catalog_category ON public.cost_catalog USING btree (category);


--
-- Name: idx_cost_catalog_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_catalog_company_id ON public.cost_catalog USING btree (company_id);


--
-- Name: idx_cost_catalog_default_vendor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_catalog_default_vendor_id ON public.cost_catalog USING btree (default_vendor_id);


--
-- Name: idx_email_logs_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_company_id ON public.email_logs USING btree (company_id);


--
-- Name: idx_email_logs_estimate_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_estimate_id ON public.email_logs USING btree (estimate_id);


--
-- Name: idx_email_logs_resend_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_resend_message_id ON public.email_logs USING btree (resend_message_id);


--
-- Name: idx_estimate_categories_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_categories_company_id ON public.estimate_categories USING btree (company_id);


--
-- Name: idx_estimate_categories_estimate_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_categories_estimate_id ON public.estimate_categories USING btree (estimate_id);


--
-- Name: idx_estimate_files_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_files_company_id ON public.estimate_files USING btree (company_id);


--
-- Name: idx_estimate_files_estimate_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_files_estimate_id ON public.estimate_files USING btree (estimate_id);


--
-- Name: idx_estimate_files_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_files_file_id ON public.estimate_files USING btree (file_id);


--
-- Name: idx_estimate_line_items_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_line_items_category_id ON public.estimate_line_items USING btree (category_id);


--
-- Name: idx_estimate_line_items_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_line_items_company_id ON public.estimate_line_items USING btree (company_id);


--
-- Name: idx_estimate_line_items_estimate_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_line_items_estimate_id ON public.estimate_line_items USING btree (estimate_id);


--
-- Name: idx_estimate_line_items_subcategory_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_line_items_subcategory_id ON public.estimate_line_items USING btree (subcategory_id);


--
-- Name: idx_estimate_line_rows_catalog_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_line_rows_catalog_item_id ON public.estimate_line_rows USING btree (catalog_item_id);


--
-- Name: idx_estimate_line_rows_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_line_rows_company_id ON public.estimate_line_rows USING btree (company_id);


--
-- Name: idx_estimate_line_rows_line_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_line_rows_line_item_id ON public.estimate_line_rows USING btree (line_item_id);


--
-- Name: idx_estimate_line_rows_subcontractor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_line_rows_subcontractor_id ON public.estimate_line_rows USING btree (subcontractor_id);


--
-- Name: idx_estimate_sub_bids_bid_document_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_sub_bids_bid_document_file_id ON public.estimate_sub_bids USING btree (bid_document_file_id);


--
-- Name: idx_estimate_sub_bids_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_sub_bids_company_id ON public.estimate_sub_bids USING btree (company_id);


--
-- Name: idx_estimate_sub_bids_estimate_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_sub_bids_estimate_id ON public.estimate_sub_bids USING btree (estimate_id);


--
-- Name: idx_estimate_sub_bids_line_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_sub_bids_line_item_id ON public.estimate_sub_bids USING btree (line_item_id);


--
-- Name: idx_estimate_sub_bids_one_winner; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_estimate_sub_bids_one_winner ON public.estimate_sub_bids USING btree (line_item_id) WHERE ((is_winner = true) AND (is_deleted = false));


--
-- Name: idx_estimate_sub_bids_subcontractor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_sub_bids_subcontractor_id ON public.estimate_sub_bids USING btree (subcontractor_id);


--
-- Name: idx_estimate_subcategories_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_subcategories_category_id ON public.estimate_subcategories USING btree (category_id);


--
-- Name: idx_estimate_subcategories_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_subcategories_company_id ON public.estimate_subcategories USING btree (company_id);


--
-- Name: idx_estimate_subcategories_estimate_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_subcategories_estimate_id ON public.estimate_subcategories USING btree (estimate_id);


--
-- Name: idx_estimates_cloned_from_estimate_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_cloned_from_estimate_id ON public.estimates USING btree (cloned_from_estimate_id);


--
-- Name: idx_estimates_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_company_id ON public.estimates USING btree (company_id);


--
-- Name: idx_estimates_contact_address_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_contact_address_id ON public.estimates USING btree (contact_address_id);


--
-- Name: idx_estimates_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_contact_id ON public.estimates USING btree (contact_id);


--
-- Name: idx_estimates_estimate_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_estimate_number ON public.estimates USING btree (estimate_number);


--
-- Name: idx_estimates_parent_estimate_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_parent_estimate_id ON public.estimates USING btree (parent_estimate_id);


--
-- Name: idx_estimates_reviewed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_reviewed_by ON public.estimates USING btree (reviewed_by);


--
-- Name: idx_estimates_signed_proposal_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_signed_proposal_file_id ON public.estimates USING btree (signed_proposal_file_id);


--
-- Name: idx_estimates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_status ON public.estimates USING btree (status);


--
-- Name: idx_files_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_category ON public.files USING btree (category);


--
-- Name: idx_files_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_company_id ON public.files USING btree (company_id);


--
-- Name: idx_files_is_favorite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_is_favorite ON public.files USING btree (company_id, is_favorite) WHERE ((is_favorite = true) AND (is_deleted = false));


--
-- Name: idx_files_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_project_id ON public.files USING btree (project_id);


--
-- Name: idx_invitations_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_company_id ON public.invitations USING btree (company_id);


--
-- Name: idx_invitations_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_email ON public.invitations USING btree (email);


--
-- Name: idx_invitations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_token ON public.invitations USING btree (token);


--
-- Name: idx_profiles_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_company_id ON public.profiles USING btree (company_id);


--
-- Name: idx_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);


--
-- Name: idx_profiles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_user_id ON public.profiles USING btree (user_id);


--
-- Name: idx_signing_sessions_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signing_sessions_company_id ON public.signing_sessions USING btree (company_id);


--
-- Name: idx_signing_sessions_estimate_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signing_sessions_estimate_id ON public.signing_sessions USING btree (estimate_id);


--
-- Name: idx_subcontractors_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subcontractors_company_id ON public.subcontractors USING btree (company_id);


--
-- Name: idx_subcontractors_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subcontractors_status ON public.subcontractors USING btree (company_id, status);


--
-- Name: idx_subcontractors_sub_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subcontractors_sub_type ON public.subcontractors USING btree (company_id, sub_type);


--
-- Name: idx_subcontractors_trade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subcontractors_trade ON public.subcontractors USING btree (company_id, trade_type);


--
-- Name: idx_subscriptions_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_company_id ON public.subscriptions USING btree (company_id);


--
-- Name: idx_subscriptions_stripe_subscription_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_stripe_subscription_id ON public.subscriptions USING btree (stripe_subscription_id);


--
-- Name: idx_tag_options_company_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tag_options_company_active ON public.tag_options USING btree (company_id, is_active) WHERE (is_active = true);


--
-- Name: idx_tag_options_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tag_options_company_id ON public.tag_options USING btree (company_id);


--
-- Name: profiles_one_owner_per_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_one_owner_per_company ON public.profiles USING btree (company_id) WHERE ((role = 'owner'::text) AND (is_deleted = false));


--
-- Name: companies companies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: contact_addresses contact_addresses_set_updated_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contact_addresses_set_updated_by BEFORE UPDATE ON public.contact_addresses FOR EACH ROW EXECUTE FUNCTION public.set_contact_addresses_updated_by();


--
-- Name: contact_addresses contact_addresses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contact_addresses_updated_at BEFORE UPDATE ON public.contact_addresses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: contacts contacts_set_updated_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contacts_set_updated_by BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_contacts_updated_by();


--
-- Name: contacts contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: cost_catalog cost_catalog_set_updated_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cost_catalog_set_updated_by BEFORE UPDATE ON public.cost_catalog FOR EACH ROW EXECUTE FUNCTION public.set_cost_catalog_updated_by();


--
-- Name: cost_catalog cost_catalog_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cost_catalog_updated_at BEFORE UPDATE ON public.cost_catalog FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: email_logs email_logs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_logs_updated_at BEFORE UPDATE ON public.email_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: estimate_categories estimate_categories_set_updated_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimate_categories_set_updated_by BEFORE UPDATE ON public.estimate_categories FOR EACH ROW EXECUTE FUNCTION public.set_estimate_categories_updated_by();


--
-- Name: estimate_categories estimate_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimate_categories_updated_at BEFORE UPDATE ON public.estimate_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: estimate_files estimate_files_set_updated_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimate_files_set_updated_by BEFORE UPDATE ON public.estimate_files FOR EACH ROW EXECUTE FUNCTION public.set_estimate_files_updated_by();


--
-- Name: estimate_files estimate_files_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimate_files_updated_at BEFORE UPDATE ON public.estimate_files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: estimate_line_items estimate_line_items_set_updated_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimate_line_items_set_updated_by BEFORE UPDATE ON public.estimate_line_items FOR EACH ROW EXECUTE FUNCTION public.set_estimate_line_items_updated_by();


--
-- Name: estimate_line_items estimate_line_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimate_line_items_updated_at BEFORE UPDATE ON public.estimate_line_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: estimate_line_rows estimate_line_rows_set_updated_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimate_line_rows_set_updated_by BEFORE UPDATE ON public.estimate_line_rows FOR EACH ROW EXECUTE FUNCTION public.set_estimate_line_rows_updated_by();


--
-- Name: estimate_line_rows estimate_line_rows_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimate_line_rows_updated_at BEFORE UPDATE ON public.estimate_line_rows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: estimate_sub_bids estimate_sub_bids_set_updated_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimate_sub_bids_set_updated_by BEFORE UPDATE ON public.estimate_sub_bids FOR EACH ROW EXECUTE FUNCTION public.set_estimate_sub_bids_updated_by();


--
-- Name: estimate_sub_bids estimate_sub_bids_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimate_sub_bids_updated_at BEFORE UPDATE ON public.estimate_sub_bids FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: estimate_subcategories estimate_subcategories_set_updated_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimate_subcategories_set_updated_by BEFORE UPDATE ON public.estimate_subcategories FOR EACH ROW EXECUTE FUNCTION public.set_estimate_subcategories_updated_by();


--
-- Name: estimate_subcategories estimate_subcategories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimate_subcategories_updated_at BEFORE UPDATE ON public.estimate_subcategories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: estimates estimates_set_updated_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimates_set_updated_by BEFORE UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION public.set_estimates_updated_by();


--
-- Name: estimates estimates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estimates_updated_at BEFORE UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: files files_set_updated_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER files_set_updated_by BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.set_files_updated_by();


--
-- Name: files files_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: invitations set_invitations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_invitations_updated_at BEFORE UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: signing_sessions signing_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER signing_sessions_updated_at BEFORE UPDATE ON public.signing_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: subcontractors subcontractors_set_updated_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subcontractors_set_updated_by BEFORE UPDATE ON public.subcontractors FOR EACH ROW EXECUTE FUNCTION public.set_subcontractors_updated_by();


--
-- Name: subcontractors subcontractors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subcontractors_updated_at BEFORE UPDATE ON public.subcontractors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: tag_options tag_options_set_updated_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tag_options_set_updated_by BEFORE UPDATE ON public.tag_options FOR EACH ROW EXECUTE FUNCTION public.set_tag_options_updated_by();


--
-- Name: tag_options tag_options_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tag_options_updated_at BEFORE UPDATE ON public.tag_options FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: subscriptions update_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: ai_tag_logs ai_tag_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_tag_logs
    ADD CONSTRAINT ai_tag_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: ai_tag_logs ai_tag_logs_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_tag_logs
    ADD CONSTRAINT ai_tag_logs_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE SET NULL;


--
-- Name: contact_addresses contact_addresses_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_addresses
    ADD CONSTRAINT contact_addresses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: contact_addresses contact_addresses_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_addresses
    ADD CONSTRAINT contact_addresses_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_addresses contact_addresses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_addresses
    ADD CONSTRAINT contact_addresses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: contact_addresses contact_addresses_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_addresses
    ADD CONSTRAINT contact_addresses_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: contacts contacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: contacts contacts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: contacts contacts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: cost_catalog cost_catalog_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_catalog
    ADD CONSTRAINT cost_catalog_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: cost_catalog cost_catalog_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_catalog
    ADD CONSTRAINT cost_catalog_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: cost_catalog cost_catalog_default_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_catalog
    ADD CONSTRAINT cost_catalog_default_vendor_id_fkey FOREIGN KEY (default_vendor_id) REFERENCES public.subcontractors(id);


--
-- Name: cost_catalog cost_catalog_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_catalog
    ADD CONSTRAINT cost_catalog_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: email_logs email_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: email_logs email_logs_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE SET NULL;


--
-- Name: email_logs email_logs_signing_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_signing_session_id_fkey FOREIGN KEY (signing_session_id) REFERENCES public.signing_sessions(id) ON DELETE SET NULL;


--
-- Name: estimate_categories estimate_categories_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_categories
    ADD CONSTRAINT estimate_categories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimate_categories estimate_categories_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_categories
    ADD CONSTRAINT estimate_categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: estimate_categories estimate_categories_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_categories
    ADD CONSTRAINT estimate_categories_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_categories estimate_categories_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_categories
    ADD CONSTRAINT estimate_categories_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: estimate_files estimate_files_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_files
    ADD CONSTRAINT estimate_files_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimate_files estimate_files_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_files
    ADD CONSTRAINT estimate_files_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: estimate_files estimate_files_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_files
    ADD CONSTRAINT estimate_files_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_files estimate_files_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_files
    ADD CONSTRAINT estimate_files_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: estimate_files estimate_files_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_files
    ADD CONSTRAINT estimate_files_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: estimate_line_items estimate_line_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_items
    ADD CONSTRAINT estimate_line_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.estimate_categories(id) ON DELETE CASCADE;


--
-- Name: estimate_line_items estimate_line_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_items
    ADD CONSTRAINT estimate_line_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimate_line_items estimate_line_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_items
    ADD CONSTRAINT estimate_line_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: estimate_line_items estimate_line_items_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_items
    ADD CONSTRAINT estimate_line_items_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_line_items estimate_line_items_subcategory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_items
    ADD CONSTRAINT estimate_line_items_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES public.estimate_subcategories(id) ON DELETE SET NULL;


--
-- Name: estimate_line_items estimate_line_items_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_items
    ADD CONSTRAINT estimate_line_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: estimate_line_rows estimate_line_rows_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_rows
    ADD CONSTRAINT estimate_line_rows_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.cost_catalog(id);


--
-- Name: estimate_line_rows estimate_line_rows_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_rows
    ADD CONSTRAINT estimate_line_rows_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimate_line_rows estimate_line_rows_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_rows
    ADD CONSTRAINT estimate_line_rows_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: estimate_line_rows estimate_line_rows_line_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_rows
    ADD CONSTRAINT estimate_line_rows_line_item_id_fkey FOREIGN KEY (line_item_id) REFERENCES public.estimate_line_items(id) ON DELETE CASCADE;


--
-- Name: estimate_line_rows estimate_line_rows_subcontractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_rows
    ADD CONSTRAINT estimate_line_rows_subcontractor_id_fkey FOREIGN KEY (subcontractor_id) REFERENCES public.subcontractors(id);


--
-- Name: estimate_line_rows estimate_line_rows_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_rows
    ADD CONSTRAINT estimate_line_rows_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: estimate_sub_bids estimate_sub_bids_bid_document_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_sub_bids
    ADD CONSTRAINT estimate_sub_bids_bid_document_file_id_fkey FOREIGN KEY (bid_document_file_id) REFERENCES public.files(id) ON DELETE SET NULL;


--
-- Name: estimate_sub_bids estimate_sub_bids_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_sub_bids
    ADD CONSTRAINT estimate_sub_bids_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimate_sub_bids estimate_sub_bids_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_sub_bids
    ADD CONSTRAINT estimate_sub_bids_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: estimate_sub_bids estimate_sub_bids_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_sub_bids
    ADD CONSTRAINT estimate_sub_bids_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_sub_bids estimate_sub_bids_line_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_sub_bids
    ADD CONSTRAINT estimate_sub_bids_line_item_id_fkey FOREIGN KEY (line_item_id) REFERENCES public.estimate_line_items(id) ON DELETE CASCADE;


--
-- Name: estimate_sub_bids estimate_sub_bids_subcontractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_sub_bids
    ADD CONSTRAINT estimate_sub_bids_subcontractor_id_fkey FOREIGN KEY (subcontractor_id) REFERENCES public.subcontractors(id);


--
-- Name: estimate_sub_bids estimate_sub_bids_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_sub_bids
    ADD CONSTRAINT estimate_sub_bids_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: estimate_subcategories estimate_subcategories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcategories
    ADD CONSTRAINT estimate_subcategories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.estimate_categories(id) ON DELETE CASCADE;


--
-- Name: estimate_subcategories estimate_subcategories_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcategories
    ADD CONSTRAINT estimate_subcategories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimate_subcategories estimate_subcategories_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcategories
    ADD CONSTRAINT estimate_subcategories_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: estimate_subcategories estimate_subcategories_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcategories
    ADD CONSTRAINT estimate_subcategories_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_subcategories estimate_subcategories_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcategories
    ADD CONSTRAINT estimate_subcategories_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: estimates estimates_cloned_from_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_cloned_from_estimate_id_fkey FOREIGN KEY (cloned_from_estimate_id) REFERENCES public.estimates(id);


--
-- Name: estimates estimates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimates estimates_contact_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_contact_address_id_fkey FOREIGN KEY (contact_address_id) REFERENCES public.contact_addresses(id);


--
-- Name: estimates estimates_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: estimates estimates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: estimates estimates_parent_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_parent_estimate_id_fkey FOREIGN KEY (parent_estimate_id) REFERENCES public.estimates(id);


--
-- Name: estimates estimates_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);


--
-- Name: estimates estimates_signed_proposal_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_signed_proposal_file_id_fkey FOREIGN KEY (signed_proposal_file_id) REFERENCES public.files(id) ON DELETE SET NULL;


--
-- Name: estimates estimates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: files files_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: files files_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: files files_supersedes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_supersedes_id_fkey FOREIGN KEY (supersedes_id) REFERENCES public.files(id);


--
-- Name: files files_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: invitations invitations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: invitations invitations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: invitations invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
-- Name: invitations invitations_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: platform_admins platform_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: profiles profiles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: signing_sessions signing_sessions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_sessions
    ADD CONSTRAINT signing_sessions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: signing_sessions signing_sessions_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_sessions
    ADD CONSTRAINT signing_sessions_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id);


--
-- Name: subcontractors subcontractors_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractors
    ADD CONSTRAINT subcontractors_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: subcontractors subcontractors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractors
    ADD CONSTRAINT subcontractors_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: subcontractors subcontractors_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractors
    ADD CONSTRAINT subcontractors_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: subscriptions subscriptions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: tag_options tag_options_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_options
    ADD CONSTRAINT tag_options_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tag_options tag_options_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_options
    ADD CONSTRAINT tag_options_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: tag_options tag_options_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_options
    ADD CONSTRAINT tag_options_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: ai_tag_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_tag_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_tag_logs ai_tag_logs_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_tag_logs_insert_authenticated ON public.ai_tag_logs FOR INSERT WITH CHECK ((company_id = public.get_my_company_id()));


--
-- Name: ai_tag_logs ai_tag_logs_select_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_tag_logs_select_owner_admin ON public.ai_tag_logs FOR SELECT USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));


--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_insert_authenticated ON public.companies FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: companies companies_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_select_own ON public.companies FOR SELECT TO authenticated USING (((id = public.get_my_company_id()) OR public.is_platform_admin()));


--
-- Name: companies companies_update_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_update_owner_admin ON public.companies FOR UPDATE USING (((id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));


--
-- Name: contact_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_addresses contact_addresses_delete_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_addresses_delete_authenticated ON public.contact_addresses FOR DELETE TO authenticated USING ((company_id = public.get_my_company_id()));


--
-- Name: contact_addresses contact_addresses_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_addresses_insert_authenticated ON public.contact_addresses FOR INSERT TO authenticated WITH CHECK ((company_id = public.get_my_company_id()));


--
-- Name: contact_addresses contact_addresses_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_addresses_select_authenticated ON public.contact_addresses FOR SELECT TO authenticated USING ((company_id = public.get_my_company_id()));


--
-- Name: contact_addresses contact_addresses_update_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_addresses_update_authenticated ON public.contact_addresses FOR UPDATE TO authenticated USING ((company_id = public.get_my_company_id())) WITH CHECK ((company_id = public.get_my_company_id()));


--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts contacts_insert_authorized; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_insert_authorized ON public.contacts FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.is_deleted = false))
 LIMIT 1)) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.is_deleted = false) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])))))));


--
-- Name: contacts contacts_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_select_authenticated ON public.contacts FOR SELECT TO authenticated USING (((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.is_deleted = false))
 LIMIT 1)) AND (is_deleted = false)));


--
-- Name: contacts contacts_update_authorized; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_update_authorized ON public.contacts FOR UPDATE TO authenticated USING (((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.is_deleted = false))
 LIMIT 1)) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.is_deleted = false) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])))))));


--
-- Name: cost_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cost_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: cost_catalog cost_catalog_insert_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_catalog_insert_manager ON public.cost_catalog FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]))));


--
-- Name: cost_catalog cost_catalog_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_catalog_select_authenticated ON public.cost_catalog FOR SELECT TO authenticated USING ((company_id = public.get_my_company_id()));


--
-- Name: cost_catalog cost_catalog_update_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_catalog_update_manager ON public.cost_catalog FOR UPDATE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])))) WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]))));


--
-- Name: email_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: email_logs email_logs_select_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_logs_select_manager ON public.email_logs FOR SELECT TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));


--
-- Name: estimate_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_categories estimate_categories_delete_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_categories_delete_manager ON public.estimate_categories FOR DELETE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_categories.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid())))))));


--
-- Name: estimate_categories estimate_categories_insert_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_categories_insert_manager ON public.estimate_categories FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_categories.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid())))))));


--
-- Name: estimate_categories estimate_categories_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_categories_select_authenticated ON public.estimate_categories FOR SELECT TO authenticated USING (((company_id = public.get_my_company_id()) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE (e.id = estimate_categories.estimate_id)))));


--
-- Name: estimate_categories estimate_categories_update_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_categories_update_manager ON public.estimate_categories FOR UPDATE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_categories.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid()))))))) WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]))));


--
-- Name: estimate_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_files ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_files estimate_files_delete_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_files_delete_manager ON public.estimate_files FOR DELETE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_files.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid())))))));


--
-- Name: estimate_files estimate_files_insert_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_files_insert_manager ON public.estimate_files FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_files.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid())))))));


--
-- Name: estimate_files estimate_files_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_files_select_authenticated ON public.estimate_files FOR SELECT TO authenticated USING (((company_id = public.get_my_company_id()) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE (e.id = estimate_files.estimate_id)))));


--
-- Name: estimate_files estimate_files_update_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_files_update_manager ON public.estimate_files FOR UPDATE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_files.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid()))))))) WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]))));


--
-- Name: estimate_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_line_items estimate_line_items_delete_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_line_items_delete_manager ON public.estimate_line_items FOR DELETE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_line_items.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid())))))));


--
-- Name: estimate_line_items estimate_line_items_insert_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_line_items_insert_manager ON public.estimate_line_items FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_line_items.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid())))))));


--
-- Name: estimate_line_items estimate_line_items_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_line_items_select_authenticated ON public.estimate_line_items FOR SELECT TO authenticated USING (((company_id = public.get_my_company_id()) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE (e.id = estimate_line_items.estimate_id)))));


--
-- Name: estimate_line_items estimate_line_items_update_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_line_items_update_manager ON public.estimate_line_items FOR UPDATE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_line_items.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid()))))))) WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]))));


--
-- Name: estimate_line_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_line_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_line_rows estimate_line_rows_delete_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_line_rows_delete_manager ON public.estimate_line_rows FOR DELETE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM (public.estimate_line_items li
     JOIN public.estimates e ON ((e.id = li.estimate_id)))
  WHERE ((li.id = estimate_line_rows.line_item_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid())))))));


--
-- Name: estimate_line_rows estimate_line_rows_insert_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_line_rows_insert_manager ON public.estimate_line_rows FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM (public.estimate_line_items li
     JOIN public.estimates e ON ((e.id = li.estimate_id)))
  WHERE ((li.id = estimate_line_rows.line_item_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid())))))));


--
-- Name: estimate_line_rows estimate_line_rows_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_line_rows_select_authenticated ON public.estimate_line_rows FOR SELECT TO authenticated USING (((company_id = public.get_my_company_id()) AND (EXISTS ( SELECT 1
   FROM public.estimate_line_items li
  WHERE (li.id = estimate_line_rows.line_item_id)))));


--
-- Name: estimate_line_rows estimate_line_rows_update_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_line_rows_update_manager ON public.estimate_line_rows FOR UPDATE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM (public.estimate_line_items li
     JOIN public.estimates e ON ((e.id = li.estimate_id)))
  WHERE ((li.id = estimate_line_rows.line_item_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid()))))))) WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]))));


--
-- Name: estimate_sub_bids; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_sub_bids ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_sub_bids estimate_sub_bids_insert_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_sub_bids_insert_manager ON public.estimate_sub_bids FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_sub_bids.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid())))))));


--
-- Name: estimate_sub_bids estimate_sub_bids_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_sub_bids_select_authenticated ON public.estimate_sub_bids FOR SELECT TO authenticated USING (((company_id = public.get_my_company_id()) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE (e.id = estimate_sub_bids.estimate_id)))));


--
-- Name: estimate_sub_bids estimate_sub_bids_update_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_sub_bids_update_manager ON public.estimate_sub_bids FOR UPDATE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_sub_bids.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid()))))))) WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]))));


--
-- Name: estimate_subcategories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_subcategories ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_subcategories estimate_subcategories_delete_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_subcategories_delete_manager ON public.estimate_subcategories FOR DELETE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_subcategories.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid())))))));


--
-- Name: estimate_subcategories estimate_subcategories_insert_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_subcategories_insert_manager ON public.estimate_subcategories FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_subcategories.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid())))))));


--
-- Name: estimate_subcategories estimate_subcategories_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_subcategories_select_authenticated ON public.estimate_subcategories FOR SELECT TO authenticated USING (((company_id = public.get_my_company_id()) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE (e.id = estimate_subcategories.estimate_id)))));


--
-- Name: estimate_subcategories estimate_subcategories_update_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_subcategories_update_manager ON public.estimate_subcategories FOR UPDATE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_subcategories.estimate_id) AND (e.status = 'draft'::text) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR (e.created_by = auth.uid()))))))) WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]))));


--
-- Name: estimates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

--
-- Name: estimates estimates_insert_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimates_insert_manager ON public.estimates FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]))));


--
-- Name: estimates estimates_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimates_select_authenticated ON public.estimates FOR SELECT TO authenticated USING (((company_id = public.get_my_company_id()) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR ((public.get_my_role() = 'project_manager'::text) AND (created_by = auth.uid())))));


--
-- Name: estimates estimates_update_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimates_update_manager ON public.estimates FOR UPDATE TO authenticated USING (((company_id = public.get_my_company_id()) AND ((public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR ((public.get_my_role() = 'project_manager'::text) AND (created_by = auth.uid()) AND (status = 'draft'::text))))) WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])) AND ((is_deleted = false) OR (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

--
-- Name: files files_delete_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY files_delete_owner_admin ON public.files FOR DELETE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));


--
-- Name: files files_insert_non_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY files_insert_non_client ON public.files FOR INSERT TO authenticated WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text]))));


--
-- Name: files files_select_non_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY files_select_non_client ON public.files FOR SELECT TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() <> 'client'::text)));


--
-- Name: files files_update_non_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY files_update_non_client ON public.files FOR UPDATE TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text])))) WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text]))));


--
-- Name: invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations invitations_insert_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_insert_owner_admin ON public.invitations FOR INSERT WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));


--
-- Name: invitations invitations_select_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_select_owner_admin ON public.invitations FOR SELECT USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) AND (is_deleted = false)));


--
-- Name: invitations invitations_update_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_update_owner_admin ON public.invitations FOR UPDATE USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));


--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins platform_admins_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_admins_select ON public.platform_admins FOR SELECT TO authenticated USING (public.is_platform_admin());


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_authenticated ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: profiles profiles_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_authenticated ON public.profiles FOR SELECT USING (((company_id = public.get_my_company_id()) AND (is_deleted = false)));


--
-- Name: profiles profiles_select_company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_company ON public.profiles FOR SELECT TO authenticated USING (((company_id = public.get_my_company_id()) OR public.is_platform_admin()));


--
-- Name: profiles profiles_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = 'admin'::text) AND (user_id <> auth.uid()) AND (role <> ALL (ARRAY['owner'::text, 'admin'::text])))) WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = 'admin'::text) AND (user_id <> auth.uid()) AND (role <> ALL (ARRAY['owner'::text, 'admin'::text]))));


--
-- Name: profiles profiles_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_owner ON public.profiles FOR UPDATE USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = 'owner'::text))) WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = 'owner'::text) AND ((user_id <> auth.uid()) OR (role = 'owner'::text))));


--
-- Name: signing_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.signing_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: signing_sessions signing_sessions_select_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY signing_sessions_select_manager ON public.signing_sessions FOR SELECT TO authenticated USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));


--
-- Name: subcontractors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;

--
-- Name: subcontractors subcontractors_insert_authorized; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subcontractors_insert_authorized ON public.subcontractors FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.is_deleted = false))
 LIMIT 1)) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.is_deleted = false) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])))))));


--
-- Name: subcontractors subcontractors_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subcontractors_select_authenticated ON public.subcontractors FOR SELECT TO authenticated USING (((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.is_deleted = false))
 LIMIT 1)) AND (is_deleted = false)));


--
-- Name: subcontractors subcontractors_update_authorized; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subcontractors_update_authorized ON public.subcontractors FOR UPDATE TO authenticated USING (((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.is_deleted = false))
 LIMIT 1)) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.is_deleted = false) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])))))));


--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions subscriptions_select_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_select_owner_admin ON public.subscriptions FOR SELECT USING ((company_id = public.get_my_company_id()));


--
-- Name: tag_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tag_options ENABLE ROW LEVEL SECURITY;

--
-- Name: tag_options tag_options_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tag_options_delete_owner ON public.tag_options FOR DELETE USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = 'owner'::text)));


--
-- Name: tag_options tag_options_insert_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tag_options_insert_owner_admin ON public.tag_options FOR INSERT WITH CHECK (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));


--
-- Name: tag_options tag_options_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tag_options_select_authenticated ON public.tag_options FOR SELECT USING ((company_id = public.get_my_company_id()));


--
-- Name: tag_options tag_options_update_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tag_options_update_owner_admin ON public.tag_options FOR UPDATE USING (((company_id = public.get_my_company_id()) AND (public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));


--
-- Name: trial_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trial_emails ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


