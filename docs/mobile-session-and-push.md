# Mobile Session Persistence & Push Notifications

## Symptom
- On mobile (slow networks / background-resume), the app appears to “auto-logout” and returns to the login screen.
- Because the user never reliably reaches the dashboard, push subscriptions may not be persisted to Supabase, and push notifications don’t work consistently.

## Root Cause

### 1) Session initialization relied on an auth event that can be delayed on mobile
`useAuthListener` previously called `supabase.auth.getSession()` but did **not** set `session` immediately when a session existed. It waited for `onAuthStateChange(INITIAL_SESSION)`.

On some mobile browsers (especially after resume / throttled JS), that event can be delayed.
While waiting, `isLoading` remained true.

### 2) A hard 10s “login timeout” forced the UI back to login while session was still valid
In `App.tsx`, a safety timeout set `currentView='login'` whenever `isLoading` stayed true past 10 seconds.

This is not a real `supabase.auth.signOut()`, but it *looks like an auto-logout*.

### 3) Push subscription persistence depended on reaching the dashboard
`NotificationManager` (which auto-subscribes when permission is already granted) is only mounted when the dashboard is visible. If the app never reaches the dashboard due to the loading/login loop, the push subscription may not be upserted to the `push_subscriptions` table.

## Fix

### A) Set session immediately during initial session probe
`useAuthListener` now sets `session` and clears loading immediately when `getSession()` returns an existing session.

File:
- [useAuthListener.ts](file:///e:/GRETEL/hooks/useAuthListener.ts)

### B) Make the safety timeout “session-aware” and less aggressive
The timeout now only forces `currentView='login'` if:
- the app is still loading, and
- there is **no** session.

Also increased to 15 seconds to reduce false positives on mobile networks.

File:
- [App.tsx](file:///e:/GRETEL/App.tsx)

### C) Persist push subscriptions as soon as session exists
When a session exists and notification permission is already `granted`, the app now calls:
- `registerServiceWorker()`
- `subscribeUserToPush()`

This makes push subscription persistence independent from reaching the dashboard.

File:
- [App.tsx](file:///e:/GRETEL/App.tsx)

## Notes on Push Support by Mobile Browser
- Android Chrome/Edge: Web Push supported.
- iOS Safari: Web Push supported only on recent iOS versions and typically requires adding the site to Home Screen (PWA-style) depending on OS version.
- Some “in-app browsers” (Facebook/Instagram) restrict service workers and push.

## Verification Checklist (Manual)

### Core session persistence
1. Login on mobile (Chrome Android / Safari iOS).
2. Wait on the loading screen for >15s on slow network.
3. Confirm the app does not jump to login if a session exists.
4. Background the app for 2–5 minutes and return.
5. Confirm user remains signed in.

### Push subscription persistence
1. Grant notification permission.
2. Login and wait for dashboard load.
3. In Supabase, verify a row exists in `push_subscriptions` for the current `user_id`.
4. Send a test notification (or enqueue via `notify-run.js`) and confirm:
   - foreground: in-app toast appears
   - background: push notification appears

### Edge cases
- Slow profile fetch / intermittent network: ensure no forced “logout” loop.
- Multiple tabs: one tab refreshes token; the other should remain stable.
- Background-resume near token expiry: session should refresh and remain valid.

