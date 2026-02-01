# Per-User Dashboard Visibility

This app supports per-user dashboard visibility and administrative configuration.

## Super User Configuration

Super Users can configure visibility per user.

### Where to Configure

- Super User Console → Employee Records → select a user → Dashboard Visibility

### What Can Be Configured

- Visibility toggles for each dashboard component key per user

## How Visibility Is Resolved

Visibility values default to hidden (`false`) unless explicitly enabled for the user. When enabled, the protected dashboard modules are visible for that user regardless of department role.

## Troubleshooting

- If you see an error loading dashboard visibility settings, confirm the Supabase migrations have been applied.
- If the admin panel shows “no access”, confirm you are logged in as a Super User.
