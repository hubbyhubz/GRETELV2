-- Duty Roster RPCs
-- Provides department-isolated read/write APIs with strict server-side authorization + audit logging.

CREATE OR REPLACE FUNCTION public.can_edit_duty_roster(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role public.department_role;
  v_can_edit boolean;
BEGIN
  IF public.is_super_user(p_user_id) THEN
    RETURN true;
  END IF;

  SELECT dm.role INTO v_role
  FROM public.department_memberships dm
  WHERE dm.user_id = p_user_id
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role NOT IN ('director', 'manager', 'assistant_manager', 'supervisor') THEN
    RETURN false;
  END IF;

  SELECT drup.can_edit INTO v_can_edit
  FROM public.duty_roster_user_permissions drup
  WHERE drup.user_id = p_user_id
  LIMIT 1;

  RETURN COALESCE(v_can_edit, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_duty_roster_week(p_week_start_sunday date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id text := public.my_company_id();
  v_department_id uuid;
  v_week_start date := p_week_start_sunday;
  v_can_edit boolean := public.can_edit_duty_roster(v_user_id);
  v_entries jsonb;
BEGIN
  IF v_week_start IS NULL THEN
    RAISE EXCEPTION 'week_start_required';
  END IF;

  IF EXTRACT(DOW FROM v_week_start)::int <> 0 THEN
    RAISE EXCEPTION 'week_start_must_be_sunday';
  END IF;

  SELECT dm.department_id INTO v_department_id
  FROM public.department_memberships dm
  WHERE dm.user_id = v_user_id
  LIMIT 1;

  IF v_department_id IS NULL THEN
    RAISE EXCEPTION 'department_membership_missing';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'duty_date', e.duty_date,
        'week_start_sunday', e.week_start_sunday,
        'slot_key', e.slot_key,
        'assignee_user_id', e.assignee_user_id,
        'notes', e.notes,
        'sort_order', e.sort_order,
        'updated_at', e.updated_at,
        'updated_by', e.updated_by
      )
      ORDER BY e.duty_date, e.sort_order, e.slot_key
    ),
    '[]'::jsonb
  )
  INTO v_entries
  FROM public.duty_roster_entries e
  WHERE e.company_id = v_company_id
    AND e.department_id = v_department_id
    AND e.week_start_sunday = v_week_start;

  RETURN jsonb_build_object(
    'week_start_sunday', v_week_start,
    'department_id', v_department_id,
    'can_edit', v_can_edit,
    'entries', v_entries
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_my_duty_roster_entries(
  p_week_start_sunday date,
  p_entries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id text := public.my_company_id();
  v_department_id uuid;
  v_week_start date := p_week_start_sunday;
  v_item jsonb;
  v_duty_date date;
  v_slot_key text;
  v_assignee uuid;
  v_notes text;
  v_sort_order int;
  v_existing public.duty_roster_entries;
  v_after public.duty_roster_entries;
BEGIN
  IF NOT public.can_edit_duty_roster(v_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_week_start IS NULL THEN
    RAISE EXCEPTION 'week_start_required';
  END IF;

  IF EXTRACT(DOW FROM v_week_start)::int <> 0 THEN
    RAISE EXCEPTION 'week_start_must_be_sunday';
  END IF;

  SELECT dm.department_id INTO v_department_id
  FROM public.department_memberships dm
  WHERE dm.user_id = v_user_id
  LIMIT 1;

  IF v_department_id IS NULL THEN
    RAISE EXCEPTION 'department_membership_missing';
  END IF;

  IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'entries_must_be_array';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    v_duty_date := NULLIF(trim(COALESCE(v_item->>'duty_date', '')), '')::date;
    v_slot_key := NULLIF(trim(COALESCE(v_item->>'slot_key', '')), '');
    v_assignee := NULLIF(trim(COALESCE(v_item->>'assignee_user_id', '')), '')::uuid;
    v_notes := NULLIF(COALESCE(v_item->>'notes', ''), '');
    v_sort_order := COALESCE((v_item->>'sort_order')::int, 0);

    IF v_duty_date IS NULL THEN
      RAISE EXCEPTION 'duty_date_required';
    END IF;

    IF v_slot_key IS NULL THEN
      RAISE EXCEPTION 'slot_key_required';
    END IF;

    IF public.week_start_sunday(v_duty_date) <> v_week_start THEN
      RAISE EXCEPTION 'duty_date_out_of_week';
    END IF;

    SELECT e.* INTO v_existing
    FROM public.duty_roster_entries e
    WHERE e.department_id = v_department_id
      AND e.duty_date = v_duty_date
      AND e.slot_key = v_slot_key
    LIMIT 1;

    INSERT INTO public.duty_roster_entries (
      company_id,
      department_id,
      duty_date,
      week_start_sunday,
      slot_key,
      assignee_user_id,
      notes,
      sort_order,
      created_at,
      updated_at,
      created_by,
      updated_by
    )
    VALUES (
      v_company_id,
      v_department_id,
      v_duty_date,
      v_week_start,
      v_slot_key,
      v_assignee,
      v_notes,
      v_sort_order,
      now(),
      now(),
      v_user_id,
      v_user_id
    )
    ON CONFLICT (department_id, duty_date, slot_key)
    DO UPDATE SET
      assignee_user_id = EXCLUDED.assignee_user_id,
      notes = EXCLUDED.notes,
      sort_order = EXCLUDED.sort_order,
      updated_at = now(),
      updated_by = v_user_id,
      company_id = EXCLUDED.company_id,
      week_start_sunday = EXCLUDED.week_start_sunday;

    SELECT e.* INTO v_after
    FROM public.duty_roster_entries e
    WHERE e.department_id = v_department_id
      AND e.duty_date = v_duty_date
      AND e.slot_key = v_slot_key
    LIMIT 1;

    INSERT INTO public.duty_roster_audit (
      company_id,
      department_id,
      actor_user_id,
      action_type,
      target_entry_id,
      week_start_sunday,
      before_state,
      after_state,
      created_at
    )
    VALUES (
      v_company_id,
      v_department_id,
      v_user_id,
      CASE WHEN v_existing.id IS NULL THEN 'insert' ELSE 'update' END,
      v_after.id,
      v_week_start,
      COALESCE(to_jsonb(v_existing), '{}'::jsonb),
      COALESCE(to_jsonb(v_after), '{}'::jsonb),
      now()
    );
  END LOOP;

  RETURN public.get_my_duty_roster_week(v_week_start);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_duty_roster_entry(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id text := public.my_company_id();
  v_department_id uuid;
  v_existing public.duty_roster_entries;
BEGIN
  IF NOT public.can_edit_duty_roster(v_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT dm.department_id INTO v_department_id
  FROM public.department_memberships dm
  WHERE dm.user_id = v_user_id
  LIMIT 1;

  IF v_department_id IS NULL THEN
    RAISE EXCEPTION 'department_membership_missing';
  END IF;

  SELECT e.* INTO v_existing
  FROM public.duty_roster_entries e
  WHERE e.id = p_entry_id
    AND e.company_id = v_company_id
    AND e.department_id = v_department_id
  LIMIT 1;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  DELETE FROM public.duty_roster_entries e
  WHERE e.id = p_entry_id;

  INSERT INTO public.duty_roster_audit (
    company_id,
    department_id,
    actor_user_id,
    action_type,
    target_entry_id,
    week_start_sunday,
    before_state,
    after_state,
    created_at
  )
  VALUES (
    v_company_id,
    v_department_id,
    v_user_id,
    'delete',
    v_existing.id,
    v_existing.week_start_sunday,
    COALESCE(to_jsonb(v_existing), '{}'::jsonb),
    '{}'::jsonb,
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_duty_roster_permission(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_can_edit boolean;
BEGIN
  PERFORM public.assert_is_super_user();

  SELECT drup.can_edit INTO v_can_edit
  FROM public.duty_roster_user_permissions drup
  WHERE drup.user_id = p_user_id
  LIMIT 1;

  RETURN jsonb_build_object('can_edit', COALESCE(v_can_edit, false));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_duty_roster_permission(
  p_target_user_id uuid,
  p_can_edit boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id text;
BEGIN
  PERFORM public.assert_is_super_user();

  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = p_target_user_id;

  IF v_company_id IS NULL OR length(trim(v_company_id)) = 0 THEN
    RAISE EXCEPTION 'company_id_missing';
  END IF;

  INSERT INTO public.duty_roster_user_permissions (user_id, company_id, can_edit, updated_at, updated_by)
  VALUES (p_target_user_id, v_company_id, COALESCE(p_can_edit, false), now(), auth.uid())
  ON CONFLICT (user_id)
  DO UPDATE SET
    can_edit = EXCLUDED.can_edit,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by,
    company_id = EXCLUDED.company_id;

  PERFORM public.log_admin_action(
    'duty_roster_permission_set',
    'duty_roster_user_permissions',
    jsonb_build_object('target_user_id', p_target_user_id, 'can_edit', COALESCE(p_can_edit, false))
  );
END;
$$;

