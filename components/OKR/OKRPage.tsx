import React from 'react';
import { useDashboardContext } from '../DashboardContext';
import { MyGoalPlan } from './MyGoalPlan';
import { ObjectiveDrawer } from './ObjectiveDrawer';
import { Pill } from './OKRUi';
import { quarterRange, toQuarterLabel } from './okrDateUtils';
import { useOKRData } from './useOKRData';
import { isMissingColumnError, isMissingTableError } from './okrShared';
import { buildGoalPlanWorkbook, inspectGoalPlanWorkbook, parseGoalPlanWorkbook } from './okrExcelImport';
import { buildOkrInsightsPayload, requestOkrInsights } from './okrAssistantInsights';
import { OKRImportDialog } from './OKRImportDialog';

type CycleDraft = {
  name: string;
  cadence: 'quarterly' | 'annual' | 'custom';
  start_date: string;
  end_date: string;
  reminder_time: string;
};

export default function OKRPage() {
  const { userProfile, setNotificationModal } = useDashboardContext();
  const userId = userProfile?.id || null;
  const okr = useOKRData(userId);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [pendingImport, setPendingImport] = React.useState<{
    fileName: string;
    buffer: ArrayBuffer;
    candidateSheets: string[];
    defaultSelected: string[];
  } | null>(null);

  const missingSetup = React.useMemo(() => {
    if (!okr.loadError) return false;
    const err = { message: okr.loadError };
    return isMissingTableError(err) || isMissingColumnError(err);
  }, [okr.loadError]);
  const selectedCycle = React.useMemo(() => okr.cycles.find((c) => c.id === okr.selectedCycleId) || null, [okr.cycles, okr.selectedCycleId]);

  const [insights, setInsights] = React.useState<any>(null);
  const [insightsError, setInsightsError] = React.useState<string | null>(null);
  const [isInsightsLoading, setIsInsightsLoading] = React.useState(false);

  const [drawerObjectiveId, setDrawerObjectiveId] = React.useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);

  const drawerObjective = React.useMemo(() => {
    if (!drawerObjectiveId) return null;
    return okr.objectives.find((o) => o.id === drawerObjectiveId) || null;
  }, [okr.objectives, drawerObjectiveId]);

  const drawerKrs = React.useMemo(() => {
    if (!drawerObjectiveId) return [];
    return okr.objectives.find((o) => o.id === drawerObjectiveId)?.krs || [];
  }, [okr.objectives, drawerObjectiveId]);

  const [cycleDraft, setCycleDraft] = React.useState<CycleDraft>(() => {
    const now = new Date();
    const range = quarterRange(now);
    return { name: toQuarterLabel(now), cadence: 'quarterly' as const, start_date: range.start, end_date: range.end, reminder_time: '09:00' };
  });

  const hasMissingTable = (res: any) => Boolean(res && typeof res === 'object' && 'missingTable' in res && res.missingTable);

  if (!userId) {
    return (
      <div className="flex-1 min-h-0 p-4 md:p-6 bg-gray-100 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="text-sm text-gray-700 dark:text-gray-200">Loading profile…</div>
        </div>
      </div>
    );
  }

  if (missingSetup) {
    return (
      <div className="flex-1 min-h-0 p-4 md:p-6 bg-gray-100 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-bold text-gray-900 dark:text-gray-100">OKRs</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Personal improvement check-ins, in Crimson.</div>
            </div>
            <Pill label="Setup Required" tone="warn" />
          </div>
          <div className="mt-3 text-sm text-gray-700 dark:text-gray-200">
            Run <span className="font-mono">migrations/okr_personal_mvp.sql</span> (and <span className="font-mono">migrations/okr_darwinbox_upgrade.sql</span> if you want Darwinbox fields) in your Supabase SQL Editor, then refresh.
          </div>
          {okr.loadError ? <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">{okr.loadError}</div> : null}
        </div>
      </div>
    );
  }

  if (!okr.cycles.length && !okr.isLoading) {
    return (
      <div className="flex-1 min-h-0 p-4 md:p-6 bg-gray-100 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-bold text-gray-900 dark:text-gray-100">OKRs</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Start a cycle to begin tracking progress.</div>
            </div>
            <Pill label="Start Here" tone="primary" />
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
            <div className="text-xs font-bold text-primary-600 uppercase tracking-wider">Create Cycle</div>
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
              <button
                type="button"
                disabled={okr.isSaving || !cycleDraft.name.trim()}
                onClick={async () => {
                  const res = await okr.createCycleForUser(cycleDraft);
                  if (!res.ok) {
                    const msg = hasMissingTable(res) ? 'OKR tables are missing in Supabase. Run migrations/okr_personal_mvp.sql, then refresh the app.' : res.error;
                    setNotificationModal({ isOpen: true, title: 'Create Cycle Failed', message: msg });
                  }
                }}
                className="sm:col-span-1 h-10 rounded-lg bg-primary-600 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 p-4 md:p-6 bg-gray-100 dark:bg-gray-900 overflow-y-auto overflow-x-hidden">
      <div className="max-w-7xl mx-auto">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0] || null;
            e.target.value = '';
            if (!f) return;
            if (f.size > 5 * 1024 * 1024) {
              setNotificationModal({ isOpen: true, title: 'Import Failed', message: 'File is too large. Please upload an Excel file under 5 MB.' });
              return;
            }
            try {
              const buf = await f.arrayBuffer();
              const inspected = inspectGoalPlanWorkbook(buf);
              const candidateSheets = inspected.candidateSheets.length ? inspected.candidateSheets : inspected.sheetNames;
              const userNeedle = String(userProfile.nickname || userProfile.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
              const defaultSelected = candidateSheets.filter((s) => userNeedle.length >= 3 && s.toLowerCase().includes(userNeedle));
              const fallbackSelected = candidateSheets.includes('DEPARTMENTAL') ? ['DEPARTMENTAL'] : candidateSheets.slice(0, 1);
              setPendingImport({ fileName: f.name, buffer: buf, candidateSheets, defaultSelected: defaultSelected.length ? defaultSelected : fallbackSelected });
            } catch (err: any) {
              setNotificationModal({ isOpen: true, title: 'Import Failed', message: String(err?.message || err) });
            }
          }}
        />

        <OKRImportDialog
          isOpen={Boolean(pendingImport)}
          fileName={pendingImport?.fileName || ''}
          sheetNames={pendingImport?.candidateSheets || []}
          defaultSelected={pendingImport?.defaultSelected || []}
          defaultIntoNewCycle={true}
          onCancel={() => setPendingImport(null)}
          onConfirm={async ({ selectedSheets, importIntoNewCycle }) => {
            if (!pendingImport) return;
            try {
              const pending = pendingImport;
              setPendingImport(null);
              setNotificationModal({ isOpen: true, title: 'Importing Excel…', message: 'Parsing workbook and importing rows into a cycle.' });

              const rows = parseGoalPlanWorkbook(pending.buffer, { includeSheets: selectedSheets });
              if (!rows.length) {
                setNotificationModal({ isOpen: true, title: 'Import Failed', message: 'No OKR rows were detected in the selected sheets.' });
                return;
              }

              let cycleId = okr.selectedCycleId;
              if (!cycleId || importIntoNewCycle) {
                const now = new Date();
                const range = quarterRange(now);
                const baseName = pending.fileName.replace(/\.(xlsx|xls)$/i, '');
                const name = baseName || toQuarterLabel(now);
                const res = await okr.createCycleForUser({ name, cadence: 'custom', start_date: range.start, end_date: range.end, reminder_time: '09:00' });
                if (!res.ok) {
                  setNotificationModal({ isOpen: true, title: 'Import Failed', message: res.error });
                  return;
                }
                cycleId = res.cycle.id;
                okr.setSelectedCycleId(cycleId);
              }

              const existingByKey = new Map<string, { id: string; krTitles: Set<string> }>();
              okr.objectives.forEach((o) => {
                const key = `${(o.objective_component || '').trim().toLowerCase()}::${o.title.trim().toLowerCase()}`;
                existingByKey.set(key, { id: o.id, krTitles: new Set((o.krs || []).map((kr) => kr.title.trim().toLowerCase())) });
              });

              const krTitleByObjKey = new Map<string, Set<string>>();
              existingByKey.forEach((v, k) => krTitleByObjKey.set(k, new Set(v.krTitles)));

              const objectiveIdByKey = new Map<string, string>();
              let createdObjectives = 0;
              let createdKrs = 0;

              for (const r of rows) {
                const objKey = `${(r.objective_component || '').trim().toLowerCase()}::${r.objective_title.trim().toLowerCase()}`;
                let objectiveId = objectiveIdByKey.get(objKey) || existingByKey.get(objKey)?.id || null;

                if (!objectiveId) {
                  const res = await okr.createObjectiveForCycle({
                    title: r.objective_title,
                    description: r.objective_description,
                    priority: 3,
                    objective_component: r.objective_component || null,
                    weightage: r.objective_weightage,
                    tracking_status: 'not_started',
                  });
                  if (!res.ok) continue;
                  objectiveId = res.objective.id;
                  objectiveIdByKey.set(objKey, objectiveId);
                  if (!krTitleByObjKey.has(objKey)) krTitleByObjKey.set(objKey, new Set());
                  createdObjectives += 1;
                }

                const newKrTitleKey = r.kr_title.trim().toLowerCase();
                const known = krTitleByObjKey.get(objKey);
                if (known?.has(newKrTitleKey)) continue;

                const target = r.target_value != null ? String(r.target_value) : '0';
                const endDate = r.end_date || new Date().toISOString().slice(0, 10);
                const achieved = r.achieved_value != null ? String(r.achieved_value) : '';

                const resKr = await okr.createKeyResultForObjective(objectiveId, {
                  title: r.kr_title,
                  metric_type: r.metric_type,
                  direction: r.target_operator === 'lte' ? 'decrease_to' : r.metric_type === 'milestone' ? 'complete' : 'increase_to',
                  unit: '',
                  start_value: '0',
                  target_value: target,
                  due_date: endDate,
                  checkin_frequency: 'weekly',

                  metric: r.metric,
                  target_operator: r.target_operator,
                  initiatives: r.initiatives,
                  start_date: r.start_date,
                  end_date: r.end_date,
                  achieved_value: achieved,
                  tracking_status: r.tracking_status,
                  data_source: r.data_source,
                  weight: r.kr_weight ?? 1,
                  budget_target_value: r.budget_target_value == null ? null : String(r.budget_target_value),
                  stretch_target_value: r.stretch_target_value == null ? null : String(r.stretch_target_value),
                });
                if (resKr.ok) {
                  createdKrs += 1;
                  if (known) known.add(newKrTitleKey);
                }
              }

              await okr.refreshObjectives();
              setNotificationModal({ isOpen: true, title: 'Import Complete', message: `Imported ${createdObjectives} objectives and ${createdKrs} key results.` });
            } catch (err: any) {
              setNotificationModal({ isOpen: true, title: 'Import Failed', message: String(err?.message || err) });
            }
          }}
        />
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-4 ${isDrawerOpen ? 'items-start' : ''}`}>
          <div className={isDrawerOpen ? 'lg:col-span-7' : 'lg:col-span-12'}>
            <MyGoalPlan
              cycles={okr.cycles}
              selectedCycleId={okr.selectedCycleId}
              onSelectCycleId={okr.setSelectedCycleId}
              objectives={okr.objectives}
              latestCheckinByKr={okr.latestCheckinByKr}
              isLoading={okr.isLoading}
              isSaving={okr.isSaving}
              onDeleteComponent={async (objectiveComponent) => {
                if (!okr.selectedCycleId) return;
                const ok = window.confirm(`Delete Objective Component "${objectiveComponent}"? This deletes all objectives + key results + check-ins under it.`);
                if (!ok) return;
                const res = await okr.deleteObjectivesByComponent(objectiveComponent);
                if (!res.ok) setNotificationModal({ isOpen: true, title: 'Delete Failed', message: res.error });
              }}
              onDeleteAll={async () => {
                if (!okr.selectedCycleId) return;
                const ok = window.confirm('Delete ALL objectives in this cycle? This cannot be undone.');
                if (!ok) return;
                const res = await okr.deleteAllObjectivesInSelectedCycle();
                if (!res.ok) setNotificationModal({ isOpen: true, title: 'Delete Failed', message: res.error });
              }}
              onRunInsights={async () => {
                setInsightsError(null);
                setIsInsightsLoading(true);
                try {
                  const payload = buildOkrInsightsPayload({ cycle: selectedCycle, objectives: okr.objectives });
                  const res = await requestOkrInsights({ payload });
                  if (!res.ok) {
                    setInsights(null);
                    setInsightsError(res.error);
                  } else {
                    setInsights(res.insights);
                  }
                } catch (err: any) {
                  setInsights(null);
                  setInsightsError(String(err?.message || err));
                } finally {
                  setIsInsightsLoading(false);
                }
              }}
              insights={insights}
              insightsError={insightsError}
              isInsightsLoading={isInsightsLoading}
              onOpenDrawer={({ objectiveId }) => {
                setDrawerObjectiveId(objectiveId);
                setIsDrawerOpen(true);
              }}
              onImportExcel={() => fileInputRef.current?.click()}
              onExportExcel={() => {
                const cycleName = selectedCycle?.name || 'Goal Plan';
                const sheetName = String(userProfile.nickname || userProfile.name || cycleName).trim() || 'Goal Plan';
                const rows = okr.objectives.flatMap((o) =>
                  (o.krs || []).map((kr) => ({
                    objective_component: (o.objective_component || '').trim() || 'Uncategorized',
                    objective_title: o.title,
                    objective_description: o.description || '',
                    objective_weightage: o.weightage == null ? null : Number(o.weightage),
                    kr_title: kr.title,
                    metric: kr.metric || '',
                    target_operator: kr.target_operator || 'equal_to',
                    target_value: kr.target_value == null ? null : Number(kr.target_value),
                    kr_weight: kr.weight == null ? null : Number(kr.weight),
                    initiatives: kr.initiatives || '',
                    start_date: kr.start_date || null,
                    end_date: kr.end_date || null,
                    tracking_status: (kr.tracking_status as any) || 'not_started',
                    achieved_value: kr.achieved_value == null ? null : Number(kr.achieved_value),
                    metric_type: kr.metric_type,
                    data_source: kr.data_source || '',
                    budget_target_value: kr.budget_target_value == null ? null : Number(kr.budget_target_value),
                    stretch_target_value: kr.stretch_target_value == null ? null : Number(kr.stretch_target_value),
                  }))
                );

                const buf = buildGoalPlanWorkbook({ sheetName, rows });
                const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${cycleName.replace(/[^a-z0-9\-_. ]/gi, '_')}.xlsx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              }}
            />
          </div>
          {isDrawerOpen ? (
            <div className="lg:col-span-5 h-[calc(100dvh-120px)] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <ObjectiveDrawer
                isOpen={isDrawerOpen}
                objective={drawerObjective}
                krs={drawerKrs}
                isSaving={okr.isSaving}
                onClose={() => {
                  setIsDrawerOpen(false);
                  setDrawerObjectiveId(null);
                }}
                onCreateObjective={async (draft) => {
                  const res = await okr.createObjectiveForCycle({
                    title: draft.title,
                    description: draft.description,
                    priority: 3,
                    objective_component: (draft as any).objective_component,
                    weightage: (draft as any).weightage,
                    tracking_status: (draft as any).tracking_status,
                  } as any);
                  if (!res.ok) {
                    const msg = hasMissingTable(res)
                      ? 'OKR tables are missing in Supabase. Run migrations/okr_personal_mvp.sql (and okr_darwinbox_upgrade.sql), then refresh the app.'
                      : res.error;
                    setNotificationModal({ isOpen: true, title: 'Create Objective Failed', message: msg });
                  }
                  return res;
                }}
                onUpdateObjective={async (objectiveId, patch) => {
                  const res = await okr.updateObjectiveById(objectiveId, patch);
                  if (!res.ok) setNotificationModal({ isOpen: true, title: 'Update Objective Failed', message: res.error });
                  return res;
                }}
                onCreateKr={async (objectiveId, draft) => {
                  const res = await okr.createKeyResultForObjective(objectiveId, draft);
                  if (!res.ok) {
                    const msg = hasMissingTable(res)
                      ? 'OKR tables are missing in Supabase. Run migrations/okr_personal_mvp.sql (and okr_darwinbox_upgrade.sql), then refresh the app.'
                      : res.error;
                    setNotificationModal({ isOpen: true, title: 'Create KR Failed', message: msg });
                  }
                  return res;
                }}
                onUpdateKr={async (krId, patch) => {
                  const res = await okr.updateKeyResultById(krId, patch);
                  if (!res.ok) setNotificationModal({ isOpen: true, title: 'Update KR Failed', message: res.error });
                  return res;
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
