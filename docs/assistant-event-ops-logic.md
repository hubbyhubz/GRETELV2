# Assistant Event Ops Logic - Complete Guide

This document explains how the AI assistant handles Event Ops items in scheduling, planning, and daily operations.

---

## What is Event Ops?

**Event Ops** are events and meetings stored in the Supabase `event_ops_items` table. They represent:
- **Events**: External events (weddings, conferences, etc.)
- **Meetings**: Internal meetings

Each Event Ops item contains:
- `kind`: 'event' or 'meeting'
- `event_date`: Date of the event
- `name`: Event/meeting name
- `location`: Location (optional)
- `pax`: Number of people (optional)
- `serving_time`: Time when service/event happens (optional, critical for scheduling)
- `remarks`: Additional notes (optional)

---

## Event Ops in System Instruction

**Location:** `components/geminiService.ts` → `buildSystemInstruction()`

### How Event Ops is Presented to AI:

1. **Data Source:**
   - Fetched from Supabase `event_ops_items` table
   - Up to 30 items shown (most recent/upcoming)
   - Includes: kind, date, name, location, pax, serving_time, remarks

2. **Context Provided:**
   ```
   **EVENT OPS CALENDAR (EVENTS + MEETINGS):**
   These items come from the Event Ops calendar in the app (stored in Supabase). 
   Use them for context when the user asks about upcoming plans, event preparation, 
   staffing, logistics, or meeting readiness. If the user has upcoming Event Ops items 
   and it is relevant, proactively mention them and ask if they want prep tasks added 
   to the schedule (but do not change the schedule unless asked).
   ```

