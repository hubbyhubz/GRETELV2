# Google OAuth Infinite Loop: Root Cause & Fix

## Symptom
After completing the Google OAuth screens (account select → unverified-app warning → consent → continue), the app returns to the **“Connect Your Google Account”** screen again, and repeating the process loops.

## Complete Authentication Flow (Current)

### 1) User logs in
- User signs in with email/password (Supabase session exists).
- The app loads the user profile.

### 2) Google gate (connect vs refresh)
In [App.tsx](file:///e:/GRETEL/App.tsx#L399-L424), once `session` exists and `setup_complete === true`, the app checks:
- **Linked Google identity?** (via `supabase.auth.getUser()` → `user.identities[]`)
  - If **not linked** → `requiresGoogleConnect = true`
  - If **linked** → `requiresGoogleRefresh = !session.provider_token`

### 3) Connect/Refresh page
The UI uses one page component with a mode:
- `mode="connect"` when the user needs to link a Google identity
- `mode="refresh"` when the identity is linked but a Google access token is missing/expired

Component: [GoogleRefreshPage.tsx](file:///e:/GRETEL/components/GoogleRefreshPage.tsx)

### 4) Calendar sync uses Google access token
Google Calendar calls use `session.provider_token` (Bearer token) in:
- [DashboardContext.tsx](file:///e:/GRETEL/components/DashboardContext.tsx#L4461-L4476)
- [googleCalendarService.ts](file:///e:/GRETEL/components/googleCalendarService.ts)

## Root Cause (Where the Loop Re-initiated)
The loop happened when:
- The user successfully **linked** their Google identity, but
- Their Supabase session still had **no `provider_token`** (common when the user’s primary login is email/password).

Previously, the connect page always used `linkIdentity()` whenever a Supabase session existed.
That can link the identity but **does not guarantee** obtaining a fresh Google `provider_token` for API calls.

Result:
1) App sees identity linked → sets `requiresGoogleRefresh = true`
2) User is sent back to Google connect UI
3) Page calls `linkIdentity()` again (does not produce token)
4) App still sees `provider_token` missing → repeats forever

## Fix (State Management + Token Validation)

### A) Split “connect” vs “refresh” actions
In [GoogleRefreshPage.tsx](file:///e:/GRETEL/components/GoogleRefreshPage.tsx):
- **Connect mode** (`mode="connect"`):
  - If logged in → `supabase.auth.linkIdentity({ provider: 'google', ... })`
  - If not logged in → `supabase.auth.signInWithOAuth({ provider: 'google', ... })`
- **Refresh mode** (`mode="refresh"`):
  - Always use `supabase.auth.signInWithOAuth({ provider: 'google', ... })` to obtain a fresh provider token.

### B) Improve token/account correctness
- Always request `openid email profile` and force account selection using:
  - `prompt=select_account consent`
  - `login_hint` when available (stored previously for the user)

### C) Render correct page based on state
In [App.tsx](file:///e:/GRETEL/App.tsx#L496-L502):
- `requiresGoogleConnect` renders `mode="connect"`
- `requiresGoogleRefresh` renders `mode="refresh"`

### D) Account mismatch protection
Before syncing schedule blocks or fetching events, the app verifies the Google identity behind the token and blocks sync if it changes unexpectedly:
- Utility: [googleUserInfo.ts](file:///e:/GRETEL/lib/googleUserInfo.ts)
- Enforcement points: [DashboardContext.tsx](file:///e:/GRETEL/components/DashboardContext.tsx)

## Edge Cases Covered
- Multiple Google accounts in browser: forced account picker + login hint
- Linked identity but missing provider token: refresh flow uses OAuth sign-in to obtain token
- Manual linking disabled in Supabase: connect mode shows a clear error instead of looping
- Session/token switching: calendar cache cleared to avoid mixed-account events

## Verification Checklist (Manual)
OAuth flows can’t be fully unit-tested locally without mocking Supabase redirects, so use this checklist.

### Scenario 1: Email/password user, no Google linked
1. Login with email/password.
2. App shows Google connect page.
3. Click connect → complete Google account selection + consent.
4. After redirect back, the app should either:
   - land on refresh page (if token missing), then
   - complete refresh and land on dashboard.
5. No repeated loop.

### Scenario 2: Email/password user, Google linked but token missing
1. Login.
2. App shows “Reconnect Google”.
3. Complete OAuth.
4. App proceeds to dashboard and calendar sync works.

### Scenario 3: User selects a different Google account than previously used
1. Complete OAuth with a different Google email.
2. Sync attempt should show “Google Account Mismatch” and block sync.

### Scenario 4: Manual linking disabled (production misconfig)
1. Login with email/password.
2. On connect attempt, UI should show error:
   - “Enable Manual Linking in Supabase Auth settings…”.
3. No infinite redirect/loop.

## Tests (Repo)
- Unit tests for the identity helper: [googleUserInfo.test.ts](file:///e:/GRETEL/tests/googleUserInfo.test.ts)

