import { describe, expect, it } from 'vitest';
import { formatWeekRangeLabel, parseYmd, startOfWeekSunday, toWeekStartYmd } from '../components/dutyRosterDateUtils';

describe('dutyRosterDateUtils', () => {
  it('startOfWeekSunday returns Sunday as week start', () => {
    const date = new Date(2026, 1, 4);
    const start = startOfWeekSunday(date);
    expect(start.getDay()).toBe(0);
  });

  it('startOfWeekSunday keeps Sunday unchanged', () => {
    const sunday = new Date(2026, 1, 1);
    const start = startOfWeekSunday(sunday);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(1);
    expect(start.getDate()).toBe(1);
    expect(start.getDay()).toBe(0);
  });

  it('toWeekStartYmd handles year boundaries', () => {
    const date = new Date(2025, 11, 31);
    const ymd = toWeekStartYmd(date);
    const parsed = parseYmd(ymd);
    expect(parsed).not.toBeNull();
    expect(parsed!.getDay()).toBe(0);
  });

  it('parseYmd rejects invalid strings', () => {
    expect(parseYmd('2026-13-01')).toBeNull();
    expect(parseYmd('not-a-date')).toBeNull();
  });

  it('formatWeekRangeLabel includes a range delimiter', () => {
    const label = formatWeekRangeLabel(new Date(2026, 0, 4));
    expect(label).toContain('–');
  });
});

