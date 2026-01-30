import { describe, expect, it } from 'vitest';
import type { DailyOpsMetricEntry, WeeklyLogItem } from '../components/types';
import { buildWeeklyDashboardSummary, getWeekStartMonday } from '../lib/weeklyDashboard';

describe('weeklyDashboard', () => {
  it('computes Monday week start (Sunday case)', () => {
    const sunday = new Date('2026-02-01T12:00:00');
    const start = getWeekStartMonday(sunday);
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    expect(`${y}-${m}-${d}`).toBe('2026-01-26');
    expect(start.getDay()).toBe(1);
  });

  it('aggregates morale and filters accomplishments/challenges by Mon→today', () => {
    const weeklyLog: WeeklyLogItem[] = [
      { id: '1', date: '2026-01-25', type: 'accomplishment', text: 'Old item' },
      { id: '2', date: '2026-01-26', type: 'accomplishment', text: 'Launched Digital Handover' },
      { id: '3', date: '2026-01-30', type: 'challenge', text: 'Clean Towel Shortage' },
    ];

    const dailyOpsMetrics: DailyOpsMetricEntry[] = [
      { id: 'm1', date: '2026-01-26', moraleScore: 4, attendanceIssues: '', createdAt: 0 },
      { id: 'm2', date: '2026-01-27', moraleScore: 5, attendanceIssues: 'One late', createdAt: 0 },
      { id: 'm3', date: '2026-01-25', moraleScore: 1, attendanceIssues: '', createdAt: 0 },
    ];

    const summary = buildWeeklyDashboardSummary({
      today: new Date('2026-01-30T10:00:00'),
      weeklyLog,
      dailyOpsMetrics,
      dailyLogs: [
        { date: '2026-01-29', breakage_cost: 2000, team_morale: 3, achievements: ['Completed OPEQ Requisition'], challenges: [] },
        { date: '2026-01-25', breakage_cost: 9999, team_morale: 1, achievements: ['Out of range'], challenges: ['Out of range'] },
      ],
    });

    expect(summary.highlights).toEqual(['Launched Digital Handover', 'Completed OPEQ Requisition']);
    expect(summary.lowlights).toEqual(['Clean Towel Shortage']);
    expect(summary.financials.total_breakage).toBe(2000);
    expect(summary.metrics.avg_morale).toBe(4);
  });
});
