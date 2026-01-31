# Google Account Linking & Calendar Sync

## Symptom
- Schedule blocks (synced to Google Calendar) sometimes appear in a different Google account than expected.
- Some users see schedule sync working, while others do not.

## Root Cause

### 1) Inconsistent linking flows
- The mandatory “Connect Google” page used `signInWithOAuth()`, which can sign the user into a different Supabase account (or a different Google account) rather than linking Google to the *current* signed-in user.
- The Settings page used `linkIdentity()`, but local Supabase config had manual linking disabled.

Key files:
- Mandatory connect UI: [GoogleRefreshPage.tsx](file:///e:/GRETEL/components/GoogleRefreshPage.tsx)
- Settings connect: [AccountSettingsPage.tsx](file:///e:/GRETEL/components/AccountSettingsPage.tsx)
- Local Supabase config: [config.toml](file:///e:/GRETEL/supabase/config.toml)

### 2) No account identity verification during sync
- Calendar sync uses `session.provider_token` as a Bearer token and writes to `calendars/primary`, but did not verify which Google account that token belongs to.
- With multiple Google accounts in the browser, OAuth can return a token for an unintended account.

## Fix

### A) Force account selection + request identity scopes
Both connect flows now request `openid email profile` and force the account picker:
- `queryParams: { prompt: 'select_account consent' }`

Updated files:
- [GoogleRefreshPage.tsx](file:///e:/GRETEL/components/GoogleRefreshPage.tsx)
- [AccountSettingsPage.tsx](file:///e:/GRETEL/components/AccountSettingsPage.tsx)

### B) Link identity when already logged in
The mandatory connect page now:
- Uses `linkIdentity()` if there is an existing Supabase session.
- Falls back to `signInWithOAuth()` only when there is no session.

### C) Detect Google account mismatch before syncing
Before fetching calendar events or syncing schedule blocks, the app now:
- Calls Google OpenID userinfo (`https://openidconnect.googleapis.com/v1/userinfo`) using the current `provider_token`.
- Stores the Google email in localStorage per Supabase user.
- If the Google email changes unexpectedly, it blocks sync, clears cached events, and prompts the user to reconnect.

New utility:
- [googleUserInfo.ts](file:///e:/GRETEL/lib/googleUserInfo.ts)

Updated sync points:
- [DashboardContext.tsx](file:///e:/GRETEL/components/DashboardContext.tsx)

### D) Clear stale calendar event cache on token/user changes
If `session.user.id` or `session.provider_token` changes, cached `googleCalendarEvents` are cleared to avoid mixing accounts.

## Reproduction (Before)
1. Sign in with email/password.
2. Click connect Google (mandatory connect page).
3. Select a different Google account than previously used.
4. Sync schedule blocks → blocks appear in the other Google account.

## Verification (After)
1. Connect flow forces account selection and requests identity scopes.
2. When logged in, connect links to the current Supabase user instead of switching accounts.
3. If the Google account differs from the previously used one for this Supabase user, the app blocks sync and asks to reconnect.

## Tests
- Basic unit tests for identity helpers:
  - [googleUserInfo.test.ts](file:///e:/GRETEL/tests/googleUserInfo.test.ts)

