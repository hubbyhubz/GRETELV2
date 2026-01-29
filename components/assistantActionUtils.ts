import type { Milestone, Project, ReminderBriefingPreference, ReminderItem, ScheduleItem, Top3Item } from './types';

export const normalizeNeedle = (value: unknown) => String(value ?? '').toLowerCase().trim();

export const toYmdLocal = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const parseDeadlineFromText = (input: string, now = new Date()) => {
  const raw = input.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/\s+/g, ' ').trim();

  const base = new Date(now);
  base.setSeconds(0, 0);

  const parseTime = (value: string) => {
    const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match) return null;
    let hours = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    const meridiem = match[3]?.toLowerCase();
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    return { hours, minutes };
  };

  const withTime = (date: Date, time: { hours: number; minutes: number } | null) => {
    const next = new Date(date);
    if (time) next.setHours(time.hours, time.minutes, 0, 0);
    else next.setHours(17, 0, 0, 0);
    return next;
  };

  const parseIsoDateTime = (text: string) => {
    const m = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ t](\d{1,2}:\d{2}))?$/i);
    if (!m) return null;
    const day = m[1];
    const time = m[2] ? parseTime(m[2]) : null;
    const date = new Date(`${day}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return { date: withTime(date, time), label: m[2] ? `${day} ${m[2]}` : day };
  };

  const parseWeekday = (text: string) => {
    const names: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
    const normalized = text.replace(/^next\s+/, '').trim();
    const target = names[normalized];
    if (target == null) return null;
    const baseDay = new Date(now);
    baseDay.setHours(0, 0, 0, 0);
    const current = baseDay.getDay();
    let delta = (target - current + 7) % 7;
    if (delta === 0) delta = 7;
    const next = new Date(baseDay);
    next.setDate(baseDay.getDate() + delta);
    return next;
  };

  const isoParsed = parseIsoDateTime(lower);
  if (isoParsed) return { deadline: isoParsed.label, deadlineISO: isoParsed.date.toISOString() };

  if (lower === 'today' || lower === 'eod today') {
    const d = withTime(base, null);
    return { deadline: toYmdLocal(d), deadlineISO: d.toISOString() };
  }
  if (lower === 'tomorrow' || lower === 'eod tomorrow') {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    const at = withTime(d, null);
    return { deadline: toYmdLocal(at), deadlineISO: at.toISOString() };
  }

  if (lower.startsWith('next ')) {
    const next = parseWeekday(lower);
    if (next) {
      const d = withTime(next, null);
      return { deadline: toYmdLocal(d), deadlineISO: d.toISOString() };
    }
  }

  const weekdayOnly = parseWeekday(lower);
  if (weekdayOnly) {
    const d = withTime(weekdayOnly, null);
    return { deadline: toYmdLocal(d), deadlineISO: d.toISOString() };
  }

  const dateFallback = new Date(raw);
  if (!Number.isNaN(dateFallback.getTime())) {
    const d = withTime(dateFallback, null);
    return { deadline: toYmdLocal(d), deadlineISO: d.toISOString() };
  }

  return null;
};

export const applyScheduleOps = (current: ScheduleItem[], ops: any[]) => {
  let next = [...current];
  const messages: string[] = [];
  const nowTs = Date.now();

  const matchIndexes = (match: any) => {
    const id = match?.id ? String(match.id) : '';
    const titleContains = normalizeNeedle(match?.titleContains);
    return next
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => (id ? item.id === id : true))
      .filter(({ item }) => {
        if (!titleContains) return true;
        const itemTitle = normalizeNeedle(item.title);
        // Fuzzy match: check if either string contains the other (handles partial matches)
        // Also check for key words in common (e.g., "Pre-Event Walkthrough" matches "Pre-Event Walkthrough at Saffron")
        const itemWords = itemTitle.split(/\s+/).filter(w => w.length > 2);
        const searchWords = titleContains.split(/\s+/).filter(w => w.length > 2);
        const hasCommonWords = searchWords.length > 0 && searchWords.some(sw => 
          itemWords.some(iw => iw.includes(sw) || sw.includes(iw))
        );
        return itemTitle.includes(titleContains) || titleContains.includes(itemTitle) || hasCommonWords;
      })
      .map(({ index }) => index);
  };

  (Array.isArray(ops) ? ops : []).forEach((op: any, index: number) => {
    const operation = String(op?.op || '').toLowerCase();
    if (operation === 'add') {
      const time = String(op?.item?.time || 'All Day').trim();
      const title = String(op?.item?.title || '').trim();
      if (!title) return;
      
      const newItem = { id: `sched-${nowTs}-${index}`, time, title, completed: false };
      
      // Apply cascading reschedule: push down conflicting items
      next = cascadeReschedule(next, { time, title });
      
      // Add the new item
      next = [...next, newItem];
      
      // Sort by time
      next.sort((a, b) => {
        const aRange = parseScheduleRangeToMinutes(a.time);
        const bRange = parseScheduleRangeToMinutes(b.time);
        if (!aRange) return 1;
        if (!bRange) return -1;
        return aRange.start - bRange.start;
      });
      
      return;
    }

    const indexes = matchIndexes(op?.match);
    if (indexes.length !== 1) {
      const targetLabel = op?.match?.id ? `id=${String(op.match.id)}` : op?.match?.titleContains ? `title contains \"${String(op.match.titleContains)}\"` : 'unspecified target';
      messages.push(indexes.length === 0 ? `I couldn't find a schedule item to ${operation} (${targetLabel}).` : `Multiple schedule items match (${targetLabel}). Please be more specific.`);
      return;
    }
    const i = indexes[0];
    if (operation === 'delete') {
      next = next.filter((_, idx) => idx !== i);
      return;
    }
    if (operation === 'update') {
      const time = op?.item?.time != null ? String(op.item.time).trim() : next[i].time;
      const title = op?.item?.title != null ? String(op.item.title).trim() : next[i].title;
      
      // If time is being updated, apply cascading reschedule
      if (op?.item?.time != null && time !== next[i].time) {
        // Get the item to update
        const itemToUpdate = next[i];
        const oldTime = itemToUpdate.time;
        
        // Remove the item from schedule temporarily
        const tempSchedule = next.filter((_, idx) => idx !== i);
        
        // Apply cascade with the NEW time - this will push down conflicting items
        // The cascade function checks for conflicts with the new time range
        const cascaded = cascadeReschedule(tempSchedule, { time, title });
        
        // Add the updated item back with new time
        const updatedItem = { ...itemToUpdate, time, title };
        next = [...cascaded, updatedItem];
        
        // Sort by time
        next.sort((a, b) => {
          const aRange = parseScheduleRangeToMinutes(a.time);
          const bRange = parseScheduleRangeToMinutes(b.time);
          if (!aRange) return 1;
          if (!bRange) return -1;
          return aRange.start - bRange.start;
        });
      } else {
        // Just update title, no time change
      next = next.map((item, idx) => (idx === i ? { ...item, time, title } : item));
      }
    }
  });

  return { next, messages };
};

