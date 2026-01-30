-- OKR Darwinbox Upgrade — Schema extension for “My Goal Plan”

ALTER TABLE IF EXISTS "public"."okr_cycles"
  ADD COLUMN IF NOT EXISTS "plan_name" text,
  ADD COLUMN IF NOT EXISTS "source" text;

ALTER TABLE IF EXISTS "public"."okr_objectives"
  ADD COLUMN IF NOT EXISTS "objective_component" text,
  ADD COLUMN IF NOT EXISTS "weightage" numeric,
  ADD COLUMN IF NOT EXISTS "tracking_status" text,
  ADD COLUMN IF NOT EXISTS "achievement_score" numeric,
  ADD COLUMN IF NOT EXISTS "last_checkin_at" timestamp with time zone;

ALTER TABLE IF EXISTS "public"."okr_key_results"
  ADD COLUMN IF NOT EXISTS "metric" text,
  ADD COLUMN IF NOT EXISTS "target_operator" text,
  ADD COLUMN IF NOT EXISTS "initiatives" text,
  ADD COLUMN IF NOT EXISTS "start_date" date,
  ADD COLUMN IF NOT EXISTS "end_date" date,
  ADD COLUMN IF NOT EXISTS "achieved_value" numeric,
  ADD COLUMN IF NOT EXISTS "tracking_status" text,
  ADD COLUMN IF NOT EXISTS "data_source" text,
  ADD COLUMN IF NOT EXISTS "budget_target_value" numeric,
  ADD COLUMN IF NOT EXISTS "stretch_target_value" numeric;

ALTER TABLE IF EXISTS "public"."okr_key_results"
  ADD CONSTRAINT IF NOT EXISTS "okr_key_results_target_operator_check"
  CHECK ("target_operator" IS NULL OR "target_operator" IN ('equal_to', 'gte', 'lte'));

ALTER TABLE IF EXISTS "public"."okr_objectives"
  ADD CONSTRAINT IF NOT EXISTS "okr_objectives_tracking_status_check"
  CHECK ("tracking_status" IS NULL OR "tracking_status" IN ('not_started', 'started', 'on_track', 'completed', 'at_risk', 'off_track'));

ALTER TABLE IF EXISTS "public"."okr_key_results"
  ADD CONSTRAINT IF NOT EXISTS "okr_key_results_tracking_status_check"
  CHECK ("tracking_status" IS NULL OR "tracking_status" IN ('not_started', 'started', 'on_track', 'completed', 'at_risk', 'off_track'));

UPDATE "public"."okr_key_results" SET
  "end_date" = COALESCE("end_date", "due_date")
WHERE "end_date" IS NULL AND "due_date" IS NOT NULL;

UPDATE "public"."okr_key_results" SET
  "achieved_value" = COALESCE("achieved_value", "current_value")
WHERE "achieved_value" IS NULL AND "current_value" IS NOT NULL;

