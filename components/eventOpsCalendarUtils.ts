export const pad2 = (n: number) => n.toString().padStart(2, '0');

export const toYmd = (date: Date) => {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
};

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

export const startOfCalendarGrid = (date: Date) => {
  const first = startOfMonth(date);
  const day = first.getDay();
  return addDays(first, -day);
};

export const endOfCalendarGrid = (date: Date) => addDays(startOfCalendarGrid(date), 41);

export const formatMonthTitle = (date: Date) =>
  date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });

export const isSameMonth = (date: Date, referenceMonth: Date) =>
  date.getMonth() === referenceMonth.getMonth() && date.getFullYear() === referenceMonth.getFullYear();

export const isSameYmd = (a: Date, b: Date) => toYmd(a) === toYmd(b);

