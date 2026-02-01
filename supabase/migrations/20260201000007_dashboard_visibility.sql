-- Dashboard Visibility RBAC + Configuration

CREATE TABLE IF NOT EXISTS public.dashboard_component_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  role public.department_role,
  component_key text NOT NULL,
  is_visible boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'dashboard_component_visibility_unique') THEN
    ALTER TABLE public.dashboard_component_visibility
      ADD CONSTRAINT dashboard_component_visibility_unique UNIQUE (company_id, department_id, role, component_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS dashboard_component_visibility_company_idx
  ON public.dashboard_component_visibility (company_id);

CREATE INDEX IF NOT EXISTS dashboard_component_visibility_company_role_idx
  ON public.dashboard_component_visibility (company_id, role);

ALTER TABLE public.dashboard_component_visibility ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dashboard_visibility_admin_roles (
  company_id text NOT NULL,
  role public.department_role NOT NULL,
  can_manage boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (company_id, role)
);

ALTER TABLE public.dashboard_visibility_admin_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dashboard_visibility_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  company_id text NOT NULL,
  subject jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboard_visibility_audit_created_at_idx
  ON public.dashboard_visibility_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS dashboard_visibility_audit_company_created_at_idx
  ON public.dashboard_visibility_audit (company_id, created_at DESC);

ALTER TABLE public.dashboard_visibility_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_director(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.department_memberships dm
    JOIN public.departments d ON d.id = dm.department_id
    JOIN public.profiles p ON p.id = p_user_id
    WHERE dm.user_id = p_user_id
      AND dm.role = 'director'
      AND d.company_id = p.company_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_dashboard_visibility(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF public.is_super_user(p_user_id) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "Users can read dashboard visibility in their company" ON public.dashboard_component_visibility;
CREATE POLICY "Users can read dashboard visibility in their company"
ON public.dashboard_component_visibility
FOR SELECT
USING (public.is_super_user(auth.uid()) OR company_id = public.my_company_id());

DROP POLICY IF EXISTS "Authorized users can manage dashboard visibility" ON public.dashboard_component_visibility;
CREATE POLICY "Authorized users can manage dashboard visibility"
ON public.dashboard_component_visibility
FOR ALL
USING (
  public.can_manage_dashboard_visibility(auth.uid())
  AND (public.is_super_user(auth.uid()) OR company_id = public.my_company_id())
)
WITH CHECK (
  public.can_manage_dashboard_visibility(auth.uid())
  AND (public.is_super_user(auth.uid()) OR company_id = public.my_company_id())
);

DROP POLICY IF EXISTS "Users can read dashboard visibility admin roles in their company" ON public.dashboard_visibility_admin_roles;
CREATE POLICY "Users can read dashboard visibility admin roles in their company"
ON public.dashboard_visibility_admin_roles
FOR SELECT
USING (public.is_super_user(auth.uid()));

DROP POLICY IF EXISTS "Directors and super users can manage dashboard visibility admin roles" ON public.dashboard_visibility_admin_roles;
CREATE POLICY "Directors and super users can manage dashboard visibility admin roles"
ON public.dashboard_visibility_admin_roles
FOR ALL
USING (
  public.is_super_user(auth.uid())
)
WITH CHECK (
  public.is_super_user(auth.uid())
);

DROP POLICY IF EXISTS "Authorized users can read dashboard visibility audit in their company" ON public.dashboard_visibility_audit;
CREATE POLICY "Authorized users can read dashboard visibility audit in their company"
ON public.dashboard_visibility_audit
FOR SELECT
USING (
  public.is_super_user(auth.uid())
);

DROP POLICY IF EXISTS "Super users can insert dashboard visibility audit rows" ON public.dashboard_visibility_audit;
CREATE POLICY "Super users can insert dashboard visibility audit rows"
ON public.dashboard_visibility_audit
FOR INSERT
WITH CHECK (public.can_manage_dashboard_visibility(auth.uid()) AND actor_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_dashboard_visibility(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_target_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_caller_user_id uuid := auth.uid();
  v_company_id text;
  v_department_id uuid;
  v_role public.department_role;
  v_visibility jsonb := '{}'::jsonb;
  v_key text;
  v_visible boolean;
BEGIN
  IF v_target_user_id <> v_caller_user_id AND NOT public.is_super_user(v_caller_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = v_target_user_id;

  IF v_company_id IS NULL OR length(trim(v_company_id)) = 0 THEN
    RAISE EXCEPTION 'company_id_missing';
  END IF;

  SELECT dm.department_id, dm.role INTO v_department_id, v_role
  FROM public.department_memberships dm
  WHERE dm.user_id = v_target_user_id;

  FOREACH v_key IN ARRAY ARRAY[
    'delegated_tasks',
    'briefing_notes',
    'morning_briefing_nav',
    'afternoon_briefing_nav',
    'briefing_pointers',
    'coaching_note',
    'log_information'
  ]
  LOOP
    SELECT dcv.is_visible INTO v_visible
    FROM public.dashboard_component_visibility dcv
    WHERE dcv.company_id = v_company_id
      AND (dcv.department_id IS NULL OR dcv.department_id = v_department_id)
      AND (dcv.role IS NULL OR dcv.role = v_role)
      AND dcv.component_key = v_key
    ORDER BY
      (dcv.department_id IS NOT NULL)::int DESC,
      (dcv.role IS NOT NULL)::int DESC,
      dcv.updated_at DESC
    LIMIT 1;

    v_visible := COALESCE(v_visible, true);

    IF v_role = 'rank_and_file' AND v_key IN (
      'delegated_tasks',
      'briefing_notes',
      'morning_briefing_nav',
      'afternoon_briefing_nav',
      'briefing_pointers',
      'coaching_note',
      'log_information'
    ) THEN
      v_visible := false;
    END IF;

    v_visibility := v_visibility || jsonb_build_object(v_key, v_visible);
  END LOOP;

  RETURN jsonb_build_object(
    'visibility', v_visibility,
    'can_manage', public.can_manage_dashboard_visibility(v_caller_user_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_dashboard_visibility(
  p_company_id text,
  p_component_key text,
  p_is_visible boolean,
  p_department_id uuid DEFAULT NULL,
  p_role public.department_role DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_keys text[] := ARRAY[
    'delegated_tasks',
    'briefing_notes',
    'morning_briefing_nav',
    'afternoon_briefing_nav',
    'briefing_pointers',
    'coaching_note',
    'log_information'
  ];
  v_before public.dashboard_component_visibility;
  v_final_visible boolean := p_is_visible;
BEGIN
  IF NOT public.can_manage_dashboard_visibility(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_company_id IS NULL OR length(trim(p_company_id)) = 0 THEN
    RAISE EXCEPTION 'company_id_missing';
  END IF;

  IF NOT public.is_super_user(auth.uid()) AND p_company_id <> public.my_company_id() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (p_component_key = ANY (v_allowed_keys)) THEN
    RAISE EXCEPTION 'invalid_component_key';
  END IF;

  IF p_role = 'rank_and_file' AND p_component_key = ANY (ARRAY[
    'delegated_tasks',
    'briefing_notes',
    'morning_briefing_nav',
    'afternoon_briefing_nav',
    'briefing_pointers',
    'coaching_note',
    'log_information'
  ]) THEN
    v_final_visible := false;
  END IF;

  SELECT * INTO v_before
  FROM public.dashboard_component_visibility
  WHERE company_id = p_company_id
    AND department_id IS NOT DISTINCT FROM p_department_id
    AND role IS NOT DISTINCT FROM p_role
    AND component_key = p_component_key
  LIMIT 1;

  INSERT INTO public.dashboard_component_visibility (
    company_id,
    department_id,
    role,
    component_key,
    is_visible,
    updated_at,
    updated_by
  )
  VALUES (
    p_company_id,
    p_department_id,
    p_role,
    p_component_key,
    v_final_visible,
    now(),
    auth.uid()
  )
  ON CONFLICT (company_id, department_id, role, component_key)
  DO UPDATE SET
    is_visible = EXCLUDED.is_visible,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by;

  INSERT INTO public.dashboard_visibility_audit (
    action_type,
    actor_user_id,
    company_id,
    subject,
    before_state,
    after_state
  )
  VALUES (
    'dashboard_component_visibility_upsert',
    auth.uid(),
    p_company_id,
    jsonb_build_object('department_id', p_department_id, 'role', p_role, 'component_key', p_component_key),
    CASE WHEN v_before.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('is_visible', v_before.is_visible) END,
    jsonb_build_object('is_visible', v_final_visible)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_dashboard_visibility_admin_role(
  p_company_id text,
  p_role public.department_role,
  p_can_manage boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before public.dashboard_visibility_admin_roles;
  v_final_can_manage boolean := p_can_manage;
BEGIN
  IF NOT public.is_super_user(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_company_id IS NULL OR length(trim(p_company_id)) = 0 THEN
    RAISE EXCEPTION 'company_id_missing';
  END IF;

  IF p_role = 'director' THEN
    v_final_can_manage := true;
  END IF;
  IF p_role = 'rank_and_file' THEN
    v_final_can_manage := false;
  END IF;

  SELECT * INTO v_before
  FROM public.dashboard_visibility_admin_roles
  WHERE company_id = p_company_id
    AND role = p_role
  LIMIT 1;

  INSERT INTO public.dashboard_visibility_admin_roles (
    company_id,
    role,
    can_manage,
    updated_at,
    updated_by
  )
  VALUES (
    p_company_id,
    p_role,
    v_final_can_manage,
    now(),
    auth.uid()
  )
  ON CONFLICT (company_id, role)
  DO UPDATE SET
    can_manage = EXCLUDED.can_manage,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by;

  INSERT INTO public.dashboard_visibility_audit (
    action_type,
    actor_user_id,
    company_id,
    subject,
    before_state,
    after_state
  )
  VALUES (
    'dashboard_visibility_admin_role_upsert',
    auth.uid(),
    p_company_id,
    jsonb_build_object('role', p_role),
    CASE WHEN v_before.company_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('can_manage', v_before.can_manage) END,
    jsonb_build_object('can_manage', v_final_can_manage)
  );
END;
$$;
