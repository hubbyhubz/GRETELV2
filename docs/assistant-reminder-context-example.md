# Assistant Reminder with Context - Example Scenario

This document explains how the assistant handles a complex reminder request with contextual triggers.

---

## User Request Example

**User:** "Can you create a reminder for me about Rico he ask that his day off would be on monday February 2, 2026 and remind me via chat when i create our weekly schedule about this reminder in case i forgot."

---

## How the Assistant Would Handle This

### STEP 1: Request Processing

The user's message goes through the normal flow:
1. **Input Validation** → Passes
2. **Special Case Detection** → No match
3. **Free-Style NLU** → No high-confidence intent
4. **Goes to AI** → Full AI processing

### STEP 2: AI Understanding

The AI would understand:
- **Action:** Create a reminder
- **Content:** Rico's day off request (Monday, February 2, 2026)
- **Context:** Should mention this when creating weekly schedule
- **Trigger:** Weekly schedule creation

### STEP 3: Reminder Creation

**Current Reminder Structure:**
```typescript
{
  id: string;
  text: string;
  completed: boolean;
  loggedAt?: number;
  includeInBriefing?: 'none' | 'morning' | 'afternoon' | 'both';
}
```

**AI Response:**
```json
{
  "text": "I've created a reminder about Rico's day off request for Monday, February 2, 2026. I'll make sure to mention this when you're creating your weekly schedule.",
  "reminderOps": [
    {
      "op": "add",
      "item": {
        "text": "Rico's day off: Monday, February 2, 2026 (remind during weekly schedule creation)",
        "includeInBriefing": "both"
      }
    }
  ]
}
```

### STEP 4: Reminder Storage

The reminder is stored in dashboard state with:
- **Text:** "Rico's day off: Monday, February 2, 2026 (remind during weekly schedule creation)"
- **Include in Briefing:** "both" (morning and afternoon)
- **Logged At:** Current timestamp

---

## Current Limitations

### 1. No Metadata Field
- Reminders don't have a `metadata` or `tags` field
- Can't store structured trigger information
- Context must be embedded in the `text` field

### 2. No Explicit Trigger System
- No mechanism to automatically trigger reminders at specific times
- Assistant must manually check reminders during relevant workflows
- Relies on AI to recognize context from reminder text

### 3. No Scheduled Reminders
- Reminders are not date-based
- No automatic activation on specific dates
- Must be manually referenced by the assistant

---

## How It Would Work in Practice

### When User Creates Weekly Schedule

**Scenario:** User says "Create my weekly schedule" or "Time for my daily kick-off"

