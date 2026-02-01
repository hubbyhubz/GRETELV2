# Duty Roster

## Overview
Duty Roster is a department-scoped weekly schedule panel (Sunday-start week) embedded in the dashboard side column. It supports view-only access for department members and controlled editing for authorized users, plus an audit trail for backtracking.

## Data Model (Supabase / Postgres)
### Tables
- `public.duty_roster_entries`
  - One row per day + slot key within a department.
  - Enforces Sunday-start week consistency via `week_start_sunday = week_start_sunday(duty_date)`.
- `public.duty_roster_user_permissions`
  - Per-user edit enablement (`can_edit`) managed by Super Users (and self-readable for realtime updates).
- `public.duty_roster_audit`
  - Append-only audit trail for every insert/update/delete via RPC.

### Sunday-start week
- `public.week_start_sunday(date)` computes the Sunday for any date (`EXTRACT(DOW)` uses 0 = Sunday).

## Security \u0026 Access Control
### Department isolation
- RLS on `duty_roster_entries` and `duty_roster_audit` restricts reads to users who are members of the row’s `department_id` and within `my_company_id()`.
- RPCs derive department from `department_memberships` and do not accept a client-provided department_id.

### Editing rules (server-side)
A user can modify duty roster entries only when:
- The user has an eligible role: `director | manager | assistant_manager | supervisor` (or is a Super User), AND
- `duty_roster_user_permissions.can_edit = true` for the user, AND
- The edits remain within the user’s own department and within the requested week window.

## API (Supabase RPC)
### Read
- `get_my_duty_roster_week(p_week_start_sunday date) -> jsonb`
  - Returns `{ week_start_sunday, department_id, can_edit, entries: [...] }`.

### Write
- `upsert_my_duty_roster_entries(p_week_start_sunday date, p_entries jsonb) -> jsonb`
  - Bulk upsert for a week; enforces week membership for all rows.
  - Writes audit rows per inserted/updated entry.
- `delete_my_duty_roster_entry(p_entry_id uuid) -> void`
  - Deletes a single entry by id and writes a delete audit row.

### Permission management (Super User Console)
- `get_duty_roster_permission(p_user_id uuid) -> jsonb`
- `set_duty_roster_permission(p_target_user_id uuid, p_can_edit boolean) -> void`

## Frontend UI
### Duty Roster panel
- Renders in the dashboard side column as a card titled “Duty Roster”.
- Week navigation: previous/next week, jump to current week.
- Sunday-start accuracy: week label uses Sunday \u2192 Saturday inclusive.
- Edit mode:
  - Inline slot editing (slot key + assignment/notes) with Save and Remove actions.
  - View-only users see the roster but cannot edit.

### Real-time permission updates
- The panel subscribes to `duty_roster_user_permissions` updates for the current user and refreshes edit state automatically.

## Backtracking
Users can backtrack roster information by:
- Navigating to any prior week (Sunday-start) in the panel, and
- Reviewing changes via the audit trail in `public.duty_roster_audit` (department-scoped reads).

## Performance Notes
- Primary read path is indexed by `(department_id, week_start_sunday)`.\n+- Bulk upsert RPC reduces round trips and keeps write latency stable as weekly rows grow.\n+
## Testing
### Unit tests (Vitest)
- `tests/dutyRosterDateUtils.test.ts` validates Sunday-start logic and year-boundary behavior.
- `tests/dutyRoster.performance.test.ts` provides a lightweight performance guard for date utilities.

