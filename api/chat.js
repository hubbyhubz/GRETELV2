const TITLE_FALLBACK = "I'm sorry, I couldn't process that request.";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 60;

const rateLimitBuckets = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded) && forwarded.length > 0) return String(forwarded[0]).split(',')[0].trim();
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  return 'unknown';
}

function isRateLimited(key) {
  const now = Date.now();
  const existing = rateLimitBuckets.get(key) || [];
  const pruned = existing.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  pruned.push(now);
  rateLimitBuckets.set(key, pruned);
  return pruned.length > RATE_LIMIT_MAX;
}

function setCors(res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, authorization');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
}

function json(res, statusCode, body) {
  setCors(res);
  res.statusCode = statusCode;
  res.end(JSON.stringify(body));
}

function extractJsonFromModelContent(raw) {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonString = (jsonMatch?.[1] ?? raw).trim();
  if (!jsonString) return { text: TITLE_FALLBACK };
  try {
    return JSON.parse(jsonString);
  } catch {
    return { text: raw || TITLE_FALLBACK };
  }
}

function extractOpenAiErrorMessage(raw) {
  try {
    const parsed = JSON.parse(raw);
    const msg = parsed?.error?.message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  } catch {
  }
  return raw || 'Upstream error';
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    if (req.body.length > 200_000) return null;
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 200_000) return null;
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const ip = getClientIp(req);
  if (isRateLimited(ip)) return json(res, 429, { error: 'Rate limit exceeded' });

  const openAiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || process.env.VITE_API_KEY;
  if (!openAiApiKey) {
    return json(res, 500, {
      error: 'Missing OPENAI_API_KEY. Please set OPENAI_API_KEY in your Vercel project Environment Variables.',
    });
  }

  let body = null;
  try {
    body = await readBody(req);
  } catch {
    body = null;
  }

  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return json(res, 400, { error: 'Invalid request body' });
  }

  const model = body.model || process.env.OPENAI_MODEL || process.env.VITE_OPENAI_MODEL || 'gpt-4o';

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: body.messages,
        response_format: { type: 'json_object' },
        max_tokens: body.max_tokens ?? 2000,
        temperature: body.temperature ?? 0.7,
      }),
    });

    if (!upstream.ok) {
      const errorBody = await upstream.text();
      const message = extractOpenAiErrorMessage(errorBody);

      if (upstream.status === 403) {
        const errorMsg = message.toLowerCase();
        if (errorMsg.includes('country') || errorMsg.includes('region') || errorMsg.includes('territory')) {
          return json(res, 403, {
            error: 'Country, region, or territory not supported. This is a regional restriction from the API provider.',
            status: 403,
          });
        }
        return json(res, 403, {
          error: 'Authentication failed. Please check your OPENAI_API_KEY is valid and has access to the requested model.',
          status: 403,
        });
      }

      return json(res, upstream.status, { error: message, status: upstream.status });
    }

    const data = await upstream.json();
    const responseText = data?.choices?.[0]?.message?.content ?? '';
    const parsed = extractJsonFromModelContent(responseText);
    return json(res, 200, parsed);
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unexpected server error';
    return json(res, 500, { error: message });
  }
}

