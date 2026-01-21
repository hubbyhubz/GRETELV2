# Migration Instructions: Per-Account Patch Notes & Tour Completion

## Overview
This update changes the patch notes (changelog) and onboarding tour to be tracked per account in Supabase instead of per browser (localStorage). This means:
- **Patch Notes**: Will only show once per version per account. Users won't see the same changelog every time they log in.
- **Onboarding Tour**: Will only run once per account. Once a user completes it, they won't see it again on subsequent logins.

## Database Changes Required

### Step 1: Run the SQL Migration

You need to run the SQL migration script in your Supabase SQL Editor to add two new columns to the `profiles` table:

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Run the SQL from `migrations/add_user_preferences_columns.sql`:

```sql
-- Add last_seen_version column (nullable text, stores version string like "1.4.8")
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_seen_version TEXT;

-- Add tour_completed column (boolean, defaults to false)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tour_completed BOOLEAN DEFAULT false;

-- Add comment to columns for documentation
COMMENT ON COLUMN profiles.last_seen_version IS 'Last version of patch notes/changelog the user has seen (per-account tracking)';
COMMENT ON COLUMN profiles.tour_completed IS 'Whether the user has completed the onboarding tour (per-account tracking)';
```

## Code Changes Made

### 1. Types (`components/types.ts`)
- Added `last_seen_version?: string | null` to `UserProfile` interface
- Added `tour_completed?: boolean` to `UserProfile` interface

### 2. App.tsx
- Updated profile loading to read `last_seen_version` and `tour_completed` from Supabase
- Changed patch notes check from `localStorage.getItem('gretelLastSeenVersion')` to `profile.last_seen_version`
- Updated `handlePatchNotesViewed()` to save `last_seen_version` to Supabase instead of localStorage
- Profile object now includes the new fields when loading from database

### 3. OnboardingTour.tsx
- Updated to check `userProfile.tour_completed` from Supabase instead of localStorage
- Updated `saveTourState()` to optionally save `tour_completed` to Supabase when tour is completed
- Removed dependency on `localStorage.getItem("gretel_tour_seen")` for auto-start
- Tour now only auto-starts if `tour_completed` is false in the user profile
- Completion is saved to Supabase when user clicks "Done 🎉" on the last step

## Behavior Changes

### Patch Notes (Changelog)
- **Before**: Shown every login if version changed (stored in localStorage)
- **After**: Shown once per version per account (stored in Supabase)
- Only shows again if the app version changes after they've seen it

### Onboarding Tour
- **Before**: Could show every login depending on localStorage state (browser-specific)
- **After**: Only shows once per account (stored in Supabase)
- Auto-starts only on first login (when `tour_completed` is false)
- Manual tour button still works for users who want to review it
- Progress (current step) is still stored in localStorage for "Continue Later" functionality

## Testing Checklist

After running the migration, test:
1. ✅ Login as a new user - should see tour auto-start (if not completed)
2. ✅ Complete the tour - should save to Supabase and not show again on next login
3. ✅ Login as existing user who hasn't seen current version - should see patch notes
4. ✅ Close patch notes - should save version to Supabase
5. ✅ Login again with same version - should NOT see patch notes
6. ✅ Update app version - existing users should see patch notes once
7. ✅ Manual tour button - should still work for reviewing tour

## Rollback Plan

If you need to rollback:
1. Remove the columns from Supabase:
```sql
ALTER TABLE profiles DROP COLUMN IF EXISTS last_seen_version;
ALTER TABLE profiles DROP COLUMN IF EXISTS tour_completed;
```
2. Revert the code changes (or use git to revert commits)

## Notes
- Existing users will see patch notes on their next login if the version has changed
- Existing users who haven't completed the tour will see it auto-start on their next login
- LocalStorage is still used for tour progress (current step) for "Continue Later" functionality
- All completion/version tracking is now per-account, so users can log in from different browsers and won't see duplicate modals/tours
