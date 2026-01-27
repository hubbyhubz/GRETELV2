# Delegated Task → Reminder Auto-Creation Logic

## Recommendation

**Create automatic reminders** for delegated tasks that are near or past their deadline.

---

## Why Reminders (Not Briefing Pointers)?

### ✅ Advantages:
1. **More Visible** - Shows in Reminders card (always visible)
2. **Briefing Integration** - Can be included in briefings via `includeInBriefing`
3. **Auto-Cleanup** - Can be automatically removed when task completes
4. **Less Clutter** - Briefing pointers are separate modal, reminders are in main view
5. **User Control** - Users can manually complete/remove reminders

### ❌ Briefing Pointers Alternative:
- Less visible (requires opening modal)
- More manual management
- Already have delegated tasks in briefing context

---

## Implementation Plan

### 1. Add Task Link to Reminders

**Option A: Add metadata field (Recommended)**
```typescript
export type ReminderItem = {
  id: string;
  text: string;
  completed: boolean;
  loggedAt?: number;
  includeInBriefing?: ReminderBriefingPreference;
  linkedTaskId?: string; // NEW: Link to delegated task
};
```

**Option B: Use text pattern (Simpler, works now)**
- Include task ID in reminder text: `"[TASK:task-id] Follow up with Jumar: Collect trigger sprayers (Due: Jan 25, 2026)"`
- Parse on completion to find and remove

### 2. Deadline Detection Logic

**Near Deadline:** Within 24-48 hours (configurable)
**Past Deadline:** After deadline date

**Date Parsing:**
- Parse `deadline` field (could be "2026-01-25", "January 25, 2026", "tomorrow", etc.)
- Convert to Date object
- Compare with current date

### 3. Auto-Creation Logic

**When to Create:**
- On delegated tasks state change
- On app load/refresh
- Periodically (every hour or on state update)

**Conditions:**
- Task is NOT completed
- Deadline is near (within 24-48h) OR past deadline
- Reminder doesn't already exist for this task

**Reminder Format:**
```
"Follow up with [Assignee]: [Task Text] (Due: [Deadline])"
```

**Settings:**
- `includeInBriefing: 'both'` - Always include in briefings
- `linkedTaskId: task.id` - Link to task for auto-cleanup

### 4. Auto-Cleanup Logic

**When to Remove:**
- When delegated task is marked as completed
- When delegated task deadline is updated to future date
- When delegated task is deleted

**How:**
- Find reminder with matching `linkedTaskId`
- Remove from reminders array

---

## Configuration Options

### Deadline Thresholds:
- **Near Deadline:** 24 hours (default), configurable to 48 hours
- **Past Deadline:** Any time after deadline date

### Reminder Behavior:
- **Create once** or **Update existing** (prevent duplicates)
- **Include in briefing:** Always ('both')
- **Auto-remove:** When task completes

---

## Code Structure

### 1. Helper Function: Check Task Deadlines

```typescript
const checkTaskDeadlines = (
  tasks: DelegatedTaskItem[],
  reminders: ReminderItem[],
  nearDeadlineHours: number = 24
): { remindersToAdd: ReminderItem[], remindersToRemove: string[] } => {
  const now = new Date();
  const nearDeadlineMs = nearDeadlineHours * 60 * 60 * 1000;
  const remindersToAdd: ReminderItem[] = [];
  const remindersToRemove: string[] = [];
  
  // Get existing reminder task IDs
  const existingTaskIds = new Set(
    reminders
      .filter(r => r.linkedTaskId)
      .map(r => r.linkedTaskId!)
  );
  
  tasks.forEach(task => {
    if (task.completed) {
      // Remove reminder if task is completed
      const linkedReminder = reminders.find(r => r.linkedTaskId === task.id);
      if (linkedReminder) {
        remindersToRemove.push(linkedReminder.id);
      }
      return;
    }
    
    if (!task.deadline || task.deadline === 'TBD') return;
    
    // Parse deadline
    const deadlineDate = parseDeadlineDate(task.deadline);
    if (!deadlineDate) return;
    
    const timeUntilDeadline = deadlineDate.getTime() - now.getTime();
    const isPastDeadline = timeUntilDeadline < 0;
    const isNearDeadline = timeUntilDeadline > 0 && timeUntilDeadline <= nearDeadlineMs;
    
    // Create reminder if near or past deadline and doesn't exist
    if ((isPastDeadline || isNearDeadline) && !existingTaskIds.has(task.id)) {
      const reminderText = `Follow up with ${task.assigneeName}: ${task.text}${task.deadline ? ` (Due: ${task.deadline})` : ''}`;
      remindersToAdd.push({
        id: `task-reminder-${task.id}`,
        text: reminderText,
        completed: false,
        loggedAt: Date.now(),
        includeInBriefing: 'both',
        linkedTaskId: task.id,
      });
    }
  });
  
  return { remindersToAdd, remindersToRemove };
};
```

