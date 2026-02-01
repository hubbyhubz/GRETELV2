import { describe, expect, it } from 'vitest';
import { startOfWeekSunday } from '../components/dutyRosterDateUtils';

describe('dutyRoster performance', () => {
  it('startOfWeekSunday stays efficient under repeated calls', () => {
    const base = new Date(2026, 0, 1);
    const start = performance.now();
    let last: Date | null = null;
    for (let i = 0; i < 100_000; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + (i % 365));
      last = startOfWeekSunday(d);
    }
    const elapsed = performance.now() - start;
    expect(last).not.toBeNull();
    expect(elapsed).toBeLessThan(1000);
  });
});

