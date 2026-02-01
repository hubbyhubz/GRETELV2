-- Dashboard Visibility (Per-User, Per-Component)
-- Extends the per-user model to store visibility per component key.
--
-- Migration notes:
-- - If the earlier per-user boolean table exists (dashboard_user_visibility), it migrates:
--   - is_visible=true => all component keys enabled for that user
--   - is_visible=false => no rows inserted (defaults remain false)
-- - The boolean table is then dropped.

CREATE TABLE IF NOT EXISTS public.dashboard_user_component_visibility (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id text NOT NULL,
  component_key text NOT NULL,
  is_visible boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, component_key)
);

CREATE INDEX IF NOT EXISTS dashboard_user_component_visibility_company_idx
  ON public.dashboard_user_component_visibility (company_id);

ALTER TABLE public.dashboard_user_component_visibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super users can read dashboard_user_component_visibility" ON public.dashboard_user_component_visibility;
CREATE POLICY "Super users can read dashboard_user_component_visibility"
ON public.dashboard_user_component_visibility
FOR SELECT
USING (public.is_super_user(auth.uid()));

DROP POLICY IF EXISTS "Super users can manage dashboard_user_component_visibility" ON public.dashboard_user_component_visibility;
CREATE POLICY "Super users can manage dashboard_user_component_visibility"
ON public.dashboard_user_component_visibility
FOR ALL
USING (public.is_super_user(auth.uid()))
WITH CHECK (public.is_super_user(auth.uid()));

DO $$
DECLARE
  v_keys text[] := ARRAY[
    'delegated_tasks',
    'briefing_notes',
    'morning_briefing_nav',
    'afternoon_briefing_nav',
    'briefing_pointers',
    'coaching_note',
    'log_information'
  ];
BEGIN
  IF to_regclass('public.dashboard_user_visibility') IS NOT NULL THEN
    INSERT INTO public.dashboard_user_component_visibility (user_id, company_id, component_key, is_visible, updated_at, updated_by)
    SELECT
      duv.user_id,
      duv.company_id,
      k.key,
      true,
      duv.updated_at,
      duv.updated_by
    FROM public.dashboard_user_visibility duv
    CROSS JOIN LATERAL unnest(v_keys) AS k(key)
    WHERE duv.is_visible = true
    ON CONFLICT (user_id, component_key)
    DO UPDATE SET
      is_visible = EXCLUDED.is_visible,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by,
      company_id = EXCLUDED.company_id;

    EXECUTE 'DROP TABLE public.dashboard_user_visibility CASCADE';
  END IF;
END;
$$;

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
  v_visibility jsonb := '{}'::jsonb;
  v_key text;
  v_visible boolean;
  v_keys text[] := ARRAY[
    'delegated_tasks',
    'briefing_notes',
    'morning_briefing_nav',
    'afternoon_briefing_nav',
    'briefing_pointers',
    'coaching_note',
    'log_information'
  ];
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

  FOREACH v_key IN ARRAY v_keys
  LOOP
    SELECT ducv.is_visible INTO v_visible
    FROM public.dashboard_user_component_visibility ducv
    WHERE ducv.user_id = v_target_user_id
      AND ducv.component_key = v_key
    LIMIT 1;

    v_visible := COALESCE(v_visible, false);
    v_visibility := v_visibility || jsonb_build_object(v_key, v_visible);
  END LOOP;

  RETURN jsonb_build_object(
    'visibility', v_visibility,
    'can_manage', public.is_super_user(v_caller_user_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_dashboard_visibility_map(
  p_target_user_id uuid,
  p_visibility jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id text;
  v_allowed_keys text[] := ARRAY[
    'delegated_tasks',
    'briefing_notes',
    'morning_briefing_nav',
    'afternoon_briefing_nav',
    'briefing_pointers',
    'coaching_note',
    'log_information'
  ];
  v_key text;
  v_value boolean;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
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

  SELECT COALESCE(jsonb_object_agg(component_key, is_visible), '{}'::jsonb) INTO v_before
  FROM public.dashboard_user_component_visibility
  WHERE user_id = p_target_user_id
    AND component_key = ANY (v_allowed_keys);

  FOREACH v_key IN ARRAY v_allowed_keys
  LOOP
    v_value := COALESCE((p_visibility ->> v_key)::boolean, false);

    INSERT INTO public.dashboard_user_component_visibility (
      user_id,
      company_id,
      component_key,
      is_visible,
      updated_at,
      updated_by
    )
    VALUES (
      p_target_user_id,
      v_company_id,
      v_key,
      v_value,
      now(),
      auth.uid()
    )
    ON CONFLICT (user_id, component_key)
    DO UPDATE SET
      is_visible = EXCLUDED.is_visible,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by,
      company_id = EXCLUDED.company_id;

    v_after := v_after || jsonb_build_object(v_key, v_value);
  END LOOP;

  INSERT INTO public.dashboard_visibility_audit (
    action_type,
    actor_user_id,
    company_id,
    subject,
    before_state,
    after_state
  )
  VALUES (
    'dashboard_user_component_visibility_bulk_upsert',
    auth.uid(),
    v_company_id,
    jsonb_build_object('target_user_id', p_target_user_id),
    v_before,
    v_after
  );
END;
$$;

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
  v_visibility jsonb := '{}'::jsonb;
  v_key text;
  v_allowed_keys text[] := ARRAY[
    'delegated_tasks',
    'briefing_notes',
    'morning_briefing_nav',
    'afternoon_briefing_nav',
    'briefing_pointers',
    'coaching_note',
    'log_information'
  ];
BEGIN
  FOREACH v_key IN ARRAY v_allowed_keys
  LOOP
    v_visibility := v_visibility || jsonb_build_object(v_key, p_is_visible);
  END LOOP;

  PERFORM public.set_user_dashboard_visibility_map(p_target_user_id, v_visibility);
END;
$$;

