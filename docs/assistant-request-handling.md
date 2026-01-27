# How the Assistant Handles User Requests in Chat

This document explains the complete flow of how the assistant processes and responds to user requests in the chat interface.

---

## Complete Request Flow

```
User Types Message
    ↓
handleSendMessage() [DashboardContext.tsx]
    ↓
STEP 1: Input Validation
    ↓
STEP 2: Special Case Detection
    ↓
STEP 3: Free-Style NLU Processing
    ↓
STEP 4: Build Context & System Instruction
    ↓
STEP 5: Prepare Message History
    ↓
STEP 6: Call AI API
    ↓
STEP 7: Parse & Validate Response
    ↓
STEP 8: Apply Dashboard Changes
    ↓
STEP 9: Display Response
```

---

## STEP 1: Input Validation

**Location:** `components/DashboardContext.tsx` → `handleSendMessage()` (lines 1577-1600)

### Checks Performed:

1. **Message Content:**
   - Extracts text from `chatInput` or `prompt` parameter
   - Handles special prefix: `PROJECT_DRAFT_REQUEST::`
   - Validates message isn't empty (unless file/image attached)

2. **Rate Limiting:**
   - Checks `aiCooldownUntil` timestamp
   - If rate-limited → Shows message: "The AI service is rate-limited right now. Please wait about a minute and try again."
   - Returns early (no AI call)

3. **Network Connectivity:**
   - Checks `navigator.onLine`
   - If offline → Shows message: "You're offline. Please reconnect to the internet and try again."
   - Returns early (no AI call)

4. **UI State:**
   - Closes mobile menu if open
   - Closes command palette if open

---

## STEP 2: Special Case Detection

**Location:** `components/DashboardContext.tsx` → `handleSendMessage()` (lines 1602-1720)

### Special Cases Handled (in order):

#### 2.1: Pending Delegation Deadline
**Condition:** `pendingDelegation` exists AND message is not a project draft/file/image/system prompt

**Action:**
- Adds user message to chat
- Calls `finalizeDelegation()` with deadline from message
- Creates delegated task if deadline valid
- Returns early (no AI call)

**Example:**
- User previously asked: "Delegate inventory check to John"
- AI asked: "When should John complete this?"
- User replies: "Tomorrow"
- System: Creates delegated task with deadline "tomorrow"

---

#### 2.2: Draft Plan Finalization
**Condition:** Draft schedule/priorities exist AND message matches finalize intent

**Action:**
- Calls `handleConfirmPlan()`
- Moves draft to Today's Schedule as pending
- Shows confirmation message
- Returns early (no AI call)

**Example:**
- User: "looks good" or "finalize"
- System: Moves draft schedule to Today's Schedule

---

#### 2.3: Cancel Pending Clarification
**Condition:** `pendingScheduleClarification` exists AND message matches cancel intent

**Action:**
- Clears pending schedule clarification
- Shows: "Canceled pending schedule blocking."
- Returns early (no AI call)

**Example:**
- User: "cancel" or "never mind"
- System: Clears pending clarification

---

#### 2.4: Exclude/Mark Done Items
**Condition:** Message matches exclude/done intent AND entity confidence ≥ 0.7

**Action:**
- Removes or marks item as completed
- Shows confirmation message
- Returns early (no AI call)

**Example:**
- User: "exclude the meeting" or "mark lunch as done"
- System: Removes/marks item directly

---

#### 2.5: SYSTEM: Prompts
**Condition:** Message starts with `SYSTEM:`

**Action:**
- Treated as special instruction
- Passed directly to AI with system instruction
- Used for mode activation, weekly reports, etc.

**Example:**
- User: "SYSTEM: Generate a comprehensive weekly report"
- System: Triggers weekly report generation

---

## STEP 3: Free-Style NLU Processing

**Location:** `components/freeStyleNlu.ts` → `inferFreeStyle()`

### Purpose

Detects common user intents **before** sending to AI, allowing for quick, direct actions.

### Intents Detected:

1. **`finalize_plan`** - "finalize", "confirm", "looks good", "approved"
2. **`cancel_pending`** - "cancel", "never mind", "stop"
3. **`proceed`** - "proceed", "go ahead", "continue"
4. **`exclude_item`** - "don't include", "exclude", "remove", "skip"
5. **`mark_done`** - "already done", "completed", "finished"

### Entity Extraction:

For exclude/done intents:
- Extracts target item from message
- Uses fuzzy matching against:
  - Event Ops items
  - Schedule items
  - Reminders
