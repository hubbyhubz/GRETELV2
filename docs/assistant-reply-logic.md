# Assistant Reply Logic - Complete Flow

This document explains how the AI assistant generates replies in the chat box, from user input to displayed response.

## Overview

The assistant reply system uses a multi-step pipeline that:
1. Processes user input
2. Builds comprehensive context
3. Calls AI API (OpenAI)
4. Parses JSON response
5. Applies dashboard changes
6. Displays chat message

---

## Complete Flow Diagram

```
User Types Message
    ↓
handleSendMessage() [DashboardContext.tsx]
    ↓
Pre-processing & Validation
    ↓
Build System Instruction [geminiService.ts]
    ↓
Prepare Message History
    ↓
Call AI API (/api/chat or direct OpenAI)
    ↓
Parse JSON Response
    ↓
Apply Dashboard Changes (schedule, priorities, etc.)
    ↓
Display Chat Message
```

---

## Step-by-Step Breakdown

### STEP 1: User Input Processing
**Location:** `components/DashboardContext.tsx` → `handleSendMessage()`

**What Happens:**
1. User types message or triggers action
2. Input validation:
   - Checks for rate limiting (cooldown)
   - Checks network connectivity
   - Validates message isn't empty
3. Special handling for:
   - `SYSTEM:` prompts (special instructions)
   - Pending delegation deadlines
   - Pending schedule clarifications
   - Project draft requests
   - Free-style NLU (natural language understanding)

**Key Functions:**
- `inferFreeStyle()` - Detects user intent (cancel, proceed, exclude, mark done)
- `finalizeDelegation()` - Handles delegation deadline input
- `handleConfirmPlan()` - Handles plan confirmation

---

### STEP 2: Context Building
**Location:** `components/geminiService.ts` → `buildSystemInstruction()`

**What Gets Included:**

1. **User Profile** (from Account Settings):
   - Name, nickname, role, responsibilities
   - Daily tasks, deep focus projects
   - Communication style, success definition
   - **Assistant Configuration** (HIGHEST PRIORITY):
     - Assistant Name
     - Key Facts (Memory) - non-negotiable rules
   - **Team Management**:
     - All team members (name, role, email)

2. **Dashboard State** (All 7 Cards):
   - Today's Schedule
   - Top Priorities
   - Reminders
   - Daily Progress (calculated)
   - Ongoing Projects
   - Delegated Tasks
   - Briefing Notes

3. **External Data**:
   - Google Calendar events (today)
   - Event Ops items (upcoming)
   - Current date/time
   - Active mode (Crisis/Strategic/Red Day)

4. **System Instructions**:
   - Visual formatting rules
   - Response JSON structure
   - Card modification capabilities
   - Critical workflows (Daily Kick-off, Briefing, etc.)
   - Clarification rules

**System Instruction Size:** ~15,000-20,000 characters (comprehensive context)

---

### STEP 3: Message History Preparation
**Location:** `components/geminiService.ts` → `sendMessageToGemini()`

**What Happens:**
1. Takes last 6 messages from `chatHistory`
2. Trims each message to max 2,200 characters
3. Limits total history to max 8,000 characters
4. Formats as OpenAI message array:
   ```json
   [
     { "role": "system", "content": "<system instruction>" },
     { "role": "user", "content": "..." },
     { "role": "assistant", "content": "..." },
     ...
   ]
   ```

**Why This Matters:**
- Keeps context manageable
- Prevents token limit issues
- Maintains recent conversation flow

---

### STEP 4: AI API Call
**Location:** `components/geminiService.ts` → `sendMessageToGemini()`

**API Endpoints (in order of preference):**

1. **Primary:** `/api/chat` (Vercel serverless function)
   - Located: `api/chat.js`
   - Rate limiting: 60 requests per 10 minutes per IP
   - Model: `gpt-4o-mini` (lightweight, fast)
   - Max tokens: 900-2000

2. **Fallback:** Direct OpenAI API call
   - Used if `/api/chat` fails
   - Model: `gpt-4o` (from env: `VITE_OPENAI_MODEL`)
   - Max tokens: 2000
   - Temperature: 0.7

**Request Format:**
```json
{
  "model": "gpt-4o-mini",
  "messages": [...],
  "response_format": { "type": "json_object" },
  "max_tokens": 2000,
  "temperature": 0.7
}
```

**Response Format:**
- **MUST be valid JSON** (enforced by `response_format`)
- Contains `text` (mandatory) + optional dashboard modification fields

---

### STEP 5: Response Parsing
**Location:** `components/geminiService.ts` → `sendMessageToGemini()`

**What Happens:**
1. Extracts JSON from response (handles code blocks)
2. Parses JSON object
3. Validates structure
4. Returns parsed object to `handleSendMessage()`

**Error Handling:**
- If JSON parsing fails → returns `{ text: "error message" }`
- If API fails → returns error message with `isError: true`
- Network errors → retries once, then falls back

---

### STEP 6: Dashboard State Updates
**Location:** `components/DashboardContext.tsx` → `handleSendMessage()`

**Response Processing Order:**

1. **Memory Updates:**
   - `newMemoryToSave` → Adds to Assistant Memory (Key Facts)

2. **Weekly Log:**
   - `weeklyLogUpdates` → Adds accomplishments/challenges

3. **Weekly Report:**
   - `weeklyReport` → Opens weekly report modal