**System Instruction Includes:**
- All current reminders (including Rico's day off reminder)
- Dashboard state
- User profile

**AI Behavior:**
1. Sees reminder: "Rico's day off: Monday, February 2, 2026 (remind during weekly schedule creation)"
2. Recognizes the context ("remind during weekly schedule creation")
3. Proactively mentions it in the response

**Example AI Response:**
```json
{
  "text": "Here's your weekly schedule. **Reminder:** Rico requested his day off on Monday, February 2, 2026 - make sure to account for this when planning that week's schedule.",
  "schedule": [
    {"time": "09:00 AM - 12:00 PM", "title": "Deep focus work"},
    ...
  ],
  "priorities": [...]
}
```

---

## Recommended Enhancements

### Option 1: Enhanced Reminder Text

**Current Approach (Works Now):**
- Include trigger context in reminder text
- Example: "Rico's day off: Monday, February 2, 2026 (remind during weekly schedule creation)"

**Pros:**
- Works immediately
- No code changes needed
- AI can parse the context

**Cons:**
- Relies on AI interpretation
- Not structured
- May be missed

---

### Option 2: Add Metadata Field

**Enhancement:**
```typescript
export type ReminderItem = {
  id: string;
  text: string;
  completed: boolean;
  loggedAt?: number;
  includeInBriefing?: ReminderBriefingPreference;
  metadata?: {
    triggerContext?: string[]; // ['weekly_schedule', 'daily_kickoff']
    relatedDate?: string; // '2026-02-02'
    relatedPerson?: string; // 'Rico'
  };
};
```

**AI Response:**
```json
{
  "reminderOps": [
    {
      "op": "add",
      "item": {
        "text": "Rico's day off: Monday, February 2, 2026",
        "includeInBriefing": "both",
        "metadata": {
          "triggerContext": ["weekly_schedule"],
          "relatedDate": "2026-02-02",
          "relatedPerson": "Rico"
        }
      }
    }
  ]
}
```

**System Instruction Enhancement:**
- Filter reminders by `triggerContext` when relevant workflow is active
- Example: When creating weekly schedule, show reminders with `triggerContext: ["weekly_schedule"]`

---

### Option 3: Add System Instruction Logic

**Enhancement to `buildSystemInstruction()`:**

```typescript
// Filter reminders by context
const scheduleRelevantReminders = reminders.filter(r => 
  r.text.toLowerCase().includes('schedule') || 
  r.text.toLowerCase().includes('weekly') ||
  r.metadata?.triggerContext?.includes('weekly_schedule')
);

const scheduleRemindersNote = scheduleRelevantReminders.length > 0
  ? `\n\n⚠️ **REMINDERS RELEVANT TO SCHEDULING:**\n${scheduleRelevantReminders.map(r => `- ${r.text}`).join('\n')}`
  : '';
```

**Result:**
- Reminders with scheduling context are highlighted
- AI is explicitly told to mention them
- More reliable than relying on text parsing

---

## Current Workaround

### Best Practice for User:

**User should phrase the reminder request as:**
"Create a reminder: Rico's day off is Monday, February 2, 2026. Please mention this when I create my weekly schedule."

**AI will:**
1. Create reminder with descriptive text
2. Include context in the text
3. See the reminder in system instruction during schedule creation
4. Proactively mention it (if AI recognizes the context)

---

## Implementation Recommendation

### Short-term (Works Now):
1. **User:** Include trigger context in reminder request
2. **AI:** Creates reminder with context in text
3. **AI:** Mentions reminder during relevant workflows (relies on AI understanding)

### Long-term (Requires Code Changes):
1. **Add metadata field** to `ReminderItem` type
2. **Enhance system instruction** to filter reminders by context
3. **Add explicit trigger logic** in workflow instructions
4. **Update reminder creation** to support metadata

---

## Example: Complete Flow

### User Request:
"Can you create a reminder for me about Rico he ask that his day off would be on monday February 2, 2026 and remind me via chat when i create our weekly schedule about this reminder in case i forgot."

### AI Response:
```json
{
  "text": "I've created a reminder about Rico's day off request for Monday, February 2, 2026. I'll make sure to mention this when you're creating your weekly schedule so you don't forget to account for his absence.",
  "reminderOps": [
    {
      "op": "add",
      "item": {
        "text": "Rico's day off: Monday, February 2, 2026 (remind during weekly schedule creation)",
        "includeInBriefing": "both"
      }
    }
  ]
}
```

### Later: When User Creates Weekly Schedule

**User:** "Create my weekly schedule"

**System Instruction Shows:**
- Reminders card includes: "Rico's day off: Monday, February 2, 2026 (remind during weekly schedule creation)"

**AI Response:**
```json
{
  "text": "Here's your weekly schedule. **Important reminder:** Rico requested his day off on Monday, February 2, 2026 - make sure to plan around his absence for that day.",
  "schedule": [
    {"time": "09:00 AM - 12:00 PM", "title": "Deep focus work"},
    ...
  ],
  "priorities": [...]
}
```

---

## Summary

**Current System:**
- ✅ Can create reminders with context in text
- ✅ Reminders visible in system instruction
- ⚠️ Relies on AI to recognize context
- ❌ No structured trigger system

**Recommended Approach:**
1. Create reminder with descriptive text including context
2. Include trigger keywords ("remind during weekly schedule creation")
3. Set `includeInBriefing: "both"` to ensure visibility
4. AI will see reminder and mention it during relevant workflows

**Future Enhancement:**
- Add metadata field for structured triggers
- Enhance system instruction to filter by context
- Add explicit trigger logic in workflows
