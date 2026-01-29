-- Supabase Schema: Push Notifications Queue
-- Purpose: durable queue for pending web push notifications to be sent by a worker/cron.
-- Notes:
-- - Uses `locked_at` for simple worker locking.
-- - Uses `delivered_at` + `error` for delivery tracking.
-- - RLS allows users to view their own rows, but typically only a service-role key should INSERT/UPDATE.

CREATE TABLE IF NOT EXISTS "public"."push_notifications_queue" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "locked_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "error" text
);

CREATE INDEX IF NOT EXISTS "push_notifications_queue_user_id_created_at_idx"
  ON "public"."push_notifications_queue" ("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "push_notifications_queue_pending_idx"
  ON "public"."push_notifications_queue" ("created_at" DESC)
  WHERE "delivered_at" IS NULL;

ALTER TABLE "public"."push_notifications_queue" ENABLE ROW LEVEL SECURITY;

-- Users can read their own queued notifications (optional; useful for debugging).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_notifications_queue'
      AND policyname = 'Users can read their own push notifications queue'
  ) THEN
    CREATE POLICY "Users can read their own push notifications queue"
    ON "public"."push_notifications_queue"
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- For INSERT/UPDATE/DELETE we typically rely on the service role key (bypasses RLS).
-- If you need users to insert their own notifications, add an INSERT policy carefully.

