import { describe, expect, it } from 'vitest';
import { applyPriorityOps, applyProjectOps, applyReminderOps, applyScheduleOps, detectEventOpsScheduleClarification, parseDeadlineFromText } from '../components/assistantActionUtils';
import type { ReminderItem } from '../components/types';

describe('assistantActionUtils', () => {
  it('parseDeadlineFromText parses tomorrow relative to now', () => {
    const now = new Date('2026-01-22T10:00:00.000Z');
    const parsed = parseDeadlineFromText('tomorrow', now);
    expect(parsed).not.toBeNull();
    expect(parsed?.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parseDeadlineFromText parses YYYY-MM-DD HH:MM', () => {
    const now = new Date('2026-01-22T10:00:00.000Z');
    const parsed = parseDeadlineFromText('2026-02-15 15:00', now);
    expect(parsed?.deadline).toBe('2026-02-15 15:00');
    expect(parsed?.deadlineISO).toContain('2026-02-15');
  });

  it('applyScheduleOps add and delete works', () => {
    const base = [{ id: 'a', time: 'All Day', title: 'Prep', completed: false }];
    const added = applyScheduleOps(base, [{ op: 'add', item: { time: '09:00 AM - 10:00 AM', title: 'Standup' } }]);
    expect(added.next.length).toBe(2);
    const deleted = applyScheduleOps(added.next, [{ op: 'delete', match: { id: 'a' } }]);
    expect(deleted.next.some(i => i.id === 'a')).toBe(false);
  });

  it('applyScheduleOps returns ambiguity message', () => {
    const base = [
      { id: 'a', time: 'All Day', title: 'Review', completed: false },
      { id: 'b', time: 'All Day', title: 'Review docs', completed: false },
    ];
    const res = applyScheduleOps(base, [{ op: 'delete', match: { titleContains: 'review' } }]);
    expect(res.messages.length).toBe(1);
    expect(res.next.length).toBe(2);
  });

  it('applyPriorityOps update works', () => {
    const base = [{ id: 'p1', text: 'Buy milk', completed: false }];
    const res = applyPriorityOps(base, [{ op: 'update', match: { id: 'p1' }, item: { text: 'Buy oat milk' } }]);
    expect(res.next[0].text).toBe('Buy oat milk');
  });

  it('applyProjectOps add and delete works', () => {
    const base: any[] = [];
    const added = applyProjectOps(base as any, [{ op: 'add', item: { name: 'Project A', deadline: '2026-02-01', milestones: [{ text: 'M1' }] } }]);
    expect(added.next.length).toBe(1);
    const deleted = applyProjectOps(added.next, [{ op: 'delete', match: { nameContains: 'project a' } }]);
    expect(deleted.next.length).toBe(0);
  });

  it('applyReminderOps supports add and update', () => {
    const base: ReminderItem[] = [];
    const opts = {
      nowTs: 123,
      defaultIncludeInBriefing: 'none' as const,
      resolveInclude: (v: unknown): 'morning' | 'none' => (v === 'morning' ? 'morning' : 'none'),
      normalize: (items: ReminderItem[]) => items,
    };
    const added = applyReminderOps(base, [{ op: 'add', item: { text: 'Call supplier', includeInBriefing: 'morning' } }], opts);
    expect(added.next.length).toBe(1);
    expect(added.next[0].includeInBriefing).toBe('morning');
    const updated = applyReminderOps(added.next, [{ op: 'update', match: { id: added.next[0].id }, item: { text: 'Call main supplier' } }], opts);
    expect(updated.next[0].text).toBe('Call main supplier');
  });

  it('detectEventOpsScheduleClarification asks when Event Ops time missing', () => {
    const todayYmd = '2026-01-22';
    const res = detectEventOpsScheduleClarification({
      todayYmd,
      eventOpsItems: [{ id: 'e1', kind: 'event', event_date: todayYmd, name: 'Banquet', location: null, serving_time: null }],
      proposedSchedule: [{ time: '09:00 AM - 10:00 AM', title: 'Admin' }],
    });
    expect(res.needsClarification).toBe(true);
    if (res.needsClarification) expect(res.reason).toBe('event_ops_missing_time');
  });

  it('detectEventOpsScheduleClarification asks when schedule overlaps serving time block', () => {
    const todayYmd = '2026-01-22';
    const res = detectEventOpsScheduleClarification({
      todayYmd,
      eventOpsItems: [{ id: 'e1', kind: 'event', event_date: todayYmd, name: 'Banquet', location: null, serving_time: '10:00:00' }],
      proposedSchedule: [{ time: '09:30 AM - 10:30 AM', title: 'Deep focus' }],
    });
    expect(res.needsClarification).toBe(true);
    if (res.needsClarification) expect(res.reason).toBe('event_ops_conflict');
  });
});
