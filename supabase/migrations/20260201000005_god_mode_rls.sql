-- 1. Grant Super Users GLOBAL access to profiles (removing company_id restriction)
DROP POLICY IF EXISTS "Super users can read company profiles" ON public.profiles;
CREATE POLICY "Super users can read all profiles (God Mode)"
ON public.profiles
FOR SELECT
USING (public.is_super_user(auth.uid()));

DROP POLICY IF EXISTS "Super users can update company profiles" ON public.profiles;
CREATE POLICY "Super users can update all profiles (God Mode)"
ON public.profiles
FOR UPDATE
USING (public.is_super_user(auth.uid()))
WITH CHECK (public.is_super_user(auth.uid()));

-- 2. Grant Super Users GLOBAL access to departments
DROP POLICY IF EXISTS "Super users can manage departments" ON public.departments;
CREATE POLICY "Super users can manage all departments (God Mode)"
ON public.departments
FOR ALL
USING (public.is_super_user(auth.uid()))
WITH CHECK (public.is_super_user(auth.uid()));

-- 3. Grant Super Users GLOBAL access to memberships
DROP POLICY IF EXISTS "Super users can manage memberships" ON public.department_memberships;
CREATE POLICY "Super users can manage all memberships (God Mode)"
ON public.department_memberships
FOR ALL
USING (public.is_super_user(auth.uid()))
WITH CHECK (public.is_super_user(auth.uid()));

DROP POLICY IF EXISTS "Super users can read all memberships" ON public.department_memberships;
-- (This one is redundant now but keeping it clean)
