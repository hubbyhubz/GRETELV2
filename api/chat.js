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

function parseJsonBestEffort(raw) {
  const jsonString = stripMarkdownCodeFence(raw);
  if (!jsonString) return { text: "I'm sorry, I couldn't process that request." };

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
      return { text: raw || "I'm sorry, I couldn't process that request." };
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

  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!geminiApiKey) {
    json(res, 500, { error: "Server is not configured. Missing GEMINI_API_KEY." });
    return;
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
      json(res, upstream.status, { error: message, status: upstream.status });
      return;
    }

    const data = raw ? JSON.parse(raw) : {};
    const responseText =
      data?.candidates?.[0]?.content?.parts?.map((p) => p?.text).filter(Boolean).join("") || "";
    const parsed = extractJsonFromModelContent(responseText);
    json(res, 200, parsed);
  } catch (error) {
    json(res, 500, { error: error?.message || "Unexpected server error" });
  }
}