export const applyPriorityOps = (current: Top3Item[], ops: any[]) => {
  let next = [...current];
  const messages: string[] = [];
  const nowTs = Date.now();

  const matchIndexes = (match: any) => {
    const id = match?.id ? String(match.id) : '';
    const textContains = normalizeNeedle(match?.textContains);
    return next
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => (id ? item.id === id : true))
      .filter(({ item }) => (textContains ? item.text.toLowerCase().includes(textContains) : true))
      .map(({ index }) => index);
  };

  (Array.isArray(ops) ? ops : []).forEach((op: any, index: number) => {
    const operation = String(op?.op || '').toLowerCase();
    if (operation === 'add') {
      const text = String(op?.item?.text || '').trim();
      if (!text) return;
      next = [...next, { id: `pri-${nowTs}-${index}`, text, completed: false }];
      return;
    }

    const indexes = matchIndexes(op?.match);
    if (indexes.length !== 1) {
      const targetLabel = op?.match?.id ? `id=${String(op.match.id)}` : op?.match?.textContains ? `text contains \"${String(op.match.textContains)}\"` : 'unspecified target';
      messages.push(indexes.length === 0 ? `I couldn’t find a priority to ${operation} (${targetLabel}).` : `Multiple priorities match (${targetLabel}). Please be more specific.`);
      return;
    }
    const i = indexes[0];
    if (operation === 'delete') {
      next = next.filter((_, idx) => idx !== i);
      return;
    }
    if (operation === 'update') {
      const text = op?.item?.text != null ? String(op.item.text).trim() : next[i].text;
      next = next.map((item, idx) => (idx === i ? { ...item, text } : item));
    }
  });

  return { next, messages };
};

