-- Supabase Schema Update for Assistant Inbox (Real-time Notifications)
-- Purpose: Store assistant-triggered notifications/reminders as messages with read/dismiss sync.

CREATE TABLE IF NOT EXISTS "public"."assistant_inbox_messages" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "sender" text NOT NULL DEFAULT 'assistant',
  "title" text,
  "content" text NOT NULL,
  "preview" text,
  "sent_at" timestamp with time zone DEFAULT now(),
  "delivered_at" timestamp with time zone,
  "read_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "assistant_inbox_messages_user_id_sent_at_idx"
  ON "public"."assistant_inbox_messages" ("user_id", "sent_at" DESC);

ALTER TABLE "public"."assistant_inbox_messages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own assistant inbox messages"
ON "public"."assistant_inbox_messages"
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own assistant inbox messages"
ON "public"."assistant_inbox_messages"
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own assistant inbox messages"
ON "public"."assistant_inbox_messages"
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Instructions:
-- 1) Run this script in Supabase SQL Editor.
-- 2) Ensure Realtime is enabled for this table in Supabase (Database → Replication).

