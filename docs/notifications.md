# Automated Assistant Notifications

This project supports automated push notifications for tasks, projects, event ops events, and wellness reminders.

## 1) Supabase setup

Run these SQL scripts in Supabase SQL Editor:
- [supabase_assistant_inbox.sql](file:///e:/BEATRIX/supabase_assistant_inbox.sql)
- [supabase_notification_system.sql](file:///e:/BEATRIX/supabase_notification_system.sql)
- [supabase_push_subscriptions.sql](file:///e:/GRETEL/supabase_push_subscriptions.sql)
- [supabase_push_notifications_queue.sql](file:///e:/GRETEL/supabase_push_notifications_queue.sql)
- [supabase_auto_push_trigger.sql](file:///e:/GRETEL/supabase_auto_push_trigger.sql) (optional; queues pushes for assistant inbox messages)

Enable Realtime for:
- `public.assistant_inbox_messages`

## 2) Configure VAPID keys

You need one VAPID keypair:
- Public key: used by the web app to create subscriptions
- Private key: used by the notification runner to send pushes

Recommended env variables:

Local (`.env.local`):
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_VAPID_PUBLIC_KEY` (same value as your VAPID public key)
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (optional, e.g. `mailto:you@domain.com`)

Cloudflare Pages (Production env):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_VAPID_PUBLIC_KEY`

After changing the public key, re-subscribe on each device: Disable → Enable.

## 3) Run the scheduler locally

```bash
npm run notify:run
```

Useful options:
- `NOTIFICATION_RUNNER_DRY_RUN=true`
- `NOTIFICATION_RUNNER_INTERVAL_MIN=5`
- `NOTIFICATION_RUNNER_VERBOSE=true`
- `NOTIFICATION_RUNNER_TEST_MESSAGE=Hello from the Assistant`

## 4) Run on a schedule (GitHub Actions)

You can call the notification runner endpoint on a schedule using GitHub Actions.

Required GitHub repository secrets:
- `NOTIFY_RUN_URL` (example: `https://<your-domain>/api/notify-run`)
- `NOTIFY_RUN_SECRET` (must match `NOTIFY_RUN_SECRET` env in your deployment; optional if not set)

Workflow file:
- `.github/workflows/assistant-notifications.yml` (every 5 minutes)

## 5) Run on a schedule (Vercel Cron)

This repo includes a Vercel Cron that calls `/api/notify-run` on an interval.

Recommended env variables in Vercel:
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (optional)
- `DEFAULT_TIME_ZONE` (optional; IANA timezone like `America/Los_Angeles`, used as fallback)
- `NOTIFY_RUN_SECRET` (set a long random string)

When `NOTIFY_RUN_SECRET` is set, the endpoint allows either:
- Vercel Cron header: `x-vercel-cron: 1`
- Manual calls: `Authorization: Bearer <NOTIFY_RUN_SECRET>`
