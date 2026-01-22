const TITLE_FALLBACK = "I'm sorry, I couldn't process that request.";

type ChatCompletionMessage = { role: "system" | "user" | "assistant"; content: any };

type PagesFunctionContext<Env = unknown> = {
  request: Request;
  env: Env;
};

type PagesFunction<Env = unknown> = (context: PagesFunctionContext<Env>) => Promise<Response>;

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 60;

const rateLimitBuckets: Map<string, number[]> = new Map();

function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const existing = rateLimitBuckets.get(key) || [];
  const pruned = existing.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  pruned.push(now);
  rateLimitBuckets.set(key, pruned);
  return pruned.length > RATE_LIMIT_MAX;
}

function jsonResponse(body: any, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "POST, OPTIONS",
      ...init?.headers,
    },
  });
}

async function readJsonBody<T>(request: Request): Promise<T | null> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  const text = await request.text();
  if (text.length > 200_000) return null;
  return JSON.parse(text) as T;
}

function extractJsonFromModelContent(raw: string): any {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonString = (jsonMatch?.[1] ?? raw).trim();
  if (!jsonString) return { text: TITLE_FALLBACK };
  try {
    return JSON.parse(jsonString);
  } catch {
    return { text: raw || TITLE_FALLBACK };
  }
}

function extractOpenAiErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const msg = parsed?.error?.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  } catch {
  }
  return raw || "Upstream error";
}

export const onRequest: PagesFunction<any> = async ({ request, env }) => {
  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return jsonResponse({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const openAiApiKey = (env as any).OPENAI_API_KEY || (env as any).VITE_OPENAI_API_KEY || (env as any).VITE_API_KEY;
  if (!openAiApiKey) {
    return jsonResponse({ error: "Server is not configured. Missing OPENAI_API_KEY." }, { status: 500 });
  }

  type Body = {
    messages: ChatCompletionMessage[];
    model?: string;
    temperature?: number;
    max_tokens?: number;
  };

  let body: Body | null = null;
  try {
    body = await readJsonBody<Body>(request);
  } catch {
    body = null;
  }

  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonResponse({ error: "Invalid request body" }, { status: 400 });
  }

  const model = body.model || (env as any).OPENAI_MODEL || (env as any).VITE_OPENAI_MODEL || "gpt-4o";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: body.messages,
        response_format: { type: "json_object" },
        max_tokens: body.max_tokens ?? 2000,
        temperature: body.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const message = extractOpenAiErrorMessage(errorBody);
      return jsonResponse({ error: message, status: response.status }, { status: response.status });
    }

    const data: any = await response.json();
    const responseText = data?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJsonFromModelContent(responseText);
    return jsonResponse(parsed, { status: 200 });
  } catch (error: any) {
    return jsonResponse({ error: error?.message || "Unexpected server error" }, { status: 500 });
  }
};
