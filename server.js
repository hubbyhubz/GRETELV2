import dotenv from "dotenv";
import express from "express";

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

function extractJsonFromModelContent(raw) {
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

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "200kb" }));

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const geminiApiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.VITE_GOOGLE_API_KEY ||
    "";
  if (!geminiApiKey) {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const lastUser = [...messages].reverse().find((m) => m?.role === "user");
    const lastText = lastUser ? toText(lastUser.content) : "";
    res.status(200).json({
      text: lastText
        ? `Mock reply (local, no Gemini key configured): I received: ${lastText}`
        : "Mock reply (local, no Gemini key configured).",
    });
    return;
  }

  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const model = req.body?.model || process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const temperature = typeof req.body?.temperature === "number" ? req.body.temperature : 0.7;
  const maxTokens = typeof req.body?.max_tokens === "number" ? req.body.max_tokens : 2000;

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
      res.status(upstream.status).json({
        error: message,
        status: upstream.status,
      });
      return;
    }

    const data = raw ? JSON.parse(raw) : {};
    const responseText =
      data?.candidates?.[0]?.content?.parts?.map((p) => p?.text).filter(Boolean).join("") || "";
    const parsed = extractJsonFromModelContent(responseText);
    res.status(200).json(parsed);
  } catch (error) {
    res.status(500).json({ error: error?.message || "Unexpected server error" });
  }
});

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});
if (typeof server?.ref === "function") server.ref();