### 2. useEffect Hook

```typescript
useEffect(() => {
  const { remindersToAdd, remindersToRemove } = checkTaskDeadlines(
    delegatedTasks,
    reminders,
    24 // 24 hours before deadline
  );
  
  if (remindersToAdd.length > 0 || remindersToRemove.length > 0) {
    setReminders(prev => {
      let next = [...prev];
      
      // Remove completed task reminders
      next = next.filter(r => !remindersToRemove.includes(r.id));
      
      // Add new reminders
      next = [...next, ...remindersToAdd];
      
      return next;
    });
  }
}, [delegatedTasks, reminders.length]); // Only re-run when tasks change or reminders count changes
```

### 3. Parse Deadline Helper

```typescript
const parseDeadlineDate = (deadline: string): Date | null => {
  if (!deadline || deadline === 'TBD') return null;
  
  // Try YYYY-MM-DD format
  const isoMatch = deadline.match(/^(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2})?$/);
  if (isoMatch) {
    const date = new Date(`${isoMatch[1]}T00:00:00`);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try parsing as Date
  const parsed = new Date(deadline);
  if (!isNaN(parsed.getTime())) return parsed;
  
  return null;
};
```

---

## User Experience

### Scenario 1: Task Near Deadline (24 hours)

**Task:**
- Assignee: Jumar
- Task: "Collect trigger sprayers"
- Deadline: Tomorrow (Jan 26, 2026)
- Status: Not Started

**Auto-Created Reminder:**
- Text: "Follow up with Jumar: Collect trigger sprayers (Due: Jan 26, 2026)"
- Include in Briefing: Both (morning & afternoon)
- Linked to: Task ID

**Result:**
- Reminder appears in Reminders card
- Included in briefing pointers automatically
- User sees it prominently

### Scenario 2: Task Past Deadline

**Task:**
- Assignee: Jumar
- Task: "Collect trigger sprayers"
- Deadline: Jan 25, 2026 (yesterday)
- Status: Not Started

**Auto-Created Reminder:**
- Text: "Follow up with Jumar: Collect trigger sprayers (Due: Jan 25, 2026)"
- Include in Briefing: Both
- **Urgency:** Past deadline (could highlight differently)

### Scenario 3: Task Completed

**Action:** User marks task as completed

**Result:**
- Reminder automatically removed
- No manual cleanup needed

---

## Edge Cases

### 1. Duplicate Prevention
- Check if reminder already exists for task ID
- Don't create duplicate reminders

### 2. Deadline Format Variations
- Handle: "2026-01-25", "January 25, 2026", "tomorrow", "TBD"
- Gracefully skip if can't parse

### 3. Task Updates
- If deadline changes to future date → Remove reminder
- If deadline changes to past date → Create/update reminder

### 4. Multiple Reminders
- One reminder per task (not multiple)
- Update existing reminder if deadline changes

---

## Implementation Steps

1. **Add `linkedTaskId` to ReminderItem type** (if using Option A)
2. **Create `checkTaskDeadlines` helper function**
3. **Create `parseDeadlineDate` helper function**
4. **Add useEffect to monitor delegatedTasks**
5. **Update task completion handler** to remove linked reminders
6. **Test with various deadline formats**

---

## Alternative: Simpler Text-Based Approach

If you want to avoid type changes:

**Reminder Text Pattern:**
```
"[TASK:task-id] Follow up with Jumar: Collect trigger sprayers (Due: Jan 25, 2026)"
```

**Cleanup:**
- Parse text to extract task ID
- Remove when task completes

**Pros:** No type changes, works immediately
**Cons:** Less structured, relies on text parsing

---

## Recommendation

**Use Option A (metadata field)** for cleaner implementation:
- More maintainable
- Better type safety
- Easier to query/filter
- Future-proof for enhancements