4. **Priority for Tomorrow:**
   - `priorityForTomorrowUpdate` → Updates tomorrow's priority

5. **Project Updates:**
   - `projectUpdate` → Marks milestone as complete

6. **Clarification Requests:**
   - `clarificationRequest` → Sets pending delegation or schedule clarification

7. **Delegation:**
   - `delegationUpdate` → Creates delegated task (syncs to Google Tasks)
   - `delegatedTaskOps` → Add/update/delete delegated tasks

8. **Schedule:**
   - `scheduleOps` → Incremental add/update/delete
   - `schedule` → Full overwrite

9. **Priorities:**
   - `priorityOps` → Incremental add/update/delete
   - `priorities` → Full overwrite

10. **Reminders:**
    - `reminderOps` → Incremental add/update/delete
    - `reminders` → Full overwrite

11. **Projects:**
    - `projectOps` → Incremental add/update/delete
    - `project` → Create new project
    - `projectDraft` → Create draft project

12. **Briefing Notes:**
    - `keep_draft` → Creates editable draft
    - `keep` → Finalizes briefing notes

13. **Plan Drafts:**
    - `isPlanDraft: true` → Shows "Looks Good, Finalize" button
    - Stores draft schedule/priorities for user confirmation

---

### STEP 7: Chat Message Display
**Location:** `components/DashboardContext.tsx` → `handleSendMessage()`

**What Gets Displayed:**

1. **Text Response:**
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

## Response JSON Structure

The AI **MUST** return a JSON object with this structure:

```json
{
  "text": "Conversational response (mandatory)",
  
  // Dashboard modifications (optional):
  "schedule": [...],                    // Full overwrite
  "scheduleOps": [...],                 // Incremental ops
  "priorities": [...],                  // Full overwrite
  "priorityOps": [...],                 // Incremental ops
  "reminders": [...],                   // Full overwrite
  "reminderOps": [...],                 // Incremental ops
  "projectOps": [...],                  // Incremental ops
  "project": {...},                     // Create project
  "projectDraft": {...},                // Draft project
  "delegatedTaskOps": [...],            // Incremental ops
  "delegationUpdate": {...},            // Create delegation
  
  // Briefing:
  "keep_draft": "string",              // Draft briefing
  "keep": "string",                     // Final briefing
  
  // Special:
  "isPlanDraft": true,                  // Show draft buttons
  "isProjectDraft": true,                // Project draft flag
  "clarificationRequest": {...},         // Ask for more info
  "newMemoryToSave": "string",          // Save to memory
  "weeklyLogUpdates": [...],            // Weekly log entries
  "weeklyReport": {...},                // Weekly report
  "priorityForTomorrowUpdate": "string" // Tomorrow's priority
}
```

---

## Key Logic Points

### 1. **Priority Order:**
- Assistant Configuration rules (HIGHEST)
- Critical workflows (Daily Kick-off, Briefing)
- Dashboard modifications
- General conversation

### 2. **Error Handling:**
- Network errors → Retry once, then fallback
- JSON parsing errors → Return error message
- API errors → User-friendly error messages
- Rate limiting → Cooldown message

### 3. **Performance:**
- No database reads in chat flow (uses in-memory state)
- History trimming (last 6 messages, 8K chars max)
- Fast response times (< 200ms to API call)

### 4. **State Management:**
- All dashboard state in React context
- Changes applied immediately after AI response
- State synced to Supabase (background)

---

## Special Workflows

### Daily Kick-off Workflow:
1. User: "Time for my daily kick-off."
2. AI: Asks 6 specific questions (Step 1)
3. User: Answers questions
4. AI: Generates draft plan with `isPlanDraft: true` (Step 2)
5. User: Confirms ("looks good")
6. AI: Confirms plan moved to schedule (Step 3)

### Briefing Workflow:
1. User: "Prepare the morning briefing."
2. AI: Asks role-specific questions (Step 1)
3. User: Answers
4. AI: Creates `keep_draft` (Step 2)
5. User: "Finalize the briefing as talking points."
6. AI: Creates `keep` (final briefing script)

### Delegation Workflow:
1. User: "Delegate X to John"
2. AI: Checks for deadline
3. If missing → `clarificationRequest` (asks for deadline)
4. If present → `delegationUpdate` (creates task, syncs to Google)

---

## Response Time Breakdown

- Input validation: < 10ms
- Context building: < 50ms
- History preparation: < 20ms
- API call: 500-2000ms (network dependent)
- Response parsing: < 10ms
- Dashboard updates: < 50ms
- UI render: < 50ms

**Total:** ~600-2200ms (mostly network latency)

---

## Important Notes

1. **JSON-Only Responses:** AI must return valid JSON (enforced by API)
2. **Text is Mandatory:** Every response must have `text` field
3. **State is In-Memory:** No database reads during chat (fast)
4. **History is Trimmed:** Only last 6 messages sent to AI
5. **Assistant Configuration Rules:** Highest priority, override everything
6. **Team Members:** Only delegate to configured team members
7. **Error Recovery:** Multiple fallback mechanisms for reliability

---

## Files Involved

- `components/DashboardContext.tsx` - Main handler, state management
- `components/geminiService.ts` - System instruction, API calls
- `api/chat.js` - Vercel serverless function (primary endpoint)
- `supabase/functions/chat/index.ts` - Supabase edge function (alternative)

---

This is the complete logic flow for how the assistant generates replies in the chat box.
