# Draft Schedule Approval Flow

This document explains what happens when a user clicks "Looks Good, Finalize" (or approves the draft) on the assistant's proposed blocked schedule.

---

## Overview

The draft approval process has **two steps**:

1. **Step 1: Approve Draft** → Moves draft schedule to "Today's Schedule" as **pending**
2. **Step 2: Finalize Schedule** → Syncs pending schedule to Google Calendar

---

## Step 1: Approving the Draft

### Trigger Methods

The user can approve the draft in **two ways**:

#### Method 1: Click "Looks Good, Finalize" Button
- **Location:** Chat message with `isPlanDraft: true`
- **Button:** "Looks Good, Finalize"
- **Action:** Calls `handleConfirmPlan()`

#### Method 2: Type Approval Message
- **Examples:** "looks good", "finalize", "go ahead", "approved", "yes confirm"
- **Detection:** Uses `inferFinalizePlan()` function
- **Patterns:**
  - Contains: `finalize`, `confirm`, `lock`, `apply`, `save`
  - Contains: `go ahead`, `proceed`, `yes`, `ok`, `sounds good`, `looks good`
  - Short messages (≤20 chars) with proceed words

**Location:** `components/freeStyleNlu.ts` → `inferFinalizePlan()`

---

### What Happens When Draft is Approved

**Function:** `handleConfirmPlan()` in `components/DashboardContext.tsx`

#### 1. Extract Draft Data
```typescript
const scheduleToFinalize = draftedSchedule && draftedSchedule.length > 0 ? draftedSchedule : null;
const prioritiesToFinalize = draftedPriorities && draftedPriorities.length > 0 ? draftedPriorities : null;
```

#### 2. Apply to Dashboard
- **Schedule:** `setScheduleItems(scheduleToFinalize)` → Moves draft to Today's Schedule
- **Priorities:** `setTop3Items(prioritiesToFinalize)` → Moves draft to Top Priorities

#### 3. Clear Draft State
- `setDraftedSchedule(null)` → Removes draft from memory
- `setDraftedPriorities(null)` → Removes draft from memory
- `setIsScheduleConfirmed(false)` → Marks schedule as **pending** (not yet synced)

#### 4. Save to Cloud
- Immediately saves dashboard state to Supabase
- Includes finalized schedule and priorities
- Sets `isScheduleConfirmed: false` (pending state)

#### 5. Show Notification
```typescript
setNotificationModal({
  isOpen: true,
  title: 'Schedule Ready',
  message: 'Your draft schedule is now in Today's Schedule as pending. Review it, then click Finalize to sync to Google Calendar.',
});
```

#### 6. Add Chat Message
- Adds confirmation message to chat:
  - "Got it — I moved your draft into Today's Schedule as pending. Review it, then click Finalize to sync it to Google Calendar."

---

## Step 2: Finalizing the Schedule

### Trigger

**Button:** "Finalize" button in Today's Schedule card header

**Location:** `components/MainDashboardPage.tsx` line 1495

**Condition:** Only visible when `pendingSchedule === true`

**State:** `pendingSchedule` is `true` when:
- Schedule exists (`scheduleItems.length > 0`)
- Schedule is NOT confirmed (`isScheduleConfirmed === false`)

---

### What Happens When Finalize is Clicked

**Function:** `finalizeSchedule()` in `components/DashboardContext.tsx`

#### 1. Sync to Google Calendar
```typescript
const ok = await syncScheduleToGoogleCalendar();
```

**Function:** `syncScheduleToGoogleCalendar()` in `components/DashboardContext.tsx`

**Process:**
1. **Check Google Connection:**
   - Verifies `session?.provider_token` exists
   - If missing → Shows "Google Not Connected" notification

2. **Filter Schedule:**
   - Only syncs items that are NOT Google events (`!item.isGoogleEvent`)
   - Skips items already in Google Calendar

3. **Set Syncing State:**
   - `setIsSyncing(true)` → Shows "Syncing..." on button
   - Button becomes disabled

4. **Batch Add Events:**
   - Calls `batchAddEventsToCalendar(token, scheduleToSync)`
   - Creates Google Calendar events for each schedule item

5. **Handle Success:**
   - Shows "Sync Successful" notification
   - `setIsScheduleConfirmed(true)` → Marks schedule as confirmed
   - `setIsSyncing(false)` → Re-enables button

6. **Handle Errors:**
   - **401/403:** Google connection expired → Triggers reconnection
   - **Other errors:** Shows error message

#### 2. Mark as Confirmed
```typescript
setIsScheduleConfirmed(true);
```

- Schedule is now **confirmed** (synced to Google)
- `pendingSchedule` becomes `false`
- "Finalize" button disappears

#### 3. Force Save
```typescript
forceSaveRef.current = true;
```

- Triggers immediate save to cloud
- Persists `isScheduleConfirmed: true` state

---

## Visual Flow

### Before Approval
```
Chat Message:
┌─────────────────────────────────────┐
│ AI: "Here's your draft schedule..." │
│ [Looks Good, Finalize] [Make Changes]│
└─────────────────────────────────────┘

Today's Schedule:
┌─────────────────────────────────────┐
│ (Empty or old schedule)             │
└─────────────────────────────────────┘
```

