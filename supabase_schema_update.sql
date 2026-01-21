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

-- Instructions:
-- 1. Copy this script.
-- 2. Run it in the Supabase SQL Editor.
