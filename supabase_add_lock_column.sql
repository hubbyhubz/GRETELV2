-- Add is_app_locked column to profiles for remote locking status
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_app_locked BOOLEAN DEFAULT FALSE;

-- Update RLS if needed (usually existing policies cover update/select for own user)
-- No new policy needed if "Users can update own profile" exists.