### After Approval (Step 1)
```
Chat Message:
┌─────────────────────────────────────┐
│ AI: "Got it — I moved your draft..." │
└─────────────────────────────────────┘

Today's Schedule:
┌─────────────────────────────────────┐
│ [Finalize]                          │
│ ⚠️ Pending Schedule                 │
│ Review your schedule below, then   │
│ click Finalize to sync to Google... │
│                                     │
│ 09:00 AM - 12:00 PM: Deep Focus    │
│ 12:00 PM - 01:00 PM: Lunch         │
│ 01:00 PM - 05:00 PM: Meetings      │
└─────────────────────────────────────┘
```

### After Finalize (Step 2)
```
Today's Schedule:
┌─────────────────────────────────────┐
│ (No Finalize button)                │
│                                     │
│ ✅ 09:00 AM - 12:00 PM: Deep Focus │
│ ✅ 12:00 PM - 01:00 PM: Lunch      │
│ ✅ 01:00 PM - 05:00 PM: Meetings   │
│                                     │
│ (All items synced to Google)       │
└─────────────────────────────────────┘
```

---

## State Variables

### Draft State
- `draftedSchedule: ScheduleItem[] | null` → Draft schedule from AI
- `draftedPriorities: Top3Item[] | null` → Draft priorities from AI

### Pending State
- `pendingSchedule: boolean` → True when schedule exists but not confirmed
- `isScheduleConfirmed: boolean` → True when schedule synced to Google

### Syncing State
- `isSyncing: boolean` → True during Google Calendar sync

---

## Key Functions

### `handleConfirmPlan()`
**Location:** `components/DashboardContext.tsx` line 2704

**Purpose:** Moves draft to Today's Schedule as pending

**Steps:**
1. Extract draft schedule/priorities
2. Apply to dashboard state
3. Clear draft state
4. Save to cloud
5. Show notification

### `finalizeSchedule()`
**Location:** `components/DashboardContext.tsx` line 3999

**Purpose:** Syncs pending schedule to Google Calendar

**Steps:**
1. Call `syncScheduleToGoogleCalendar()`
2. Mark as confirmed
3. Force save

### `syncScheduleToGoogleCalendar()`
**Location:** `components/DashboardContext.tsx` line 2997

**Purpose:** Syncs schedule items to Google Calendar

**Steps:**
1. Check Google connection
2. Filter non-Google items
3. Set syncing state
4. Batch add events
5. Handle success/error

### `inferFinalizePlan()`
**Location:** `components/freeStyleNlu.ts` line 58

**Purpose:** Detects if user message is approval

**Patterns:**
- `finalize`, `confirm`, `lock`, `apply`, `save`
- `go ahead`, `proceed`, `yes`, `ok`, `sounds good`, `looks good`
- Short messages (≤20 chars) with proceed words

---

## Error Handling

### Google Not Connected
- **Message:** "Google Not Connected"
- **Action:** User must connect Google account

### Nothing To Sync
- **Message:** "Nothing To Sync"
- **Condition:** All items are already Google events

### Sync Failed
- **401/403:** Google connection expired → Triggers reconnection
- **Other:** Shows error message with details

### Network Errors
- Retries handled by Google Calendar API
- User sees error notification

---

## User Experience

### Approval (Step 1)
1. User sees draft schedule in chat
2. User clicks "Looks Good, Finalize" OR types approval
3. Draft moves to Today's Schedule
4. Notification: "Schedule Ready"
5. Chat message: "Got it — I moved your draft..."

### Finalization (Step 2)
1. User reviews schedule in Today's Schedule card
2. User clicks "Finalize" button
3. Button shows "Syncing..." (disabled)
4. Events sync to Google Calendar
5. Notification: "Sync Successful"
6. Button disappears (schedule confirmed)

---

## Important Notes

1. **Two-Step Process:**
   - Approval → Moves to pending
   - Finalize → Syncs to Google

2. **Draft State:**
   - Drafts are stored in `draftedSchedule` / `draftedPriorities`
   - Cleared after approval

3. **Pending State:**
   - `isScheduleConfirmed: false` → Pending
   - `isScheduleConfirmed: true` → Confirmed

4. **Google Sync:**
   - Only syncs non-Google items
   - Skips items already in Google Calendar

5. **State Persistence:**
   - All state saved to Supabase
   - Survives page refresh

---

## Code Locations

- **Draft Approval:** `components/DashboardContext.tsx` → `handleConfirmPlan()` (line 2704)
- **Finalize Schedule:** `components/DashboardContext.tsx` → `finalizeSchedule()` (line 3999)
- **Google Sync:** `components/DashboardContext.tsx` → `syncScheduleToGoogleCalendar()` (line 2997)
- **Approval Detection:** `components/freeStyleNlu.ts` → `inferFinalizePlan()` (line 58)
- **UI Button:** `components/MainDashboardPage.tsx` → Line 1495

---

This is the complete flow for approving and finalizing draft schedules.
