import type { DailyOpsMetricEntry, WeeklyLogItem } from '../components/types';

export type WeeklyDashboardSummary = {
  week_of: string;
  financials: { total_breakage: number };
  metrics: { avg_morale: number | null };
  highlights: string[];
  lowlights: string[];
};

const toYmdLocal = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getWeekStartMonday = (today: Date) => {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const day = t.getDay();
  const diff = (day + 6) % 7;
  t.setDate(t.getDate() - diff);
  return t;
};

const formatMonthDay = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const formatMonthDayYear = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const formatWeekOfLabel = (start: Date, end: Date) => {
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${formatMonthDay(start)} - ${formatMonthDayYear(end)}`;
  }
  if (sameYear) {
    return `${formatMonthDay(start)} - ${formatMonthDayYear(end)}`;
  }
  return `${formatMonthDayYear(start)} - ${formatMonthDayYear(end)}`;
};

const uniqueNonEmpty = (items: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = String(raw || '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
};

export const buildWeeklyDashboardSummary = (params: {
  today?: Date;
  weeklyLog: WeeklyLogItem[];
  dailyOpsMetrics?: DailyOpsMetricEntry[];
  dailyLogs?: Array<{ date: string; breakage_cost?: number; team_morale?: number | null; achievements?: string[]; challenges?: string[] }>;
}): WeeklyDashboardSummary => {
  const today = params.today ? new Date(params.today) : new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = getWeekStartMonday(today);

  const startYmd = toYmdLocal(weekStart);
  const endYmd = toYmdLocal(today);

  const weeklyLogInRange = (params.weeklyLog || []).filter(it => it.date >= startYmd && it.date <= endYmd);
  const opsInRange = (params.dailyOpsMetrics || []).filter(it => it.date >= startYmd && it.date <= endYmd);
  const dailyLogsInRange = (params.dailyLogs || []).filter(it => it.date >= startYmd && it.date <= endYmd);

  const moraleValues = [
    ...opsInRange.map(it => it.moraleScore).filter((v): v is number => typeof v === 'number' && !Number.isNaN(v)),
    ...dailyLogsInRange.map(it => it.team_morale).filter((v): v is number => typeof v === 'number' && !Number.isNaN(v)),
  ];

  const avg_morale = moraleValues.length > 0
    ? Math.round((moraleValues.reduce((sum, v) => sum + v, 0) / moraleValues.length) * 10) / 10
    : null;

  const total_breakage = dailyLogsInRange.reduce((acc, log) => acc + (Number(log.breakage_cost) || 0), 0);

  const highlights = uniqueNonEmpty([
    ...weeklyLogInRange.filter(it => it.type === 'accomplishment').map(it => it.text),
    ...dailyLogsInRange.flatMap(it => Array.isArray(it.achievements) ? it.achievements : []),
  ]);

  const lowlights = uniqueNonEmpty([
    ...weeklyLogInRange.filter(it => it.type === 'challenge').map(it => it.text),
    ...dailyLogsInRange.flatMap(it => Array.isArray(it.challenges) ? it.challenges : []),
  ]);

  return {
    week_of: formatWeekOfLabel(weekStart, today),
    financials: { total_breakage },
    metrics: { avg_morale },
    highlights,
    lowlights,
  };
};

