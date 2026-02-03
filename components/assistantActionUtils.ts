import type { BlockedTimeSlot, Milestone, Project, ReminderBriefingPreference, ReminderItem, ScheduleItem, Top3Item } from './types';

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
export const minutesToTimeString = (minutes: number): string => {
  const normalized = ((Math.floor(minutes) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
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
    if (item.source === 'rule') return false;
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
    const isConstraint = item.source === 'rule' || constraintKeywords.some(keyword => titleLower.includes(keyword));
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
  newItem: { time: string; title: string }
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

const clampMinutesRange = (range: { start: number; end: number }) => {
  const start = Math.max(0, Math.min(24 * 60, Math.floor(range.start)));
  const end = Math.max(0, Math.min(24 * 60, Math.floor(range.end)));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end <= start) return null;
  return { start, end };
};

const rangesOverlap = (a: { start: number; end: number }, b: { start: number; end: number }) => {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)) > 0;
};

const parseFlexibleTimeToMinutes = (value: string) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const ampm = parseAmPmToMinutes(trimmed);
  if (ampm != null) return ampm;
  const hm = parseHmToMinutes(trimmed);
  if (hm != null) return hm;
  const m = trimmed.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
};

const extractAssistantMemoryText = (assistantMemory: unknown) => {
  const raw = String(assistantMemory ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x)).join('\n');
    if (typeof parsed === 'string') return parsed;
    return raw;
  } catch {
    return raw;
  }
};

const extractWorkHoursFromMemory = (assistantMemory: unknown) => {
  const text = extractAssistantMemoryText(assistantMemory);
  const match = text.match(/work\s*hours?\s*[:\-]?\s*([0-9:\s]+(?:am|pm)?)\s*(?:to|\-|–)\s*([0-9:\s]+(?:am|pm)?)/i);
  if (!match) return null;
  const start = parseFlexibleTimeToMinutes(match[1]);
  const end = parseFlexibleTimeToMinutes(match[2]);
  if (start == null || end == null) return null;
  return clampMinutesRange({ start, end });
};

const extractLunchFromMemory = (assistantMemory: unknown) => {
  const text = extractAssistantMemoryText(assistantMemory);
  const match = text.match(/lunch\b[^0-9]*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (!match) return null;
  const start = parseFlexibleTimeToMinutes(match[1]);
  if (start == null) return null;
  const durationMatch = text.match(/lunch\b.*?\b(\d{1,3})\s*(?:min|mins|minutes)\b/i);
  const duration = durationMatch ? Number(durationMatch[1]) : 30;
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return clampMinutesRange({ start, end: start + Math.min(240, duration) });
};

const toTimeLabel = (range: { start: number; end: number }) => {
  if (range.start === 0 && range.end >= 24 * 60) return 'All Day';
  return `${minutesToTimeString(range.start)} - ${minutesToTimeString(range.end)}`;
};

const mergeOverlappingRanges = (ranges: Array<{ start: number; end: number }>) => {
  const sorted = ranges
    .map(clampMinutesRange)
    .filter(Boolean) as Array<{ start: number; end: number }>;
  sorted.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...r });
      continue;
    }
    if (r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      continue;
    }
    merged.push({ ...r });
  }
  return merged;
};

