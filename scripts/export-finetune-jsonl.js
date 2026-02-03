import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = new Map();
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, true);
      continue;
    }
    args.set(key, next);
    i++;
  }
  return args;
}

function stripThinkingTags(raw) {
  if (typeof raw !== "string") return "";
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  cleaned = cleaned.replace(/<think>[\s\S]*/gi, "");
  cleaned = cleaned.replace(/<think>|<\/think>/gi, "");
  return cleaned.trim();
}

function normalizeRole(role) {
  const r = String(role || "").toLowerCase().trim();
  if (r === "system" || r === "developer") return "system";
  if (r === "user" || r === "human") return "user";
  if (r === "assistant" || r === "model") return "assistant";
  if (r === "tool") return "tool";
  return r || "user";
}

function coerceMessages(sample) {
  if (sample && Array.isArray(sample.messages)) return sample.messages;
  if (sample && Array.isArray(sample.conversations)) {
    return sample.conversations.map((c) => {
      const role = c?.from === "human" ? "user" : c?.from === "gpt" ? "assistant" : c?.from;
      return { role, content: c?.value ?? "" };
    });
  }
  return null;
}

function normalizeMessages(messages) {
  const normalized = messages
    .map((m) => {
      const role = normalizeRole(m?.role ?? m?.from);
      const content = m?.content ?? m?.value ?? "";
      const name = m?.name;
      const tool_calls = m?.tool_calls;
      const thinking = m?.thinking;
      const out = { role, content: typeof content === "string" ? content : JSON.stringify(content) };
      if (typeof name === "string" && name.trim()) out.name = name.trim();
      if (tool_calls != null) out.tool_calls = tool_calls;
      if (thinking != null) out.thinking = thinking;
      return out;
    })
    .filter((m) => typeof m.content === "string" && m.content.trim().length > 0 || m.role === "tool" || m.tool_calls);

  for (const msg of normalized) {
    if (msg.role === "assistant" && typeof msg.content === "string") {
      msg.content = stripThinkingTags(msg.content);
    }
  }

  const systemMessages = normalized.filter((m) => m.role === "system");
  const rest = normalized.filter((m) => m.role !== "system");

  const condensed = [];
  for (const msg of rest) {
    const last = condensed[condensed.length - 1];
    if (!last) {
      if (msg.role === "assistant") continue;
      condensed.push({ ...msg });
      continue;
    }
    if (last.role === msg.role && msg.role !== "tool") {
      last.content = `${String(last.content).trim()}\n\n${String(msg.content).trim()}`.trim();
      continue;
    }
    condensed.push({ ...msg });
  }

  const finalMessages = [...systemMessages, ...condensed].filter((m) => {
    if (m.role === "assistant" && typeof m.content === "string") return m.content.trim().length > 0 || m.tool_calls;
    if (m.role === "user" && typeof m.content === "string") return m.content.trim().length > 0;
    if (m.role === "system" && typeof m.content === "string") return m.content.trim().length > 0;
    return true;
  });

  return finalMessages;
}

async function collectInputFiles(inputPath) {
  const stat = await fs.stat(inputPath);
  if (stat.isFile()) return [inputPath];
  const entries = await fs.readdir(inputPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.join(inputPath, e.name))
    .filter((p) => p.toLowerCase().endsWith(".json") || p.toLowerCase().endsWith(".jsonl"));
}

async function readSamplesFromFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  if (filePath.toLowerCase().endsWith(".jsonl")) {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  return [parsed];
}

async function main() {
  const args = parseArgs(process.argv);
  const inputPath = args.get("in");
  const outputPath = args.get("out");
  if (!inputPath || !outputPath) {
    process.stderr.write("Usage: node scripts/export-finetune-jsonl.js --in <dir|file> --out <file>\n");
    process.exit(1);
  }

  const files = await collectInputFiles(path.resolve(String(inputPath)));
  const rows = [];

  for (const file of files) {
    const samples = await readSamplesFromFile(file);
    for (const sample of samples) {
      const messages = coerceMessages(sample);
      if (!messages) continue;
      const normalizedMessages = normalizeMessages(messages);
      if (normalizedMessages.length < 2) continue;
      rows.push({ messages: normalizedMessages });
    }
  }

  await fs.mkdir(path.dirname(path.resolve(String(outputPath))), { recursive: true });
  const out = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  await fs.writeFile(path.resolve(String(outputPath)), out, "utf8");
  process.stdout.write(`Wrote ${rows.length} samples to ${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error?.message || error) + "\n");
  process.exit(1);
});

