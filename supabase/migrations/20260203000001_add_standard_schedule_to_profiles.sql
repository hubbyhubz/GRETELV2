-- Add standard schedule columns to profiles table if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'standard_schedule_start'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN standard_schedule_start text;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'standard_schedule_end'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN standard_schedule_end text;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'standard_schedule_days'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN standard_schedule_days text;
    END IF;
END $$;

