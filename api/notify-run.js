import { createClient } from '@supabase/supabase-js';
import * as webpush from 'web-push';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function requireAuth(req, res) {
  const secret = process.env.NOTIFY_RUN_SECRET || '';
  if (!secret) return true;
  const vercelCron = String(req.headers?.['x-vercel-cron'] || '');
  if (vercelCron === '1') return true;
  const authHeader = String(req.headers?.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (token && token === secret) return true;
  json(res, 401, { ok: false, error: 'Unauthorized' });
  return false;
}

function getEnv(name, fallback = '') {
  const value = process.env[name];
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function formatYmdInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !d) return null;
  return `${y}-${m}-${d}`;
}

function getMinuteOfDayInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hh = Number(parts.find((p) => p.type === 'hour')?.value);
  const mm = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function parseHmToMinutes(hm) {
  const m = String(hm || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function isWithinQuietHours(minuteOfDay, quietHours) {
  const start = parseHmToMinutes(quietHours?.start);
  const end = parseHmToMinutes(quietHours?.end);
  if (start == null || end == null) return false;
  if (start === end) return true;
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
}

function shouldSuppressInQuietHours(kind) {
  return kind !== 'event_ops_reminder' && kind !== 'schedule_upcoming';
}

function parseScheduleRangeStartMinutes(timeRange) {
  const text = String(timeRange || '').trim();
  const m = text.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function parseScheduleRangeToMinutes(timeRange) {
  const text = String(timeRange || '').trim();
  const m = text.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const sh = Number(m[1]);
  const sm = Number(m[2]);
  const eh = Number(m[3]);
  const em = Number(m[4]);
  if (![sh, sm, eh, em].every(Number.isFinite)) return null;
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start < 0 || start >= 24 * 60) return null;
  if (end <= start || end > 24 * 60) return null;
  return { start, end };
}

function normalizePreferences(rawPrefs, fallbackTimeZone) {
  const prefs = rawPrefs && typeof rawPrefs === 'object' ? rawPrefs : {};
  const timeZone = typeof prefs.timezone === 'string' && prefs.timezone.trim() ? prefs.timezone.trim() : fallbackTimeZone;
  const quietHours =
    prefs.quietHours && typeof prefs.quietHours === 'object'
      ? { start: String(prefs.quietHours.start || '22:00'), end: String(prefs.quietHours.end || '06:00') }
      : { start: '22:00', end: '06:00' };
  const strictMode = prefs.strictMode !== false;
  const snoozes = prefs.snoozes && typeof prefs.snoozes === 'object' ? prefs.snoozes : {};
  return { timeZone, quietHours, strictMode, snoozes };
}

async function tryInsertNotificationLog(supabase, userId, dedupeKey, kind, priority) {
  const { error } = await supabase
    .from('assistant_notification_log')
    .insert({ user_id: userId, dedupe_key: dedupeKey, kind, priority });
  if (!error) return { inserted: true };
  if (String(error.code || '') === '23505') return { inserted: false };
  return { inserted: false, error };
}

async function createInAppAndPush(supabase, params) {
  const { userId, title, body, dedupeKey, kind, url, priority } = params;
  await supabase.from('assistant_inbox_messages').insert({
    user_id: userId,
    sender: 'assistant',
    title,
    content: body,
    preview: String(body || '').slice(0, 100),
    metadata: { kind, dedupe_key: dedupeKey, url, priority },
  });
  await supabase.from('push_notifications_queue').insert({
    user_id: userId,
    title,
    body: String(body || '').slice(0, 180),
    data: { kind, dedupe_key: dedupeKey, url, priority },
  });
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  const requestUrl = new URL(req.url || '/api/notify-run', `http://${String(req.headers?.host || 'localhost')}`);
  const dryRun = requestUrl.searchParams.get('dry_run') === 'true' || getEnv('NOTIFICATION_RUNNER_DRY_RUN', '') === 'true';

  const supabaseUrl = getEnv('VITE_SUPABASE_URL', getEnv('SUPABASE_URL'));
  const supabaseServiceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    json(res, 500, { ok: false, error: 'Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE URL env.' });
    return;
  }

  const vapidPublicKey = getEnv('VAPID_PUBLIC_KEY', getEnv('VITE_VAPID_PUBLIC_KEY'));
  const vapidPrivateKey = getEnv('VAPID_PRIVATE_KEY');
  const vapidSubject = getEnv('VAPID_SUBJECT', 'mailto:admin@example.com');

  const intervalMin = Number(getEnv('NOTIFICATION_RUNNER_INTERVAL_MIN', '5'));
  const triggerWindowMin = Number.isFinite(intervalMin) && intervalMin > 0 ? intervalMin : 5;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const now = new Date();
  const defaultTz = getEnv('DEFAULT_TIME_ZONE', 'UTC');

  const { data: subUsers, error: subUsersError } = await supabase
    .from('push_subscriptions')
    .select('user_id')
    .limit(5000);
  if (subUsersError) {
    json(res, 500, { ok: false, error: `Failed to load subscriptions: ${subUsersError.message}` });
    return;
  }
  const userIds = Array.from(new Set((subUsers || []).map((r) => r.user_id).filter(Boolean)));

  const { data: prefRows } = await supabase
    .from('assistant_notification_preferences')
    .select('user_id, preferences')
    .in('user_id', userIds);
  const prefByUser = new Map((prefRows || []).map((r) => [r.user_id, r.preferences]));

  const generated = [];

  for (const userId of userIds) {
    const prefs = normalizePreferences(prefByUser.get(userId), defaultTz);
    const todayYmd = formatYmdInTimeZone(now, prefs.timeZone);
    const minuteOfDay = getMinuteOfDayInTimeZone(now, prefs.timeZone);
    if (!todayYmd || minuteOfDay == null) continue;

    const inQuiet = isWithinQuietHours(minuteOfDay, prefs.quietHours);

    const { data: eventOpsRows } = await supabase
      .from('event_ops_items')
      .select('id, kind, event_date, name, location, serving_time')
      .eq('user_id', userId)
      .eq('event_date', todayYmd)
      .limit(200);

    const eventOpsItems = Array.isArray(eventOpsRows) ? eventOpsRows : [];
    const missingTime = eventOpsItems.filter((it) => !it.serving_time);

    const shouldFireAt = (targetMinute) => {
      if (targetMinute == null) return false;
      const delta = Math.abs(minuteOfDay - targetMinute);
      return delta >= 0 && delta < triggerWindowMin;
    };

    if (missingTime.length > 0 && shouldFireAt(8 * 60)) {
      const dedupeKey = `event_ops_missing_time:${todayYmd}`;
      const until = Number(prefs.snoozes?.[dedupeKey] || 0);
      if (!(until && until > Date.now())) {
        const { inserted } = await tryInsertNotificationLog(supabase, userId, dedupeKey, 'event_ops_missing_time', 'critical');
        if (inserted) {
          await createInAppAndPush(supabase, {
            userId,
            title: 'Event Ops needs serving time',
            body: `You have ${missingTime.length} Event Ops item(s) today missing a serving time. Add serving_time so I can block prep/cleanup properly.`,
            dedupeKey,
            kind: 'event_ops_missing_time',
            url: '/?tab=events',
            priority: 'critical',
          });
          generated.push({ userId, kind: 'event_ops_missing_time' });
        }
      }
    }

    for (const it of eventOpsItems) {
      const servingMinutes = parseHmToMinutes(String(it.serving_time || '').slice(0, 5));
      if (servingMinutes == null) continue;
      const moments = [
        { label: 'T-90', minute: Math.max(0, servingMinutes - 90) },
        { label: 'T-30', minute: Math.max(0, servingMinutes - 30) },
        { label: 'T-0', minute: servingMinutes },
        { label: 'T+120', minute: Math.min(24 * 60, servingMinutes + 120) },
      ];
      for (const m of moments) {
        if (!shouldFireAt(m.minute)) continue;
        const dedupeKey = `event_ops_reminder:${it.id}:${todayYmd}:${m.label}`;
        const until = Number(prefs.snoozes?.[dedupeKey] || 0);
        if (until && until > Date.now()) continue;
        if (inQuiet && shouldSuppressInQuietHours('event_ops_reminder')) continue;
        const { inserted } = await tryInsertNotificationLog(supabase, userId, dedupeKey, 'event_ops_reminder', 'critical');
        if (!inserted) continue;
        await createInAppAndPush(supabase, {
          userId,
          title: `Event Ops ${m.label}: ${it.name}`,
          body: `${it.name} serving at ${String(it.serving_time || '').slice(0, 5)}. Stay on manager cadence: prep → execute → closeout.`,
          dedupeKey,
          kind: 'event_ops_reminder',
          url: '/?tab=events',
          priority: 'critical',
        });
        generated.push({ userId, kind: 'event_ops_reminder' });
      }
    }

    const { data: dashboardRow } = await supabase
      .from('dashboard_states')
      .select('state')
      .eq('user_id', userId)
      .maybeSingle();
    const state = dashboardRow?.state && typeof dashboardRow.state === 'object' ? dashboardRow.state : null;

    const scheduleItems = Array.isArray(state?.scheduleItems) ? state.scheduleItems : [];
    for (const item of scheduleItems) {
      const start = parseScheduleRangeStartMinutes(item.time);
      if (start == null) continue;
      const target = start - 15;
      if (!shouldFireAt(target)) continue;
      const dedupeKey = `schedule_upcoming:${item.id}:${todayYmd}:T-15`;
      const until = Number(prefs.snoozes?.[dedupeKey] || 0);
      if (until && until > Date.now()) continue;
      if (inQuiet && shouldSuppressInQuietHours('schedule_upcoming')) continue;
      const { inserted } = await tryInsertNotificationLog(supabase, userId, dedupeKey, 'schedule_upcoming', 'critical');
      if (!inserted) continue;
      await createInAppAndPush(supabase, {
        userId,
        title: 'Starts in 15 minutes',
        body: `${item.title || 'Scheduled item'} starts at ${String(item.time || '').split('-')[0]?.trim() || ''}.`,
        dedupeKey,
        kind: 'schedule_upcoming',
        url: '/?tab=today',
        priority: 'critical',
      });
      generated.push({ userId, kind: 'schedule_upcoming' });
    }

    if (eventOpsItems.length > 0 && shouldFireAt(8 * 60)) {
      const blocks = eventOpsItems
        .map((it) => {
          const servingMinutes = parseHmToMinutes(String(it.serving_time || '').slice(0, 5));
          if (servingMinutes == null) return null;
          return { start: Math.max(0, servingMinutes - 90), end: Math.min(24 * 60, servingMinutes + 120), item: it };
        })
        .filter(Boolean);

      const conflicts = [];
      for (const slot of scheduleItems) {
        const parsed = parseScheduleRangeToMinutes(slot.time);
        if (!parsed) continue;
        const slotTitle = String(slot.title || '').toLowerCase();
        for (const b of blocks) {
          const nameNeedle = String(b.item?.name || '').toLowerCase();
          if (slotTitle.includes('event ops')) continue;
          if (nameNeedle && slotTitle.includes(nameNeedle)) continue;
          const overlap = Math.max(0, Math.min(parsed.end, b.end) - Math.max(parsed.start, b.start));
          if (overlap > 0) conflicts.push(b.item);
        }
      }

      if (conflicts.length > 0) {
        const unique = Array.from(new Map(conflicts.map((it) => [it.id, it])).values());
        const names = unique.slice(0, 3).map((it) => it.name).join(', ');
        const dedupeKey = `event_ops_conflict:${todayYmd}`;
        const until = Number(prefs.snoozes?.[dedupeKey] || 0);
        if (!(until && until > Date.now())) {
          const { inserted } = await tryInsertNotificationLog(supabase, userId, dedupeKey, 'event_ops_conflict', 'critical');
          if (inserted) {
            await createInAppAndPush(supabase, {
              userId,
              title: 'Event Ops conflict detected',
              body: `Your schedule overlaps with Event Ops today (${names}). Adjust blocks so you can execute like a manager.`,
              dedupeKey,
              kind: 'event_ops_conflict',
              url: '/?tab=today',
              priority: 'critical',
            });
            generated.push({ userId, kind: 'event_ops_conflict' });
          }
        }
      }
    }

    const delegatedTasks = Array.isArray(state?.delegatedTasks) ? state.delegatedTasks : [];
    const incomplete = delegatedTasks.filter((t) => !t.completed);
    const dueToday = incomplete.filter((t) => String(t.deadline || '') === todayYmd);
    const overdue = incomplete.filter((t) => {
      const d = String(t.deadline || '');
      return d && d < todayYmd;
    });
    const dueTimes = [9 * 60];
    const overdueTimes = [9 * 60, 15 * 60];

    if (dueToday.length > 0 && dueTimes.some(shouldFireAt)) {
      const dedupeKey = `delegated_due:${todayYmd}`;
      const until = Number(prefs.snoozes?.[dedupeKey] || 0);
      if (!(until && until > Date.now())) {
        const { inserted } = await tryInsertNotificationLog(supabase, userId, dedupeKey, 'delegated_due', 'critical');
        if (inserted) {
          await createInAppAndPush(supabase, {
            userId,
            title: 'Delegations due today',
            body: `${dueToday.length} delegated task(s) are due today. Follow up and close the loop.`,
            dedupeKey,
            kind: 'delegated_due',
            url: '/?tab=work',
            priority: 'critical',
          });
          generated.push({ userId, kind: 'delegated_due' });
        }
      }
    }

    if (overdue.length > 0 && overdueTimes.some(shouldFireAt)) {
      const dedupeKey = `delegated_overdue:${todayYmd}`;
      const until = Number(prefs.snoozes?.[dedupeKey] || 0);
      if (!(until && until > Date.now())) {
        const { inserted } = await tryInsertNotificationLog(supabase, userId, dedupeKey, 'delegated_overdue', 'critical');
        if (inserted) {
          await createInAppAndPush(supabase, {
            userId,
            title: 'Overdue delegations',
            body: `${overdue.length} delegated task(s) are overdue. Escalate, reassign, or set a hard next step.`,
            dedupeKey,
            kind: 'delegated_overdue',
            url: '/?tab=work',
            priority: 'critical',
          });
          generated.push({ userId, kind: 'delegated_overdue' });
        }
      }
    }
  }

  const sendable = Boolean(vapidPublicKey && vapidPrivateKey);
  if (sendable && !dryRun) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  }

  const lockThresholdMs = 5 * 60 * 1000;
  const lockBefore = new Date(Date.now() - lockThresholdMs).toISOString();
  const { data: pendingRows, error: pendingError } = await supabase
    .from('push_notifications_queue')
    .select('id, user_id, title, body, data, locked_at')
    .is('delivered_at', null)
    .or(`locked_at.is.null,locked_at.lt.${lockBefore}`)
    .order('created_at', { ascending: true })
    .limit(50);

  if (pendingError) {
    json(res, 500, { ok: false, error: `Failed to read queue: ${pendingError.message}`, generated: generated.length });
    return;
  }

  const pending = Array.isArray(pendingRows) ? pendingRows : [];
  const lockNowIso = new Date().toISOString();
  if (pending.length > 0) {
    await supabase
      .from('push_notifications_queue')
      .update({ locked_at: lockNowIso })
      .in('id', pending.map((r) => r.id))
      .is('delivered_at', null);
  }

  let sentCount = 0;
  let skippedPushCount = 0;

  for (const row of pending) {
    if (!sendable || dryRun) {
      skippedPushCount += 1;
      continue;
    }
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', row.user_id)
      .limit(20);
    const subscriptions = Array.isArray(subs) ? subs : [];
    let anySuccess = false;
    let lastError = '';

    for (const sub of subscriptions) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      const payload = JSON.stringify({
        title: row.title,
        body: row.body,
        url: row.data?.url || '/',
        data: row.data || {},
      });
      try {
        await webpush.sendNotification(subscription, payload);
        anySuccess = true;
        sentCount += 1;
        await supabase.from('push_subscriptions').update({ last_used_at: lockNowIso }).eq('id', sub.id);
      } catch (err) {
        lastError = String(err?.message || err || 'Push send failed');
        const statusCode = Number(err?.statusCode || err?.status || 0);
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    if (anySuccess) {
      await supabase.from('push_notifications_queue').update({ delivered_at: lockNowIso, error: null }).eq('id', row.id);
    } else {
      await supabase.from('push_notifications_queue').update({ error: lastError || 'No active subscriptions' }).eq('id', row.id);
    }
  }

  json(res, 200, {
    ok: true,
    generated: generated.length,
    queued: pending.length,
    pushSent: sentCount,
    pushSkipped: skippedPushCount,
    triggerWindowMin,
    dryRun,
  });
}
