import React from 'react';
import type { OKRKeyResultRow, OKRMetricType, OKRObjectiveRow, OKRTargetOperator, OKRTrackingStatus } from '../okrTypes';

type DraftObjective = {
  title: string;
  description: string;
  objective_component: string;
  weightage: string;
  tracking_status: OKRTrackingStatus;
};

type DraftKr = {
  id?: string;
  title: string;
  metric: string;
  metric_type: OKRMetricType;
  target_operator: OKRTargetOperator;
  target_value: string;
  achieved_value: string;
  weight: string;
  initiatives: string;
  start_date: string;
  end_date: string;
  tracking_status: OKRTrackingStatus;
  data_source: string;
  budget_target_value: string;
  stretch_target_value: string;
};

const TRACKING_STATUSES: Array<{ value: OKRTrackingStatus; label: string }> = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'started', label: 'Started' },
  { value: 'on_track', label: 'On Track' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'off_track', label: 'Off Track' },
  { value: 'completed', label: 'Completed' },
];

const TARGET_OPERATORS: Array<{ value: OKRTargetOperator; label: string }> = [
  { value: 'equal_to', label: 'Is equal to' },
  { value: 'gte', label: 'Greater than or equal to' },
  { value: 'lte', label: 'Less than or equal to' },
];

const METRIC_TYPES: Array<{ value: OKRMetricType; label: string }> = [
  { value: 'number', label: 'Number' },
  { value: 'percent', label: 'Percent' },
  { value: 'currency', label: 'Currency' },
  { value: 'count', label: 'Count' },
  { value: 'milestone', label: 'Milestone' },
];

function AutosizeTextarea(props: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  className: string;
  minHeightPx: number;
}) {
  const { value, onChange, placeholder, className, minHeightPx } = props;
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    const next = Math.max(minHeightPx, el.scrollHeight);
    el.style.height = `${next}px`;
  }, [value, minHeightPx]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      style={{ resize: 'vertical', overflow: 'hidden' }}
    />
  );
}

