-- 1. Enhance profiles table with additional metadata
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deactivated')),
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 2. Create a system-wide audit log for Super User access tracking
CREATE TABLE IF NOT EXISTS public.admin_access_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid NOT NULL REFERENCES auth.users(id),
    action_type text NOT NULL,
    target_resource text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_access_logs ENABLE ROW LEVEL SECURITY;

-- Only super users can see these logs
DROP POLICY IF EXISTS "Super users can read admin access logs" ON public.admin_access_logs;
CREATE POLICY "Super users can read admin access logs"
ON public.admin_access_logs
FOR SELECT
USING (public.is_super_user(auth.uid()));

-- 3. Update Super User policies for UNRESTRICTED company-wide access
-- We use my_company_id() to ensure they stay within their organization, 
-- but we remove the "own profile" limitation for SELECT.

DROP POLICY IF EXISTS "Super users can read company profiles" ON public.profiles;
CREATE POLICY "Super users can read company profiles"
ON public.profiles
FOR SELECT
USING (
  public.is_super_user(auth.uid()) 
  AND company_id = public.my_company_id()
);

-- Ensure they can see all memberships in their company
DROP POLICY IF EXISTS "Super users can read all memberships" ON public.department_memberships;
CREATE POLICY "Super users can read all memberships"
ON public.department_memberships
FOR SELECT
USING (
  public.is_super_user(auth.uid())
);

-- 4. RPC for logged Super User data access (Privacy compliance audit)
CREATE OR REPLACE FUNCTION public.log_admin_action(
    p_action_type text,
    p_target_resource text,
    p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_super_user(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    INSERT INTO public.admin_access_logs (actor_user_id, action_type, target_resource, details)
    VALUES (auth.uid(), p_action_type, p_target_resource, p_details);
END;
$$;
