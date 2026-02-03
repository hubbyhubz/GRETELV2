import { describe, expect, it } from 'vitest';
import { getQuestionLabel } from '../lib/briefingQuestionHints';

const baseCtx = () => ({
  now: new Date('2026-02-03T09:00:00.000Z'),
  reminders: [],
  briefingInputs: [],
  dailyOpsMetrics: [],
  staffPerformanceLog: [],
  googleCalendarEvents: [],
  eventOpsItems: [],
});

describe('briefingQuestionHints', () => {
  it('adds staffing system note from reminder', () => {
    const ctx = {
      ...baseCtx(),
      reminders: [{ id: 'r1', text: 'Rico is OFF today', completed: false, createdAt: Date.now(), includeInBriefing: 'morning' as any } as any],
    };
    const label = getQuestionLabel('Any staffing or coverage changes the team must know?', 'staffing_coverage', ctx);
    expect(label).toContain('(System Note: Rico is marked OFF today)');
  });

  it('adds incident system alert for towels low', () => {
    const ctx = {
      ...baseCtx(),
      briefingInputs: [{ id: 'b1', type: 'Logged', text: 'Clean towels supply low in linen room', loggedAt: Date.now() } as any],
    };
    const label = getQuestionLabel('Any incidents, risks, or guest-impacting issues to highlight?', 'incidents_risks', ctx);
    expect(label).toContain('(System Alert: Clean Towel Supply Low)');
  });

  it('adds upcoming calendar hint from google events', () => {
    const ctx = {
      ...baseCtx(),
      now: new Date('2026-02-03T03:00:00.000Z'),
      googleCalendarEvents: [
        { summary: 'LGU Lunch', start: { dateTime: '2026-02-03T04:00:00.000Z' } },
      ],
    };
    const label = getQuestionLabel('What is the single most important operational focus for this morning?', 'operational_focus', ctx);
    expect(label).toContain('(Upcoming:');
    expect(label).toContain('LGU Lunch');
  });

  it('returns base question when no hints exist', () => {
    const ctx = baseCtx();
    const label = getQuestionLabel('What coaching point or standard do you want emphasized today?', 'coaching_point', ctx);
    expect(label).toBe('What coaching point or standard do you want emphasized today?');
  });
});

