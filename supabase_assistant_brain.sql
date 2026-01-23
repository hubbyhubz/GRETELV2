-- Supabase Assistant Brain (Centralized Per-User Memory)
-- Generated: 2026-01-23
-- Purpose: Create a per-user centralized "assistant brain" that aggregates profile + dashboard state.

-- 1) Main table
CREATE TABLE IF NOT EXISTS "public"."assistant_brains" (
  "user_id" uuid PRIMARY KEY REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "brain" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- 2) RLS policies
ALTER TABLE "public"."assistant_brains" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own assistant brain" ON "public"."assistant_brains";
DROP POLICY IF EXISTS "Users can insert their own assistant brain" ON "public"."assistant_brains";
DROP POLICY IF EXISTS "Users can update their own assistant brain" ON "public"."assistant_brains";

CREATE POLICY "Users can read their own assistant brain"
ON "public"."assistant_brains"
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own assistant brain"
ON "public"."assistant_brains"
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own assistant brain"
ON "public"."assistant_brains"
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3) RPC: upsert a patch (top-level jsonb merge) for the current user
CREATE OR REPLACE FUNCTION "public"."assistant_brain_upsert"(p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "public"."assistant_brains" ("user_id", "brain", "updated_at")
  VALUES (
    auth.uid(),
    COALESCE(p_patch, '{}'::jsonb),
    now()
  )
  ON CONFLICT ("user_id") DO UPDATE
    SET "brain" = COALESCE("public"."assistant_brains"."brain", '{}'::jsonb) || EXCLUDED."brain",
        "updated_at" = now();
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."assistant_brain_upsert"(jsonb) TO authenticated;

-- 4) Auto-create a brain row on auth.users insert
CREATE OR REPLACE FUNCTION "public"."handle_new_user_assistant_brain"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO "public"."assistant_brains" ("user_id", "brain", "created_at", "updated_at")
  VALUES (
    NEW.id,
    jsonb_build_object(
      'version', 1,
      'created_from', 'auth.users',
      'created_at_ms', (extract(epoch from now()) * 1000)::bigint
    ),
    now(),
    now()
  )
  ON CONFLICT ("user_id") DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_created_assistant_brain'
  ) THEN
    EXECUTE '
      CREATE TRIGGER on_auth_user_created_assistant_brain
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user_assistant_brain();
    ';
  END IF;
END;
$$;

-- 5) Optional: keep brain synced from profiles (aggregates profile fields into brain.profile)
CREATE OR REPLACE FUNCTION "public"."sync_assistant_brain_from_profile"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patch jsonb;
BEGIN
  patch := jsonb_build_object(
    'version', 1,
    'profile', jsonb_build_object(
      'full_name', NEW.full_name,
      'username', NEW.username,
      'company_id', NEW.company_id,
      'mobile_number', NEW.mobile_number,
      'assistant_name', NEW.assistant_name,
      'assistant_memory', NEW.assistant_memory,
      'role', NEW.role,
      'responsibilities', NEW.responsibilities,
      'daily_tasks', NEW.daily_tasks,
      'deep_focus_projects', NEW.deep_focus_projects,
      'metrics', NEW.metrics,
      'meetings', NEW.meetings,
      'time_challenge', NEW.time_challenge,
      'comm_style', NEW.comm_style,
      'success_definition', NEW.success_definition,
      'team', NEW.team
    ),
    'profile_updated_at', now()
  );

  INSERT INTO "public"."assistant_brains" ("user_id", "brain", "updated_at")
  VALUES (NEW.id, patch, now())
  ON CONFLICT ("user_id") DO UPDATE
    SET "brain" = COALESCE("public"."assistant_brains"."brain", '{}'::jsonb) || EXCLUDED."brain",
        "updated_at" = now();

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_profile_sync_assistant_brain') THEN
      EXECUTE '
        CREATE TRIGGER on_profile_sync_assistant_brain
        AFTER INSERT OR UPDATE ON public.profiles
        FOR EACH ROW
        EXECUTE FUNCTION public.sync_assistant_brain_from_profile();
      ';
    END IF;
  END IF;
END;
$$;

-- 6) Optional: keep brain synced from dashboard_states (aggregates dashboard state into brain.dashboard_state)
CREATE OR REPLACE FUNCTION "public"."sync_assistant_brain_from_dashboard_state"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patch jsonb;
BEGIN
  patch := jsonb_build_object(
    'version', 1,
    'dashboard_state', NEW.state,
    'dashboard_state_updated_at', now()
  );

  INSERT INTO "public"."assistant_brains" ("user_id", "brain", "updated_at")
  VALUES (NEW.user_id, patch, now())
  ON CONFLICT ("user_id") DO UPDATE
    SET "brain" = COALESCE("public"."assistant_brains"."brain", '{}'::jsonb) || EXCLUDED."brain",
        "updated_at" = now();

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.dashboard_states') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_dashboard_state_sync_assistant_brain') THEN
      EXECUTE '
        CREATE TRIGGER on_dashboard_state_sync_assistant_brain
        AFTER INSERT OR UPDATE ON public.dashboard_states
        FOR EACH ROW
        EXECUTE FUNCTION public.sync_assistant_brain_from_dashboard_state();
      ';
    END IF;
  END IF;
END;
$$;

-- Instructions:
-- 1) Copy this script into the Supabase SQL Editor and run it.
-- 2) Confirm `public.assistant_brains` exists and RLS policies are applied.
-- 3) Create a new user and verify a row appears in `assistant_brains`.
