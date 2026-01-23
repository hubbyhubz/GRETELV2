import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function safeSnippet(value, maxLen = 300) {
  if (value == null) return '';
  const s = typeof value === 'string' ? value : (() => {
    try { return JSON.stringify(value); } catch { return String(value); }
  })();
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

function summarizePushError(err) {
  const statusCode = err?.statusCode;
  const message = err?.message || String(err);
  const body = safeSnippet(err?.body);
  const summaryParts = [];
  if (statusCode) summaryParts.push(`status=${statusCode}`);
  if (message) summaryParts.push(`message=${safeSnippet(message, 180)}`);
  if (body) summaryParts.push(`body=${body}`);
  return summaryParts.join(' | ') || 'Unknown push error';
}

function isAuthorized(req) {
  const isCron = req.headers['x-vercel-cron'] === '1';
  if (isCron) return true;
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  return expected ? auth === expected : false;
}

function buildSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function configureWebPush() {
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!publicKey || !privateKey) return null;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey, privateKey, subject };
}

async function fetchPendingQueueMessages(supabase) {
  const { data, error } = await supabase
    .from('push_notifications_queue')
    .select('*')
    .is('delivered_at', null)
    .is('locked_at', null)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) return { source: 'queue', error, messages: [] };
  return { source: 'queue', error: null, messages: data || [] };
}

async function fetchPendingInboxMessages(supabase) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('assistant_inbox_messages')
    .select('*')
    .is('delivered_at', null)
    .gt('sent_at', since)
    .order('sent_at', { ascending: true })
    .limit(20);
  if (error) return { source: 'inbox', error, messages: [] };
  return { source: 'inbox', error: null, messages: data || [] };
}

async function lockQueueMessage(supabase, id) {
  await supabase.from('push_notifications_queue').update({ locked_at: new Date().toISOString() }).eq('id', id);
}

async function markDelivered(supabase, source, id, fields) {
  if (source === 'queue') {
    await supabase.from('push_notifications_queue').update(fields).eq('id', id);
    return;
  }
  const next = {};
  if (fields && typeof fields === 'object' && 'delivered_at' in fields) next.delivered_at = fields.delivered_at;
  await supabase.from('assistant_inbox_messages').update(next).eq('id', id);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!isAuthorized(req)) return json(res, 401, { error: 'Unauthorized' });

  const supabase = buildSupabaseAdmin();
  if (!supabase) return json(res, 500, { error: 'Missing Supabase admin environment variables' });

  const vapid = configureWebPush();
  if (!vapid) return json(res, 500, { error: 'Missing VAPID environment variables' });

  const queue = await fetchPendingQueueMessages(supabase);
  const inbox = await fetchPendingInboxMessages(supabase);

  if (queue.error) return json(res, 500, { error: queue.error.message || String(queue.error) });
  if (inbox.error) return json(res, 500, { error: inbox.error.message || String(inbox.error) });

  const queuedMessageIds = new Set(
    (queue.messages || [])
      .map((m) => m?.data?.message_id)
      .filter(Boolean)
      .map(String)
  );
  const inboxFiltered = (inbox.messages || []).filter((m) => !queuedMessageIds.has(String(m.id)));
  const chosen = [
    ...queue.messages.map((m) => ({ source: 'queue', msg: m })),
    ...inboxFiltered.map((m) => ({ source: 'inbox', msg: m })),
  ];
  if (chosen.length === 0) return json(res, 200, { ok: true, processed: 0, source: 'none' });

  const results = [];

  for (const { source, msg } of chosen) {
    const id = msg.id;
    const userId = msg.user_id;
    const title = msg.title || 'New Message from G.R.E.T.E.L';
    const body = msg.body || msg.content || msg.preview || 'You have a new message';
    const data = msg.data || msg.metadata || {};

    if (source === 'queue') {
      await lockQueueMessage(supabase, id);
    }

    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (subErr) {
      if (source === 'queue') {
        await markDelivered(supabase, source, id, { error: subErr.message || String(subErr), locked_at: null });
      }
      results.push({ id, ok: false, delivered: 0, failed: 0, error: subErr.message || String(subErr) });
      continue;
    }

    if (!subs || subs.length === 0) {
      await markDelivered(supabase, source, id, source === 'queue' ? { delivered_at: new Date().toISOString(), error: 'No subscriptions', locked_at: null } : { delivered_at: new Date().toISOString() });
      results.push({ id, ok: true, delivered: 0, failed: 0, note: 'No subscriptions' });
      continue;
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icons/brain.svg',
      url: '/',
      data,
    });

    let delivered = 0;
    let failed = 0;
    const failureSamples = [];
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
        delivered += 1;
        await supabase
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', sub.id);
      } catch (err) {
        failed += 1;
        const statusCode = err?.statusCode;
        if (failureSamples.length < 3) {
          failureSamples.push({ subId: sub.id, error: summarizePushError(err) });
        }
        if (statusCode === 410 || statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    const nowIso = new Date().toISOString();
    const partialError = failed > 0 ? `Partial push failure: ${failed}/${subs.length} devices failed` : null;

    if (delivered === 0) {
      if (source === 'queue') {
        const summarized = failureSamples.length > 0 ? `No deliveries. ${failureSamples.map((f) => `${f.subId}: ${f.error}`).join(' ; ')}` : 'No deliveries.';
        await markDelivered(supabase, source, id, { delivered_at: null, error: summarized, locked_at: null });
      }
      results.push({ id, ok: false, delivered, failed, failures: failureSamples });
      continue;
    }

    await markDelivered(
      supabase,
      source,
      id,
      source === 'queue'
        ? { delivered_at: nowIso, error: partialError, locked_at: null }
        : { delivered_at: nowIso }
    );
    results.push({ id, ok: true, delivered, failed, failures: failureSamples.length > 0 ? failureSamples : undefined });
  }

  return json(res, 200, { ok: true, processed: results.length, results });
}
