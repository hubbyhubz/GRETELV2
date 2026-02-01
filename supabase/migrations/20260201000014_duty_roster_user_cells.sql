-- Duty Roster: Per-user day cells (employee rows)
-- Converts roster storage to be keyed by (department_id, duty_date, assignee_user_id, slot_key).

ALTER TABLE public.duty_roster_entries
  DROP CONSTRAINT IF EXISTS duty_roster_entries_dept_day_slot_uniq;

DELETE FROM public.duty_roster_entries
WHERE assignee_user_id IS NULL;

ALTER TABLE public.duty_roster_entries
  ALTER COLUMN assignee_user_id SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'duty_roster_entries_dept_day_user_slot_uniq'
      AND table_schema = 'public'
      AND table_name = 'duty_roster_entries'
  ) THEN
    ALTER TABLE public.duty_roster_entries
      ADD CONSTRAINT duty_roster_entries_dept_day_user_slot_uniq
      UNIQUE (department_id, duty_date, assignee_user_id, slot_key);
  END IF;
END $$;

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
  v_assignee_ok boolean;
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

    IF v_assignee IS NULL THEN
      RAISE EXCEPTION 'assignee_user_id_required';
    END IF;

    IF public.week_start_sunday(v_duty_date) <> v_week_start THEN
      RAISE EXCEPTION 'duty_date_out_of_week';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.department_memberships dm
      WHERE dm.user_id = v_assignee
        AND dm.department_id = v_department_id
    )
    INTO v_assignee_ok;

    IF NOT v_assignee_ok THEN
      RAISE EXCEPTION 'assignee_not_in_department';
    END IF;

    SELECT e.* INTO v_existing
    FROM public.duty_roster_entries e
    WHERE e.department_id = v_department_id
      AND e.duty_date = v_duty_date
      AND e.assignee_user_id = v_assignee
      AND e.slot_key = v_slot_key
    LIMIT 1;

    IF v_notes IS NULL OR length(trim(v_notes)) = 0 THEN
      IF v_existing.id IS NOT NULL THEN
        DELETE FROM public.duty_roster_entries e WHERE e.id = v_existing.id;

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
          v_week_start,
          COALESCE(to_jsonb(v_existing), '{}'::jsonb),
          '{}'::jsonb,
          now()
        );
      END IF;

      CONTINUE;
    END IF;

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
    ON CONFLICT (department_id, duty_date, assignee_user_id, slot_key)
    DO UPDATE SET
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
      AND e.assignee_user_id = v_assignee
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

