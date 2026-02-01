-- Duty Roster (Weekly, Sunday-start)
-- Adds department-scoped duty roster storage + per-user editor permissions + audit trail.

CREATE OR REPLACE FUNCTION public.week_start_sunday(d date)
RETURNS date
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT (d - (EXTRACT(DOW FROM d)::int))::date;
$$;

CREATE TABLE IF NOT EXISTS public.duty_roster_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  duty_date date NOT NULL,
  week_start_sunday date NOT NULL,
  slot_key text NOT NULL,
  assignee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT duty_roster_entries_week_matches_date_chk
    CHECK (week_start_sunday = public.week_start_sunday(duty_date)),
  CONSTRAINT duty_roster_entries_dept_day_slot_uniq
    UNIQUE (department_id, duty_date, slot_key)
);

CREATE INDEX IF NOT EXISTS duty_roster_entries_company_idx
  ON public.duty_roster_entries (company_id);

CREATE INDEX IF NOT EXISTS duty_roster_entries_department_week_idx
  ON public.duty_roster_entries (department_id, week_start_sunday);

CREATE INDEX IF NOT EXISTS duty_roster_entries_assignee_idx
  ON public.duty_roster_entries (assignee_user_id);

ALTER TABLE public.duty_roster_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Department members can read duty_roster_entries" ON public.duty_roster_entries;
CREATE POLICY "Department members can read duty_roster_entries"
ON public.duty_roster_entries
FOR SELECT
USING (
  company_id = public.my_company_id()
  AND public.is_department_member(department_id, auth.uid())
);

CREATE TABLE IF NOT EXISTS public.duty_roster_user_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id text NOT NULL,
  can_edit boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS duty_roster_user_permissions_company_idx
  ON public.duty_roster_user_permissions (company_id);

ALTER TABLE public.duty_roster_user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super users can read duty_roster_user_permissions" ON public.duty_roster_user_permissions;
CREATE POLICY "Super users can read duty_roster_user_permissions"
ON public.duty_roster_user_permissions
FOR SELECT
USING (public.is_super_user(auth.uid()));

DROP POLICY IF EXISTS "Super users can manage duty_roster_user_permissions" ON public.duty_roster_user_permissions;
CREATE POLICY "Super users can manage duty_roster_user_permissions"
ON public.duty_roster_user_permissions
FOR ALL
USING (public.is_super_user(auth.uid()))
WITH CHECK (public.is_super_user(auth.uid()));

CREATE TABLE IF NOT EXISTS public.duty_roster_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action_type text NOT NULL,
  target_entry_id uuid REFERENCES public.duty_roster_entries(id) ON DELETE SET NULL,
  week_start_sunday date NOT NULL,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS duty_roster_audit_department_week_idx
  ON public.duty_roster_audit (department_id, week_start_sunday);

CREATE INDEX IF NOT EXISTS duty_roster_audit_actor_created_idx
  ON public.duty_roster_audit (actor_user_id, created_at DESC);

ALTER TABLE public.duty_roster_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Department members can read duty_roster_audit" ON public.duty_roster_audit;
CREATE POLICY "Department members can read duty_roster_audit"
ON public.duty_roster_audit
FOR SELECT
USING (
  company_id = public.my_company_id()
  AND public.is_department_member(department_id, auth.uid())
);

