export type FreeStyleIntent =
  | 'finalize_plan'
  | 'cancel_pending'
  | 'proceed'
  | 'exclude_item'
  | 'mark_done';

export type FreeStyleEntityKind = 'event_ops_item' | 'schedule_item' | 'reminder' | 'unknown';

export type FreeStyleEntity = {
  kind: FreeStyleEntityKind;
  id?: string;
  name?: string;
  confidence: number;
};

export type FreeStyleInterpretation = {
  intent: FreeStyleIntent;
  confidence: number;
  entities: FreeStyleEntity[];
  signals: string[];
};

export const normalizeText = (input: string) =>
  String(input || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\p{L}\p{N}\s'"-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (input: string) => normalizeText(input).split(' ').filter(Boolean);

const unique = (arr: string[]) => Array.from(new Set(arr));

const tokenOverlapScore = (aTokens: string[], bTokens: string[]) => {
  const a = unique(aTokens);
  const b = unique(bTokens);
  if (a.length === 0 || b.length === 0) return 0;
  const bSet = new Set(b);
  const overlap = a.filter((t) => bSet.has(t)).length;
  return overlap / Math.max(1, Math.min(a.length, b.length));
};

const pickQuotedOrTail = (text: string) => {
  const raw = String(text || '');
  const quote = raw.match(/["“”']([^"“”']{2,80})["“”']/);
  if (quote?.[1]) return quote[1].trim();
  const tail = raw
    .replace(/^(please|pls|can you|could you|would you|hey|hi)\b[:\s-]*/i, '')
    .replace(/\b(don't|dont|do not|remove|exclude|skip|ignore|omit|without)\b/gi, '')
    .replace(/\b(because|since|as)\b[\s\S]*$/i, '')
    .trim();
  return tail.length <= 2 ? '' : tail.slice(0, 80);
};

export const inferFinalizePlan = (messageText: string) => {
  const text = normalizeText(messageText);
  if (!text) return false;
  const hardNo = /\b(don't|do not|dont|nope|nah|not yet|wait|hold)\b/.test(text);
  if (hardNo) return false;
  const hasFinalize = /\b(finali[sz]e|confirm|lock|apply|save)\b/.test(text);
  const hasProceed = /\b(go ahead|proceed|do it|yes|yep|sure|ok|okay|sounds good|looks good|ship it)\b/.test(text);
  if (hasFinalize) return true;
  if (hasProceed && /\b(looks good|sounds good|all set|approved)\b/.test(text)) return true;
  if (hasProceed && text.length <= 20) return true;
  return false;
};

export const inferCancel = (messageText: string) => {
  const text = normalizeText(messageText);
  return /\b(cancel|never mind|nevermind|stop|forget it|abort)\b/.test(text);
};

export const inferProceed = (messageText: string) => {
  const text = normalizeText(messageText);
  if (!text) return false;
  const softProceed = /\b(proceed|continue|go ahead|move on|carry on|next|let's do it|lets do it)\b/.test(text);
  const already = /\b(already|set up|setup|done|sorted)\b/.test(text);
  return softProceed || already;
};

export const inferExclude = (messageText: string) => {
  const text = normalizeText(messageText);
  return /\b(don't include|dont include|exclude|skip|remove|omit|ignore|without)\b/.test(text);
};

export const inferMarkDone = (messageText: string) => {
  const text = normalizeText(messageText);
  return /\b(already done|already finished|done already|completed|finished)\b/.test(text);
};

export const bestFuzzyMatch = <T extends { id?: string; name?: string; title?: string; text?: string }>(
  needleRaw: string,
  candidates: T[]
) => {
  const needle = normalizeText(needleRaw);
  const needleTokens = tokenize(needle);
  if (!needle || needleTokens.length === 0) return null;
  let best: { item: T; score: number; label: string } | null = null;
  for (const item of candidates || []) {
    const label = String(item?.name || item?.title || item?.text || '').trim();
    if (!label) continue;
    const score = tokenOverlapScore(needleTokens, tokenize(label));
    if (!best || score > best.score) best = { item, score, label };
  }
  return best;
};

export const inferFreeStyle = (params: {
  messageText: string;
  pendingScheduleClarification: boolean;
  eventOpsItems?: Array<{ id: string; name: string }>;
  scheduleItems?: Array<{ id: string; title: string }>;
  reminders?: Array<{ id: string; text: string }>;
}) => {
  const { messageText, pendingScheduleClarification, eventOpsItems = [], scheduleItems = [], reminders = [] } = params;
  const signals: string[] = [];
  const entities: FreeStyleEntity[] = [];
  const exclude = inferExclude(messageText);
  const done = inferMarkDone(messageText);
  const cancel = inferCancel(messageText);
  const finalize = inferFinalizePlan(messageText);
  const proceed = inferProceed(messageText);

  if (cancel) signals.push('cancel');
  if (finalize) signals.push('finalize');
  if (proceed) signals.push('proceed');
  if (exclude) signals.push('exclude');
  if (done) signals.push('done');

  if (exclude || done) {
    const needle = pickQuotedOrTail(messageText);
    const matchEventOps = bestFuzzyMatch(needle, eventOpsItems);
    const matchSchedule = bestFuzzyMatch(needle, scheduleItems);
    const matchReminder = bestFuzzyMatch(needle, reminders);
    const ranked = [
      matchEventOps ? { kind: 'event_ops_item' as const, ...matchEventOps } : null,
      matchSchedule ? { kind: 'schedule_item' as const, ...matchSchedule } : null,
      matchReminder ? { kind: 'reminder' as const, ...matchReminder } : null,
    ]
      .filter(Boolean) as Array<{ kind: FreeStyleEntityKind; item: any; score: number; label: string }>;

    ranked.sort((a, b) => b.score - a.score);
    if (ranked[0] && ranked[0].score >= 0.45) {
      entities.push({
        kind: ranked[0].kind,
        id: ranked[0].item.id,
        name: ranked[0].label,
        confidence: ranked[0].score,
      });
    } else if (needle) {
      entities.push({ kind: 'unknown', name: needle, confidence: 0.2 });
    }
  }

  if (finalize) return { intent: 'finalize_plan' as const, confidence: 0.9, entities, signals };
  if (cancel && pendingScheduleClarification) return { intent: 'cancel_pending' as const, confidence: 0.9, entities, signals };
  if (exclude) return { intent: 'exclude_item' as const, confidence: entities.length ? 0.75 : 0.55, entities, signals };
  if (done) return { intent: 'mark_done' as const, confidence: entities.length ? 0.7 : 0.5, entities, signals };
  if (proceed) return { intent: 'proceed' as const, confidence: 0.65, entities, signals };

  return { intent: 'proceed' as const, confidence: 0.2, entities, signals };
};
