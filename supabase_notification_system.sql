-- Supabase Schema Update for Automated Assistant Notifications
-- Purpose: Preferences, delivery dedupe/logging, and wellness check-in storage.

CREATE TABLE IF NOT EXISTS "public"."assistant_notification_preferences" (
  "user_id" uuid PRIMARY KEY REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "preferences" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "public"."assistant_notification_preferences" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own assistant notification preferences"
ON "public"."assistant_notification_preferences"
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own assistant notification preferences"
ON "public"."assistant_notification_preferences"
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own assistant notification preferences"
ON "public"."assistant_notification_preferences"
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS "public"."assistant_notification_log" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "dedupe_key" text NOT NULL,
  "kind" text NOT NULL,
  "priority" text NOT NULL DEFAULT 'normal',
  "message_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  UNIQUE ("user_id", "dedupe_key")
);

CREATE INDEX IF NOT EXISTS "assistant_notification_log_user_id_created_at_idx"
  ON "public"."assistant_notification_log" ("user_id", "created_at" DESC);

ALTER TABLE "public"."assistant_notification_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own assistant notification log"
ON "public"."assistant_notification_log"
FOR SELECT
USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS "public"."wellness_checkins" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now(),
  "stress" integer,
  "energy" integer,
  "sleep_hours" numeric,
  "notes" text,
  "metrics" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "wellness_checkins_user_id_created_at_idx"
  ON "public"."wellness_checkins" ("user_id", "created_at" DESC);

ALTER TABLE "public"."wellness_checkins" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own wellness checkins"
ON "public"."wellness_checkins"
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wellness checkins"
ON "public"."wellness_checkins"
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Instructions:
-- 1) Run this script in Supabase SQL Editor.
-- 2) Ensure Realtime is enabled for assistant_inbox_messages (and optionally assistant_notification_log).

