import { describe, expect, it } from 'vitest';
import { buildBriefingConsolidation } from '../lib/briefingConsolidation';

describe('briefingConsolidation', () => {
  it('builds consolidated text with required sections', () => {
    const result = buildBriefingConsolidation({
      briefingType: 'morning',
      fullDate: 'Tuesday, February 3, 2026',
      interviewQuestions: ['Q1', 'Q2', 'Q3', 'Q4'],
      interviewAnswers: ['A1', 'A2', 'A3', 'Coach this'],
      otherNotes: 'Other note 1',
      coachingNotes: 'Coach this',
      reminders: [{ id: 'r1', text: 'Rico off today', completed: false, loggedAt: Date.now(), includeInBriefing: 'morning' as any } as any],
      delegatedTasks: [{ id: 'd1', text: 'Check towels', assigneeName: 'Paulino', deadline: 'today', completed: false } as any],
      briefingPointers: [{ id: 'b1', type: 'Logged', text: 'Guest complaint about towels', loggedAt: Date.now() } as any],
      dailyOpsMetrics: [{ id: 'm1', date: '2026-02-03', moraleScore: 4, attendanceIssues: 'Rico OFF', createdAt: Date.now() } as any],
      staffPerformanceLog: [{ id: 's1', date: '2026-02-03', text: 'Coach: standards reminder', createdAt: Date.now() } as any],
    });

    expect(result.ok).toBe(true);
    expect(result.text).toContain('MORNING BRIEFING - CONSOLIDATED NOTES');
    expect(result.text).toContain('1. INTERVIEW ANSWERS:');
    expect(result.text).toContain('2. COACHING NOTES:');
    expect(result.text).toContain('4. REMINDERS:');
    expect(result.text).toContain('5. DELEGATED TASKS:');
    expect(result.text).toContain('6. BRIEFING POINTERS:');
    expect(result.text).toContain('7. LOG INFORMATION:');
  });

  it('flags missing sources when arrays are absent', () => {
    const result = buildBriefingConsolidation({
      briefingType: 'morning',
      fullDate: 'Tuesday, February 3, 2026',
      interviewQuestions: [],
      interviewAnswers: [],
      otherNotes: '',
      coachingNotes: '',
      reminders: undefined,
      delegatedTasks: undefined,
      briefingPointers: undefined,
      dailyOpsMetrics: undefined,
      staffPerformanceLog: undefined,
    });
    expect(result.ok).toBe(false);
    expect(result.meta.status).toBe('error');
    expect(result.meta.missingSources.length).toBeGreaterThan(0);
  });
});
