import type { BriefingInputItem, DailyOpsMetricEntry, DelegatedTaskItem, EventOpsItem, ReminderItem, StaffPerformanceLogEntry } from '../components/types';

export type BriefingQuestionHintType =
  | 'operational_focus'
  | 'staffing_coverage'
  | 'incidents_risks'
  | 'coaching_point'
  | 'handoff_progress'
  | 'handoff_blockers'
  | 'handoff_items'
  | 'tomorrow_priority';

type HintContext = {
  now: Date;
  reminders: ReminderItem[];
  briefingInputs: BriefingInputItem[];
  delegatedTasks: DelegatedTaskItem[];
  priorityForTomorrow: string;
  dailyOpsMetrics: DailyOpsMetricEntry[];
  staffPerformanceLog: StaffPerformanceLogEntry[];
  googleCalendarEvents: any[];
  eventOpsItems: EventOpsItem[];
};

const toYmdLocal = (date: Date): string => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const stripBullet = (value: string): string => String(value || '').replace(/^[-•*]\s+/, '').trim();

const truncate = (value: string, max = 60): string => {
  const s = String(value || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
};

const extractStaffingNote = (ctx: HintContext): string | null => {
  const keywords = /\b(off|leave|on\s+leave|sick|late|leaving)\b/i;

  const sources: string[] = [];
  ctx.dailyOpsMetrics.forEach((m) => {
    const sameDay = String(m.date || '').slice(0, 10) === toYmdLocal(ctx.now);
    if (!sameDay) return;
    if (m.attendanceIssues) sources.push(String(m.attendanceIssues));
  });
  ctx.reminders.forEach((r) => sources.push(String(r.text || '')));
  ctx.briefingInputs.forEach((b) => sources.push(String(b.text || '')));

  const candidates = sources.map(stripBullet).filter(Boolean);
  for (const line of candidates) {
    if (!keywords.test(line)) continue;

    const m1 = line.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b[\s:,-]*(?:is\s+)?\b(off|on\s+leave|leave|sick|late|leaving)\b/i);
    const m2 = line.match(/\b(off|on\s+leave|leave|sick|late|leaving)\b[\s:,-]*(?:today\s*)?\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i);
    const rawName = (m1?.[1] || m2?.[2] || '').trim();
    const name = rawName.replace(/\s+\b(is|was)\b$/i, '').trim();
    const statusRaw = (m1?.[2] || m2?.[1] || '').trim();
    if (!name) return `System Note: ${truncate(line, 70)}`;
    const status = statusRaw.toUpperCase().replace(/\s+/g, ' ');
    return `System Note: ${name} is marked ${status} today`;
  }
  return null;
};

const extractIncidentNote = (ctx: HintContext): string | null => {
  const keyword = /\b(breakage|inventory|towel|towels|shortage|low|out\s+of|incident|risk|hazard|complaint)\b/i;
  const sources: string[] = [];

  ctx.staffPerformanceLog.forEach((s) => sources.push(String(s.text || '')));
  ctx.reminders.forEach((r) => sources.push(String(r.text || '')));
  ctx.briefingInputs.forEach((b) => sources.push(String(b.text || '')));

  const candidates = sources.map(stripBullet).filter(Boolean);
  for (const line of candidates) {
    if (!keyword.test(line)) continue;
    const lowered = line.toLowerCase();
    if (/\btowel(s)?\b/.test(lowered) && (/\blow\b/.test(lowered) || /\bshort\b/.test(lowered) || /\bshortage\b/.test(lowered))) {
      return 'System Alert: Clean Towel Supply Low';
    }
    if (/\bbreakage\b/.test(lowered)) {
      return 'System Alert: Breakage reported';
    }
    return `System Alert: ${truncate(line, 70)}`;
  }
  return null;
};

