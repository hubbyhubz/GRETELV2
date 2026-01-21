-- Supabase Cleanup Script
-- Generated: 2026-01-21
-- Purpose: Remove unused legacy tables identified in the database cleanup analysis.
--
-- INSTRUCTIONS:
-- 1. Go to your Supabase Project Dashboard.
-- 2. Navigate to the SQL Editor.
-- 3. Copy and paste the contents of this file.
-- 4. Run the script.

-- Drop tables in order of likely dependencies (e.g., child tables first)

-- 1. Drop Breakage/Inventory related tables
DROP TABLE IF EXISTS "public"."breakage_items";
DROP TABLE IF EXISTS "public"."breakage_reports";
DROP TABLE IF EXISTS "public"."inventory_counts";
DROP TABLE IF EXISTS "public"."inventory_sessions";

-- 2. Drop Item/Product catalog tables
DROP TABLE IF EXISTS "public"."items";
DROP TABLE IF EXISTS "public"."categories";

-- 3. Drop Organization/Location tables
DROP TABLE IF EXISTS "public"."outlets";

-- Verification Query (Optional - run this after the drops to see remaining tables)
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
