import React from 'react';
import { useDashboardContext } from '../DashboardContext';
import { OKRDashboard } from './OKRDashboard';
import { OKRObjectiveDetail } from './OKRObjectiveDetail';
import { Pill } from './OKRUi';
import { quarterRange, toQuarterLabel } from './okrDateUtils';
import { useOKRData } from './useOKRData';
import { isMissingTableError } from './okrShared';

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

  const missingSetup = React.useMemo(() => (okr.loadError ? isMissingTableError({ message: okr.loadError }) : false), [okr.loadError]);
  const selectedObjective = React.useMemo(() => okr.objectives.find((o) => o.id === okr.selectedObjectiveId) || null, [okr.objectives, okr.selectedObjectiveId]);
  const selectedCycle = React.useMemo(() => okr.cycles.find((c) => c.id === okr.selectedCycleId) || null, [okr.cycles, okr.selectedCycleId]);

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
            Run <span className="font-mono">migrations/okr_personal_mvp.sql</span> in your Supabase SQL Editor, then refresh.
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
    <div className="flex-1 min-h-0 p-4 md:p-6 bg-gray-100 dark:bg-gray-900 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-4">
        {!selectedObjective ? (
          <OKRDashboard
            cycles={okr.cycles}
            selectedCycleId={okr.selectedCycleId}
            onSelectCycleId={okr.setSelectedCycleId}
            objectives={okr.objectives}
            latestCheckinByKr={okr.latestCheckinByKr}
            isLoading={okr.isLoading}
            isSaving={okr.isSaving}
            onCreateCycle={async (draft) => {
              const res = await okr.createCycleForUser(draft);
              if (!res.ok) {
                const msg = hasMissingTable(res)
                  ? 'OKR tables are missing in Supabase. Run migrations/okr_personal_mvp.sql, then refresh the app.'
                  : res.error;
                setNotificationModal({ isOpen: true, title: 'Create Cycle Failed', message: msg });
              }
              return res;
            }}
            onDeleteCycle={async (cycleId) => {
              const res = await okr.deleteCycleById(cycleId);
              if (!res.ok) setNotificationModal({ isOpen: true, title: 'Delete Cycle Failed', message: res.error });
              return res;
            }}
            onCreateObjective={async (draft) => {
              if (!draft.title.trim()) {
                setNotificationModal({ isOpen: true, title: 'Invalid Objective', message: 'Objective title is required.' });
                return { ok: false };
              }
              const res = await okr.createObjectiveForCycle(draft);
              if (!res.ok) {
                const msg = hasMissingTable(res) ? 'OKR tables are missing in Supabase. Run migrations/okr_personal_mvp.sql, then refresh the app.' : res.error;
                setNotificationModal({ isOpen: true, title: 'Create Objective Failed', message: msg });
              }
              return res;
            }}
            onOpenObjective={okr.setSelectedObjectiveId}
            onDeleteObjective={async (objectiveId) => {
              const res = await okr.deleteObjectiveById(objectiveId);
              if (!res.ok) setNotificationModal({ isOpen: true, title: 'Delete Objective Failed', message: res.error });
              return res;
            }}
          />
        ) : (
          <OKRObjectiveDetail
            objective={selectedObjective}
            cycle={selectedCycle}
            isSaving={okr.isSaving}
            latestCheckinByKr={okr.latestCheckinByKr}
            onBack={() => okr.setSelectedObjectiveId(null)}
            onCreateKr={async (objectiveId, draft) => {
              if (!draft.title.trim()) {
                setNotificationModal({ isOpen: true, title: 'Invalid Key Result', message: 'Key result title is required.' });
                return { ok: false };
              }
              const res = await okr.createKeyResultForObjective(objectiveId, draft);
              if (!res.ok) {
                const msg = hasMissingTable(res) ? 'OKR tables are missing in Supabase. Run migrations/okr_personal_mvp.sql, then refresh the app.' : res.error;
                setNotificationModal({ isOpen: true, title: 'Create KR Failed', message: msg });
              }
              return res;
            }}
            onLogCheckin={async (kr, draft) => {
              const res = await okr.logCheckinForKr(kr, draft);
              if (!res.ok) {
                setNotificationModal({ isOpen: true, title: 'Check-in Failed', message: res.error });
              }
              return res;
            }}
          />
        )}
      </div>
    </div>
  );
}
