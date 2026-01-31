import { describe, expect, it } from 'vitest';
import { mergeDashboardStateForCrossDeviceSync } from '../lib/dashboardStateMerge';

describe('mergeDashboardStateForCrossDeviceSync', () => {
  it('merges by id and unions dismissed ids', () => {
    const local = {
      reminders: [{ id: 'r1', text: 'local', completed: false }],
      briefingInputs: [{ id: 'b1', type: 'Briefing Pointer', text: 'local', loggedAt: 1 }],
      delegatedTasks: [{ id: 'd1', assigneeId: 'a', assigneeName: 'A', text: 'task', deadline: 'x', completed: false }],
      staffPerformanceLog: [{ id: 's1', date: '2026-01-01', text: 'note', createdAt: 1 }],
      dismissedDelegatedReminderTaskIds: ['x'],
    };

    const remote = {
      reminders: [{ id: 'r1', text: 'remote', completed: true }, { id: 'r2', text: 'new', completed: false }],
      briefingInputs: [{ id: 'b2', type: 'Log Information', text: 'remote', loggedAt: 2 }],
      delegatedTasks: [{ id: 'd1', assigneeId: 'a', assigneeName: 'A', text: 'task2', deadline: 'y', completed: true }],
      staffPerformanceLog: [{ id: 's2', date: '2026-01-02', text: 'note2', createdAt: 2 }],
      dismissedDelegatedReminderTaskIds: ['y'],
    };

    const merged = mergeDashboardStateForCrossDeviceSync(local as any, remote as any);

    expect(merged.reminders.find(r => r.id === 'r1')?.text).toBe('remote');
    expect(merged.reminders.map(r => r.id).sort()).toEqual(['r1', 'r2']);
    expect(merged.briefingInputs.map(b => b.id).sort()).toEqual(['b1', 'b2']);
    expect(merged.delegatedTasks.find(d => d.id === 'd1')?.text).toBe('task2');
    expect(merged.staffPerformanceLog?.map(s => s.id).sort()).toEqual(['s1', 's2']);
    expect(merged.dismissedDelegatedReminderTaskIds.sort()).toEqual(['x', 'y']);
  });
});