export const applyReminderOps = (
  current: ReminderItem[],
  ops: any[],
  options: {
    nowTs: number;
    defaultIncludeInBriefing: ReminderBriefingPreference;
    resolveInclude: (value: unknown) => ReminderBriefingPreference;
    normalize: (items: ReminderItem[]) => ReminderItem[];
  }
) => {
  let next = [...current];
  const messages: string[] = [];

  const matchIndexes = (match: any) => {
    const id = match?.id ? String(match.id) : '';
    const textContains = normalizeNeedle(match?.textContains);
    return next
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => (id ? item.id === id : true))
      .filter(({ item }) => (textContains ? item.text.toLowerCase().includes(textContains) : true))
      .map(({ index }) => index);
  };

  (Array.isArray(ops) ? ops : []).forEach((op: any, index: number) => {
    const operation = String(op?.op || '').toLowerCase();
    if (operation === 'add') {
      const text = String(op?.item?.text || '').trim();
      if (!text) return;
      const includeInBriefing = op?.item?.includeInBriefing != null ? options.resolveInclude(op.item.includeInBriefing) : options.defaultIncludeInBriefing;
      next = [...next, { id: `rem-${options.nowTs}-${index}`, text, completed: false, loggedAt: options.nowTs, includeInBriefing }];
      return;
    }

    const indexes = matchIndexes(op?.match);
    if (indexes.length !== 1) {
      const targetLabel = op?.match?.id ? `id=${String(op.match.id)}` : op?.match?.textContains ? `text contains \"${String(op.match.textContains)}\"` : 'unspecified target';
      messages.push(indexes.length === 0 ? `I couldn’t find a reminder to ${operation} (${targetLabel}).` : `Multiple reminders match (${targetLabel}). Please be more specific.`);
      return;
    }
    const i = indexes[0];
    if (operation === 'delete') {
      next = next.filter((_, idx) => idx !== i);
      return;
    }
    if (operation === 'update') {
      const text = op?.item?.text != null ? String(op.item.text).trim() : next[i].text;
      const includeInBriefing = op?.item?.includeInBriefing != null ? options.resolveInclude(op.item.includeInBriefing) : next[i].includeInBriefing;
      next = next.map((item, idx) => (idx === i ? { ...item, text, includeInBriefing } : item));
    }
  });

  return { next: options.normalize(next), messages };
};

export const applyProjectOps = (current: Project[], ops: any[]) => {
  let next = [...current];
  const messages: string[] = [];
  const nowTs = Date.now();

  const matchIndexes = (match: any) => {
    const id = match?.id ? String(match.id) : '';
    const nameContains = normalizeNeedle(match?.nameContains);
    return next
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => (id ? item.id === id : true))
      .filter(({ item }) => (nameContains ? item.name.toLowerCase().includes(nameContains) : true))
      .map(({ index }) => index);
  };

  (Array.isArray(ops) ? ops : []).forEach((op: any, index: number) => {
    const operation = String(op?.op || '').toLowerCase();
    if (operation === 'add') {
      const name = String(op?.item?.name || '').trim();
      const deadline = String(op?.item?.deadline || '').trim();
      const rawMilestones = Array.isArray(op?.item?.milestones) ? op.item.milestones : [];
      if (!name) return;
      const milestones: Milestone[] = rawMilestones
        .map((m: any, mi: number) => {
          const text = String(m?.text || '').trim();
          if (!text) return null;
          const assigneeName = m?.assigneeName ? String(m.assigneeName).trim() : undefined;
          return { id: `ms-${nowTs}-${index}-${mi}`, text, progress: 0, assigneeName };
        })
        .filter(Boolean) as Milestone[];
      next = [...next, { id: `proj-${nowTs}-${index}`, name, deadline, milestones }];
      return;
    }

    const indexes = matchIndexes(op?.match);
    if (indexes.length !== 1) {
      const targetLabel = op?.match?.id ? `id=${String(op.match.id)}` : op?.match?.nameContains ? `name contains \"${String(op.match.nameContains)}\"` : 'unspecified target';
      messages.push(indexes.length === 0 ? `I couldn’t find a project to ${operation} (${targetLabel}).` : `Multiple projects match (${targetLabel}). Please be more specific.`);
      return;
    }
    const i = indexes[0];
    if (operation === 'delete') {
      next = next.filter((_, idx) => idx !== i);
      return;
    }
    if (operation === 'update') {
      const name = op?.item?.name != null ? String(op.item.name).trim() : next[i].name;
      const deadline = op?.item?.deadline != null ? String(op.item.deadline).trim() : next[i].deadline;
      next = next.map((item, idx) => (idx === i ? { ...item, name, deadline } : item));
    }
  });

  return { next, messages };
};

