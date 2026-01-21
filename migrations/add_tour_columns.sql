-- Add tour_state and seen_features to profiles table
-- Date: 2026-01-21

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS tour_state JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS seen_features JSONB DEFAULT '[]'::jsonb;

-- Comment on columns
COMMENT ON COLUMN profiles.tour_state IS 'Stores the detailed state of the onboarding tour (step, version, etc.)';
COMMENT ON COLUMN profiles.seen_features IS 'List of feature versions the user has already seen announcements for';
