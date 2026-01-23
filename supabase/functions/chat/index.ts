import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type ChatCompletionMessage = { role: 'system' | 'user' | 'assistant'; content: unknown };

type Body = {
  messages: ChatCompletionMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
};

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders, ...(init?.headers || {}) },
  });

const extractJsonFromModelContent = (raw: string): any => {
  const match = raw.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonString = (match?.[1] ?? raw).trim();
  if (!jsonString) return { text: "I'm sorry, I couldn't process that request." };
  try {
    return JSON.parse(jsonString);
  } catch {
    return { text: raw || "I'm sorry, I couldn't process that request." };
  }
};

const extractOpenAiErrorMessage = (raw: string): string => {
  try {
    const parsed = JSON.parse(raw);
    const msg = parsed?.error?.message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  } catch {
  }
  return raw || 'Upstream error';
};

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  // 1. Timeout control: abort OpenAI call if it takes > 50s (Supabase hard limit is 60s)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const openAiApiKey = Deno.env.get('OPENAI_API_KEY') || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: 'Server is not configured (missing Supabase env vars).' }, { status: 500 });
    }
    if (!openAiApiKey) {
      return json({ error: 'Server is not configured (missing OPENAI_API_KEY).' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    
    // 2. Auth check
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user?.id) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Body | null = null;
    try {
      body = (await req.json()) as Body;
    } catch {
      body = null;
    }

    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ error: 'Invalid request body' }, { status: 400 });
    }

    // 3. Force lightweight model default and cap tokens
    const model = body.model || Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';
    const max_tokens = Math.min(body.max_tokens ?? 900, 2000); 

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${openAiApiKey}` },
      body: JSON.stringify({
        model,
        messages: body.messages,
        response_format: { type: 'json_object' },
        max_tokens,
        temperature: body.temperature ?? 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      const message = extractOpenAiErrorMessage(errorBody);
      return json({ error: message, status: response.status }, { status: response.status });
    }

    const data: any = await response.json();
    const responseText = data?.choices?.[0]?.message?.content ?? '';
    const parsed = extractJsonFromModelContent(responseText);
    return json(parsed, { status: 200 });
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return json({ error: 'OpenAI request timed out (server-side).' }, { status: 504 });
    }
    return json({ error: error?.message || 'Unexpected server error' }, { status: 500 });
  }
};
