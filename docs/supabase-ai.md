# Supabase AI (Server Key)

This project routes AI requests through a **Supabase Edge Function** so:

- OpenAI is called **server-side**
- you do **not** ship an OpenAI key to the browser
- all users can use the app without pasting a personal key

## What You Store Where (Safe Defaults)

### Cloudflare Pages env (public)
- `VITE_SUPABASE_URL` (public, required)
- `VITE_SUPABASE_ANON_KEY` (public, required)
- `VITE_VAPID_PUBLIC_KEY` (public, optional)

You cannot “store these in Supabase and fetch them later” because the browser needs them to connect to Supabase in the first place.

### Supabase Edge Function secrets (server-only)
- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (optional, defaults to `gpt-4o`)

## Edge Function

- [chat](file:///c:/BEATRIX_CURSOR/supabase/functions/chat/index.ts)

## Setup

1. Deploy the `chat` function.
2. In Supabase Dashboard → Edge Functions → Secrets, set:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional)
3. Deploy Cloudflare Pages with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

