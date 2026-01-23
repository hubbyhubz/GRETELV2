import { createClient } from '@supabase/supabase-js';

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
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

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (!isAuthorized(req)) return json(res, 401, { error: 'Unauthorized' });

  const supabase = buildSupabaseAdmin();
  if (!supabase) return json(res, 500, { error: 'Missing Supabase admin environment variables' });

  const env = {
    hasSupabaseUrl: Boolean(process.env.VITE_SUPABASE_URL),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasVapidPublicKey: Boolean(process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY),
    hasVapidPrivateKey: Boolean(process.env.VAPID_PRIVATE_KEY),
    hasCronSecret: Boolean(process.env.CRON_SECRET),
  };

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const pending = await supabase
    .from('push_notifications_queue')
    .select('id', { count: 'exact', head: true })
    .is('delivered_at', null);

  const locked = await supabase
    .from('push_notifications_queue')
    .select('id', { count: 'exact', head: true })
    .is('delivered_at', null)
    .not('locked_at', 'is', null);

  const delivered24h = await supabase
    .from('push_notifications_queue')
    .select('id', { count: 'exact', head: true })
    .not('delivered_at', 'is', null)
    .gt('delivered_at', sinceIso);

  const { data: recentErrors, error: recentErrorsError } = await supabase
    .from('push_notifications_queue')
    .select('id,user_id,created_at,locked_at,delivered_at,error')
    .not('error', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (pending.error) return json(res, 500, { error: pending.error.message || String(pending.error) });
  if (locked.error) return json(res, 500, { error: locked.error.message || String(locked.error) });
  if (delivered24h.error) return json(res, 500, { error: delivered24h.error.message || String(delivered24h.error) });
  if (recentErrorsError) return json(res, 500, { error: recentErrorsError.message || String(recentErrorsError) });

  return json(res, 200, {
    ok: true,
    env,
    queue: {
      pending: pending.count ?? 0,
      locked: locked.count ?? 0,
      deliveredLast24h: delivered24h.count ?? 0,
      recentErrors: recentErrors || [],
    },
  });
}

