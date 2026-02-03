import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

function stripMarkdownCodeFence(raw) {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match?.[1]) return match[1].trim();
  if (raw.includes("```")) {
    const lines = raw.split(/\r?\n/);
    if (lines[0]?.trim().startsWith("```")) lines.shift();
    const last = lines[lines.length - 1]?.trim();
    if (last?.startsWith("```")) lines.pop();
    return lines.join("\n").trim();
  }
  return raw.trim();
}

function escapeNewlinesInJsonStrings(input) {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }

    if (ch === "\n") {
      out += "\\n";
      continue;
    }

    if (ch === "\r") {
      continue;
    }

    out += ch;
  }

  return out;
}

function stripThinkingTags(raw) {
  if (!raw || typeof raw !== "string") return "";
  // Remove <think>...</think> blocks if present, case-insensitive
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Also remove any stray opening/closing tags if they somehow remained
  cleaned = cleaned.replace(/<think>|<\/think>/gi, "");
  return cleaned.trim();
}

function parseJsonBestEffort(raw) {
  const withoutThinking = stripThinkingTags(raw);
  const jsonString = stripMarkdownCodeFence(withoutThinking);
  if (!jsonString) return { text: withoutThinking || "I'm sorry, I couldn't process that request." };

  try {
    return JSON.parse(jsonString);
  } catch {
    const repaired = escapeNewlinesInJsonStrings(jsonString);
    try {
      return JSON.parse(repaired);
    } catch {
      const start = repaired.indexOf("{");
      const end = repaired.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(repaired.slice(start, end + 1));
        } catch {
        }
      }
      return { text: withoutThinking || "I'm sorry, I couldn't process that request." };
    }
  }
}

function extractJsonFromModelContent(raw) {
  return parseJsonBestEffort(raw);
}

function extractUpstreamErrorMessage(raw) {
  try {
    const parsed = JSON.parse(raw);
    const msg = parsed?.error?.message || parsed?.error?.statusMessage || parsed?.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  } catch {
  }
  return raw || "Upstream error";
}

function toText(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toGeminiPayloadFromMessages(messages) {
  const system = messages.find((m) => m?.role === "system");
  const systemText = system ? toText(system.content) : "";
  const contents = messages
    .filter((m) => m && m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: toText(m.content) }],
    }));

  return {
    systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
    contents,
  };
}

