import { describe, expect, it } from 'vitest';
import { coerceDashboardVisibilityMap } from '../lib/dashboardVisibility';

describe('dashboardVisibility performance', () => {
  it('coerceDashboardVisibilityMap stays efficient under repeated calls', () => {
    const start = performance.now();
    let last: any = null;
    for (let i = 0; i < 50_000; i++) {
      last = coerceDashboardVisibilityMap({ delegated_tasks: i % 2 === 0, briefing_notes: i % 3 === 0 });
    }
    const elapsed = performance.now() - start;
    expect(typeof last?.delegated_tasks).toBe('boolean');
    expect(elapsed).toBeLessThan(1000);
  });
});

