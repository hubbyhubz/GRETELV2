import type { OkrSnapshot } from './okrSnapshot';

export function OKRDashboardWidget(props: {
  snapshot: OkrSnapshot | null;
  isLoading: boolean;
  error: string | null;
  onOpenOkrs: () => void;
  onRefresh: () => void;
}) {
  const { snapshot, isLoading, error, onOpenOkrs, onRefresh } = props;
  const dueCount = snapshot?.due_count ?? 0;

  return (
    <div id="okr-dashboard-widget" className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-none sm:shadow-sm border border-gray-200 dark:border-gray-700 card-lift card-hover-animation">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-primary-600 flex items-center">
            <span className="ml-0">OKR Check-ins</span>
          </h2>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
            {snapshot ? `Cycle: ${snapshot.cycle.name}` : 'No active cycle'}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className={`px-2 py-1 rounded-full text-xs font-bold border ${dueCount ? 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800/40' : 'bg-gray-50 text-gray-700 border-gray-200/70 dark:bg-gray-900/60 dark:text-gray-200 dark:border-gray-700/50'}`}>
            {dueCount}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-7 px-2 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50"
          >
            {isLoading ? '…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={onOpenOkrs}
            className="h-7 px-2 rounded-lg text-xs font-semibold text-primary-700 dark:text-primary-200 border border-primary-200/80 dark:border-primary-800/50 hover:bg-primary-50 dark:hover:bg-primary-950/30"
          >
            Open
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 text-xs text-rose-700 dark:text-rose-200">{error}</div>
      ) : snapshot && snapshot.due_items.length ? (
        <div className="mt-3 space-y-2">
          {snapshot.due_items.slice(0, 4).map((d) => (
            <div key={d.key_result_id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
              <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{d.key_result_title}</div>
              <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 truncate">{d.objective_title}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">You’re up to date.</div>
      )}
    </div>
  );
}
