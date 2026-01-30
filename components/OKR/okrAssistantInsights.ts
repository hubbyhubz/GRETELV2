import type { OKRCycleRow, OKRKeyResultRow, OKRObjectiveRow, OKRTargetOperator, OKRTrackingStatus } from '../okrTypes';
import type { ObjectiveWithKrs } from './okrShared';

export type OkrAssistantIssue = {
  severity: 'high' | 'medium' | 'low';
  scope: 'objective' | 'key_result';
  objective_title?: string;
  key_result_title?: string;
  issue: string;
  fix: string;
};

export type OkrAssistantOutput = {
  summary: string;
  overall_score_0_100: number;
  top_risks: string[];
  issues: OkrAssistantIssue[];
  suggested_rewrites: Array<{
    objective_title: string;
    key_result_title: string;
    improved_key_result_title?: string;
    improved_initiatives?: string;
    recommended_target_operator?: OKRTargetOperator;
    recommended_target_value?: number;
  }>;
  next_checkins: Array<{
    objective_title: string;
    key_result_title: string;
    recommended_next_step: string;
  }>;
};

type KrPayload = Pick<
  OKRKeyResultRow,
  | 'title'
  | 'metric_type'
  | 'metric'
  | 'target_operator'
  | 'start_value'
  | 'target_value'
  | 'current_value'
  | 'achieved_value'
  | 'initiatives'
  | 'start_date'
  | 'end_date'
  | 'due_date'
  | 'tracking_status'
  | 'weight'
  | 'budget_target_value'
  | 'stretch_target_value'
  | 'data_source'
>;

type ObjectivePayload = Pick<
  OKRObjectiveRow,
  | 'title'
  | 'description'
  | 'objective_component'
  | 'weightage'
  | 'tracking_status'
  | 'achievement_score'
> & { key_results: KrPayload[] };

function clampNumber(n: any, min: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function compactText(v: any, max = 600): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function mapTrackingStatus(v: any): OKRTrackingStatus | null {
  const s = String(v || '').toLowerCase();
  if (s === 'not_started') return 'not_started';
  if (s === 'started') return 'started';
  if (s === 'on_track') return 'on_track';
  if (s === 'completed') return 'completed';
  if (s === 'at_risk') return 'at_risk';
  if (s === 'off_track') return 'off_track';
  return null;
}

export function buildOkrInsightsPayload(params: {
  cycle: OKRCycleRow | null;
  objectives: ObjectiveWithKrs[];
}) {
  const { cycle, objectives } = params;
  const objectivePayload: ObjectivePayload[] = objectives.slice(0, 30).map((o) => {
    const key_results: KrPayload[] = (o.krs || []).slice(0, 100).map((kr) => ({
      title: kr.title,
      metric_type: kr.metric_type,
      metric: compactText(kr.metric),
      target_operator: kr.target_operator || null,
      start_value: clampNumber(kr.start_value, 0, 1_000_000_000),
      target_value: clampNumber(kr.target_value, 0, 1_000_000_000),
      current_value: clampNumber(kr.current_value, 0, 1_000_000_000),
      achieved_value: kr.achieved_value == null ? null : clampNumber(kr.achieved_value, 0, 1_000_000_000),
      initiatives: compactText(kr.initiatives, 1200),
      start_date: kr.start_date || null,
      end_date: kr.end_date || null,
      due_date: kr.due_date,
      tracking_status: mapTrackingStatus(kr.tracking_status),
      weight: clampNumber(kr.weight, 0, 100),
      budget_target_value: kr.budget_target_value == null ? null : clampNumber(kr.budget_target_value, 0, 1_000_000_000),
      stretch_target_value: kr.stretch_target_value == null ? null : clampNumber(kr.stretch_target_value, 0, 1_000_000_000),
      data_source: compactText(kr.data_source, 300),
    }));

    return {
      title: o.title,
      description: compactText(o.description, 900),
      objective_component: compactText(o.objective_component, 120),
      weightage: o.weightage == null ? null : clampNumber(o.weightage, 0, 100),
      tracking_status: mapTrackingStatus(o.tracking_status),
      achievement_score: o.achievement_score == null ? null : clampNumber(o.achievement_score, 0, 200),
      key_results,
    };
  });

  return {
    cycle: cycle
      ? {
          name: cycle.name,
          cadence: cycle.cadence,
          start_date: cycle.start_date,
          end_date: cycle.end_date,
          plan_name: compactText(cycle.plan_name, 120),
          source: compactText(cycle.source, 120),
        }
      : null,
    objectives: objectivePayload,
  };
}

export async function requestOkrInsights(params: {
  payload: any;
}) {
  const { payload } = params;

  const system =
    'You are an OKR coach and QA reviewer. You audit a Darwinbox-style Goal Plan and produce actionable fixes. ' +
    'Pay close attention to Key Results, Targets, Target Types (operators), Initiatives, Dates, Weightages, and Statuses. ' +
    'Return ONLY valid JSON matching the schema described by the user message. Do not include markdown.';

  const user =
    'Analyze this Goal Plan JSON and return insights as JSON with the following schema:\n' +
    '{\n' +
    '  "summary": string,\n' +
    '  "overall_score_0_100": number,\n' +
    '  "top_risks": string[],\n' +
    '  "issues": [{"severity":"high"|"medium"|"low","scope":"objective"|"key_result","objective_title"?:string,"key_result_title"?:string,"issue":string,"fix":string}],\n' +
    '  "suggested_rewrites": [{"objective_title":string,"key_result_title":string,"improved_key_result_title"?:string,"improved_initiatives"?:string,"recommended_target_operator"?:"equal_to"|"gte"|"lte","recommended_target_value"?:number}],\n' +
    '  "next_checkins": [{"objective_title":string,"key_result_title":string,"recommended_next_step":string}]\n' +
    '}\n\n' +
    'Guidelines:\n' +
    '- Flag vague KRs, missing metrics, missing initiatives, inconsistent target operator vs direction, missing dates, weightage problems, and achieved/target anomalies.\n' +
    '- Give fixes that are specific and easy to apply in the UI.\n' +
    '- Suggest up to 8 rewrites max and up to 10 issues max.\n\n' +
    'Goal Plan JSON:\n' +
    JSON.stringify(payload);

  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: 1800,
    }),
  });

  const raw = await resp.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw || '{}');
  } catch {
    parsed = { error: raw || 'Invalid response from assistant.' };
  }

  if (!resp.ok) {
    const msg = typeof parsed?.error === 'string' ? parsed.error : raw;
    return { ok: false as const, error: msg || `Request failed (HTTP ${resp.status})` };
  }

  if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string' && parsed.text.includes('Mock reply')) {
    return { ok: false as const, error: 'Gemini API key is not configured on the server yet.' };
  }

  return { ok: true as const, insights: parsed as OkrAssistantOutput };
}

