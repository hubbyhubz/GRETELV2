import { describe, expect, it } from 'vitest';
import { addDays, endOfCalendarGrid, formatMonthTitle, isSameMonth, isSameYmd, startOfCalendarGrid, startOfMonth, toYmd } from '../components/eventOpsCalendarUtils';

describe('eventOpsCalendarUtils', () => {
  it('toYmd formats dates as YYYY-MM-DD', () => {
    const date = new Date(2026, 0, 2);
    expect(toYmd(date)).toBe('2026-01-02');
  });

  it('startOfMonth returns first day of month', () => {
    const date = new Date(2026, 4, 18);
    const first = startOfMonth(date);
    expect(toYmd(first)).toBe('2026-05-01');
  });

  it('startOfCalendarGrid begins on Sunday', () => {
    const date = new Date(2026, 0, 15);
    const start = startOfCalendarGrid(date);
    expect(start.getDay()).toBe(0);
  });

  it('endOfCalendarGrid yields a 42-day grid window', () => {
    const date = new Date(2026, 0, 15);
    const start = startOfCalendarGrid(date);
    const end = endOfCalendarGrid(date);
    expect(toYmd(end)).toBe(toYmd(addDays(start, 41)));
  });

  it('isSameMonth matches month and year', () => {
    const reference = new Date(2026, 0, 1);
    expect(isSameMonth(new Date(2026, 0, 31), reference)).toBe(true);
    expect(isSameMonth(new Date(2026, 1, 1), reference)).toBe(false);
  });

  it('isSameYmd compares by day precision', () => {
    expect(isSameYmd(new Date(2026, 0, 1, 1, 0, 0), new Date(2026, 0, 1, 23, 0, 0))).toBe(true);
  });

  it('formatMonthTitle includes month and year', () => {
    const title = formatMonthTitle(new Date(2026, 0, 10));
    expect(title.toLowerCase()).toContain('january');
    expect(title).toContain('2026');
  });
});
