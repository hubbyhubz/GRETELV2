# Database Cleanup Plan and Backup

**Date:** 2026-01-21
**Purpose:** Remove unused legacy tables from the Supabase database to resolve breakages and clean up the schema.

## 1. Analysis of Existing Tables

The following tables were identified in the database (via user report) and cross-referenced with the codebase:

| Table Name | Status | Usage in Codebase | Action |
| :--- | :--- | :--- | :--- |
| `profiles` | **Active** | Used in `App.tsx`, `supabaseClient.ts`, `types.ts`. Stores user identity, preferences, and onboarding data. | **KEEP** |
| `dashboard_states` | **Active** | Used in `DashboardContext.tsx` (implied). Stores the persistent state of the dashboard (tasks, chat, etc.). | **KEEP** |
| `feedback` | **Active** | Used in `FeedbackModal.tsx`. Stores user feedback submissions. | **KEEP** |
| `breakage_items` | **Unused** | No references found in `src/`. Likely part of a legacy inventory system. | **DELETE** |
| `breakage_reports` | **Unused** | No references found in `src/`. Likely part of a legacy inventory system. | **DELETE** |
| `categories` | **Unused** | No references found in `src/`. Likely part of a legacy inventory system. | **DELETE** |
| `inventory_counts` | **Unused** | No references found in `src/`. Likely part of a legacy inventory system. | **DELETE** |
| `inventory_sessions` | **Unused** | No references found in `src/`. Likely part of a legacy inventory system. | **DELETE** |
| `items` | **Unused** | No references found in `src/`. Likely part of a legacy inventory system. | **DELETE** |
| `outlets` | **Unused** | No references found in `src/`. Likely part of a legacy inventory system. | **DELETE** |

## 2. Backup Strategy

Since direct database dumps are not possible from this environment, this document serves as the structural backup. The tables to be deleted are legacy tables with no current application logic attached.

**Recommendation:** Before running the deletion script, please use the Supabase Dashboard -> Database -> Backups to ensure a point-in-time recovery is available.

## 3. Deletion Plan

The SQL script `supabase_cleanup.sql` has been generated to drop the unused tables.

**Tables to be dropped:**
- `breakage_items`
- `breakage_reports`
- `inventory_counts`
- `inventory_sessions`
- `items`
- `categories`
- `outlets`

## 4. Verification

After execution, the application should be checked to ensure:
- Login/Auth continues to work (`profiles` table).
- Dashboard loads and saves state (`dashboard_states` table).
- Feedback submission works (`feedback` table).