const parseHmToMinutes = (value: string) => {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
};

const parseAmPmToMinutes = (value: string) => {
  const m = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3].toLowerCase();
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (meridiem === 'pm' && h < 12) h += 12;
  if (meridiem === 'am' && h === 12) h = 0;
  return h * 60 + min;
};

export const parseScheduleRangeToMinutes = (range: string) => {
  const raw = range.trim();
  if (!raw) return null;
  if (/^all\s*day$/i.test(raw)) return null;
  const m = raw.match(/^(.+?)\s*-\s*(.+)$/);
  if (!m) return null;
  const startRaw = m[1].trim();
  const endRaw = m[2].trim();
  const start = parseAmPmToMinutes(startRaw);
  const end = parseAmPmToMinutes(endRaw);
  if (start == null || end == null) return null;
  return { start, end };
};

/**
 * Checks if two time ranges overlap
 */
const doRangesOverlap = (range1: { start: number; end: number }, range2: { start: number; end: number }): boolean => {
  return Math.max(0, Math.min(range1.end, range2.end) - Math.max(range1.start, range2.start)) > 0;
};

/**
 * Formats minutes since midnight to "HH:MM AM/PM" format
 */
const minutesToTimeString = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const h = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const m = String(mins).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  return `${h}:${m} ${ampm}`;
};

/**
 * Finds all schedule items that conflict with a given time range
 */
const findConflictingItems = (schedule: ScheduleItem[], newRange: { start: number; end: number }): ScheduleItem[] => {
  return schedule.filter(item => {
    if (item.time.toLowerCase().trim() === 'all day') return true; // All day items always conflict
    const itemRange = parseScheduleRangeToMinutes(item.time);
    if (!itemRange) return false;
    return doRangesOverlap(itemRange, newRange);
  });
};

/**
 * Gets hard constraint blocks from schedule (Lunch, Briefing, etc.)
 * These are items that should not be scheduled over
 */
const getHardConstraintBlocks = (schedule: ScheduleItem[]): Array<{ start: number; end: number; title: string }> => {
  const constraints: Array<{ start: number; end: number; title: string }> = [];
  const constraintKeywords = ['lunch', 'briefing', 'meeting', 'standup', 'sync'];
  
  schedule.forEach(item => {
    const titleLower = item.title.toLowerCase();
    const isConstraint = constraintKeywords.some(keyword => titleLower.includes(keyword));
    if (isConstraint) {
      const range = parseScheduleRangeToMinutes(item.time);
      if (range) {
        constraints.push({ ...range, title: item.title });
      }
    }
  });
  
  return constraints.sort((a, b) => a.start - b.start);
};

/**
 * Finds the next available time slot after a given time, respecting hard constraints and existing schedule items
 */
