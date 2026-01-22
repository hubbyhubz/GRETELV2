# Assistant Actions: Supported Chat Commands

This app’s assistant can update dashboard data using structured JSON fields returned by the model. The UI applies these changes in [DashboardContext.tsx](file:///e:/BEATRIX/components/DashboardContext.tsx) based on the response contract defined in [geminiService.ts](file:///e:/BEATRIX/components/geminiService.ts).

## Lists The Assistant Can Modify

### Today’s Schedule
- Full replace: `schedule`
- Incremental ops: `scheduleOps`

### Top Priorities
- Full replace: `priorities`
- Incremental ops: `priorityOps`

### Reminders
- Full replace: `reminders`
- Incremental ops: `reminderOps`

### Ongoing Projects
- Create: `project` (non-draft) or `projectOps` add
- Incremental ops: `projectOps`
- Draft flow: `projectDraft` + `isProjectDraft`

### Delegated Tasks
- Create: `delegationUpdate` (requires deadline) or `delegatedTaskOps` add
- Incremental ops: `delegatedTaskOps`

## Delegation: Missing Deadline (Slot-Filling)

If a user asks to delegate a task but does not specify a deadline:
- The assistant should ask a follow-up question (clarification) instead of guessing.
- The UI stores a pending delegation and waits for the user to reply with a deadline.

Accepted deadline inputs include:
- `tomorrow`
- `today` / `eod today`
- `YYYY-MM-DD`
- `YYYY-MM-DD HH:MM`
- `next friday` (weekday names supported)

## Scheduling: Event Ops-Aware Clarification

When the assistant is drafting a time-blocked schedule and there are Event Ops items today, the app will avoid producing a confusing block schedule when timing or coverage is unclear.

Behavior:
- If Event Ops timing is missing (no serving time) or the proposed schedule overlaps a serving-time block, the UI asks: “What’s your plan for today so I can block your schedule properly?”
- The UI shows a banner “Need your plan before I block your schedule” until you reply or cancel.

What you can reply with:
- “I’m on the event 10–2, then admin work.”
- “Block 2 hours prep before serving time, and keep the rest flexible.”
- “Don’t block time for it; I’ll handle it ad hoc.”

## Operation Fields (Add / Update / Delete)

All `*Ops` arrays use this shape:
- `op`: `add` | `update` | `delete`
- `match`: how to find the existing item (for update/delete)
- `item`: the new data (for add/update)

### scheduleOps
```json
{
  "scheduleOps": [
    { "op": "add", "item": { "time": "09:00 AM - 10:00 AM", "title": "Team huddle" } },
    { "op": "delete", "match": { "titleContains": "huddle" } }
  ]
}
```

### priorityOps
```json
{
  "priorityOps": [
    { "op": "add", "item": { "text": "Confirm staffing" } },
    { "op": "update", "match": { "textContains": "staffing" }, "item": { "text": "Confirm staffing and station assignments" } }
  ]
}
```

### reminderOps
```json
{
  "reminderOps": [
    { "op": "add", "item": { "text": "Call supplier", "includeInBriefing": "morning" } }
  ]
}
```

### delegatedTaskOps
```json
{
  "delegatedTaskOps": [
    { "op": "add", "item": { "assigneeName": "Jamila", "text": "Confirm linen delivery", "deadline": "tomorrow" } },
    { "op": "delete", "match": { "textContains": "linen", "assigneeName": "Jamila" } }
  ]
}
```

### projectOps
```json
{
  "projectOps": [
    {
      "op": "add",
      "item": {
        "name": "Inventory Accuracy",
        "deadline": "2026-02-28",
        "milestones": [
          { "text": "Audit current stock counts", "assigneeName": "Jamila" }
        ]
      }
    }
  ]
}
```

## Ambiguity Rules
- If an update/delete match finds 0 or more than 1 item, the UI does not guess. It prompts for clarification instead.
