-- Duty Roster: Department user list (for roster population)

CREATE OR REPLACE FUNCTION public.get_my_department_users()
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
  v_users jsonb;
BEGIN
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
        'user_id', p.id,
        'full_name', COALESCE(NULLIF(p.full_name, ''), 'Unnamed User'),
        'role', dm.role
      )
      ORDER BY dm.role, p.full_name
    ),
    '[]'::jsonb
  )
  INTO v_users
  FROM public.department_memberships dm
  JOIN public.profiles p ON p.id = dm.user_id
  WHERE dm.department_id = v_department_id
    AND p.company_id = v_company_id;

  RETURN jsonb_build_object(
    'department_id', v_department_id,
    'users', v_users
  );
END;
$$;

