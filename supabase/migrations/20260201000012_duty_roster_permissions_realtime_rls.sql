-- Duty Roster Permissions (Self-read for realtime updates)

ALTER TABLE public.duty_roster_user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own duty_roster_user_permissions" ON public.duty_roster_user_permissions;
CREATE POLICY "Users can read their own duty_roster_user_permissions"
ON public.duty_roster_user_permissions
FOR SELECT
USING (auth.uid() = user_id);