function normalizeBaseUrl(url) {
  if (!url || typeof url !== "string") return "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const rateLimitWindowMs = toPositiveInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 60000);
const rateLimitMax = toPositiveInt(process.env.AI_RATE_LIMIT_MAX, 30);
const rateLimitBuckets = new Map();

const maxConcurrent = toPositiveInt(process.env.AI_MAX_CONCURRENT, 1);
const requestQueue = [];
let activeRequests = 0;

function getClientId(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (raw && typeof raw === "string") return raw.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function checkRateLimit(req) {
  const now = Date.now();
  const clientId = getClientId(req);
  const existing = rateLimitBuckets.get(clientId);
  if (!existing || now > existing.resetAt) {
    const next = { count: 1, resetAt: now + rateLimitWindowMs };
    rateLimitBuckets.set(clientId, next);
    return { limited: false, retryAfterMs: 0 };
  }
  if (existing.count >= rateLimitMax) {
    return { limited: true, retryAfterMs: Math.max(0, existing.resetAt - now) };
  }
  existing.count += 1;
  rateLimitBuckets.set(clientId, existing);
  return { limited: false, retryAfterMs: 0 };
}

function enqueue(task) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ task, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (activeRequests >= maxConcurrent) return;
  const next = requestQueue.shift();
  if (!next) return;
  activeRequests += 1;
  try {
    const result = await next.task();
    next.resolve(result);
  } catch (error) {
    next.reject(error);
  } finally {
    activeRequests -= 1;
    processQueue();
  }
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 200_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "content-type, authorization");
    res.setHeader("access-control-allow-methods", "POST, OPTIONS");
    json(res, 200, { ok: true });
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  const rate = checkRateLimit(req);
  if (rate.limited) {
    const retrySeconds = Math.ceil(rate.retryAfterMs / 1000);
    res.setHeader("retry-after", String(retrySeconds));
    json(res, 429, { error: `Rate limit exceeded. Please try again in ${retrySeconds}s.`, status: 429 });
    return;
  }

  const lmStudioBaseUrl = normalizeBaseUrl(process.env.LM_STUDIO_BASE_URL || process.env.LM_STUDIO_URL || "");
  const lmStudioApiKey = process.env.LM_STUDIO_API_KEY || "";
  const lmStudioModel = process.env.LM_STUDIO_MODEL || "openai/gpt-oss-20b";
  if (lmStudioBaseUrl) {
    console.log(`[LM Studio] Routing request to: ${lmStudioBaseUrl}/v1/chat/completions (Model: ${lmStudioModel})`);
  }
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

  let cachedLmStudioModelId = "";
  let cachedLmStudioModelFetchedAt = 0;
  async function resolveLmStudioModelId() {
    const now = Date.now();
    if (cachedLmStudioModelId && now - cachedLmStudioModelFetchedAt < 60_000) {
      return cachedLmStudioModelId;
    }
    const headers = { "content-type": "application/json" };
    if (/\.ngrok(-free)?\./i.test(lmStudioBaseUrl) || /\bngrok\b/i.test(lmStudioBaseUrl)) headers["ngrok-skip-browser-warning"] = "1";
    if (lmStudioApiKey) headers.authorization = `Bearer ${lmStudioApiKey}`;
    const upstream = await fetch(`${lmStudioBaseUrl}/v1/models`, { method: "GET", headers });
    const raw = await upstream.text();
    if (!upstream.ok) {
      const message = extractUpstreamErrorMessage(raw);
      throw new Error(`LM Studio /v1/models failed (${upstream.status}): ${message}`);
    }
    const data = raw ? JSON.parse(raw) : {};
    const modelId = data?.data?.[0]?.id || "";
    cachedLmStudioModelId = typeof modelId === "string" ? modelId : "";
    cachedLmStudioModelFetchedAt = now;
    return cachedLmStudioModelId;
  }

  let body = null;
  try {
    const rawBody = await readBody(req);
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    body = null;
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    json(res, 400, { error: "Invalid request body" });
    return;
  }

  const model = body?.model || process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const temperature = typeof body?.temperature === "number" ? body.temperature : 0.7;
  const maxTokens = typeof body?.max_tokens === "number" ? body.max_tokens : 2000;

  try {
    const result = await enqueue(async () => {
      if (lmStudioBaseUrl) {
        const headers = { "content-type": "application/json" };
        if (/\.ngrok(-free)?\./i.test(lmStudioBaseUrl) || /\bngrok\b/i.test(lmStudioBaseUrl)) headers["ngrok-skip-browser-warning"] = "1";
        if (lmStudioApiKey) headers.authorization = `Bearer ${lmStudioApiKey}`;
        let modelToUse = lmStudioModel;
        if (!modelToUse) {
          try {
            modelToUse = await resolveLmStudioModelId();
          } catch (error) {
            console.warn("[LM Studio] Failed to auto-resolve model id:", error?.message || String(error));
            modelToUse = "";
          }
        }
        const bodyToSend = {
          messages,
          temperature,
          max_tokens: maxTokens,
        };
        if (modelToUse) bodyToSend.model = modelToUse;
        console.log(`[LM Studio Request] Body: ${JSON.stringify(bodyToSend, null, 2)}`);
        const upstream = await fetch(`${lmStudioBaseUrl}/v1/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(bodyToSend),
        });
        const raw = await upstream.text();
        if (!upstream.ok) {
          const message = extractUpstreamErrorMessage(raw);
          return { status: upstream.status, body: { error: message, status: upstream.status } };
        }
        const data = raw ? JSON.parse(raw) : {};
        const responseText = data?.choices?.[0]?.message?.content || "";
        const parsed = extractJsonFromModelContent(responseText || raw);
        return { status: 200, body: parsed };
      }

      if (!geminiApiKey) {
        return { status: 500, body: { error: "Server is not configured. Missing GEMINI_API_KEY." } };
      }

      const payload = toGeminiPayloadFromMessages(messages);
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            ...payload,
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
            },
          }),
        }
      );

      const raw = await upstream.text();

      if (!upstream.ok) {
        const message = extractUpstreamErrorMessage(raw);
        return { status: upstream.status, body: { error: message, status: upstream.status } };
      }

      const data = raw ? JSON.parse(raw) : {};
      const responseText =
        data?.candidates?.[0]?.content?.parts?.map((p) => p?.text).filter(Boolean).join("") || "";
      const parsed = extractJsonFromModelContent(responseText);
      return { status: 200, body: parsed };
    });
    json(res, result.status, result.body);
  } catch (error) {
    console.error("[api/chat] Unexpected error:", error);
    json(res, 500, { error: error?.message || "Unexpected server error" });
  }
}
