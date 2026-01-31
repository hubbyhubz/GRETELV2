# Cross-Device Sync: Today's Schedule

## Symptom
- Changes to Today’s schedule on mobile (add/edit/complete items) do not show on laptop until a hard refresh.

## Root Cause
- The app stores the entire dashboard as a single JSON blob in `dashboard_states.state`.
- Without a live update signal + conflict-safe merging, one device can:
  - save an older snapshot that overwrites the other device’s schedule changes, and/or
  - never notify the other device to refetch.

## Fix

### 1) Real-time propagation (sub-1s target)
- After each successful save, the app broadcasts `dashboard_state_updated` on a per-user realtime channel.
- Other devices listen and immediately refetch + merge.

### 2) Conflict-safe merging
- On save, the client merges `scheduleItems` with the current remote state to avoid deleting cross-device updates.
- On receive, remote changes are merged into local state and then displayed.

### 3) Offline queue + retry
- If saving fails due to network errors, the state is queued in localStorage and flushed on resume/online.

### 4) Fallback polling
- While visible, the app polls every 5s and reconciles any differences.

## Key Files
- Schedule persistence + merge-before-save: [googleDriveService.ts](file:///e:/GRETEL/components/googleDriveService.ts)
- Realtime broadcast + receive + polling: [DashboardContext.tsx](file:///e:/GRETEL/components/DashboardContext.tsx)
- Merge logic: [dashboardStateMerge.ts](file:///e:/GRETEL/lib/dashboardStateMerge.ts)

## Tests
- Merge behavior (includes schedule items): [dashboardStateMerge.test.ts](file:///e:/GRETEL/tests/dashboardStateMerge.test.ts)