function numOrNull(input: string): number | null {
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

function toDateOnly(input: string): string {
  return String(input || '').slice(0, 10);
}

function fillDraftFromObjective(o: OKRObjectiveRow | null): DraftObjective {
  return {
    title: o?.title || '',
    description: o?.description || '',
    objective_component: o?.objective_component || '',
    weightage: o?.weightage != null ? String(o.weightage) : '',
    tracking_status: (o?.tracking_status as OKRTrackingStatus) || 'not_started',
  };
}

function fillDraftFromKr(kr: OKRKeyResultRow): DraftKr {
  return {
    id: kr.id,
    title: kr.title || '',
    metric: kr.metric || '',
    metric_type: kr.metric_type || 'number',
    target_operator: (kr.target_operator as OKRTargetOperator) || 'equal_to',
    target_value: kr.target_value != null ? String(kr.target_value) : '',
    achieved_value: kr.achieved_value != null ? String(kr.achieved_value) : String(kr.current_value ?? ''),
    weight: kr.weight != null ? String(kr.weight) : '1',
    initiatives: kr.initiatives || '',
    start_date: toDateOnly(kr.start_date || ''),
    end_date: toDateOnly(kr.end_date || kr.due_date || ''),
    tracking_status: (kr.tracking_status as OKRTrackingStatus) || 'not_started',
    data_source: kr.data_source || '',
    budget_target_value: kr.budget_target_value != null ? String(kr.budget_target_value) : '',
    stretch_target_value: kr.stretch_target_value != null ? String(kr.stretch_target_value) : '',
  };
}

function emptyKrDraft(): DraftKr {
  return {
    title: '',
    metric: '',
    metric_type: 'number',
    target_operator: 'equal_to',
    target_value: '',
    achieved_value: '',
    weight: '1',
    initiatives: '',
    start_date: '',
    end_date: '',
    tracking_status: 'not_started',
    data_source: '',
    budget_target_value: '',
    stretch_target_value: '',
  };
}

export function ObjectiveDrawer(props: {
  isOpen: boolean;
  objective: OKRObjectiveRow | null;
  krs: OKRKeyResultRow[];
  isSaving: boolean;
  onClose: () => void;
  onCreateObjective: (draft: { title: string; description: string; priority: number; objective_component?: string | null; weightage?: number | null; tracking_status?: OKRTrackingStatus | null }) => Promise<any>;
  onUpdateObjective: (objectiveId: string, patch: Partial<OKRObjectiveRow>) => Promise<any>;
  onCreateKr: (objectiveId: string, draft: any) => Promise<any>;
  onUpdateKr: (krId: string, patch: Partial<OKRKeyResultRow>) => Promise<any>;
}) {
  const { isOpen, objective, krs, isSaving, onClose, onCreateObjective, onUpdateObjective, onCreateKr, onUpdateKr } = props;
  const isEdit = Boolean(objective?.id);

  const [objDraft, setObjDraft] = React.useState<DraftObjective>(() => fillDraftFromObjective(objective));
  const [krDrafts, setKrDrafts] = React.useState<DraftKr[]>(() => (krs || []).map(fillDraftFromKr));

  React.useEffect(() => {
    if (!isOpen) return;
    setObjDraft(fillDraftFromObjective(objective));
    setKrDrafts((krs || []).map(fillDraftFromKr));
  }, [isOpen, objective, krs]);

  if (!isOpen) return null;

  return (
    <div className="h-full bg-white dark:bg-gray-900 flex flex-col overflow-x-hidden">
      <div className="sticky top-0 z-10 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{isEdit ? 'Update Objective' : 'Add Objective'}</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">Edit objective + key results (Darwinbox-style fields)</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-lg px-3 text-sm font-semibold text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Close
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-5">
        <div className="space-y-2">
          <div className="text-xs font-bold text-gray-700 dark:text-gray-200">Objective</div>
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Objective Title</div>
              <input
                value={objDraft.title}
                onChange={(e) => setObjDraft((p) => ({ ...p, title: e.target.value }))}
                placeholder="Objective Title"
                className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Objective Description</div>
              <AutosizeTextarea
                value={objDraft.description}
                onChange={(next) => setObjDraft((p) => ({ ...p, description: next }))}
                placeholder="Objective Description"
                minHeightPx={140}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Objective Component</div>
                <input
                  value={objDraft.objective_component}
                  onChange={(e) => setObjDraft((p) => ({ ...p, objective_component: e.target.value }))}
                  placeholder="Objective Component"
                  className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Objective Weightage %</div>
                  <input
                    value={objDraft.weightage}
                    onChange={(e) => setObjDraft((p) => ({ ...p, weightage: e.target.value }))}
                    placeholder="Weightage %"
                    className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Objective Status</div>
                  <select
                    value={objDraft.tracking_status}
                    onChange={(e) => setObjDraft((p) => ({ ...p, tracking_status: e.target.value as OKRTrackingStatus }))}
                    className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                  >
                    {TRACKING_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-gray-700 dark:text-gray-200">Key Results</div>
            <button
              type="button"
              onClick={() => setKrDrafts((p) => [...p, emptyKrDraft()])}
              className="h-8 rounded-lg px-3 text-xs font-semibold text-primary-700 dark:text-primary-200 border border-primary-200/80 dark:border-primary-800/50 hover:bg-primary-50 dark:hover:bg-primary-950/30"
            >
              + Key Result
            </button>
          </div>

          <div className="space-y-3">
            {krDrafts.map((kr, idx) => (
              <div key={kr.id || `new-${idx}`} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 p-3">
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Key Result</div>
                    <input
                      value={kr.title}
                      onChange={(e) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))}
                      placeholder="Key Result Title"
                      className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Initiatives</div>
                    <AutosizeTextarea
                      value={kr.initiatives}
                      onChange={(next) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, initiatives: next } : x)))}
                      placeholder="Initiatives"
                      minHeightPx={120}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Start Date</div>
                      <input
                        value={kr.start_date}
                        onChange={(e) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, start_date: e.target.value } : x)))}
                        type="date"
                        className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">End Date</div>
                      <input
                        value={kr.end_date}
                        onChange={(e) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, end_date: e.target.value } : x)))}
                        type="date"
                        className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Target</div>
                      <input
                        value={kr.target_value}
                        onChange={(e) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, target_value: e.target.value } : x)))}
                        placeholder="Target"
                        className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Target Type</div>
                      <select
                        value={kr.target_operator}
                        onChange={(e) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, target_operator: e.target.value as OKRTargetOperator } : x)))}
                        className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                      >
                        {TARGET_OPERATORS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Metric</div>
                      <input
                        value={kr.metric}
                        onChange={(e) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, metric: e.target.value } : x)))}
                        placeholder="Metric"
                        className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Metric Type</div>
                      <select
                        value={kr.metric_type}
                        onChange={(e) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, metric_type: e.target.value as OKRMetricType } : x)))}
                        className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                      >
                        {METRIC_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Achieved</div>
                      <input
                        value={kr.achieved_value}
                        onChange={(e) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, achieved_value: e.target.value } : x)))}
                        placeholder="Achieved"
                        className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">KR Status</div>
                      <select
                        value={kr.tracking_status}
                        onChange={(e) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, tracking_status: e.target.value as OKRTrackingStatus } : x)))}
                        className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                      >
                        {TRACKING_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">KR Weight</div>
                      <input
                        value={kr.weight}
                        onChange={(e) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, weight: e.target.value } : x)))}
                        placeholder="Weightage %"
                        className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Budget Target</div>
                      <input
                        value={kr.budget_target_value}
                        onChange={(e) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, budget_target_value: e.target.value } : x)))}
                        placeholder="Budget Target"
                        className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div className="space-y-1 min-w-0 sm:col-span-2">
                      <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Stretch Target</div>
                      <input
                        value={kr.stretch_target_value}
                        onChange={(e) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, stretch_target_value: e.target.value } : x)))}
                        placeholder="Stretch Target"
                        className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Data Source</div>
                    <input
                      value={kr.data_source}
                      onChange={(e) => setKrDrafts((p) => p.map((x, i) => (i === idx ? { ...x, data_source: e.target.value } : x)))}
                      placeholder="Data Source (e.g., Trust You, Power BI, Navision)"
                      className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setKrDrafts((p) => p.filter((_, i) => i !== idx))}
                    className="h-9 rounded-lg px-3 text-sm font-semibold text-red-700 dark:text-red-200 border border-red-200/80 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    Remove KR (local)
                  </button>
                </div>
              </div>
            ))}
            {!krDrafts.length ? <div className="text-sm text-gray-600 dark:text-gray-300">No key results yet.</div> : null}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 overflow-x-hidden">
        <button
          type="button"
          disabled={isSaving}
          onClick={onClose}
          className="h-10 w-full sm:w-auto rounded-lg px-4 text-sm font-semibold text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isSaving || !objDraft.title.trim()}
          onClick={async () => {
            if (!objDraft.title.trim()) return;

            if (!isEdit) {
              const created = await onCreateObjective({
                title: objDraft.title,
                description: objDraft.description,
                priority: 3,
                objective_component: objDraft.objective_component.trim() || null,
                weightage: numOrNull(objDraft.weightage),
                tracking_status: objDraft.tracking_status,
              });
              const objectiveId = created?.objective?.id || created?.objectiveId || created?.id || created?.data?.id;
              if (!created?.ok || !objectiveId) return;

              for (const kr of krDrafts) {
                if (!kr.title.trim()) continue;
                await onCreateKr(objectiveId, {
                  title: kr.title,
                  metric_type: kr.metric_type,
                  direction: kr.target_operator === 'lte' ? 'decrease_to' : kr.metric_type === 'milestone' ? 'complete' : 'increase_to',
                  unit: '',
                  start_value: '0',
                  target_value: kr.target_value,
                  due_date: kr.end_date || new Date().toISOString().slice(0, 10),
                  checkin_frequency: 'weekly',
                  metric: kr.metric,
                  target_operator: kr.target_operator,
                  initiatives: kr.initiatives,
                  start_date: kr.start_date || null,
                  end_date: kr.end_date || null,
                  achieved_value: numOrNull(kr.achieved_value),
                  tracking_status: kr.tracking_status,
                  data_source: kr.data_source,
                  budget_target_value: numOrNull(kr.budget_target_value),
                  stretch_target_value: numOrNull(kr.stretch_target_value),
                });
              }
              onClose();
              return;
            }

            await onUpdateObjective(objective!.id, {
              title: objDraft.title,
              description: objDraft.description.trim() || null,
              objective_component: objDraft.objective_component.trim() || null,
              weightage: numOrNull(objDraft.weightage),
              tracking_status: objDraft.tracking_status,
            });

            for (const kr of krDrafts) {
              if (!kr.title.trim()) continue;
              const patch: Partial<OKRKeyResultRow> = {
                title: kr.title,
                metric: kr.metric.trim() || null,
                metric_type: kr.metric_type,
                target_operator: kr.target_operator,
                target_value: Number(kr.target_value) || 0,
                achieved_value: numOrNull(kr.achieved_value),
                current_value: numOrNull(kr.achieved_value) ?? 0,
                initiatives: kr.initiatives.trim() || null,
                start_date: kr.start_date || null,
                end_date: kr.end_date || null,
                due_date: kr.end_date || objective?.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
                tracking_status: kr.tracking_status,
                data_source: kr.data_source.trim() || null,
                budget_target_value: numOrNull(kr.budget_target_value),
                stretch_target_value: numOrNull(kr.stretch_target_value),
                weight: Number(kr.weight) || 1,
              };

              if (kr.id) {
                await onUpdateKr(kr.id, patch);
              } else {
                await onCreateKr(objective!.id, {
                  title: patch.title,
                  metric_type: patch.metric_type,
                  direction: kr.target_operator === 'lte' ? 'decrease_to' : kr.metric_type === 'milestone' ? 'complete' : 'increase_to',
                  unit: '',
                  start_value: '0',
                  target_value: String(patch.target_value ?? 0),
                  due_date: patch.due_date || new Date().toISOString().slice(0, 10),
                  checkin_frequency: 'weekly',
                  metric: kr.metric,
                  target_operator: kr.target_operator,
                  initiatives: kr.initiatives,
                  start_date: kr.start_date || null,
                  end_date: kr.end_date || null,
                  achieved_value: numOrNull(kr.achieved_value),
                  tracking_status: kr.tracking_status,
                  data_source: kr.data_source,
                  budget_target_value: numOrNull(kr.budget_target_value),
                  stretch_target_value: numOrNull(kr.stretch_target_value),
                });
              }
            }

            onClose();
          }}
          className="h-10 w-full sm:w-auto rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