3. **AI Instructions:**
   - Use Event Ops for **context** (awareness)
   - **Proactively mention** upcoming items when relevant
   - **Ask** if user wants prep tasks added (don't auto-add)
   - **Don't change schedule** unless explicitly asked

---

## Event Ops Scheduling Logic

### Scenario 1: Daily Kick-off with Event Ops

**When:** User says "Time for my daily kick-off."

**AI Behavior:**
1. Checks if Event Ops items exist for today
2. If yes → Adds **extra question** to the 6 standard questions:
   - "I see you have [Event Ops item] today. What's your plan for today so I can block your schedule accurately?"

**Location:** `components/geminiService.ts` line 427

---

### Scenario 2: Drafting Schedule with Event Ops

**When:** AI is asked to create a time-blocked schedule for today

**AI Instructions:**
```
If you are asked to draft a time-blocked schedule for today and there are 
Event Ops items today, you MUST incorporate them. Treat them as mandatory blocks. 
If timing or coverage is unclear, make a reasonable assumption based on the event 
time (e.g., prep 1 hour before), or ask a follow-up only if absolutely necessary.
```

**What This Means:**
- Event Ops items are **mandatory blocks** (like Google Calendar events)
- AI should incorporate them into the schedule
- If timing unclear → Make reasonable assumption OR ask for clarification

---

## Event Ops Conflict Detection

**Location:** `components/assistantActionUtils.ts` → `detectEventOpsScheduleClarification()`

### How It Works:

1. **Builds Time Blocks:**
   - For each Event Ops item with `serving_time`:
     - **Start:** 90 minutes before serving time (prep time)
     - **End:** 120 minutes after serving time (cleanup time)
   - Example: If serving_time is 2:00 PM:
     - Block: 12:30 PM - 4:00 PM

2. **Checks for Missing Times:**
   - If Event Ops item has NO `serving_time` → **Needs clarification**
   - Reason: `event_ops_missing_time`
   - Question: "I see you have an Event Ops item today ([name]). What's your plan for today so I can block your schedule properly?"

3. **Checks for Conflicts:**
   - Compares proposed schedule against Event Ops time blocks
   - If any schedule slot overlaps with Event Ops block → **Needs clarification**
   - Reason: `event_ops_conflict`
   - Question: "I see there is an Event Ops item today ([name]). What's your plan for today so I can block your schedule properly?"

4. **Exclusions:**
   - If schedule already mentions Event Ops (title contains "event ops" or event name) → No conflict
   - If user says "exclude [event]" → Removed from conflict check

---

## Event Ops Auto-Inclusion in Drafts

**Location:** `components/DashboardContext.tsx` lines 2115-2138

### When AI Creates a Plan Draft:

1. **After AI generates schedule:**
   - System checks for Event Ops items for today
   - Builds time blocks (90 min before, 120 min after serving_time)
   - Checks if Event Ops already mentioned in schedule

2. **Auto-Adds Missing Event Ops:**
   - If Event Ops item NOT already in schedule:
     - Creates schedule item: `"Event Ops — [Event Name]"`
     - Time: `"[start] - [end]"` (based on serving_time)
     - ID: `eventops-[item.id]`

3. **Sorts Schedule:**
   - All schedule items sorted by time (chronological order)

4. **Validates:**
   - Runs conflict detection
   - If conflicts or missing times → Sets `pendingScheduleClarification`
   - Otherwise → Shows draft with Event Ops included

---

## Pending Schedule Clarification Flow

**Location:** `components/DashboardContext.tsx` lines 1780-1828**

### When User Has Pending Clarification:

1. **Banner Shown:**
   - "Need your plan before I block your schedule"
   - Lists Event Ops items that need clarification

2. **User Can:**
   - **Provide plan:** "I'm on the event 10-2, then admin work"
   - **Exclude event:** "Exclude [event name]" or "Don't include [event]"
   - **Cancel:** "Cancel" or "Never mind"

3. **System Processing:**
   - If user excludes → Removes from Event Ops list
   - If user provides plan → Uses it to build schedule
   - Includes Key Facts (Memory) in prompt
   - Sends to AI with Event Ops context

4. **AI Response:**
   - Creates schedule incorporating user's plan
   - Includes Event Ops items (unless excluded)
   - Returns draft with `isPlanDraft: true`

---

## Event Ops in Daily Kick-off Workflow

### Step 1: Questions (First Response)

**If Event Ops items exist for today:**
- AI MUST add 7th question (after the 6 standard questions):
  - "I see you have [Event Ops item] today. What's your plan for today so I can block your schedule accurately?"

**Location:** `components/geminiService.ts` line 427

### Step 2: Drafting Plan (Second Response)

**AI Must:**
- Incorporate Event Ops items into schedule
- Treat them as mandatory blocks
- Account for prep time (90 min before) and cleanup (120 min after)
- If timing unclear → Make reasonable assumption OR ask clarification

**System Auto-Enhancement:**
- After AI generates schedule, system auto-adds any missing Event Ops items
- Validates for conflicts
- If conflicts → Sets pending clarification

---

## Event Ops Time Block Calculation

**Location:** `components/assistantActionUtils.ts` → `buildEventOpsBlocksForToday()`

### Formula:

For Event Ops item with `serving_time` = `HH:MM`:

1. **Convert to minutes:** `serving_time` → minutes since midnight
2. **Calculate start:** `max(0, minutes - 90)` (90 min prep time)
3. **Calculate end:** `min(1440, minutes + 120)` (120 min cleanup, max 24 hours)

**Example:**
- Serving time: `14:00` (2:00 PM) = 840 minutes
- Start: `840 - 90 = 750 minutes` = 12:30 PM
- End: `840 + 120 = 960 minutes` = 4:00 PM
- **Block:** `12:30 PM - 4:00 PM`

---

## Conflict Detection Algorithm

**Location:** `components/assistantActionUtils.ts` → `detectEventOpsScheduleClarification()`

### Steps:

1. **Filter today's items:**
   - Get all Event Ops items where `event_date === today`

2. **Identify missing times:**
   - Items without `serving_time` → Needs clarification

3. **Build time blocks:**
   - For items with `serving_time` → Create time blocks (prep + cleanup)

4. **Check proposed schedule:**
   - For each schedule slot:
     - Skip if title contains "event ops" or matches event name
     - Parse time range to minutes
     - Check overlap with Event Ops blocks
     - If overlap > 0 → Conflict detected

5. **Return result:**
   - `needsClarification: false` → No issues, proceed
   - `needsClarification: true` → Ask user for plan

---

## User Interaction Patterns

### Pattern 1: User Provides Plan

**User:** "I'm on the event 10-2, then admin work"

**System:**
- Removes pending clarification
- Sends to AI with Event Ops context
- AI creates schedule: "10:00 AM - 2:00 PM: Event Ops — [Event Name]", then "2:00 PM - 5:00 PM: Admin work"

### Pattern 2: User Excludes Event

**User:** "Exclude the wedding" or "Don't include the conference"

**System:**
- Uses NLU to match event name
- Removes from Event Ops list
- Rebuilds schedule without that event

### Pattern 3: User Cancels

**User:** "Cancel" or "Never mind"

**System:**
- Clears pending clarification
- Returns to normal chat flow

---

## Event Ops in System Context

### Always Included:

1. **In System Instruction:**
   - Up to 30 Event Ops items (most recent/upcoming)
   - Full details: kind, date, name, location, pax, serving_time, remarks

2. **In Daily Kick-off:**
   - Extra question if Event Ops items exist today

3. **In Schedule Drafts:**
   - Auto-included as time blocks
   - Validated for conflicts

4. **In Pending Clarifications:**
   - Listed in clarification question
   - Can be excluded by user

---

## Key Rules for AI

1. **Awareness:**
   - Always know about Event Ops items
   - Proactively mention when relevant
   - Ask if user wants prep tasks (don't auto-add)

2. **Scheduling:**
   - Treat Event Ops as mandatory blocks
   - Incorporate into schedules
   - Account for prep (90 min) and cleanup (120 min)

3. **Clarification:**
   - If timing unclear → Make reasonable assumption OR ask
   - If conflicts detected → Ask for user's plan
   - Don't guess when information is missing

4. **Respect User:**
   - Don't change schedule unless asked
   - If user excludes event → Respect that
   - If user provides plan → Use it exactly

---

## Technical Implementation

### Functions:

1. **`buildEventOpsBlocksForToday()`**
   - Filters today's items
   - Builds time blocks from serving_time
   - Returns: `{ todayItems, missingTime, blocks }`

2. **`detectEventOpsScheduleClarification()`**
   - Checks for missing times
   - Detects conflicts
   - Returns: `{ needsClarification, reason, question, eventOpsItems }`

3. **`fetchEventOpsItemsForAI()`**
   - Fetches from Supabase
   - Caches for performance
   - Returns: `EventOpsItem[]`

### State Management:

- `eventOpsItems`: Current Event Ops items (cached)
- `pendingScheduleClarification`: Active clarification request
- `draftedSchedule`: Draft schedule (includes Event Ops)

---

## Example Flows

### Example 1: Event Ops with Serving Time

**Event Ops Item:**
- Name: "Wedding Reception"
- Date: Today
- Serving time: 18:00 (6:00 PM)

**AI Behavior:**
- Creates time block: `4:30 PM - 8:00 PM` (90 min prep, 120 min cleanup)
- Includes in schedule: `"4:30 PM - 8:00 PM: Event Ops — Wedding Reception"`
- No clarification needed (has serving_time)

### Example 2: Event Ops without Serving Time

**Event Ops Item:**
- Name: "Conference"
- Date: Today
- Serving time: null

**AI Behavior:**
- Detects missing time
- Sets `pendingScheduleClarification`
- Asks: "I see you have an Event Ops item today (Conference). What's your plan for today so I can block your schedule properly?"
- Waits for user response

### Example 3: Event Ops Conflict

**Event Ops Item:**
- Serving time: 14:00 (2:00 PM)
- Block: 12:30 PM - 4:00 PM

**Proposed Schedule:**
- "1:00 PM - 3:00 PM: Team Meeting" (overlaps!)

**AI Behavior:**
- Detects conflict
- Sets `pendingScheduleClarification`
- Asks: "I see there is an Event Ops item today (Wedding Reception). What's your plan for today so I can block your schedule properly?"
- Waits for user to clarify

---

## Summary

The assistant's Event Ops logic ensures:
1. **Awareness:** AI always knows about Event Ops items
2. **Integration:** Event Ops automatically included in schedules
3. **Validation:** Conflicts and missing times detected
4. **Clarification:** User asked when information is unclear
5. **Respect:** User can exclude or provide custom plans

Event Ops items are treated as **mandatory blocks** (like Google Calendar events) and the system ensures they're properly incorporated into daily schedules while respecting user preferences and constraints.
