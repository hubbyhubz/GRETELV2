-- Super User Department Role & Transfer

DO $$ BEGIN
  CREATE TYPE public.department_role AS ENUM (
    'director',
    'manager',
    'assistant_manager',
    'supervisor',
    'rank_and_file'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.company_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_super_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'departments_company_code_unique') THEN
    ALTER TABLE public.departments
      ADD CONSTRAINT departments_company_code_unique UNIQUE (company_id, code);
  END IF;
END $$;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.department_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  role public.department_role NOT NULL DEFAULT 'rank_and_file',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'department_memberships_user_unique') THEN
    ALTER TABLE public.department_memberships
      ADD CONSTRAINT department_memberships_user_unique UNIQUE (user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS department_memberships_department_id_idx
  ON public.department_memberships (department_id);

ALTER TABLE public.department_memberships ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  destination_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_created_at_idx
  ON public.audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_action_type_created_at_idx
  ON public.audit_events (action_type, created_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_user(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_users cu
    WHERE cu.user_id = p_user_id
      AND cu.is_super_user = true
  );
$$;

CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_company_id text;
BEGIN
  SELECT p.company_id
    INTO v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL OR length(trim(v_company_id)) = 0 THEN
    RAISE EXCEPTION 'company_id_missing';
  END IF;

  RETURN v_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_is_super_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_user(auth.uid()) THEN
    RAISE EXCEPTION 'not_super_user';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_department_member(p_department_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.department_memberships
    WHERE user_id = p_user_id
      AND department_id = p_department_id
  );
$$;

DROP POLICY IF EXISTS "Users can read their own company record" ON public.company_users;
CREATE POLICY "Users can read their own company record"
ON public.company_users
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super users can manage company users" ON public.company_users;
CREATE POLICY "Super users can manage company users"
ON public.company_users
FOR ALL
USING (public.is_super_user(auth.uid()))
WITH CHECK (public.is_super_user(auth.uid()));

DROP POLICY IF EXISTS "Users can read departments in their company" ON public.departments;
CREATE POLICY "Users can read departments in their company"
ON public.departments
FOR SELECT
USING (company_id = public.my_company_id());

DROP POLICY IF EXISTS "Super users can manage departments" ON public.departments;
CREATE POLICY "Super users can manage departments"
ON public.departments
FOR ALL
USING (public.is_super_user(auth.uid()) AND company_id = public.my_company_id())
WITH CHECK (public.is_super_user(auth.uid()) AND company_id = public.my_company_id());

DROP POLICY IF EXISTS "Members can read memberships in their department" ON public.department_memberships;
CREATE POLICY "Members can read memberships in their department"
ON public.department_memberships
FOR SELECT
USING (
  user_id = auth.uid() 
  OR public.is_super_user(auth.uid())
  OR public.is_department_member(department_id, auth.uid())
);

DROP POLICY IF EXISTS "Super users can manage memberships" ON public.department_memberships;
CREATE POLICY "Super users can manage memberships"
ON public.department_memberships
FOR ALL
USING (public.is_super_user(auth.uid()))
WITH CHECK (public.is_super_user(auth.uid()));

DROP POLICY IF EXISTS "Super users can read audit events" ON public.audit_events;
CREATE POLICY "Super users can read audit events"
ON public.audit_events
FOR SELECT
USING (public.is_super_user(auth.uid()));

DROP POLICY IF EXISTS "Super users can insert audit events" ON public.audit_events;
CREATE POLICY "Super users can insert audit events"
ON public.audit_events
FOR INSERT
WITH CHECK (public.is_super_user(auth.uid()) AND actor_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.super_set_user_membership(
  p_target_user_id uuid,
  p_destination_department_id uuid,
  p_role public.department_role,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before public.department_memberships;
  v_action text;
  v_actor_company text;
  v_target_company text;
  v_dest_company text;
  v_dest_is_active boolean;
BEGIN
  PERFORM public.assert_is_super_user();

  SELECT d.company_id, d.is_active
    INTO v_dest_company, v_dest_is_active
  FROM public.departments d
  WHERE d.id = p_destination_department_id;

  IF v_dest_company IS NULL THEN
    RAISE EXCEPTION 'destination_department_not_found';
  END IF;

  IF v_dest_is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'destination_department_inactive';
  END IF;

  -- Automatically update the user's company_id in their profile to match the destination department
  UPDATE public.profiles
  SET company_id = v_dest_company
  WHERE id = p_target_user_id;

  SELECT * INTO v_before
  FROM public.department_memberships m
  WHERE m.user_id = p_target_user_id;

  IF FOUND THEN
    IF v_before.department_id = p_destination_department_id AND v_before.role = p_role THEN
      RAISE EXCEPTION 'no_change';
    END IF;

    v_action := CASE WHEN v_before.department_id = p_destination_department_id THEN 'role_changed' ELSE 'membership_transferred' END;

    UPDATE public.department_memberships
    SET department_id = p_destination_department_id,
        role = p_role,
        updated_at = now()
    WHERE user_id = p_target_user_id;
  ELSE
    v_action := 'membership_assigned';
    INSERT INTO public.department_memberships (user_id, department_id, role)
    VALUES (p_target_user_id, p_destination_department_id, p_role);
  END IF;

  INSERT INTO public.audit_events (
    action_type,
    actor_user_id,
    target_user_id,
    source_department_id,
    destination_department_id,
    before_state,
    after_state,
    reason
  )
  VALUES (
    v_action,
    auth.uid(),
    p_target_user_id,
    v_before.department_id,
    p_destination_department_id,
    COALESCE(to_jsonb(v_before), '{}'::jsonb),
    (
      SELECT to_jsonb(m)
      FROM public.department_memberships m
      WHERE m.user_id = p_target_user_id
    ),
    COALESCE(p_reason, 'No reason provided')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_super_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_user(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.my_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_company_id() TO authenticated;

REVOKE ALL ON FUNCTION public.super_set_user_membership(uuid, uuid, public.department_role, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.super_set_user_membership(uuid, uuid, public.department_role, text) TO authenticated;
