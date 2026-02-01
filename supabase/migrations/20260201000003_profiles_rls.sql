-- Enable RLS on profiles if not already enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 1. Users can read their own profile
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- 2. Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. Super Users can read all profiles in their company
DROP POLICY IF EXISTS "Super users can read company profiles" ON public.profiles;
CREATE POLICY "Super users can read company profiles"
ON public.profiles
FOR SELECT
USING (
  public.is_super_user(auth.uid()) 
  AND company_id = public.my_company_id()
);

-- 4. Super Users can update profiles in their company (for administrative changes)
DROP POLICY IF EXISTS "Super users can update company profiles" ON public.profiles;
CREATE POLICY "Super users can update company profiles"
ON public.profiles
FOR UPDATE
USING (
  public.is_super_user(auth.uid()) 
  AND company_id = public.my_company_id()
)
WITH CHECK (
  public.is_super_user(auth.uid()) 
  AND company_id = public.my_company_id()
);
