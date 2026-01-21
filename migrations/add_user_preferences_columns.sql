-- Migration: Add last_seen_version and tour_completed columns to profiles table
-- Date: 2026-01-19
-- Description: 
--   - last_seen_version: Stores the last version of changelog/patch notes the user has seen (per account)
--   - tour_completed: Stores whether the user has completed the onboarding tour (per account)

-- Add last_seen_version column (nullable text, stores version string like "1.4.8")
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_seen_version TEXT;

-- Add tour_completed column (boolean, defaults to false)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tour_completed BOOLEAN DEFAULT false;

-- Add comment to columns for documentation
COMMENT ON COLUMN profiles.last_seen_version IS 'Last version of patch notes/changelog the user has seen (per-account tracking)';
COMMENT ON COLUMN profiles.tour_completed IS 'Whether the user has completed the onboarding tour (per-account tracking)';

-- Set default value for existing users (they haven't seen the current version or completed tour)
-- This is optional - existing users will see patch notes on next login if version changed
-- and can manually start the tour if they want
