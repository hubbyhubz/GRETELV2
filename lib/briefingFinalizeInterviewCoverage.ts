export type InterviewCoverage = {
  ops: string[];
  risks: string[];
};

const extractInterviewAnswersFromConsolidatedNotes = (notes: string): string[] => {
  const lines = String(notes || '').split('\n');
  const startIndex = lines.findIndex((l) => /^\s*1\.\s+INTERVIEW\s+ANSWERS\s*:\s*$/i.test(String(l || '').trim()));
  if (startIndex < 0) return [];

  const answers: Record<number, string[]> = {};
  let currentA: number | null = null;

  for (let i = startIndex + 1; i < lines.length; i++) {
    const raw = String(lines[i] ?? '');
    const trimmed = raw.trim();

    if (/^\s*\d+\.\s+.+:\s*$/i.test(raw) && !/^\s*\d+\.\s+INTERVIEW\s+ANSWERS\s*:\s*$/i.test(raw)) break;

    const aMatch = raw.match(/^\s*A(\d+)\s*:\s*(.*)$/i);
    if (aMatch) {
      currentA = Number(aMatch[1]);
      const rest = String(aMatch[2] || '').trim();
      if (!answers[currentA]) answers[currentA] = [];
      if (rest) answers[currentA].push(rest);
      continue;
    }

    if (/^\s*Q\d+\s*:/i.test(raw)) {
      currentA = null;
      continue;
    }

    if (currentA != null && trimmed) {
      if (!answers[currentA]) answers[currentA] = [];
      answers[currentA].push(trimmed);
    }
  }

  const out: string[] = [];
  for (let idx = 1; idx <= 4; idx++) {
    const joined = (answers[idx] || []).join(' ').replace(/\s+/g, ' ').trim();
    out.push(joined);
  }
  return out;
};

const splitSentences = (value: string): string[] =>
  String(value || '')
    .replace(/^"+|"+$/g, '')
    .replace(/^'+|'+$/g, '')
    .split(/(?<=[.!?])\s+/)
    .map((x) => String(x || '').trim())
    .filter(Boolean);

const isStartSentence = (sentence: string): boolean => {
  const s = String(sentence || '').trim();
  if (!s) return false;
  if (/^(progress|delegated|task|mandatory|operational|first\s+priority|constraint|incident)\s*:/i.test(s)) return true;
  if (/^(test\s+event\s+setup)\s*:/i.test(s)) return true;
  if (/^[A-Z][A-Za-z0-9'()&.\- ]{1,48}:\s+/.test(s)) return true;
  return false;
};

const shouldKeepDetailSentence = (sentence: string): boolean => {
  const s = String(sentence || '').trim();
  if (!s) return false;
  if (/\b(radio|call|print|printed|organize|organized|log|logged|timestamp)\b/i.test(s)) return true;
  if (/\b(recurring|recurrence|recurrences)\b/i.test(s)) return true;
  if (/\b(fluctuat|switch|spill|audit|buffer|slick|towel)\b/i.test(s)) return true;
  if (/\b(not\s+yet\s+returned|has\s+not\s+yet\s+returned|returned\s+with|collected|sprayer|sprayers)\b/i.test(s)) return true;
  if (/\b(extremely\s+disciplined|disciplined\s+with\s+usage|must\s+be\s+extremely\s+disciplined|usage)\b/i.test(s)) return true;
  if (/\b\d{1,2}:\d{2}\b/.test(s)) return true;
  if (/\b\d{1,2}\s*(am|pm)\b/i.test(s)) return true;
  if (/\b\d+\s*(minute|minutes|hour|hours)\b/i.test(s)) return true;
  if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/.test(s) && /\b(tomorrow|today|before|after|by|at)\b/i.test(s)) return true;
  return false;
};

const buildGroupedBullets = (answerText: string): string[] => {
  const sentences = splitSentences(answerText);
  const bullets: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    const joined = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (joined && !/:\s*$/.test(joined)) bullets.push(joined);
    buf = [];
  };

  for (const sentence of sentences) {
    if (isStartSentence(sentence)) {
      if (buf.length > 0) flush();
      buf.push(sentence);
      continue;
    }

    if (buf.length > 0 && shouldKeepDetailSentence(sentence)) {
      buf.push(sentence);
      continue;
    }
  }

  if (buf.length > 0) flush();
  return bullets;
};

const categorize = (bullet: string): 'ops' | 'risks' => {
  const s = String(bullet || '').toLowerCase();
  if (/^(constraint|incident)\s*:/.test(s)) return 'risks';
  if (/\b(spill|audit|slick|hazard|risk|blocker|constraint|fluctuat|switch|buffer|towel)\b/.test(s)) return 'risks';
  return 'ops';
};

export const deriveAfternoonInterviewCoverage = (notes: string): InterviewCoverage => {
  const answers = extractInterviewAnswersFromConsolidatedNotes(notes);
  const bullets = answers.flatMap(buildGroupedBullets);

  const ops: string[] = [];
  const risks: string[] = [];
  const seen = new Set<string>();
  const norm = (v: string) =>
    String(v || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  for (const b of bullets) {
    const key = norm(b);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    (categorize(b) === 'risks' ? risks : ops).push(b);
  }

  return { ops: ops.slice(0, 10), risks: risks.slice(0, 10) };
};
