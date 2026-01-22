-- Trigger to automatically queue a Push Notification when a new Assistant Message arrives.

-- 1. Create the Queue Table (required by trigger + worker)
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

-- 2. Create the Function
CREATE OR REPLACE FUNCTION public.queue_push_for_new_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue for 'assistant' messages that haven't been read yet (sanity check)
  IF NEW.sender = 'assistant' THEN
    INSERT INTO public.push_notifications_queue (user_id, title, body, data)
    VALUES (
      NEW.user_id,
      COALESCE(NEW.title, 'New Message from G.R.E.T.E.L'), -- Default title if null
      substring(NEW.content from 1 for 100) || (CASE WHEN length(NEW.content) > 100 THEN '...' ELSE '' END), -- Truncate body
      jsonb_build_object('message_id', NEW.id, 'type', 'chat_message')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create the Trigger
DROP TRIGGER IF EXISTS on_new_assistant_message ON public.assistant_inbox_messages;

CREATE TRIGGER on_new_assistant_message
  AFTER INSERT ON public.assistant_inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_push_for_new_message();

-- 4. (Optional) Log for verification
COMMENT ON TRIGGER on_new_assistant_message ON public.assistant_inbox_messages IS 'Automatically inserts into push_notifications_queue when a new assistant message is created.';
