# Dashboard Visibility API (Supabase RPC)

This project implements dashboard visibility controls via Supabase database tables and RPC functions (Postgres functions).

## Component Keys

These keys are returned by `get_dashboard_visibility()`:

- `delegated_tasks`
- `briefing_notes`
- `morning_briefing_nav`
- `afternoon_briefing_nav`
- `briefing_pointers`
- `coaching_note`
- `log_information`

## RPC: `get_dashboard_visibility`

Returns the effective visibility map for a user.

### Signature

```sql
public.get_dashboard_visibility(p_user_id uuid DEFAULT auth.uid()) returns jsonb
```

### Response (JSON)

```json
{
  "visibility": {
    "delegated_tasks": true,
    "briefing_notes": true,
    "morning_briefing_nav": true,
    "afternoon_briefing_nav": true,
    "briefing_pointers": true,
    "coaching_note": true,
    "log_information": true
  },
  "can_manage": false
}
```

### Notes

- Scope: visibility is stored per user (not by department role).
- Defaults: if no per-user setting exists, all keys default to `false`.
- Impersonation: requesting `p_user_id != auth.uid()` requires Super User.

### Errors

- `company_id_missing`: the target user has no `profiles.company_id`.
- `not_authorized`: caller is not allowed to read another user’s visibility context.

## RPC: `set_dashboard_visibility`

## RPC: `set_user_dashboard_visibility`

Grants or revokes dashboard visibility for a specific user.

### Signature

```sql
public.set_user_dashboard_visibility(
  p_target_user_id uuid,
  p_is_visible boolean
) returns void
```

### Notes

- Permission: only Super Users.
- Company scope: the target user must belong to the caller’s company.
- Audit logging: each change writes a row to `dashboard_visibility_audit` (`action_type = dashboard_user_visibility_upsert`).

### Errors

- `not_authorized`: caller is not allowed to manage dashboard visibility.
- `company_id_missing`: the target user has no `profiles.company_id`.

## RPC: `set_user_dashboard_visibility_map`

Bulk upserts per-component visibility for a specific user.

### Signature

```sql
public.set_user_dashboard_visibility_map(
  p_target_user_id uuid,
  p_visibility jsonb
) returns void
```

### Notes

- Permission: only Super Users.
- Company scope: the target user must belong to the caller’s company.
- Any missing keys default to `false`.

## Tables

### `dashboard_user_visibility`

Stores per-user visibility.

- Primary key: `user_id`
- Fields: `company_id`, `is_visible`, `updated_at`, `updated_by`

### `dashboard_user_component_visibility`

Stores per-user, per-component visibility.

- Primary key: `(user_id, component_key)`
- Fields: `company_id`, `component_key`, `is_visible`, `updated_at`, `updated_by`

### `dashboard_visibility_audit`

Immutable audit log for visibility configuration changes.

- Core fields: `action_type`, `actor_user_id`, `company_id`, `subject`, `before_state`, `after_state`, `created_at`
