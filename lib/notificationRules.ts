export type NotificationKind =
  | 'event_ops_reminder'
  | 'event_ops_missing_time'
  | 'event_ops_conflict'
  | 'schedule_upcoming'
  | 'delegated_due'
  | 'delegated_overdue';

export type NotificationPriority = 'critical' | 'nudge';

export type QuietHours = { start: string; end: string };

export type AssistantNotificationPreferences = {
  timezone: string;
  quietHours: QuietHours;
  strictMode: boolean;
  snoozes?: Record<string, number>;
};

export const DEFAULT_QUIET_HOURS: QuietHours = { start: '22:00', end: '06:00' };

export const isCriticalKind = (kind: NotificationKind): boolean => {
  return (
    kind === 'event_ops_reminder' ||
    kind === 'event_ops_missing_time' ||
    kind === 'event_ops_conflict' ||
    kind === 'schedule_upcoming' ||
    kind === 'delegated_due' ||
    kind === 'delegated_overdue'
  );
};

export const getDefaultAssistantNotificationPreferences = (timezone: string): AssistantNotificationPreferences => ({
  timezone,
  quietHours: DEFAULT_QUIET_HOURS,
  strictMode: true,
  snoozes: {},
});

const parseHm = (hm: string): number | null => {
  const m = String(hm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
};

export const isWithinQuietHours = (minuteOfDay: number, quietHours: QuietHours): boolean => {
  const start = parseHm(quietHours.start);
  const end = parseHm(quietHours.end);
  if (start == null || end == null) return false;
  if (start === end) return true;
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
};

export const shouldSuppressPushInQuietHours = (kind: NotificationKind): boolean => {
  return kind !== 'event_ops_reminder' && kind !== 'schedule_upcoming';
};

