import React from 'react';
import type { OKRCheckinRow, OKRCycleRow, OKRKeyResultRow } from '../okrTypes';
import { computeKrProgress, formatPercent, isCheckinDue } from '../okrUtils';
import type { ObjectiveWithKrs } from './okrShared';
import { Pill, ProgressBar } from './OKRUi';
import { quarterRange, toQuarterLabel } from './okrDateUtils';
import { OKRConfirmDialog } from './OKRConfirmDialog';

type ConfirmState =
  | null
  | {
      title: string;
      message: string;
      confirmLabel: string;
      onConfirm: () => Promise<any>;
    };

export function OKRDashboard(props: {
  cycles: OKRCycleRow[];
  selectedCycleId: string | null;
  onSelectCycleId: (id: string | null) => void;
  objectives: ObjectiveWithKrs[];
  latestCheckinByKr: Record<string, OKRCheckinRow | undefined>;
  isLoading: boolean;
  isSaving: boolean;
  onCreateObjective: (draft: { title: string; description: string; priority: number }) => Promise<any>;
  onOpenObjective: (objectiveId: string) => void;
  onDeleteObjective: (objectiveId: string) => Promise<any>;
  onCreateCycle: (draft: { name: string; cadence: 'quarterly' | 'annual' | 'custom'; start_date: string; end_date: string; reminder_time: string }) => Promise<any>;
  onDeleteCycle: (cycleId: string) => Promise<any>;
}) {
  const { cycles, selectedCycleId, onSelectCycleId, objectives, latestCheckinByKr, isLoading, isSaving, onCreateObjective, onOpenObjective, onDeleteObjective, onCreateCycle, onDeleteCycle } = props;
  const [objectiveDraft, setObjectiveDraft] = React.useState({ title: '', description: '', priority: 3 });
  const [isAddingCycle, setIsAddingCycle] = React.useState(false);

  type CycleDraft = {
    name: string;
    cadence: 'quarterly' | 'annual' | 'custom';
    start_date: string;
    end_date: string;
    reminder_time: string;
  };

  const [cycleDraft, setCycleDraft] = React.useState<CycleDraft>(() => {
    const nowLocal = new Date();
    const range = quarterRange(nowLocal);
    return { name: toQuarterLabel(nowLocal), cadence: 'quarterly', start_date: range.start, end_date: range.end, reminder_time: '09:00' };
  });
  const [confirmState, setConfirmState] = React.useState<ConfirmState>(null);

  const now = React.useMemo(() => new Date(), []);

  const dueKrs = React.useMemo(() => {
    const list: Array<{ objectiveId: string; objectiveTitle: string; kr: OKRKeyResultRow } > = [];
    objectives.forEach((o) => {
      o.krs.forEach((kr) => {
        if (!kr.reminder_enabled) return;
        const last = latestCheckinByKr[kr.id]?.created_at ?? null;
        if (isCheckinDue({ frequency: kr.checkin_frequency, lastCheckinAt: last, now })) {
          list.push({ objectiveId: o.id, objectiveTitle: o.title, kr });
        }
      });
    });
    return list.slice(0, 8);
  }, [objectives, latestCheckinByKr, now]);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">OKRs</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Personal improvement check-ins, in Crimson.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => setIsAddingCycle((p) => !p)}
            className="h-10 rounded-lg px-3 text-sm font-semibold text-primary-700 dark:text-primary-200 border border-primary-200/80 dark:border-primary-800/50 hover:bg-primary-50 dark:hover:bg-primary-950/30 disabled:opacity-50"
          >
            Add OKR
          </button>
          <button
            type="button"
            disabled={isSaving || !selectedCycleId}
            onClick={async () => {
              const selected = cycles.find((c) => c.id === selectedCycleId) || null;
              if (!selectedCycleId) return;
              setConfirmState({
                title: `Delete OKR cycle${selected?.name ? ` "${selected.name}"` : ''}?`,
                message: 'This will delete objectives, key results, and check-ins in this cycle.',
                confirmLabel: 'Delete',
                onConfirm: async () => {
                  const res = await onDeleteCycle(selectedCycleId);
                  if (res?.ok !== false) setConfirmState(null);
                },
              });
            }}
            className="h-10 rounded-lg px-3 text-sm font-semibold text-red-700 dark:text-red-200 border border-red-200/80 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
          >
            Delete
          </button>
          <select
            value={selectedCycleId || ''}
            onChange={(e) => onSelectCycleId(e.target.value || null)}
            className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isAddingCycle ? (
        <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-primary-600 uppercase tracking-wider">New OKR Cycle</div>
            <button
              type="button"
              onClick={() => setIsAddingCycle(false)}
              className="h-8 rounded-lg px-2 text-xs font-semibold text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              Close
            </button>
          </div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-12 gap-2">
            <input
              value={cycleDraft.name}
              onChange={(e) => setCycleDraft((p) => ({ ...p, name: e.target.value }))}
              className="sm:col-span-5 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
            />
            <select
              value={cycleDraft.cadence}
              onChange={(e) => setCycleDraft((p) => ({ ...p, cadence: e.target.value as 'quarterly' | 'annual' | 'custom' }))}
              className="sm:col-span-2 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
            >
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom</option>
            </select>
            <input
              value={cycleDraft.start_date}
              onChange={(e) => setCycleDraft((p) => ({ ...p, start_date: e.target.value }))}
              type="date"
              className="sm:col-span-2 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
            />
            <input
              value={cycleDraft.end_date}
              onChange={(e) => setCycleDraft((p) => ({ ...p, end_date: e.target.value }))}
              type="date"
              className="sm:col-span-2 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
            />
            <input
              value={cycleDraft.reminder_time}
              onChange={(e) => setCycleDraft((p) => ({ ...p, reminder_time: e.target.value }))}
              type="time"
              className="sm:col-span-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
            />
            <button
              type="button"
              disabled={isSaving || !cycleDraft.name.trim()}
              onClick={async () => {
                const res = await onCreateCycle({
                  name: cycleDraft.name,
                  cadence: cycleDraft.cadence,
                  start_date: cycleDraft.start_date,
                  end_date: cycleDraft.end_date,
                  reminder_time: cycleDraft.reminder_time,
                });
                if (res?.ok) setIsAddingCycle(false);
              }}
              className="sm:col-span-12 h-10 rounded-lg bg-primary-600 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Create Cycle
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 space-y-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
            <div className="text-xs font-bold text-primary-600 uppercase tracking-wider">New Objective</div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                value={objectiveDraft.title}
                onChange={(e) => setObjectiveDraft((p) => ({ ...p, title: e.target.value }))}
                placeholder="Objective title"
                className="sm:col-span-6 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
              />
              <input
                value={objectiveDraft.description}
                onChange={(e) => setObjectiveDraft((p) => ({ ...p, description: e.target.value }))}
                placeholder="Why it matters (optional)"
                className="sm:col-span-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
              />
              <button
                type="button"
                disabled={isSaving || !selectedCycleId || !objectiveDraft.title.trim()}
                onClick={async () => {
                  const res = await onCreateObjective(objectiveDraft);
                  if (res?.ok) setObjectiveDraft({ title: '', description: '', priority: 3 });
                }}
                className="sm:col-span-2 h-10 rounded-lg bg-primary-600 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-300">Loading…</div>
          ) : objectives.length ? (
            <div className="space-y-3">
              {objectives.map((o) => (
                <div key={o.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{o.title}</div>
                        <Pill label={formatPercent(o.progress01)} tone="primary" />
                      </div>
                      {o.description ? <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">{o.description}</div> : null}
                      <div className="mt-3"><ProgressBar value01={o.progress01} /></div>
                      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">{o.krs.length} key result{o.krs.length === 1 ? '' : 's'}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={async () => {
                          setConfirmState({
                            title: `Delete objective "${o.title}"?`,
                            message: 'This will delete its key results and check-ins.',
                            confirmLabel: 'Delete',
                            onConfirm: async () => {
                              const res = await onDeleteObjective(o.id);
                              if (res?.ok !== false) setConfirmState(null);
                            },
                          });
                        }}
                        className="h-9 rounded-lg px-3 text-sm font-semibold text-red-700 dark:text-red-200 border border-red-200/80 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenObjective(o.id)}
                        className="h-9 rounded-lg px-3 text-sm font-semibold text-primary-700 dark:text-primary-200 border border-primary-200/80 dark:border-primary-800/50 hover:bg-primary-50 dark:hover:bg-primary-950/30"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-300">No objectives yet.</div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100">Check-ins Due</div>
              <Pill label={String(dueKrs.length)} tone={dueKrs.length ? 'warn' : 'neutral'} />
            </div>
            <div className="mt-3 space-y-2">
              {dueKrs.length ? (
                dueKrs.map(({ objectiveId, objectiveTitle, kr }) => {
                  const progress = computeKrProgress(kr);
                  return (
                    <button
                      key={kr.id}
                      type="button"
                      onClick={() => onOpenObjective(objectiveId)}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{kr.title}</div>
                          <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 truncate">{objectiveTitle}</div>
                        </div>
                        <div className="text-xs font-bold text-primary-700 dark:text-primary-200">{formatPercent(progress)}</div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="text-sm text-gray-600 dark:text-gray-300">You’re up to date.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <OKRConfirmDialog
        isOpen={Boolean(confirmState)}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        confirmLabel={confirmState?.confirmLabel}
        isBusy={isSaving}
        onClose={() => setConfirmState(null)}
        onConfirm={async () => {
          if (!confirmState) return;
          await confirmState.onConfirm();
        }}
      />
    </div>
  );
}
