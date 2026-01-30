import React from 'react';
import type { OKRCheckinFrequency, OKRCheckinRow, OKRCycleRow, OKRDirection, OKRHealth, OKRKeyResultRow, OKRMetricType } from '../okrTypes';
import { computeKrProgress, formatPercent } from '../okrUtils';
import type { ObjectiveWithKrs } from './okrShared';
import { Pill, ProgressBar } from './OKRUi';

const healthTone = (health: OKRHealth): 'success' | 'warn' | 'danger' => {
  if (health === 'on_track') return 'success';
  if (health === 'at_risk') return 'warn';
  return 'danger';
};

export function OKRObjectiveDetail(props: {
  objective: ObjectiveWithKrs;
  cycle: OKRCycleRow | null;
  isSaving: boolean;
  latestCheckinByKr: Record<string, OKRCheckinRow | undefined>;
  onBack: () => void;
  onCreateKr: (objectiveId: string, draft: { title: string; metric_type: OKRMetricType; direction: OKRDirection; unit: string; start_value: string; target_value: string; due_date: string; checkin_frequency: OKRCheckinFrequency }) => Promise<any>;
  onLogCheckin: (kr: OKRKeyResultRow, params: { value: string; confidence: 1 | 2 | 3 | 4 | 5; health: OKRHealth; note: string }) => Promise<any>;
}) {
  const { objective, cycle, isSaving, latestCheckinByKr, onBack, onCreateKr, onLogCheckin } = props;
  const [krDraft, setKrDraft] = React.useState({
    title: '',
    metric_type: 'number' as OKRMetricType,
    direction: 'increase_to' as OKRDirection,
    unit: '',
    start_value: '0',
    target_value: '0',
    due_date: cycle?.end_date || '',
    checkin_frequency: 'daily' as OKRCheckinFrequency,
  });

  const [checkinDraftByKr, setCheckinDraftByKr] = React.useState<Record<string, { value: string; confidence: 1 | 2 | 3 | 4 | 5; health: OKRHealth; note: string }>>({});

  const getCheckinDraft = (kr: OKRKeyResultRow) => {
    const existing = checkinDraftByKr[kr.id];
    if (existing) return existing;
    return { value: String(kr.current_value ?? 0), confidence: 3 as const, health: 'on_track' as OKRHealth, note: '' };
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-900 dark:text-gray-100">Objective</div>
          <div className="text-base sm:text-lg font-bold text-primary-700 dark:text-primary-200 truncate">{objective.title}</div>
          {objective.description ? <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{objective.description}</div> : null}
          <div className="mt-2"><ProgressBar value01={objective.progress01} /></div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="h-9 rounded-lg px-3 text-sm font-semibold text-primary-700 dark:text-primary-200 border border-primary-200/80 dark:border-primary-800/50 hover:bg-primary-50 dark:hover:bg-primary-950/30"
        >
          Back
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
        <div className="text-xs font-bold text-primary-600 uppercase tracking-wider">Add Key Result</div>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-12 gap-2">
          <input
            value={krDraft.title}
            onChange={(e) => setKrDraft((p) => ({ ...p, title: e.target.value }))}
            placeholder="Key result title"
            className="md:col-span-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
          />
          <select
            value={krDraft.metric_type}
            onChange={(e) => setKrDraft((p) => ({ ...p, metric_type: e.target.value as OKRMetricType }))}
            className="md:col-span-2 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="number">Number</option>
            <option value="percent">Percent</option>
            <option value="currency">Currency</option>
            <option value="count">Count</option>
            <option value="milestone">Milestone</option>
          </select>
          <select
            value={krDraft.direction}
            onChange={(e) => setKrDraft((p) => ({ ...p, direction: e.target.value as OKRDirection }))}
            className="md:col-span-2 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="increase_to">Increase to</option>
            <option value="decrease_to">Decrease to</option>
            <option value="maintain_at">Maintain at</option>
            <option value="complete">Complete</option>
          </select>
          <input
            value={krDraft.unit}
            onChange={(e) => setKrDraft((p) => ({ ...p, unit: e.target.value }))}
            placeholder="Unit"
            className="md:col-span-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
          />
          <input
            value={krDraft.start_value}
            onChange={(e) => setKrDraft((p) => ({ ...p, start_value: e.target.value }))}
            placeholder="Start"
            className="md:col-span-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
          />
          <input
            value={krDraft.target_value}
            onChange={(e) => setKrDraft((p) => ({ ...p, target_value: e.target.value }))}
            placeholder="Target"
            className="md:col-span-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
          />
          <input
            value={krDraft.due_date}
            onChange={(e) => setKrDraft((p) => ({ ...p, due_date: e.target.value }))}
            type="date"
            className="md:col-span-2 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
          />
          <select
            value={krDraft.checkin_frequency}
            onChange={(e) => setKrDraft((p) => ({ ...p, checkin_frequency: e.target.value as OKRCheckinFrequency }))}
            className="md:col-span-2 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <button
            type="button"
            disabled={isSaving || !krDraft.title.trim()}
            onClick={async () => {
              const res = await onCreateKr(objective.id, krDraft);
              if (res?.ok) setKrDraft((p) => ({ ...p, title: '' }));
            }}
            className="md:col-span-2 h-10 rounded-lg bg-primary-600 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            Add KR
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {objective.krs.map((kr) => {
          const progress01 = computeKrProgress(kr);
          const last = latestCheckinByKr[kr.id];
          const draft = getCheckinDraft(kr);

          return (
            <div key={kr.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{kr.title}</div>
                    <Pill label={formatPercent(progress01)} tone="primary" />
                  </div>
                  <div className="mt-2"><ProgressBar value01={progress01} /></div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Start {String(kr.start_value)} → Target {String(kr.target_value)} • Current {String(kr.current_value)} • Due {kr.due_date}
                  </div>
                  {last ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Pill label={last.health.replace('_', ' ')} tone={healthTone(last.health)} />
                      <span className="text-xs text-gray-500 dark:text-gray-400">Last check-in: {new Date(last.created_at).toLocaleString()}</span>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">No check-ins yet.</div>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-2">
                <input
                  value={draft.value}
                  onChange={(e) => setCheckinDraftByKr((prev) => ({ ...prev, [kr.id]: { ...draft, value: e.target.value } }))}
                  className="md:col-span-2 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                />
                <select
                  value={draft.confidence}
                  onChange={(e) => setCheckinDraftByKr((prev) => ({ ...prev, [kr.id]: { ...draft, confidence: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 } }))}
                  className="md:col-span-2 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                >
                  <option value={1}>Confidence 1</option>
                  <option value={2}>Confidence 2</option>
                  <option value={3}>Confidence 3</option>
                  <option value={4}>Confidence 4</option>
                  <option value={5}>Confidence 5</option>
                </select>
                <select
                  value={draft.health}
                  onChange={(e) => setCheckinDraftByKr((prev) => ({ ...prev, [kr.id]: { ...draft, health: e.target.value as OKRHealth } }))}
                  className="md:col-span-2 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                >
                  <option value="on_track">On track</option>
                  <option value="at_risk">At risk</option>
                  <option value="off_track">Off track</option>
                </select>
                <input
                  value={draft.note}
                  onChange={(e) => setCheckinDraftByKr((prev) => ({ ...prev, [kr.id]: { ...draft, note: e.target.value } }))}
                  placeholder="Notes / blockers (optional)"
                  className="md:col-span-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => onLogCheckin(kr, draft)}
                  className="md:col-span-2 h-10 rounded-lg bg-primary-600 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  Log check-in
                </button>
              </div>
            </div>
          );
        })}
        {!objective.krs.length ? (
          <div className="rounded-xl border border-dashed border-primary-600/40 bg-primary-600/5 dark:bg-primary-600/10 p-4 text-sm text-gray-700 dark:text-gray-200">
            Add your first key result to make this objective measurable.
          </div>
        ) : null}
      </div>
    </div>
  );
}
