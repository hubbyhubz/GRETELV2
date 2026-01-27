<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1x7PRh_zZe3-aO-G_6Lk_LPtV7ohVOAPO

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Vercel

**Vercel Environment Variables**
- Frontend (Vite):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Serverless API (`/api/chat`):
  - `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)
  - Optional: `GEMINI_MODEL`

**Supabase Auth Redirect URLs**
- In Supabase → Auth → URL Configuration, add your Vercel production URL (and preview URLs if you use them).

**Vercel Build Settings**
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

More details: [docs/vercel-deployment.md](docs/vercel-deployment.md)