const findNextAvailableSlot = (
  startAfter: number,
  duration: number,
  hardConstraints: Array<{ start: number; end: number; title: string }>,
  existingSchedule: ScheduleItem[],
  excludeItemIds: Set<string> = new Set(), // Items to exclude from conflict check (e.g., items being moved)
  maxTime: number = 24 * 60 // End of day
): number | null => {
  let candidateStart = startAfter;
  const maxIterations = 100; // Prevent infinite loops
  let iterations = 0;
  
  while (iterations < maxIterations) {
    iterations++;
    let hasConflict = false;
    const candidateRange = { start: candidateStart, end: candidateStart + duration };
    
    // Check hard constraints
    for (const constraint of hardConstraints) {
      if (doRangesOverlap(candidateRange, constraint)) {
        candidateStart = constraint.end;
        hasConflict = true;
        break;
      }
    }
    
    if (hasConflict) continue;
    
    // Check existing schedule items (excluding items being moved)
    for (const item of existingSchedule) {
      if (excludeItemIds.has(item.id)) continue; // Skip items being moved
      if (item.time.toLowerCase().trim() === 'all day') continue; // Skip all-day items
      
      const itemRange = parseScheduleRangeToMinutes(item.time);
      if (!itemRange) continue;
      
      if (doRangesOverlap(candidateRange, itemRange)) {
        candidateStart = itemRange.end;
        hasConflict = true;
        break;
      }
    }
    
    if (!hasConflict) {
      // Found a slot that doesn't conflict
      if (candidateStart + duration <= maxTime) {
        return candidateStart;
      }
      return null; // Would go past end of day
    }
    
    // If we've gone past end of day, stop
    if (candidateStart + duration > maxTime) {
      return null;
    }
  }
  
  // Max iterations reached (shouldn't happen, but safety check)
  return null;
};

/**
 * Cascading reschedule: Pushes down conflicting items when a new item is added/updated
 */
export const cascadeReschedule = (
  schedule: ScheduleItem[],
  newItem: { time: string; title: string },
  hardConstraintKeywords: string[] = ['lunch', 'briefing', 'meeting', 'standup', 'sync']
): ScheduleItem[] => {
  const newRange = parseScheduleRangeToMinutes(newItem.time);
  if (!newRange) {
    // Can't parse new item time, just add it
    return schedule;
  }
  
  // Get hard constraints (immutable blocks)
  const hardConstraints = getHardConstraintBlocks(schedule);
  
  // Find all items that conflict with the new item
  const conflictingItems = findConflictingItems(schedule, newRange);
  
  if (conflictingItems.length === 0) {
    // No conflicts, just add the new item
    return schedule;
  }
  
  // Calculate the end time of the new item (this is where we'll start pushing)
  let pushStartTime = newRange.end;
  
  // Sort conflicting items by their original start time to maintain order
  const sortedConflicting = [...conflictingItems].sort((a, b) => {
    const aRange = parseScheduleRangeToMinutes(a.time);
    const bRange = parseScheduleRangeToMinutes(b.time);
    if (!aRange) return 1;
    if (!bRange) return -1;
    return aRange.start - bRange.start;
  });
  
  // Track where each item should be moved to (cascading effect)
  const movedItems = new Map<string, { newStart: number; newEnd: number; newTime: string }>();
  const conflictingItemIds = new Set(conflictingItems.map(item => item.id));
  
  // Get non-conflicting items for conflict checking
  const nonConflictingSchedule = schedule.filter(item => !conflictingItemIds.has(item.id));
  
  // Process each conflicting item in order, cascading them down
  sortedConflicting.forEach(item => {
    const itemRange = parseScheduleRangeToMinutes(item.time);
    if (!itemRange) return;
    
    const duration = itemRange.end - itemRange.start;
    
    // Build list of already-moved items to exclude from conflict check
    const excludeIds = new Set(Array.from(movedItems.keys()));
    
    // Find next available slot after the current push position
    // Exclude items being moved and check against non-conflicting items + hard constraints
    const newStart = findNextAvailableSlot(
      pushStartTime,
      duration,
      hardConstraints,
      nonConflictingSchedule,
      excludeIds
    );
    
    if (newStart === null) {
      // No available slot found, keep original time
      console.warn(`Could not find available slot for "${item.title}" after ${minutesToTimeString(pushStartTime)}`);
      return;
    }
    
    const newEnd = newStart + duration;
    const newTime = `${minutesToTimeString(newStart)} - ${minutesToTimeString(newEnd)}`;
    
    movedItems.set(item.id, { newStart, newEnd, newTime });
    
    // Update push position to after this item ends (cascading effect)
    pushStartTime = newEnd;
  });
  
  // Apply the moves to the schedule
  const updatedSchedule = schedule.map(item => {
    const isConflicting = conflictingItems.some(conflict => conflict.id === item.id);
    if (!isConflicting) {
      return item; // Keep non-conflicting items as-is
    }
    
    const move = movedItems.get(item.id);
    if (!move) {
      // Couldn't find a slot, keep original
      return item;
    }
    
    return {
      ...item,
      time: move.newTime,
    };
  });
  
  return updatedSchedule;
};

