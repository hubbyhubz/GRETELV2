-- OKR Personal MVP (Crimson) — Supabase Migration
-- Purpose: Add personal OKR tables (cycles, objectives, key results, check-ins) with RLS.

-- 1) Cycles
CREATE TABLE IF NOT EXISTS "public"."okr_cycles" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "cadence" text NOT NULL CHECK ("cadence" IN ('quarterly', 'annual', 'custom')),
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('draft', 'active', 'closed')),
  "reminder_time" text NOT NULL DEFAULT '09:00',
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "okr_cycles_user_id_status_idx"
  ON "public"."okr_cycles" ("user_id", "status");

ALTER TABLE "public"."okr_cycles" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own OKR cycles" ON "public"."okr_cycles";
DROP POLICY IF EXISTS "Users can insert their own OKR cycles" ON "public"."okr_cycles";
DROP POLICY IF EXISTS "Users can update their own OKR cycles" ON "public"."okr_cycles";
DROP POLICY IF EXISTS "Users can delete their own OKR cycles" ON "public"."okr_cycles";

CREATE POLICY "Users can read their own OKR cycles"
ON "public"."okr_cycles"
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own OKR cycles"
ON "public"."okr_cycles"
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OKR cycles"
ON "public"."okr_cycles"
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OKR cycles"
ON "public"."okr_cycles"
FOR DELETE
USING (auth.uid() = user_id);

-- 2) Objectives
CREATE TABLE IF NOT EXISTS "public"."okr_objectives" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "cycle_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('draft', 'active', 'closed')),
  "priority" int NOT NULL DEFAULT 3 CHECK ("priority" BETWEEN 1 AND 5),
  "aligned_to_objective_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "okr_objectives_user_id_cycle_id_idx"
  ON "public"."okr_objectives" ("user_id", "cycle_id");

CREATE INDEX IF NOT EXISTS "okr_objectives_aligned_to_idx"
  ON "public"."okr_objectives" ("aligned_to_objective_id");

ALTER TABLE "public"."okr_objectives" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own OKR objectives" ON "public"."okr_objectives";
DROP POLICY IF EXISTS "Users can insert their own OKR objectives" ON "public"."okr_objectives";
DROP POLICY IF EXISTS "Users can update their own OKR objectives" ON "public"."okr_objectives";
DROP POLICY IF EXISTS "Users can delete their own OKR objectives" ON "public"."okr_objectives";

CREATE POLICY "Users can read their own OKR objectives"
ON "public"."okr_objectives"
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own OKR objectives"
ON "public"."okr_objectives"
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OKR objectives"
ON "public"."okr_objectives"
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OKR objectives"
ON "public"."okr_objectives"
FOR DELETE
USING (auth.uid() = user_id);

-- 3) Key Results
CREATE TABLE IF NOT EXISTS "public"."okr_key_results" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "objective_id" uuid NOT NULL,
  "title" text NOT NULL,
  "metric_type" text NOT NULL CHECK ("metric_type" IN ('number', 'percent', 'currency', 'count', 'milestone')),
  "unit" text,
  "direction" text NOT NULL DEFAULT 'increase_to' CHECK ("direction" IN ('increase_to', 'decrease_to', 'maintain_at', 'complete')),
  "start_value" numeric NOT NULL DEFAULT 0,
  "target_value" numeric NOT NULL DEFAULT 0,
  "current_value" numeric NOT NULL DEFAULT 0,
  "due_date" date NOT NULL,
  "weight" numeric NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('draft', 'active', 'closed')),
  "checkin_frequency" text NOT NULL DEFAULT 'daily' CHECK ("checkin_frequency" IN ('daily', 'weekly')),
  "reminder_enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "okr_key_results_user_id_objective_id_idx"
  ON "public"."okr_key_results" ("user_id", "objective_id");

CREATE INDEX IF NOT EXISTS "okr_key_results_due_date_idx"
  ON "public"."okr_key_results" ("due_date");

ALTER TABLE "public"."okr_key_results" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own OKR key results" ON "public"."okr_key_results";
DROP POLICY IF EXISTS "Users can insert their own OKR key results" ON "public"."okr_key_results";
DROP POLICY IF EXISTS "Users can update their own OKR key results" ON "public"."okr_key_results";
DROP POLICY IF EXISTS "Users can delete their own OKR key results" ON "public"."okr_key_results";

CREATE POLICY "Users can read their own OKR key results"
ON "public"."okr_key_results"
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own OKR key results"
ON "public"."okr_key_results"
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OKR key results"
ON "public"."okr_key_results"
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OKR key results"
ON "public"."okr_key_results"
FOR DELETE
USING (auth.uid() = user_id);

-- 4) Check-ins
CREATE TABLE IF NOT EXISTS "public"."okr_checkins" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "key_result_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "value" numeric NOT NULL,
  "confidence" int NOT NULL CHECK ("confidence" BETWEEN 1 AND 5),
  "health" text NOT NULL CHECK ("health" IN ('on_track', 'at_risk', 'off_track')),
  "note" text
);

CREATE INDEX IF NOT EXISTS "okr_checkins_key_result_created_idx"
  ON "public"."okr_checkins" ("key_result_id", "created_at" DESC);

ALTER TABLE "public"."okr_checkins" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own OKR checkins" ON "public"."okr_checkins";
DROP POLICY IF EXISTS "Users can insert their own OKR checkins" ON "public"."okr_checkins";
DROP POLICY IF EXISTS "Users can update their own OKR checkins" ON "public"."okr_checkins";
DROP POLICY IF EXISTS "Users can delete their own OKR checkins" ON "public"."okr_checkins";

CREATE POLICY "Users can read their own OKR checkins"
ON "public"."okr_checkins"
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own OKR checkins"
ON "public"."okr_checkins"
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OKR checkins"
ON "public"."okr_checkins"
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OKR checkins"
ON "public"."okr_checkins"
FOR DELETE
USING (auth.uid() = user_id);

-- 5) Grants (required in addition to RLS)
GRANT SELECT ON "public"."okr_cycles", "public"."okr_objectives", "public"."okr_key_results", "public"."okr_checkins" TO anon;
GRANT ALL PRIVILEGES ON "public"."okr_cycles", "public"."okr_objectives", "public"."okr_key_results", "public"."okr_checkins" TO authenticated;

