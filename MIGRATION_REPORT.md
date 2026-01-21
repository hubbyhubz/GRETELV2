# Data Migration & Storage Analysis Report

**Date:** 2026-01-21
**Status:** Implementation Complete

## 1. Inventory of Locally Stored Data

We identified the following data elements previously stored only in `localStorage`:

| Key | Description | Target Supabase Location | Strategy |
| :--- | :--- | :--- | :--- |
| `gretel_last_seen_version` | Tracks patch notes version seen by user | `profiles.last_seen_version` | **Lazy Migration:** On app load, if DB is empty but local exists, sync to DB. |
| `gretel_tour_state` | Detailed progress of the onboarding tour (step, completion) | `profiles.tour_state` (New JSONB column) | **Lazy Migration:** On component mount, if DB is empty but local exists, sync to DB. |
| `gretel_seen_features` | List of feature announcements seen | `profiles.seen_features` (New JSONB column) | **Sync:** Update logic modified to write to both DB and Local. |
| `hasCompletedTour` | Legacy flag for tour completion | `profiles.tour_completed` | **Redundant:** Mapped to `tour_completed` column. |

## 2. Database Schema Changes

A new migration file `migrations/add_tour_columns.sql` has been created to support the new data:

```sql
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS tour_state JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS seen_features JSONB DEFAULT '[]'::jsonb;
```

**Action Required:** Run this SQL in your Supabase SQL Editor.

## 3. Implementation Details

### A. App Versioning (`App.tsx`)
- **Logic Updated:** On user profile load, the app checks `localStorage`.
- **Migration:** If `localStorage` has a version string but Supabase is `null`, it performs a background update to Supabase.
- **Result:** User preferences for patch notes are now cloud-synced.

### B. Onboarding Tour (`OnboardingTour.tsx`)
- **Logic Updated:** Tour state management refactored to prioritize `userProfile.tour_state`.
- **Migration:** When the tour component initializes, it checks for legacy local data. If found (and DB is empty), it automatically uploads the state to Supabase.
- **Sync:** All tour progress events (Next/Prev/Complete) now write to Supabase.

## 4. Testing & Verification

To verify the migration:
1.  **Run the SQL Migration** in Supabase.
2.  **Open the App** on a device with existing local data.
3.  **Check Console:** Look for "Migrating last_seen_version..." or network requests to `profiles`.
4.  **Check Supabase:** Verify that the `profiles` table now contains data in `tour_state` and `seen_features` columns for your user.
5.  **Cross-Device Test:** Open the app on a *new* browser/device. You should see the same tour progress and patch note status as the original device.
