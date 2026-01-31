# Cross-Device Reminder Sync (Mobile → Desktop)

## Symptom
- Reminders (and reminder-adjacent items created from Delegated Tasks, Log Information, Briefing Pointer, and Coaching Notes workflows) appear in mobile view but are missing on desktop.

## Root Cause

### 1) Dashboard persistence was best-effort and could silently drop writes
The app persists the entire dashboard state as a JSON blob in `dashboard_states.state`.

When Supabase writes failed with transient network errors (common on mobile), `saveDashboardState()` logged a warning and returned without retry.
That meant reminders created on mobile were never persisted server-side, so desktop couldn’t see them.

File:
- [googleDriveService.ts](file:///e:/GRETEL/components/googleDriveService.ts)

### 2) Writes were debounced
State saves are debounced (~1500ms). On mobile, quick backgrounding/navigation could interrupt the timer, increasing the chance that newly created reminders never reached Supabase.

File:
- [DashboardContext.tsx](file:///e:/GRETEL/components/DashboardContext.tsx)

### 3) Desktop did not proactively receive remote updates
Even when mobile successfully saved to Supabase, desktop didn’t have a “live” refresh protocol for these state blobs.

### 4) Whole-blob overwrites could drop cross-device changes
Because the entire dashboard state is stored as a single JSON blob, a device saving an older local snapshot could overwrite the newer snapshot written by another device.
This is especially likely if the laptop is active (typing, chatting) while the phone creates reminders.

## Fix

### A) Add an outbox for failed dashboard state saves
If a Supabase write fails due to `Failed to fetch`, the state is queued in `localStorage` and retried later.

Key:
- `gretel:dashboardStateOutbox:<userId>`

Added:
- `flushQueuedDashboardState(userId)`

File:
- [googleDriveService.ts](file:///e:/GRETEL/components/googleDriveService.ts)

### B) Flush queued writes on online/focus/visibility
When connectivity returns or the user resumes the app, queued writes are retried.

File:
- [DashboardContext.tsx](file:///e:/GRETEL/components/DashboardContext.tsx)

### C) Faster persistence for reminders & related modules
When reminders / briefing inputs / delegated tasks / coaching log entries change, the autosave delay is shortened to ~100ms to reduce loss risk on mobile.

File:
- [DashboardContext.tsx](file:///e:/GRETEL/components/DashboardContext.tsx)

### D) Cross-device live updates (desktop receives mobile changes)
Desktop now listens for Supabase Realtime in two layers:
- A lightweight **broadcast** signal (`dashboard_state_updated`) to trigger immediate refetch/merge.
- A best-effort `postgres_changes` subscription on `dashboard_states` when replication is enabled.
- A 5s polling fallback while the app is visible.

Merge logic:
- [dashboardStateMerge.ts](file:///e:/GRETEL/lib/dashboardStateMerge.ts)

### E) Merge critical slices on save (prevents overwriting remote reminders)
When saving `dashboard_states`, the client now merges the critical cross-device arrays with the current remote state before updating:
- `reminders`
- `briefingInputs`
- `delegatedTasks`
- `staffPerformanceLog`
- `dismissedDelegatedReminderTaskIds`

File:
- [googleDriveService.ts](file:///e:/GRETEL/components/googleDriveService.ts)

## Automated Tests
- Merge behavior is covered via unit tests:
  - [dashboardStateMerge.test.ts](file:///e:/GRETEL/tests/dashboardStateMerge.test.ts)

## Monitoring / Regression Prevention
- Outbox key presence indicates pending unsynced dashboard state:
  - `localStorage.getItem('gretel:dashboardStateOutbox:<userId>')`
- If users report missing cross-device data, check browser devtools for:
  - `Network error saving to Supabase (offline?)`
  - Presence of outbox key above

## Notes
- “Briefing Pointer”, “Log Information”, and “Coaching Note” are stored in `briefingInputs` / `staffPerformanceLog` (not `reminders`). They are now synced cross-device the same way.
