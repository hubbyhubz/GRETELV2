-- Supabase Schema Update
-- Generated: 2026-01-21
-- Purpose: Add missing columns to 'profiles' table to resolve client-side errors and ensure full data persistence.

-- 1. Add 'last_seen_version' for patch notes tracking
ALTER TABLE "public"."profiles" 
ADD COLUMN IF NOT EXISTS "last_seen_version" text;

-- 2. Add 'tour_completed' for onboarding status
ALTER TABLE "public"."profiles" 
ADD COLUMN IF NOT EXISTS "tour_completed" boolean DEFAULT false;

-- 3. Add 'seen_features' for feature announcements
ALTER TABLE "public"."profiles" 
ADD COLUMN IF NOT EXISTS "seen_features" text[] DEFAULT '{}';

-- 4. Add 'tour_state' for granular tour progress
ALTER TABLE "public"."profiles" 
ADD COLUMN IF NOT EXISTS "tour_state" jsonb;

-- 5. Add 'assistant_memory' and 'team' (referenced in App.tsx)
ALTER TABLE "public"."profiles" 
ADD COLUMN IF NOT EXISTS "assistant_memory" text,
ADD COLUMN IF NOT EXISTS "team" jsonb DEFAULT '[]';

-- 6. Add 'passive_memory' and 'relational_memory' for long-term memory persistence
ALTER TABLE "public"."profiles" 
ADD COLUMN IF NOT EXISTS "passive_memory" text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "relational_memory" jsonb DEFAULT '{"nodes": [], "edges": []}';

-- 7. Event Ops Calendar (events + meetings)
CREATE TABLE IF NOT EXISTS "public"."event_ops_items" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL CHECK ("kind" IN ('event', 'meeting')),
  "event_date" date NOT NULL,
  "name" text NOT NULL,
  "location" text,
  "pax" integer,
  "serving_time" time without time zone,
  "remarks" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "event_ops_items_user_id_event_date_idx"
  ON "public"."event_ops_items" ("user_id", "event_date" DESC);

ALTER TABLE "public"."event_ops_items" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own event ops items" ON "public"."event_ops_items";
DROP POLICY IF EXISTS "Users can insert their own event ops items" ON "public"."event_ops_items";
DROP POLICY IF EXISTS "Users can update their own event ops items" ON "public"."event_ops_items";
DROP POLICY IF EXISTS "Users can delete their own event ops items" ON "public"."event_ops_items";

CREATE POLICY "Users can read their own event ops items"
ON "public"."event_ops_items"
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own event ops items"
ON "public"."event_ops_items"
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own event ops items"
ON "public"."event_ops_items"
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own event ops items"
ON "public"."event_ops_items"
FOR DELETE
USING (auth.uid() = user_id);

-- Instructions:
-- 1. Copy this script.
-- 2. Run it in the Supabase SQL Editor.