export const EVENT_OPS_PREP_MINUTES = 90;
export const EVENT_OPS_WRAP_MINUTES = 120;

export const getEventOpsReminderMoments = (servingMinutes: number) => {
  return [
    { label: 'T-90', minute: Math.max(0, servingMinutes - EVENT_OPS_PREP_MINUTES) },
    { label: 'T-30', minute: Math.max(0, servingMinutes - 30) },
    { label: 'T-0', minute: servingMinutes },
    { label: 'T+120', minute: Math.min(24 * 60, servingMinutes + EVENT_OPS_WRAP_MINUTES) },
  ];
};

export const buildEventOpsBlocksForToday = (
  items: Array<{ id: string; kind: string; event_date: string; name: string; location: string | null; serving_time: string | null }>,
  todayYmd: string
) => {
  const todayItems = (Array.isArray(items) ? items : []).filter((it: any) => String(it?.event_date || '') === todayYmd);
  const missingTime = todayItems.filter((it: any) => !it?.serving_time);
  const blocks = todayItems
    .map((it: any) => {
      const serving = String(it?.serving_time || '').slice(0, 5);
      const minutes = parseHmToMinutes(serving);
      if (minutes == null) return null;
      const start = Math.max(0, minutes - EVENT_OPS_PREP_MINUTES);
      const end = Math.min(24 * 60, minutes + EVENT_OPS_WRAP_MINUTES);
      return { start, end, item: it };
    })
    .filter(Boolean) as Array<{ start: number; end: number; item: any }>;

  return { todayItems, missingTime, blocks };
};

export const detectEventOpsScheduleClarification = (params: {
  todayYmd: string;
  eventOpsItems: Array<{ id: string; kind: string; event_date: string; name: string; location: string | null; serving_time: string | null }>;
  proposedSchedule: Array<{ time: string; title: string }>;
}) => {
  const { todayYmd, eventOpsItems, proposedSchedule } = params;
  const { todayItems, missingTime, blocks } = buildEventOpsBlocksForToday(eventOpsItems, todayYmd);
  if (todayItems.length === 0) return { needsClarification: false as const };

  if (missingTime.length > 0) {
    const names = missingTime.slice(0, 3).map((it: any) => it.name).join(', ');
    return {
      needsClarification: true as const,
      reason: 'event_ops_missing_time' as const,
      eventOpsItems: todayItems,
      question: `I see you have an Event Ops item today (${names}). What’s your plan for today so I can block your schedule properly?`,
    };
  }

  const conflicts: any[] = [];
  (Array.isArray(proposedSchedule) ? proposedSchedule : []).forEach((slot) => {
    const slotTitle = normalizeNeedle(slot?.title);
    if (slotTitle) {
      if (slotTitle.includes('event ops')) return;
      const matchesOwnEvent = todayItems.some((it: any) => slotTitle.includes(normalizeNeedle(it?.name)));
      if (matchesOwnEvent) return;
    }
    const parsed = parseScheduleRangeToMinutes(String(slot?.time || ''));
    if (!parsed) return;
    blocks.forEach((b) => {
      const overlap = Math.max(0, Math.min(parsed.end, b.end) - Math.max(parsed.start, b.start));
      if (overlap > 0) conflicts.push(b.item);
    });
  });

  if (conflicts.length > 0) {
    const unique = Array.from(new Map(conflicts.map((it) => [it.id, it])).values());
    const names = unique.slice(0, 3).map((it: any) => it.name).join(', ');
    return {
      needsClarification: true as const,
      reason: 'event_ops_conflict' as const,
      eventOpsItems: todayItems,
      question: `I see there is an Event Ops item today (${names}). What’s your plan for today so I can block your schedule properly?`,
    };
  }

  return { needsClarification: false as const };
};
