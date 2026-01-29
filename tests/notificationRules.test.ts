import { describe, expect, it } from 'vitest';
import { getDefaultAssistantNotificationPreferences, isWithinQuietHours, shouldSuppressPushInQuietHours } from '../lib/notificationRules';
import { EVENT_OPS_PREP_MINUTES, EVENT_OPS_WRAP_MINUTES, getEventOpsReminderMoments } from '../components/assistantActionUtils';

describe('notificationRules', () => {
  it('creates strict defaults', () => {
    const prefs = getDefaultAssistantNotificationPreferences('Asia/Manila');
    expect(prefs.strictMode).toBe(true);
    expect(prefs.timezone).toBe('Asia/Manila');
    expect(prefs.quietHours.start).toBe('22:00');
    expect(prefs.quietHours.end).toBe('06:00');
  });

  it('treats cross-midnight quiet hours correctly', () => {
    const quiet = { start: '22:00', end: '06:00' };
    expect(isWithinQuietHours(23 * 60, quiet)).toBe(true);
    expect(isWithinQuietHours(5 * 60 + 30, quiet)).toBe(true);
    expect(isWithinQuietHours(12 * 60, quiet)).toBe(false);
  });

  it('suppresses non-emergency kinds during quiet hours', () => {
    expect(shouldSuppressPushInQuietHours('schedule_upcoming')).toBe(false);
    expect(shouldSuppressPushInQuietHours('event_ops_reminder')).toBe(false);
    expect(shouldSuppressPushInQuietHours('delegated_overdue')).toBe(true);
  });
});

describe('event ops reminder moments', () => {
  it('builds the expected cadence moments', () => {
    const serving = 12 * 60;
    const moments = getEventOpsReminderMoments(serving);
    expect(moments).toEqual([
      { label: 'T-90', minute: serving - EVENT_OPS_PREP_MINUTES },
      { label: 'T-30', minute: serving - 30 },
      { label: 'T-0', minute: serving },
      { label: 'T+120', minute: serving + EVENT_OPS_WRAP_MINUTES },
    ]);
  });
});

