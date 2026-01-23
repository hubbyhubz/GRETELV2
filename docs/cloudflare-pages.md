# Cloudflare Pages Deployment (Vite)

## Build Settings
- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`

## Required Environment Variables (Cloudflare Pages → Settings → Environment Variables)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_VAPID_PUBLIC_KEY` (if you enable push notifications)

## AI / OpenAI
- Do NOT set `VITE_OPENAI_API_KEY` in Cloudflare Pages. Any `VITE_*` variable is shipped to the browser bundle.
- Set these on Cloudflare Pages as **secrets** (not `VITE_*`):
  - `OPENAI_API_KEY` (required)
  - `OPENAI_MODEL` (optional, defaults server-side)
- The frontend calls the Cloudflare Pages Function at `/api/chat`.

## SPA Fallback
This repo includes [public/_redirects](file:///e:/BEATRIX/public/_redirects) to serve `index.html` for all non-asset paths (keeps `/assets/*` serving real JS/CSS).

## Deploy via Wrangler (optional)
1. `npm install`
2. `npm run build`
3. `npx wrangler login`
4. `npm run deploy:cf`

## Supabase Auth / OAuth Redirect URLs
After your Pages URL is created, add it to Supabase:
- Site URL: `https://<your-project>.pages.dev`
- Redirect URLs: include the same URL and any custom domain.
