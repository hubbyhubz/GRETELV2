-- Dashboard Visibility (Per-User)
-- Replaces role-based dashboard_component_visibility with a per-user toggle.
--
-- New behavior:
-- - No role/group-based grants (supervisor/assistant_manager/rank_and_file do not imply visibility)
-- - Visibility defaults to FALSE unless explicitly enabled for a user
-- - Super users can grant/revoke visibility per user
-- - API contract keeps public.get_dashboard_visibility() returning { visibility, can_manage }
--
-- NOTE: This migration intentionally drops the role-based configuration tables and RPCs.
--       The audit table (public.dashboard_visibility_audit) is retained.
-- Drop legacy role-based configuration tables first (removes dependent policies)
DROP TABLE IF EXISTS public.dashboard_component_visibility CASCADE;
DROP TABLE IF EXISTS public.dashboard_visibility_admin_roles CASCADE;

-- Drop legacy policies on the audit table that depended on role-based functions, then recreate.
DO $$ BEGIN
  IF to_regclass('public.dashboard_visibility_audit') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authorized users can read dashboard visibility audit in their company" ON public.dashboard_visibility_audit';
    EXECUTE 'DROP POLICY IF EXISTS "Super users can insert dashboard visibility audit rows" ON public.dashboard_visibility_audit';
    EXECUTE 'DROP POLICY IF EXISTS "Super users can read dashboard visibility audit" ON public.dashboard_visibility_audit';
    EXECUTE 'DROP POLICY IF EXISTS "Super users can insert dashboard visibility audit" ON public.dashboard_visibility_audit';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.dashboard_visibility_audit') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "Super users can read dashboard visibility audit" ON public.dashboard_visibility_audit FOR SELECT USING (public.is_super_user(auth.uid()))';
    EXECUTE 'CREATE POLICY "Super users can insert dashboard visibility audit" ON public.dashboard_visibility_audit FOR INSERT WITH CHECK (public.is_super_user(auth.uid()) AND actor_user_id = auth.uid())';
  END IF;
END $$;

-- Drop legacy functions (role-based)
DROP FUNCTION IF EXISTS public.set_dashboard_visibility(text, text, boolean, uuid, public.department_role);
DROP FUNCTION IF EXISTS public.set_dashboard_visibility_admin_role(text, public.department_role, boolean);
DROP FUNCTION IF EXISTS public.can_manage_dashboard_visibility(uuid);
DROP FUNCTION IF EXISTS public.is_director(uuid);
DROP FUNCTION IF EXISTS public.get_dashboard_visibility(uuid);

-- Per-user visibility table
CREATE TABLE IF NOT EXISTS public.dashboard_user_visibility (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id text NOT NULL,
  is_visible boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS dashboard_user_visibility_company_idx
  ON public.dashboard_user_visibility (company_id);

ALTER TABLE public.dashboard_user_visibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super users can read dashboard_user_visibility" ON public.dashboard_user_visibility;
CREATE POLICY "Super users can read dashboard_user_visibility"
ON public.dashboard_user_visibility
FOR SELECT
USING (public.is_super_user(auth.uid()));

DROP POLICY IF EXISTS "Super users can manage dashboard_user_visibility" ON public.dashboard_user_visibility;
CREATE POLICY "Super users can manage dashboard_user_visibility"
ON public.dashboard_user_visibility
FOR ALL
USING (public.is_super_user(auth.uid()))
WITH CHECK (public.is_super_user(auth.uid()));

-- Per-user API: return a visibility map for the known component keys
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
  v_enabled boolean := false;
  v_visibility jsonb := '{}'::jsonb;
  v_key text;
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

  -- Default is FALSE (no automatic grants). If explicitly enabled, all protected modules are visible.
  SELECT duv.is_visible INTO v_enabled
  FROM public.dashboard_user_visibility duv
  WHERE duv.user_id = v_target_user_id
  LIMIT 1;
  v_enabled := COALESCE(v_enabled, false);

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
    v_visibility := v_visibility || jsonb_build_object(v_key, v_enabled);
  END LOOP;

  RETURN jsonb_build_object(
    'visibility', v_visibility,
    'can_manage', public.is_super_user(v_caller_user_id)
  );
END;
$$;

-- Super-user action: set dashboard visibility for a specific user
CREATE OR REPLACE FUNCTION public.set_user_dashboard_visibility(
  p_target_user_id uuid,
  p_is_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id text;
  v_before public.dashboard_user_visibility;
BEGIN
  IF NOT public.is_super_user(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = p_target_user_id;

  IF v_company_id IS NULL OR length(trim(v_company_id)) = 0 THEN
    RAISE EXCEPTION 'company_id_missing';
  END IF;

  IF v_company_id <> public.my_company_id() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_before
  FROM public.dashboard_user_visibility
  WHERE user_id = p_target_user_id
  LIMIT 1;

  INSERT INTO public.dashboard_user_visibility (
    user_id,
    company_id,
    is_visible,
    updated_at,
    updated_by
  )
  VALUES (
    p_target_user_id,
    v_company_id,
    p_is_visible,
    now(),
    auth.uid()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    is_visible = EXCLUDED.is_visible,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by,
    company_id = EXCLUDED.company_id;

  INSERT INTO public.dashboard_visibility_audit (
    action_type,
    actor_user_id,
    company_id,
    subject,
    before_state,
    after_state
  )
  VALUES (
    'dashboard_user_visibility_upsert',
    auth.uid(),
    v_company_id,
    jsonb_build_object('target_user_id', p_target_user_id),
    CASE WHEN v_before.user_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('is_visible', v_before.is_visible) END,
    jsonb_build_object('is_visible', p_is_visible)
  );
END;
$$;
