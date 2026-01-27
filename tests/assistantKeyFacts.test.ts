import { describe, expect, test } from "vitest";

const parseAssistantKeyFacts = (memory: string | null | undefined): string[] => {
  const raw = String(memory || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
    }
  } catch {
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
};

const mergeAssistantKeyFact = (memory: string | null | undefined, newFactRaw: string): string => {
  const newFact = String(newFactRaw || "").trim().replace(/^[-*•]\s*/, "").trim();
  if (!newFact) return JSON.stringify(parseAssistantKeyFacts(memory));
  const existing = parseAssistantKeyFacts(memory);
  const needle = newFact.toLowerCase();
  const has = existing.some((f) => f.toLowerCase() === needle);
  const next = has ? existing : [...existing, newFact];
  return JSON.stringify(next);
};

describe("assistant key facts parsing/merge", () => {
  test("parses JSON array memory", () => {
    expect(parseAssistantKeyFacts('["a","b"]')).toEqual(["a", "b"]);
  });

  test("parses bullet/newline memory", () => {
    expect(parseAssistantKeyFacts("- a\n- b\nc")).toEqual(["a", "b", "c"]);
  });

  test("merges new fact into JSON array without corruption", () => {
    const next = mergeAssistantKeyFact('["a"]', "b");
    expect(next).toBe('["a","b"]');
  });

  test("does not duplicate existing fact (case-insensitive)", () => {
    const next = mergeAssistantKeyFact('["Daily report"]', "daily report");
    expect(next).toBe('["Daily report"]');
  });
});

