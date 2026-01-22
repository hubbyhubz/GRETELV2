# Event Ops: Event Handling Reference

This document describes the UI event types used by the Event Ops calendar and their expected behaviors.

## UI Event Types

### Calendar Grid
- **calendar:selectDate**
  - Trigger: click/keyboard-activate any day cell.
  - Behavior: updates the selected date and refreshes the right-side Details panel.
  - Implementation note: uses event delegation from the calendar grid container to avoid per-cell handlers.

### Modal Open/Close
- **modal:openCreate**
  - Trigger: click “Add Event” or “Add Meeting”.
  - Behavior: opens the modal in create mode for the currently selected date.
  - Guard: blocked when the Supabase table is missing; shows an actionable setup message.

- **modal:openEdit**
  - Trigger: click “Edit” on an item in the Details list.
  - Behavior: opens the modal in edit mode with the existing values prefilled.

- **modal:close**
  - Trigger: click outside modal (overlay) or after successful save.
  - Behavior: closes modal, clears transient modal state.

- **modal:escape**
  - Trigger: press Escape while modal is open.
  - Behavior: closes modal.
  - Propagation: Escape is captured and stops propagation to prevent conflicts with other global handlers.
  - Lifecycle: the keydown listener is only bound while the modal is open and is unbound on close/unmount.

### Persistence (Supabase CRUD)
- **fetch:start / fetch:success / fetch:error**
  - Trigger: when month range changes or user hits Refresh.
  - Behavior: reads `event_ops_items` for the visible 42-day calendar grid window.
  - Performance: month-range fetch is debounced to avoid repeated queries when navigating quickly.

- **save:start / save:success / save:error**
  - Trigger: click Save in the modal.
  - Behavior: inserts or updates `event_ops_items` and updates local UI state.
  - Error handling: when the table does not exist (schema cache/missing relation), a guided message instructs running `supabase_schema_update.sql` (Event Ops Calendar section).

- **delete:start / delete:success / delete:error**
  - Trigger: click Delete on an item in the Details list.
  - Behavior: deletes the row from Supabase and removes it from local UI state.

## Logging

Debug logging is available for Event Ops interactions.
- Enable: set `localStorage["gretel:debug:eventops"] = "1"`.
- Output: `console.debug` with `[EventOps]` prefix for interaction traces; Supabase errors are still surfaced to users via the existing notification modal.