const parseEventStart = (event: any): Date | null => {
  const start = event?.start?.dateTime || event?.start?.date || event?.startTime || event?.start;
  if (!start) return null;
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const extractUpcomingCalendarNote = (ctx: HintContext): string | null => {
  const today = toYmdLocal(ctx.now);
  const candidates = (Array.isArray(ctx.googleCalendarEvents) ? ctx.googleCalendarEvents : [])
    .map((e) => ({ e, start: parseEventStart(e) }))
    .filter((row) => row.start && toYmdLocal(row.start) === today) as Array<{ e: any; start: Date }>;

  candidates.sort((a, b) => a.start.getTime() - b.start.getTime());
  const upcoming = candidates.find((c) => c.start.getTime() >= ctx.now.getTime() - 5 * 60 * 1000) ?? candidates[0];
  if (upcoming) {
    const title = String(upcoming.e?.summary || upcoming.e?.title || upcoming.e?.name || 'Calendar event').trim();
    const time = upcoming.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `Upcoming: ${truncate(title, 40)} at ${time}`;
  }

  const eventOpsToday = (Array.isArray(ctx.eventOpsItems) ? ctx.eventOpsItems : [])
    .filter((it) => String(it?.event_date || '') === today)
    .map((it) => {
      const name = String(it?.name || 'Event').trim();
      const serving = String(it?.serving_time || '').slice(0, 5);
      return { name, serving };
    })
    .filter((it) => Boolean(it.serving));
  if (eventOpsToday.length > 0) {
    const first = eventOpsToday[0];
    return `Upcoming: ${truncate(first.name, 40)} at ${first.serving}`;
  }

  return null;
};

const extractHandoffProgressNote = (ctx: HintContext): string | null => {
  const openTasks = (Array.isArray(ctx.delegatedTasks) ? ctx.delegatedTasks : []).filter((t) => !t.completed);
  if (openTasks.length > 0) return `System Note: ${openTasks.length} delegated task${openTasks.length === 1 ? '' : 's'} still open`;
  const upcoming = extractUpcomingCalendarNote(ctx);
  if (upcoming) return `System Note: ${upcoming}`;
  return null;
};

const extractHandoffItemsNote = (ctx: HintContext): string | null => {
  const now = ctx.now;
  const todayYmd = toYmdLocal(now);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const openTasks = (Array.isArray(ctx.delegatedTasks) ? ctx.delegatedTasks : [])
    .filter((t) => !t.completed)
    .map((t) => ({ text: String(t.text || '').trim(), deadline: String(t.deadline || '').trim() }))
    .filter((t) => Boolean(t.text));

  const dueTodayOrOverdue = openTasks.filter((t) => {
    const d = t.deadline;
    if (!d) return false;
    if (/\btoday\b/i.test(d)) return true;
    if (d.startsWith(todayYmd)) return true;
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.getTime() <= endOfToday.getTime();
  });

  if (dueTodayOrOverdue.length === 0) return null;
  const example = dueTodayOrOverdue[0]?.text ? truncate(dueTodayOrOverdue[0].text, 50) : '';
  return example
    ? `System Note: Handoff due items exist (e.g., ${example})`
    : 'System Note: Handoff due items exist';
};

const extractTomorrowPriorityNote = (ctx: HintContext): string | null => {
  const p = String(ctx.priorityForTomorrow || '').trim();
  if (!p) return null;
  return `System Note: Current “Top Priority for Tomorrow” is ${truncate(p, 55)}`;
};

export const getQuestionLabel = (
  baseQuestion: string,
  type: BriefingQuestionHintType,
  ctx: HintContext
): string => {
  const base = String(baseQuestion || '').trim();
  if (!base) return '';

  let note: string | null = null;
  if (type === 'staffing_coverage') note = extractStaffingNote(ctx);
  if (type === 'incidents_risks') note = extractIncidentNote(ctx);
  if (type === 'operational_focus') note = extractUpcomingCalendarNote(ctx);
  if (type === 'handoff_progress') note = extractHandoffProgressNote(ctx);
  if (type === 'handoff_blockers') note = extractIncidentNote(ctx);
  if (type === 'handoff_items') note = extractHandoffItemsNote(ctx);
  if (type === 'tomorrow_priority') note = extractTomorrowPriorityNote(ctx);

  return note ? `${base} (${note})` : base;
};
