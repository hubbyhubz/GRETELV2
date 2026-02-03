import type { BriefingInputItem, DailyOpsMetricEntry, DelegatedTaskItem, ReminderItem, StaffPerformanceLogEntry } from '../components/types';

export type ConsolidationSourceKey =
  | 'reminders'
  | 'delegated_tasks'
  | 'log_information'
  | 'briefing_pointers'
  | 'coaching_notes';

export type BriefingConsolidationStatus = 'idle' | 'running' | 'ready' | 'error';

export type BriefingConsolidationMeta = {
  status: BriefingConsolidationStatus;
  requiredSources: ConsolidationSourceKey[];
  missingSources: ConsolidationSourceKey[];
  counts: Record<ConsolidationSourceKey, number>;
  generatedAt: number | null;
  error: string | null;
};

export type BriefingConsolidationInput = {
  briefingType: 'morning' | 'afternoon';
  fullDate: string;
  interviewQuestions: string[];
  interviewAnswers: string[];
  otherNotes: string;
  coachingNotes: string;
  reminders: ReminderItem[] | null | undefined;
  delegatedTasks: DelegatedTaskItem[] | null | undefined;
  briefingPointers: BriefingInputItem[] | null | undefined;
  dailyOpsMetrics: DailyOpsMetricEntry[] | null | undefined;
  staffPerformanceLog: StaffPerformanceLogEntry[] | null | undefined;
};

export type BriefingConsolidationResult = {
  ok: boolean;
  text: string;
  meta: BriefingConsolidationMeta;
};

const requiredSources: ConsolidationSourceKey[] = [
  'reminders',
  'delegated_tasks',
  'log_information',
  'briefing_pointers',
  'coaching_notes',
];

const splitLines = (value: string): string[] =>
  String(value || '')
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter(Boolean);

const bulletList = (items: string[]): string =>
  items.length > 0 ? items.map((x) => `- ${x}`).join('\n') : '- (none)';

const safeArray = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

const normalizePointerType = (raw: string): 'briefing_pointer' | 'coaching_note' | 'log_information' => {
  const t = String(raw || '').trim().toLowerCase();
  if (t.includes('coach')) return 'coaching_note';
  if (t.includes('log')) return 'log_information';
  return 'briefing_pointer';
};

export const buildBriefingConsolidation = (input: BriefingConsolidationInput): BriefingConsolidationResult => {
  const missing: ConsolidationSourceKey[] = [];

  const remindersOk = Array.isArray(input.reminders);
  const delegatedOk = Array.isArray(input.delegatedTasks);
  const pointersOk = Array.isArray(input.briefingPointers);
  const metricsOk = Array.isArray(input.dailyOpsMetrics);
  const staffLogOk = Array.isArray(input.staffPerformanceLog);

  if (!remindersOk) missing.push('reminders');
  if (!delegatedOk) missing.push('delegated_tasks');
  if (!pointersOk) missing.push('briefing_pointers');
  if (!(metricsOk && staffLogOk)) missing.push('log_information');
  if (typeof input.coachingNotes !== 'string') missing.push('coaching_notes');

  const reminders = safeArray(input.reminders);
  const delegatedTasks = safeArray(input.delegatedTasks);
  const pointers = safeArray(input.briefingPointers);
  const dailyOpsMetrics = safeArray(input.dailyOpsMetrics);
  const staffPerformanceLog = safeArray(input.staffPerformanceLog);

  const coaching = splitLines(input.coachingNotes);
  const other = splitLines(input.otherNotes);

  const pointerText = pointers
    .map((p) => ({ type: normalizePointerType((p as any)?.type), text: String((p as any)?.text || '').trim() }))
    .filter((p) => Boolean(p.text));
  const briefingPointerLines = pointerText.filter((p) => p.type === 'briefing_pointer').map((p) => p.text);
  const coachingPointerLines = pointerText.filter((p) => p.type === 'coaching_note').map((p) => p.text);
  const logPointerLines = pointerText.filter((p) => p.type === 'log_information').map((p) => p.text);

  const qas = input.interviewQuestions
    .map((q, idx) => {
      const a = String(input.interviewAnswers?.[idx] ?? '').trim();
      const answer = a || '(no answer provided)';
      return `Q${idx + 1}: ${q}\nA${idx + 1}: ${answer}`;
    })
    .join('\n\n');

  const opsMetricsLines = dailyOpsMetrics
    .slice(-3)
    .map((m) => {
      const morale = m.moraleScore == null ? 'N/A' : `${m.moraleScore}/5`;
      const attendance = String(m.attendanceIssues || '').trim() || 'None reported';
      return `${m.date}: Morale ${morale}; Attendance: ${attendance}`;
    });

  const staffLogLines = staffPerformanceLog
    .slice(-6)
    .map((s) => String(s.text || '').trim())
    .filter(Boolean);

  const title = `${input.briefingType.toUpperCase()} BRIEFING - CONSOLIDATED NOTES - ${input.fullDate}`;
  const text = [
    title,
    '',
    '1. INTERVIEW ANSWERS:',
    qas || '(no answers)',
    '',
    '2. COACHING NOTES:',
    bulletList([...coaching, ...coachingPointerLines]),
    '',
    '3. OTHER UPDATES / NOTES:',
    bulletList(other),
    '',
    '4. REMINDERS:',
    bulletList(reminders.map((r) => String(r.text || '').trim()).filter(Boolean)),
    '',
    '5. DELEGATED TASKS:',
    bulletList(
      delegatedTasks.map((t) => {
        const assignee = String(t.assigneeName || '').trim();
        const deadline = String(t.deadline || '').trim();
        const suffix = [assignee ? `Assignee: ${assignee}` : '', deadline ? `Deadline: ${deadline}` : ''].filter(Boolean).join(', ');
        return suffix ? `${t.text} (${suffix})` : t.text;
      }).filter(Boolean)
    ),
    '',
    '6. BRIEFING POINTERS:',
    bulletList(briefingPointerLines),
    '',
    '7. LOG INFORMATION:',
    bulletList([...logPointerLines, ...opsMetricsLines, ...staffLogLines]),
  ].join('\n');

  const counts: Record<ConsolidationSourceKey, number> = {
    reminders: reminders.length,
    delegated_tasks: delegatedTasks.length,
    log_information: logPointerLines.length + opsMetricsLines.length + staffLogLines.length,
    briefing_pointers: briefingPointerLines.length,
    coaching_notes: coaching.length + coachingPointerLines.length,
  };

  const meta: BriefingConsolidationMeta = {
    status: missing.length > 0 ? 'error' : 'ready',
    requiredSources: [...requiredSources],
    missingSources: missing,
    counts,
    generatedAt: Date.now(),
    error: missing.length > 0 ? `Missing required data sources: ${missing.join(', ')}` : null,
  };

  return { ok: missing.length === 0, text, meta };
};