- Confidence threshold: 0.45 (45% match)

### Result:

- If high-confidence intent detected → Executes action directly (no AI call)
- If unclear → Passes to AI for interpretation

---

## STEP 4: Build Context & System Instruction

**Location:** `components/geminiService.ts` → `buildSystemInstruction()`

### What Gets Built:

#### 4.1: User Profile Context
- Name, nickname, role, responsibilities
- Daily tasks, deep focus projects
- Communication style, success definition
- **Assistant Configuration** (HIGHEST PRIORITY):
  - Assistant Name
  - Key Facts (Memory) - non-negotiable rules
- **Team Management**:
  - All team members (name, role, email)

#### 4.2: Dashboard State
- All 7 dashboard cards current state:
  1. Today's Schedule
  2. Top Priorities
  3. Reminders
  4. Daily Progress (calculated)
  5. Ongoing Projects
  6. Delegated Tasks
  7. Briefing Notes

#### 4.3: External Data
- Google Calendar events (today)
- Event Ops items (upcoming, with today's items highlighted)
- Current date/time
- Active mode (Crisis/Strategic/Red Day)

#### 4.4: System Instructions
- Visual formatting rules
- Response JSON structure
- Card modification capabilities
- Critical workflows (Daily Kick-off, Briefing, etc.)
- Clarification rules
- Scope and capabilities
- Graceful decline logic

**System Instruction Size:** ~15,000-20,000 characters

---

## STEP 5: Prepare Message History

**Location:** `components/geminiService.ts` → `sendMessageToGemini()`

### Process:

1. **Take Last 6 Messages:**
   - From `chatHistory` array
   - Maintains conversation context

2. **Trim Each Message:**
   - Max 2,200 characters per message
   - Prevents token overflow

3. **Limit Total History:**
   - Max 8,000 characters total
   - Keeps context manageable

4. **Format for OpenAI:**
   ```json
   [
     { "role": "system", "content": "<system instruction>" },
     { "role": "user", "content": "..." },
     { "role": "assistant", "content": "..." },
     ...
   ]
   ```

5. **Add Current Message:**
   - User's new message added to array
   - Ready for API call

---

## STEP 6: Call AI API

**Location:** `components/geminiService.ts` → `sendMessageToGemini()`

### API Endpoints (in order of preference):

#### 6.1: Primary - `/api/chat` (Vercel)
- Located: `api/chat.js`
- Rate limiting: 60 requests per 10 minutes per IP
- Model: `gpt-4o-mini` (lightweight, fast)
- Max tokens: 900-2000
- Response format: JSON only (enforced)

#### 6.2: Fallback - Direct OpenAI API
- Used if `/api/chat` fails
- Model: `gpt-4o` (from env: `VITE_OPENAI_MODEL`)
- Max tokens: 2000
- Temperature: 0.7

### Request Format:
```json
{
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "<system instruction>" },
    { "role": "user", "content": "..." },
    ...
  ],
  "response_format": { "type": "json_object" },
  "max_tokens": 2000,
  "temperature": 0.7
}
```

### Response Format:
- **MUST be valid JSON** (enforced by `response_format`)
- Contains `text` (mandatory) + optional dashboard modification fields

---

## STEP 7: Parse & Validate Response

**Location:** `components/geminiService.ts` → `sendMessageToGemini()`

### Process:

1. **Extract JSON:**
   - Handles code blocks (```json ... ```)
   - Strips markdown formatting if present

2. **Parse JSON:**
   - Validates JSON structure
   - Extracts response object

3. **Error Handling:**
   - If JSON parsing fails → Returns `{ text: "error message", isError: true }`
   - If API fails → Returns error message with `isError: true`
   - Network errors → Retries once, then falls back

4. **Return to Handler:**
   - Returns parsed response object to `handleSendMessage()`

---

## STEP 8: Apply Dashboard Changes

**Location:** `components/DashboardContext.tsx` → `handleSendMessage()` (lines 1907-2430)

### Processing Order:

#### 8.1: Error Handling
- If `response.isError` → Shows error message, stops processing

#### 8.2: Memory Updates
- `newMemoryToSave` → Adds to Assistant Memory (Key Facts)
- Saved to user profile

#### 8.3: Weekly Log
- `weeklyLogUpdates` → Adds accomplishments/challenges
- Appended to weekly log

#### 8.4: Weekly Report
- `weeklyReport` → Opens weekly report modal
- Displays report to user

#### 8.5: Priority for Tomorrow
- `priorityForTomorrowUpdate` → Updates tomorrow's priority
- Saved to dashboard state

#### 8.6: Project Updates
- `projectUpdate` → Marks milestone as complete
- Updates project progress

#### 8.7: Clarification Requests
- `clarificationRequest` → Sets pending delegation or schedule clarification
- Shows banner to user

#### 8.8: Delegation
- `delegationUpdate` → Creates delegated task
- Syncs to Google Tasks (if connected)
- `delegatedTaskOps` → Add/update/delete delegated tasks

#### 8.9: Schedule Modifications
- `scheduleOps` → Incremental add/update/delete
- `schedule` → Full overwrite
- Auto-includes Event Ops items if missing
- Validates for conflicts

#### 8.10: Priorities Modifications
- `priorityOps` → Incremental add/update/delete
- `priorities` → Full overwrite

#### 8.11: Reminders Modifications
- `reminderOps` → Incremental add/update/delete
- `reminders` → Full overwrite

#### 8.12: Projects Modifications
- `projectOps` → Incremental add/update/delete
- `project` → Create new project
- `projectDraft` → Create draft project

#### 8.13: Briefing Notes
- `keep_draft` → Creates editable draft
- `keep` → Finalizes briefing notes

#### 8.14: Plan Drafts
- `isPlanDraft: true` → Shows "Looks Good, Finalize" button
- Stores draft schedule/priorities for user confirmation

---

## STEP 9: Display Response

**Location:** `components/DashboardContext.tsx` → `handleSendMessage()` (lines 2395-2430)

### What Gets Displayed:

1. **Chat Message:**
   - `response.text` → Main conversational message
   - Formatted with markdown (bold, italics, lists)
   - Displayed in chat bubble

2. **Special Flags:**
   - `isPlanDraft: true` → Shows draft approval buttons
   - `isProjectDraft` → Shows project draft modal
   - `isWeeklyReport` → Opens weekly report modal

3. **Message History:**
   - Added to `chatHistory` (for context in next message)
   - Added to `chatMessages` (for UI display)

---

## Key Decision Points

### When Does the Request Skip AI Processing?

1. **Rate Limited** → Shows cooldown message
2. **Offline** → Shows offline message
3. **Pending Delegation** → Handles deadline directly
4. **Draft Finalization** → Moves draft to schedule
5. **Cancel Pending** → Clears pending clarification
6. **Exclude/Mark Done** (high confidence) → Direct action

### When Does the Request Go to AI?

1. **No special case matches**
2. **Free-style NLU unclear** (low confidence)
3. **General conversation**
4. **Dashboard modifications needed**
5. **Workflow triggers** (Daily Kick-off, Briefing, etc.)

---

## Response Time Breakdown

- Input validation: < 10ms
- Special case detection: < 20ms
- Free-style NLU: < 30ms
- Context building: < 50ms
- History preparation: < 20ms
- API call: 500-2000ms (network dependent)
- Response parsing: < 10ms
- Dashboard updates: < 50ms
- UI render: < 50ms

**Total:** ~600-2200ms (mostly network latency)

---

## Error Handling

### Network Errors:
- Retries once
- Falls back to alternative endpoint
- Shows user-friendly error message

### JSON Parsing Errors:
- Returns `{ text: "error message", isError: true }`
- Logs error to console
- User sees error in chat

### API Errors:
- Handles rate limiting (shows cooldown)
- Handles authentication errors (triggers reconnection)
- Shows specific error message

---

## Important Notes

1. **Fast Path vs. AI Path:**
   - Common intents handled directly (fast)
   - Complex requests go to AI (slower but more flexible)

2. **State Management:**
   - All dashboard state in React context
   - Changes applied immediately after AI response
   - State synced to Supabase (background)

3. **Context Preservation:**
   - Last 6 messages kept in history
   - Full dashboard state included in every request
   - User profile always available

4. **Priority Order:**
   - Assistant Configuration rules (HIGHEST)
   - Critical workflows (Daily Kick-off, Briefing)
   - Dashboard modifications
   - General conversation

---

## Code Locations

- **Main Handler:** `components/DashboardContext.tsx` → `handleSendMessage()` (line 1577)
- **Free-Style NLU:** `components/freeStyleNlu.ts`
- **System Instruction:** `components/geminiService.ts` → `buildSystemInstruction()` (line 22)
- **AI API Call:** `components/geminiService.ts` → `sendMessageToGemini()` (line 555)
- **API Endpoint:** `api/chat.js` (Vercel) or direct OpenAI

---

This is the complete flow of how the assistant handles user requests in the chat.