export const buildBlockedTimeSlotsForDate = (params: {
  now: Date;
  assistantMemory: unknown;
  includeOutsideWorkHours?: boolean;
  includeLunch?: boolean;
}) => {
  const { now, assistantMemory } = params;
  const includeOutsideWorkHours = params.includeOutsideWorkHours === true;
  const includeLunch = params.includeLunch === true;

  const workHours = extractWorkHoursFromMemory(assistantMemory) ?? { start: 9 * 60, end: 17 * 60 };
  const lunch = extractLunchFromMemory(assistantMemory);

  const slots: BlockedTimeSlot[] = [];
  const ymd = toYmdLocal(now);

  if (includeOutsideWorkHours) {
    const before = clampMinutesRange({ start: 0, end: workHours.start });
    const after = clampMinutesRange({ start: workHours.end, end: 24 * 60 });
    if (before) slots.push({ id: `blocked-rule-before-${ymd}`, start: before.start, end: before.end, timeLabel: toTimeLabel(before), title: 'Outside Work Hours', source: 'rule', reason: 'outside_work_hours' });
    if (after) slots.push({ id: `blocked-rule-after-${ymd}`, start: after.start, end: after.end, timeLabel: toTimeLabel(after), title: 'Outside Work Hours', source: 'rule', reason: 'outside_work_hours' });
  }

  if (includeLunch && lunch) {
    slots.push({ id: `blocked-rule-lunch-${ymd}`, start: lunch.start, end: lunch.end, timeLabel: toTimeLabel(lunch), title: 'Lunch', source: 'rule', reason: 'lunch' });
  }

  const ruleRanges = mergeOverlappingRanges(slots.filter((s) => s.source === 'rule').map((s) => ({ start: s.start, end: s.end })));

  const normalizedSlots: BlockedTimeSlot[] = [];
  ruleRanges.forEach((r, idx) => {
    const matchingReasons = slots
      .filter((s) => s.source === 'rule')
      .filter((s) => rangesOverlap({ start: s.start, end: s.end }, r))
      .map((s) => s.reason)
      .filter(Boolean) as string[];
    const reason = matchingReasons.includes('lunch') ? 'lunch' : matchingReasons.includes('outside_work_hours') ? 'outside_work_hours' : undefined;
    const title = reason === 'lunch' ? 'Lunch' : 'Outside Work Hours';
    normalizedSlots.push({ id: `blocked-rule-${ymd}-${idx}`, start: r.start, end: r.end, timeLabel: toTimeLabel(r), title, source: 'rule', reason });
  });

  normalizedSlots.sort((a, b) => a.start - b.start);

  return normalizedSlots;
};

export type KickoffEnergyPeak = 'morning' | 'midday' | 'afternoon' | 'evening';

export type EightHourSchedulePlan =
  | { ok: true; span: { start: number; end: number }; schedule: ScheduleItem[]; priorities: string[]; warnings: string[] }
  | { ok: false; error: string };

const parseAnswerList = (raw: string) => {
  return String(raw || '')
    .split(/\r?\n|;|,/)
    .map((line) => String(line || '').trim().replace(/^[-•*]\s+/, ''))
    .filter(Boolean);
};

