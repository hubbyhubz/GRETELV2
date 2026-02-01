import { addDays, pad2, toYmd } from './eventOpsCalendarUtils';

export const parseYmd = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
};

export const startOfWeekSunday = (date: Date) => {
  const day = date.getDay();
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), -day);
};

export const formatWeekRangeLabel = (weekStartSunday: Date) => {
  const weekEnd = addDays(weekStartSunday, 6);
  const left = `${weekStartSunday.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
  const right = `${weekEnd.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
  return `${left} – ${right}`;
};

export const toWeekStartYmd = (date: Date) => toYmd(startOfWeekSunday(date));

export const daysOfWeek = (weekStartSunday: Date) =>
  Array.from({ length: 7 }, (_, i) => addDays(weekStartSunday, i));

export const formatYmd = (date: Date) => {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
};

