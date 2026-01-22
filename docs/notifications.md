# Automated Assistant Notifications

This project supports automated push notifications for tasks, projects, event ops events, and wellness reminders.

## 1) Supabase setup

Run these SQL scripts in Supabase SQL Editor:
- [supabase_assistant_inbox.sql](file:///e:/BEATRIX/supabase_assistant_inbox.sql)
- [supabase_notification_system.sql](file:///e:/BEATRIX/supabase_notification_system.sql)

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

You can run the notification runner as a scheduled GitHub Action.

Required GitHub repository secrets:
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (optional)

Workflow file:
- `.github/workflows/assistant-notifications.yml`