const shortenKickoffLabel = (raw: string, maxLen: number = 34) => {
  let text = String(raw ?? '').trim();
  if (!text) return '';
  text = text.replace(/^[\u200B-\u200D\uFEFF]+/, '').trim();
  text = text.replace(/^[-•*]+\s*/, '').trim();
  text = text.replace(/^focus\s*[-—:]\s*/i, '').trim();
  const separators = [':', '—', '-'];
  for (const sep of separators) {
    const idx = text.indexOf(sep);
    if (idx > 3 && idx < 44) {
      const left = text.slice(0, idx).trim();
      if (left.length >= 4) {
        text = left;
        break;
      }
    }
  }
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/[.,"'`]+$/g, '').trim();
  if (text.length > maxLen) {
    text = `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
  }
  return text;
};

const deriveKickoffFillLabels = (questions: string[], answers: string[], otherNotes?: string) => {
  const pairs = (Array.isArray(questions) ? questions : []).map((q, i) => ({
    q: String(q ?? ''),
    qLower: String(q ?? '').toLowerCase(),
    a: String((Array.isArray(answers) ? answers[i] : '') ?? '').trim(),
    aLower: String((Array.isArray(answers) ? answers[i] : '') ?? '').toLowerCase(),
  }));

  const labels: string[] = [];
  labels.push('Waste', 'Checklist', 'Breakage');

  const adminAnswer = pairs.find((p) => p.qLower.includes('additional admin blocks'))?.a ?? '';
  parseAnswerList(adminAnswer).forEach((item) => {
    const shortened = shortenKickoffLabel(item, 26);
    if (shortened) labels.push(shortened);
  });

  if (pairs.some((p) => p.a && p.qLower.includes('breakage'))) labels.unshift('Breakage');
  if (pairs.some((p) => p.a && p.qLower.includes('inventory'))) labels.unshift('Inventory');
  if (pairs.some((p) => p.a && (p.qLower.includes('team development') || p.qLower.includes('coaching')))) labels.unshift('Coaching');
  if (pairs.some((p) => p.a && p.qLower.includes('bottlenecks'))) labels.unshift('Bottlenecks');
  if (pairs.some((p) => p.a && p.qLower.includes('deep focus block'))) labels.unshift('Deep Focus');

  const other = String(otherNotes ?? '').trim();
  if (other) {
    parseAnswerList(other).slice(0, 6).forEach((item) => {
      const shortened = shortenKickoffLabel(item, 26);
      if (shortened) labels.push(shortened);
    });
  }

  const fallbackDefaults = ['Follow-ups', 'Email', 'Admin'];
  if (labels.length === 0) labels.push(...fallbackDefaults);

  const seen = new Set<string>();
  return labels.filter((l) => {
    const key = l.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractAvailabilityWindowFromText = (raw: string) => {
  const text = String(raw || '').trim();
  if (!text) return { start: null as number | null, end: null as number | null };

  const rangeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|\-|–)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (rangeMatch) {
    const start = parseFlexibleTimeToMinutes(rangeMatch[1]);
    const end = parseFlexibleTimeToMinutes(rangeMatch[2]);
    return { start, end };
  }

  const startMatch = text.match(/\b(?:start|available|in|begin)\b[^0-9]*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  const endMatch = text.match(/\b(?:done|leave|out|until|end|hard\s*stop)\b[^0-9]*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  const start = startMatch ? parseFlexibleTimeToMinutes(startMatch[1]) : null;
  const end = endMatch ? parseFlexibleTimeToMinutes(endMatch[1]) : null;
  return { start, end };
};

const extractEnergyPeakFromText = (raw: string): KickoffEnergyPeak | null => {
  const text = String(raw || '').toLowerCase();
  if (!text) return null;
  if (text.includes('morning')) return 'morning';
  if (text.includes('midday') || text.includes('lunch') || text.includes('noon')) return 'midday';
  if (text.includes('afternoon')) return 'afternoon';
  if (text.includes('evening') || text.includes('night')) return 'evening';
  return null;
};

const subtractRanges = (base: { start: number; end: number }, blocks: Array<{ start: number; end: number }>) => {
  const merged = mergeOverlappingRanges(blocks) as Array<{ start: number; end: number }>;
  const result: Array<{ start: number; end: number }> = [];
  let cursor = base.start;
  merged.forEach((b) => {
    const start = Math.max(base.start, b.start);
    const end = Math.min(base.end, b.end);
    if (end <= base.start || start >= base.end) return;
    if (start > cursor) result.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  });
  if (cursor < base.end) result.push({ start: cursor, end: base.end });
  return result;
};

export const planEightHourScheduleFromKickoffInterview = (params: {
  now: Date;
  questions: string[];
  answers: string[];
  otherNotes?: string;
  assistantMemory: unknown;
  eventOpsItems?: Array<{ id: string; kind: string; event_date: string; name: string; location: string | null; serving_time: string | null }>;
  standardScheduleStart?: string | null;
  standardScheduleEnd?: string | null;
  standardScheduleDays?: string | null;
}) => {
  const now = params.now;
  const answers = Array.isArray(params.answers) ? params.answers : [];
  const assistantMemory = params.assistantMemory;
  const assistantText = extractAssistantMemoryText(assistantMemory);

  const top3Answer = String(answers[0] || '').trim();
  const energyAnswer = String(answers[1] || '').trim();
  const availabilityAnswer = String(answers[2] || '').trim();

  const priorities = parseAnswerList(top3Answer).slice(0, 3).map((p) => shortenKickoffLabel(p, 40)).filter(Boolean);
  const energyPeak = extractEnergyPeakFromText(energyAnswer);

  const extractShiftFromMemory = () => {
    const match = assistantText.match(/\bshift\b[^a-z]*(morning|afternoon|midnight)\b/i);
    return match ? match[1].toLowerCase() : null;
  };
  const extractStandardScheduleFromMemory = () => {
    const match = assistantText.match(/\bstandard\s*schedule\b[\s\S]*?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|\-|–)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (!match) return null;
    const start = parseFlexibleTimeToMinutes(match[1]);
    const end = parseFlexibleTimeToMinutes(match[2]);
    if (start == null || end == null) return null;
    return clampMinutesRange({ start, end });
  };
  const extractStandardScheduleFromProfile = () => {
    const startRaw = String(params.standardScheduleStart ?? '').trim();
    const endRaw = String(params.standardScheduleEnd ?? '').trim();
    if (!startRaw || !endRaw) return null;
    const start = parseFlexibleTimeToMinutes(startRaw);
    const end = parseFlexibleTimeToMinutes(endRaw);
    if (start == null || end == null) return null;
    return clampMinutesRange({ start, end });
  };

  const defaultByShift = (shift: string | null) => {
    if (shift === 'morning') return { start: 8 * 60, end: 18 * 60 };
    if (shift === 'afternoon') return { start: 15 * 60, end: 23 * 60 };
    if (shift === 'midnight') return null;
    return { start: 8 * 60, end: 18 * 60 };
  };

  const availability = extractAvailabilityWindowFromText(availabilityAnswer);
  const standard = extractStandardScheduleFromProfile() ?? extractStandardScheduleFromMemory();
  const shift = extractShiftFromMemory();
  const shiftDefault = defaultByShift(shift);
  const workHours = extractWorkHoursFromMemory(assistantMemory) ?? { start: 8 * 60, end: 18 * 60 };

  const inferredStart = standard?.start ?? (availability.start != null ? availability.start : shiftDefault?.start ?? workHours.start);
  const inferredEnd = standard?.end ?? (availability.end != null ? availability.end : shiftDefault?.end ?? workHours.end);
  const dayRange = clampMinutesRange({ start: inferredStart, end: inferredEnd });
  if (!dayRange) {
    return { ok: false as const, error: 'I need a valid start and end time for today (e.g., 8:00 AM - 6:00 PM).' };
  }

  const warnings: string[] = [];

  const makeId = (prefix: string) => `${prefix}-${now.getTime()}-${Math.random().toString(16).slice(2)}`;
  const pushItem = (items: ScheduleItem[], item: ScheduleItem) => {
    if (!item?.time || !item?.title) return;
    const range = parseScheduleRangeToMinutes(item.time);
    if (!range) return;
    if (range.end <= dayRange.start || range.start >= dayRange.end) return;
    items.push(item);
  };

  const fixed: ScheduleItem[] = [];

  const lunch = extractLunchFromMemory(assistantMemory);
  if (lunch) {
    const t = `${minutesToTimeString(lunch.start)} - ${minutesToTimeString(lunch.end)}`;
    pushItem(fixed, { id: makeId('rule-lunch'), time: t, title: 'Lunch', completed: false, source: 'rule' });
  }

  if (dayRange.start < 8 * 60 && 8 * 60 + 30 <= dayRange.end) {
    pushItem(fixed, { id: makeId('rule-briefing-am'), time: `${minutesToTimeString(8 * 60)} - ${minutesToTimeString(8 * 60 + 30)}`, title: 'Morning Briefing', completed: false, source: 'rule' });
  }
  if (dayRange.end > 15 * 60 && 15 * 60 + 30 <= dayRange.end) {
    pushItem(fixed, { id: makeId('rule-briefing-pm'), time: `${minutesToTimeString(15 * 60)} - ${minutesToTimeString(15 * 60 + 30)}`, title: 'Afternoon Briefing', completed: false, source: 'rule' });
  }

  const pairs = (Array.isArray(params.questions) ? params.questions : []).map((q, i) => ({
    qLower: String(q ?? '').toLowerCase(),
    a: String((Array.isArray(answers) ? answers[i] : '') ?? '').trim(),
  }));
  const adminAnswer = pairs.find((p) => p.qLower.includes('additional admin blocks'))?.a ?? '';
  const additionalAdmin = parseAnswerList(adminAnswer).map((x) => shortenKickoffLabel(x, 18)).filter(Boolean);

  const adminParts = ['Waste', 'Checklist', 'Breakage', ...additionalAdmin];
  const adminTitle = `Admin — ${adminParts.slice(0, 4).join('/')}${adminParts.length > 4 ? '…' : ''}`;
  const adminDuration = Math.min(120, 60 + Math.max(0, adminParts.length - 3) * 15);
  const preferredAdminStart = 16 * 60 + 30;
  const adminStart = Math.max(dayRange.start, Math.min(preferredAdminStart, dayRange.end - adminDuration));
  const adminEnd = adminStart + adminDuration;
  if (adminEnd > adminStart && adminEnd <= dayRange.end) {
    pushItem(fixed, { id: makeId('rule-admin'), time: `${minutesToTimeString(adminStart)} - ${minutesToTimeString(adminEnd)}`, title: adminTitle, completed: false, source: 'rule' });
  }

  const fixedRanges = [...fixed]
    .map((it) => parseScheduleRangeToMinutes(it.time))
    .filter(Boolean) as Array<{ start: number; end: number }>;

  const free = subtractRanges(dayRange, fixedRanges);
  const freeMinutes = free.reduce((sum, r) => sum + Math.max(0, r.end - r.start), 0);
  if (freeMinutes < 180) warnings.push('Very limited free time detected due to fixed blocks; consider adjusting times.');

  const placeBlockInWindow = (preferred: { start: number; end: number }, duration: number) => {
    const window = clampMinutesRange({ start: Math.max(dayRange.start, preferred.start), end: Math.min(dayRange.end, preferred.end) });
    if (!window) return null;
    for (const r of free) {
      const s = Math.max(r.start, window.start);
      const e = Math.min(r.end, window.end);
      if (e - s >= duration) return { start: s, end: s + duration };
    }
    return null;
  };

  const focusDuration = 90;
  const focusLabel = priorities[0] ? `Focus — ${priorities[0]}` : 'Focus';
  const preferredWindow =
    energyPeak === 'morning'
      ? { start: 9 * 60, end: 11 * 60 }
      : energyPeak === 'afternoon'
        ? { start: 13 * 60, end: 15 * 60 }
        : energyPeak === 'midday'
          ? { start: 11 * 60, end: 13 * 60 }
          : { start: 15 * 60, end: 17 * 60 };

  const focusSlot = placeBlockInWindow(preferredWindow, focusDuration) ?? placeBlockInWindow({ start: dayRange.start, end: dayRange.end }, focusDuration);
  if (!focusSlot) {
    return { ok: false as const, error: 'No available slot for a Focus Block without colliding with fixed blocks. Adjust your availability window or rules.' };
  }

  const schedule: ScheduleItem[] = [];
  fixed.forEach((it) => schedule.push(it));
  schedule.push({ id: makeId('auto-focus'), time: `${minutesToTimeString(focusSlot.start)} - ${minutesToTimeString(focusSlot.end)}`, title: focusLabel, completed: false });

  const remainingPriorities = priorities.slice(1);
  const fillLabels = deriveKickoffFillLabels(params.questions, answers, params.otherNotes);
  let fillIdx = 0;

  const occupiedAfterFocus = [...schedule]
    .map((it) => parseScheduleRangeToMinutes(it.time))
    .filter(Boolean) as Array<{ start: number; end: number }>;
  const freeAfter = subtractRanges(dayRange, occupiedAfterFocus);

  remainingPriorities.forEach((p) => {
    const label = `Ops — ${p}`;
    const slot = freeAfter.find((r) => r.end - r.start >= 60);
    if (!slot) return;
    const start = slot.start;
    const end = start + 60;
    schedule.push({ id: makeId('auto-ops'), time: `${minutesToTimeString(start)} - ${minutesToTimeString(end)}`, title: label, completed: false });
    occupiedAfterFocus.push({ start, end });
    const nextFree = subtractRanges(dayRange, occupiedAfterFocus);
    freeAfter.splice(0, freeAfter.length, ...nextFree);
  });

  const bufferCount = Math.min(2, Math.max(0, freeAfter.length));
  for (let i = 0; i < bufferCount; i++) {
    const slot = freeAfter.find((r) => r.end - r.start >= 45);
    if (!slot) break;
    const start = slot.start;
    const end = start + Math.min(60, slot.end - slot.start);
    const title = fillLabels[fillIdx++ % fillLabels.length] || 'Ops Buffer';
    schedule.push({ id: makeId('auto-fill'), time: `${minutesToTimeString(start)} - ${minutesToTimeString(end)}`, title, completed: false });
    occupiedAfterFocus.push({ start, end });
    const nextFree = subtractRanges(dayRange, occupiedAfterFocus);
    freeAfter.splice(0, freeAfter.length, ...nextFree);
  }

  schedule.sort((a, b) => {
    const pa = parseScheduleRangeToMinutes(String(a.time || ''));
    const pb = parseScheduleRangeToMinutes(String(b.time || ''));
    if (!pa && !pb) return 0;
    if (!pa) return 1;
    if (!pb) return -1;
    return pa.start - pb.start;
  });

  return { ok: true as const, span: { start: dayRange.start, end: dayRange.end }, schedule, priorities, warnings };
};
