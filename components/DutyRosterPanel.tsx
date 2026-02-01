import React from 'react';
import { useDutyRosterActions } from '../hooks/useDutyRosterActions';
import { useDutyRosterWeek } from '../hooks/useDutyRosterWeek';
import { daysOfWeek, formatWeekRangeLabel, formatYmd, startOfWeekSunday, toWeekStartYmd } from './dutyRosterDateUtils';
import type { DutyRosterEntry, DutyRosterUpsertEntryInput } from './dutyRosterTypes';
import { TrashIcon } from './AnimatedIcons';
import { CalendarDaysIcon } from './AnimatedIcons/CalendarDaysIcon.tsx';
import { supabase } from './supabaseClient';

type DraftRow = {
  id?: string;
  duty_date: string;
  slot_key: string;
  notes: string;
  sort_order: number;
};

const toDraftRows = (entries: DutyRosterEntry[]): DraftRow[] =>
  entries
    .map((e) => ({
      id: e.id,
      duty_date: e.duty_date,
      slot_key: e.slot_key,
      notes: e.notes ?? '',
      sort_order: Number.isFinite(Number(e.sort_order)) ? Number(e.sort_order) : 0,
    }))
    .sort((a, b) => (a.duty_date < b.duty_date ? -1 : a.duty_date > b.duty_date ? 1 : a.sort_order - b.sort_order));

export default function DutyRosterPanel() {
  const [weekStart, setWeekStart] = React.useState(() => startOfWeekSunday(new Date()));
  const weekStartYmd = React.useMemo(() => toWeekStartYmd(weekStart), [weekStart]);
  const weekLabel = React.useMemo(() => formatWeekRangeLabel(weekStart), [weekStart]);

  const { isLoading, week, error, reload } = useDutyRosterWeek(weekStartYmd);
  const { isSaving, error: saveError, upsertWeekEntries, deleteEntry } = useDutyRosterActions();

  const [draftRows, setDraftRows] = React.useState<DraftRow[]>([]);
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);
  const [permissionUpdatedAt, setPermissionUpdatedAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    let channel: any | null = null;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (cancelled || !userId) return;

      channel = supabase
        .channel('public:duty_roster_user_permissions')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'duty_roster_user_permissions', filter: `user_id=eq.${userId}` },
          () => {
            setPermissionUpdatedAt(Date.now());
            reload().catch(() => {});
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [reload]);

  React.useEffect(() => {
    if (!week) {
      setDraftRows([]);
      return;
    }
    setDraftRows(toDraftRows(week.entries));
  }, [week?.week_start_sunday]);

  const canEdit = Boolean(week?.can_edit);

  const groupedRows = React.useMemo(() => {
    const map: Record<string, DraftRow[]> = {};
    for (const row of draftRows) {
      if (!map[row.duty_date]) map[row.duty_date] = [];
      map[row.duty_date].push(row);
    }
    Object.values(map).forEach((rows) => rows.sort((a, b) => a.sort_order - b.sort_order || a.slot_key.localeCompare(b.slot_key)));
    return map;
  }, [draftRows]);

  const handlePrevWeek = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    setWeekStart(startOfWeekSunday(prev));
    setLastSavedAt(null);
  };

  const handleNextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(startOfWeekSunday(next));
    setLastSavedAt(null);
  };

  const handleThisWeek = () => {
    setWeekStart(startOfWeekSunday(new Date()));
    setLastSavedAt(null);
  };

  const updateRow = (index: number, patch: Partial<DraftRow>) => {
    setDraftRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = async (row: DraftRow) => {
    setLastSavedAt(null);
    if (!row.id) {
      setDraftRows((prev) => prev.filter((r) => r !== row));
      return;
    }
    await deleteEntry(row.id);
    await reload();
  };

  const addSlotForDay = (dutyDateYmd: string) => {
    setLastSavedAt(null);
    setDraftRows((prev) => [
      ...prev,
      {
        duty_date: dutyDateYmd,
        slot_key: 'slot',
        notes: '',
        sort_order: (prev.filter((r) => r.duty_date === dutyDateYmd).reduce((m, r) => Math.max(m, r.sort_order), -1) || 0) + 1,
      },
    ]);
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setLastSavedAt(null);
    const payload: DutyRosterUpsertEntryInput[] = draftRows
      .map((r) => ({
        duty_date: r.duty_date,
        slot_key: r.slot_key.trim(),
        notes: r.notes,
        sort_order: r.sort_order,
      }))
      .filter((r) => !!r.duty_date && !!r.slot_key);

    const saved = await upsertWeekEntries(weekStartYmd, payload);
    const coercedEntries = Array.isArray((saved as any).entries) ? ((saved as any).entries as DutyRosterEntry[]) : [];
    setDraftRows(toDraftRows(coercedEntries));
    setLastSavedAt(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
  };

  const days = React.useMemo(() => daysOfWeek(weekStart), [weekStart]);

  return (
    <div id="duty-roster" className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-none sm:shadow-sm border border-gray-200 dark:border-gray-700 card-lift card-hover-animation">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-primary-600 flex items-center gap-2">
            <CalendarDaysIcon size={16} />
            Duty Roster
          </h2>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{weekLabel}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevWeek}
            className="h-7 w-7 rounded-md inline-flex items-center justify-center text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="Previous week"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={handleThisWeek}
            className="text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2.5 py-1 rounded-md transition-colors"
            title="Jump to current week"
          >
            Today
          </button>
          <button
            type="button"
            onClick={handleNextWeek}
            className="h-7 w-7 rounded-md inline-flex items-center justify-center text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="Next week"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {(error || saveError) && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
            {error || saveError}
          </div>
        )}

        {lastSavedAt && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md p-2">Saved at {lastSavedAt}</div>}
        {permissionUpdatedAt && (
          <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-md p-2">
            Your duty roster edit permission was updated.
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-gray-500">Loading duty roster…</div>
        ) : (
          <div className="space-y-4">
            {days.map((d) => {
              const ymd = formatYmd(d);
              const dayRows = groupedRows[ymd] ?? [];
              return (
                <div key={ymd} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => addSlotForDay(ymd)}
                        className="text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 px-2 py-1 rounded-md transition-colors"
                      >
                        Add slot
                      </button>
                    )}
                  </div>

                  <div className="mt-2 space-y-2">
                    {dayRows.length === 0 ? (
                      <div className="text-xs text-gray-500">No entries.</div>
                    ) : (
                      dayRows.map((row) => {
                        const index = draftRows.indexOf(row);
                        return (
                          <div key={`${row.duty_date}:${row.slot_key}:${row.sort_order}`} className="flex items-start gap-2">
                            <input
                              value={row.slot_key}
                              onChange={(e) => updateRow(index, { slot_key: e.target.value })}
                              disabled={!canEdit || isSaving}
                              className="w-24 flex-none text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 disabled:opacity-60"
                              placeholder="Slot"
                            />
                            <textarea
                              value={row.notes}
                              onChange={(e) => updateRow(index, { notes: e.target.value })}
                              disabled={!canEdit || isSaving}
                              className="flex-1 text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 min-h-[34px] disabled:opacity-60"
                              placeholder="Assignment / notes"
                            />
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => removeRow(row)}
                                disabled={isSaving}
                                className="h-7 w-7 rounded-md inline-flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
                                title="Remove"
                              >
                                <TrashIcon size={16} />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-gray-500">
                {week?.can_edit ? 'Editing enabled' : 'View-only'}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-md transition-colors disabled:opacity-60"
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
