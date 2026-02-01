import { describe, expect, it } from 'vitest';
import { coerceDashboardVisibilityMap, DEFAULT_DASHBOARD_VISIBILITY } from '../lib/dashboardVisibility';

describe('dashboardVisibility', () => {
  it('coerceDashboardVisibilityMap falls back to defaults', () => {
    const map = coerceDashboardVisibilityMap({ delegated_tasks: false });
    expect(map.delegated_tasks).toBe(false);
    expect(map.briefing_notes).toBe(DEFAULT_DASHBOARD_VISIBILITY.briefing_notes);
  });
});
