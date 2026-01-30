import React from 'react';
import type { OKRCheckinRow, OKRCycleRow } from '../okrTypes';
import type { ObjectiveWithKrs } from './okrShared';
import { Pill } from './OKRUi';
import type { OkrAssistantOutput } from './okrAssistantInsights';

function formatScore(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

function computeObjectiveAchievementScore01(o: ObjectiveWithKrs): number {
  const v = Number.isFinite(Number(o.achievement_score))
    ? Number(o.achievement_score) / 100
    : Number.isFinite(Number(o.progress01))
      ? Number(o.progress01)
      : 0;
  return Math.max(0, Math.min(1, v));
}

function normalizeWeightage(o: ObjectiveWithKrs): number {
  const w = Number(o.weightage);
  if (!Number.isFinite(w) || w <= 0) return 1;
  return w;
}

function normalizeStatus(o: ObjectiveWithKrs): 'neutral' | 'primary' | 'success' | 'warn' {
  const s = String(o.tracking_status || '').toLowerCase();
  if (s === 'completed') return 'success';
  if (s === 'on_track') return 'primary';
  if (s === 'at_risk' || s === 'off_track') return 'warn';
  return 'neutral';
}

function labelStatus(s: string | null | undefined): string {
  const v = String(s || '').toLowerCase();
  if (v === 'not_started') return 'Not Started';
  if (v === 'started') return 'Started';
  if (v === 'on_track') return 'On Track';
  if (v === 'completed') return 'Completed';
  if (v === 'at_risk') return 'At Risk';
  if (v === 'off_track') return 'Off Track';
  return 'Not Started';
}

export function MyGoalPlan(props: {
  cycles: OKRCycleRow[];
  selectedCycleId: string | null;
  onSelectCycleId: (id: string | null) => void;
  objectives: ObjectiveWithKrs[];
  latestCheckinByKr: Record<string, OKRCheckinRow | undefined>;
  isLoading: boolean;
  isSaving: boolean;
  onOpenDrawer: (params: { objectiveId: string | null }) => void;
  onImportExcel: () => void;
  onExportExcel: () => void;
  onDeleteComponent: (objectiveComponent: string) => void;
  onDeleteAll: () => void;
  onRunInsights: () => void;
  insights: OkrAssistantOutput | null;
  insightsError: string | null;
  isInsightsLoading: boolean;
}) {
  const { cycles, selectedCycleId, onSelectCycleId, objectives, isLoading, isSaving, onOpenDrawer, onImportExcel, onExportExcel, onDeleteComponent, onDeleteAll, onRunInsights, insights, insightsError, isInsightsLoading } = props;

  const [expandedObjectiveIds, setExpandedObjectiveIds] = React.useState<Record<string, boolean>>({});
  const [expandedComponents, setExpandedComponents] = React.useState<Record<string, boolean>>({});

  const grouped = React.useMemo(() => {
    const map = new Map<string, ObjectiveWithKrs[]>();
    objectives.forEach((o) => {
      const key = (o.objective_component || 'Uncategorized').trim() || 'Uncategorized';
      const list = map.get(key) || [];
      list.push(o);
      map.set(key, list);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [objectives]);

  const kpi = React.useMemo(() => {
    const totalGoals = objectives.length;
    const weights = objectives.map(normalizeWeightage);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const weightedScore = objectives.reduce((sum, o, i) => sum + computeObjectiveAchievementScore01(o) * weights[i], 0);
    const avgScore01 = totalWeight > 0 ? weightedScore / totalWeight : 0;
    const overallScore = weightedScore * 100;
    const avgScore = avgScore01 * 100;
    return { totalGoals, avgScore, overallScore };
  }, [objectives]);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">My Goal Plan</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Darwinbox-style goal plan tracking, in Crimson.</div>
        </div>
        <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onImportExcel}
            className="h-10 rounded-lg px-3 text-xs sm:text-sm font-semibold whitespace-nowrap text-primary-700 dark:text-primary-200 border border-primary-200/80 dark:border-primary-800/50 hover:bg-primary-50 dark:hover:bg-primary-950/30 disabled:opacity-50"
          >
            Import Excel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onExportExcel}
            className="h-10 rounded-lg px-3 text-xs sm:text-sm font-semibold whitespace-nowrap text-primary-700 dark:text-primary-200 border border-primary-200/80 dark:border-primary-800/50 hover:bg-primary-50 dark:hover:bg-primary-950/30 disabled:opacity-50"
          >
            Export Excel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onDeleteAll}
            className="h-10 rounded-lg px-3 text-xs sm:text-sm font-semibold whitespace-nowrap text-rose-700 dark:text-rose-200 border border-rose-200/80 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50"
          >
            Delete All
          </button>
          <button
            type="button"
            disabled={isSaving || isInsightsLoading}
            onClick={onRunInsights}
            className="h-10 rounded-lg px-3 text-xs sm:text-sm font-semibold whitespace-nowrap text-primary-700 dark:text-primary-200 border border-primary-200/80 dark:border-primary-800/50 hover:bg-primary-50 dark:hover:bg-primary-950/30 disabled:opacity-50"
          >
            {isInsightsLoading ? 'Analyzing…' : 'Assistant Insights'}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => onOpenDrawer({ objectiveId: null })}
            className="h-10 rounded-lg bg-primary-600 px-3 text-xs sm:text-sm font-semibold whitespace-nowrap text-white hover:bg-primary-700 disabled:opacity-50"
          >
            + Add Objective
          </button>
          <select
            value={selectedCycleId || ''}
            onChange={(e) => onSelectCycleId(e.target.value || null)}
            className="h-10 w-full sm:w-auto flex-1 sm:flex-none min-w-[180px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-xs sm:text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{kpi.totalGoals}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total Goals / Key Result Areas</div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{formatScore(kpi.avgScore)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Average Achievement Score</div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{formatScore(kpi.overallScore)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Overall Achievement Score</div>
          </div>
        </div>
      </div>

      {insightsError ? (
        <div className="mt-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 p-4">
          <div className="text-sm font-bold text-rose-900 dark:text-rose-100">Assistant Insights</div>
          <div className="mt-1 text-sm text-rose-800 dark:text-rose-200">{insightsError}</div>
        </div>
      ) : insights ? (
        <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100">Assistant Insights</div>
              <div className="mt-1 text-sm text-gray-700 dark:text-gray-200">{insights.summary}</div>
            </div>
            <Pill label={`${Math.round(Number(insights.overall_score_0_100 || 0))}/100`} tone={Number(insights.overall_score_0_100 || 0) >= 80 ? 'success' : Number(insights.overall_score_0_100 || 0) >= 60 ? 'primary' : 'warn'} />
          </div>

          {insights.top_risks?.length ? (
            <div className="mt-3">
              <div className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Top Risks</div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                {insights.top_risks.slice(0, 6).map((r) => (
                  <div key={r} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-700 dark:text-gray-200">
                    {r}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {insights.issues?.length ? (
            <div className="mt-4">
              <div className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Fixes</div>
              <div className="mt-2 space-y-2">
                {insights.issues.slice(0, 10).map((it, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {it.scope === 'objective' ? it.objective_title : `${it.objective_title} — ${it.key_result_title}`}
                      </div>
                      <Pill label={it.severity.toUpperCase()} tone={it.severity === 'high' ? 'danger' : it.severity === 'medium' ? 'warn' : 'neutral'} />
                    </div>
                    <div className="mt-1 text-sm text-gray-700 dark:text-gray-200">{it.issue}</div>
                    <div className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                      <span className="font-semibold">Fix: </span>
                      {it.fix}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {insights.suggested_rewrites?.length ? (
            <div className="mt-4">
              <div className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Suggested Rewrites</div>
              <div className="mt-2 space-y-2">
                {insights.suggested_rewrites.slice(0, 8).map((s, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{s.objective_title} — {s.key_result_title}</div>
                    {s.improved_key_result_title ? (
                      <div className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                        <span className="font-semibold">KR: </span>
                        {s.improved_key_result_title}
                      </div>
                    ) : null}
                    {s.improved_initiatives ? (
                      <div className="mt-2 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-line">
                        <span className="font-semibold">Initiatives: </span>
                        {s.improved_initiatives}
                      </div>
                    ) : null}
                    {s.recommended_target_operator && s.recommended_target_value != null ? (
                      <div className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                        <span className="font-semibold">Target: </span>
                        {s.recommended_target_operator} {s.recommended_target_value}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {insights.next_checkins?.length ? (
            <div className="mt-4">
              <div className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Next Check-ins</div>
              <div className="mt-2 space-y-2">
                {insights.next_checkins.slice(0, 6).map((n, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{n.objective_title} — {n.key_result_title}</div>
                    <div className="mt-1 text-sm text-gray-700 dark:text-gray-200">{n.recommended_next_step}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-gray-900 dark:text-gray-100">Objective Components</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Count of Objective: Min 1 - Max 30</div>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {isLoading ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-300">Loading…</div>
        ) : grouped.length ? (
          grouped.map(([component, list]) => {
            const isOpen = expandedComponents[component] ?? true;
            return (
              <div key={component} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedComponents((p) => ({ ...p, [component]: !isOpen }))}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">Objective Component: {component}</div>
                    <Pill label={String(list.length)} tone="neutral" />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteComponent(component);
                      }}
                      className="h-8 rounded-lg px-2 text-xs font-semibold text-rose-700 dark:text-rose-200 border border-rose-200/80 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </button>
                {isOpen ? (
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {list.map((o) => {
                      const rowOpen = expandedObjectiveIds[o.id] ?? false;
                      const score = Number.isFinite(Number(o.achievement_score)) ? Number(o.achievement_score) : Math.round(o.progress01 * 100);
                      const weight = Number.isFinite(Number(o.weightage)) ? Number(o.weightage) : null;
                      return (
                        <div key={o.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setExpandedObjectiveIds((p) => ({ ...p, [o.id]: !rowOpen }))}
                              className="min-w-0 text-left"
                            >
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{o.title}</div>
                                <Pill label={labelStatus(o.tracking_status)} tone={normalizeStatus(o)} />
                              </div>
                              {o.description ? <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300 truncate">{o.description}</div> : null}
                            </button>
                            <div className="shrink-0 flex items-center gap-4">
                              <div className="text-right">
                                <div className="text-[11px] text-gray-500 dark:text-gray-400">Achievement Score</div>
                                <div className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">{formatScore(score)}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[11px] text-gray-500 dark:text-gray-400">Weightage</div>
                                <div className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">{weight != null ? `${weight}%` : '—'}</div>
                              </div>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => onOpenDrawer({ objectiveId: o.id })}
                                className="h-9 rounded-lg px-3 text-sm font-semibold text-primary-700 dark:text-primary-200 border border-primary-200/80 dark:border-primary-800/50 hover:bg-primary-50 dark:hover:bg-primary-950/30 disabled:opacity-50"
                              >
                                Show Details
                              </button>
                            </div>
                          </div>

                          {rowOpen ? (
                            <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                              <div className="grid grid-cols-12 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-[11px] text-gray-600 dark:text-gray-300">
                                <div className="col-span-4 font-semibold">Key Result</div>
                                <div className="col-span-2 font-semibold">Metric</div>
                                <div className="col-span-2 font-semibold">Target</div>
                                <div className="col-span-2 font-semibold">Achieved</div>
                                <div className="col-span-2 font-semibold">Status</div>
                              </div>
                              {o.krs.length ? (
                                o.krs.map((kr) => (
                                  <div key={kr.id} className="grid grid-cols-12 px-3 py-2 text-xs text-gray-800 dark:text-gray-200 border-t border-gray-200 dark:border-gray-700">
                                    <div className="col-span-4 truncate">{kr.title}</div>
                                    <div className="col-span-2 truncate">{kr.metric || '—'}</div>
                                    <div className="col-span-2 tabular-nums truncate">{String(kr.target_value ?? '')}</div>
                                    <div className="col-span-2 tabular-nums truncate">{String(kr.achieved_value ?? kr.current_value ?? '')}</div>
                                    <div className="col-span-2">
                                      <Pill label={labelStatus(kr.tracking_status)} tone="neutral" />
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="px-3 py-3 text-sm text-gray-600 dark:text-gray-300">No key results yet.</div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-300">No objectives yet.</div>
        )}
      </div>
    </div>
  );
}
