-- Supabase Schema for Web Push Subscriptions
-- Purpose: Store VAPID subscriptions for user devices.

CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "last_used_at" timestamp with time zone DEFAULT now(),
  UNIQUE ("user_id", "endpoint")
);

ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscriptions
CREATE POLICY "Users can read their own push subscriptions"
ON "public"."push_subscriptions"
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own subscriptions
CREATE POLICY "Users can insert their own push subscriptions"
ON "public"."push_subscriptions"
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own subscriptions
CREATE POLICY "Users can delete their own push subscriptions"
ON "public"."push_subscriptions"
FOR DELETE
USING (auth.uid() = user_id);

-- Users can update their own subscriptions (e.g. last_used_at)
CREATE POLICY "Users can update their own push subscriptions"
ON "public"."push_subscriptions"
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Instructions:
-- 1) Run this script in Supabase SQL Editor.
