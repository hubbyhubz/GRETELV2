# Vercel Deployment (Prerequisites + Setup)

## Prerequisites
- A Vercel account and a Git repo connected to Vercel (GitHub/GitLab/Bitbucket).
- A Supabase project with Auth enabled and your required tables applied.
- OpenAI API access if you want `/api/chat` to work (this app uses a serverless endpoint to call OpenAI).

## Required Environment Variables (Vercel)
Set these in **Vercel → Project → Settings → Environment Variables**:

**Frontend (Vite)**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Serverless API (`/api/chat`)**
- `OPENAI_API_KEY`
- Optional: `OPENAI_MODEL` (defaults to `gpt-4o`)

## Supabase Auth Redirect URLs
In Supabase **Auth → URL Configuration**, add:
- Your Vercel production URL (e.g. `https://your-app.vercel.app`)
- Your custom domain (if any)
- Optional: Preview deployments if you use them (Vercel preview URLs)

This is required for email confirmation, magic links, and password reset flows.

## Vercel Project Settings
Vercel can usually detect this automatically.
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`
- Node version: 20 (recommended, matches prior hosting settings)

## API Route
This repo includes a Vercel serverless function at:
- `api/chat.js` → reachable at `https://<your-domain>/api/chat`

The frontend calls `/api/chat` (same-origin), so no additional rewrites are required for the API route.

## SPA Routing
This repo includes `vercel.json` with a rewrite to serve the app from `/` for unknown paths.

## Database Migrations / SQL Scripts
If you’re bootstrapping a fresh Supabase project, run the SQL scripts in the Supabase SQL editor as needed:
- `supabase_schema_update.sql` (profile columns, event ops table + RLS)
- `supabase_assistant_brain.sql` (centralized assistant brain table + RLS)
- Notification/push scripts as needed for your setup.

