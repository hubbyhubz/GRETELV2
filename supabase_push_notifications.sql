-- Supabase Schema Update for Push Notifications
-- Generated: 2026-01-21
-- Purpose: Create table to store Web Push subscriptions.

-- 1. Create the push_subscriptions table
CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "endpoint" text NOT NULL,
    "p256dh" text NOT NULL,
    "auth" text NOT NULL,
    "user_agent" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "last_used_at" timestamp with time zone DEFAULT now(),
    -- Ensure unique endpoint per user to avoid duplicate notifications
    UNIQUE("user_id", "endpoint")
);

-- 2. Enable RLS
ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;

-- 3. Create policies
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON "public"."push_subscriptions";
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON "public"."push_subscriptions";
DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON "public"."push_subscriptions";
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON "public"."push_subscriptions";

-- Allow users to insert their own subscriptions
CREATE POLICY "Users can insert their own subscriptions"
ON "public"."push_subscriptions" 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Allow users to view their own subscriptions
CREATE POLICY "Users can view their own subscriptions" 
ON "public"."push_subscriptions" 
FOR SELECT 
USING (auth.uid() = user_id);

-- Allow users to delete their own subscriptions
CREATE POLICY "Users can delete their own subscriptions" 
ON "public"."push_subscriptions" 
FOR DELETE 
USING (auth.uid() = user_id);

-- Allow users to update their own subscriptions
CREATE POLICY "Users can update their own subscriptions"
ON "public"."push_subscriptions"
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Instructions:
-- 1. Copy this script.
-- 2. Run it in the Supabase SQL Editor.
