import React from 'react';
import { createPortal } from 'react-dom';
import { useDutyRosterDepartmentUsers } from '../hooks/useDutyRosterDepartmentUsers';
import { useDutyRosterActions } from '../hooks/useDutyRosterActions';
import { useDutyRosterWeek } from '../hooks/useDutyRosterWeek';
import { daysOfWeek, formatWeekRangeLabel, formatYmd, parseYmd, startOfWeekSunday, toWeekStartYmd } from './dutyRosterDateUtils';
import { CalendarDaysIcon } from './AnimatedIcons/CalendarDaysIcon.tsx';
import type { DutyRosterEntry, DutyRosterUpsertEntryInput } from './dutyRosterTypes';

const CRIMSON = '#DC143C';
const WEEK_STORAGE_KEY = 'dutyRosterWeekStartYmd';

const LIGHT_CRIMSON_BG = 'rgba(220, 20, 60, 0.02)';
const LIGHT_CRIMSON_BORDER = 'rgba(220, 20, 60, 0.16)';
const LIGHT_CRIMSON_BORDER_STRONG = 'rgba(220, 20, 60, 0.22)';

const hourToLabel = (hour24: number) => {
  const h = ((hour24 % 24) + 24) % 24;
  const isPm = h >= 12;
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}${isPm ? 'PM' : 'AM'}`;
};

const buildEightHourShiftOptions = () => {
  const opts: string[] = [];
  for (let start = 0; start < 24; start++) {
    const end = (start + 8) % 24;
    opts.push(`${hourToLabel(start)} - ${hourToLabel(end)}`);
  }
  return opts;
};

const SHIFT_OPTIONS_8H = buildEightHourShiftOptions();

type ShiftOptionValue = '' | 'RDO' | 'OFF' | (typeof SHIFT_OPTIONS_8H)[number];

function ShiftPicker({
  shiftKey,
  value,
  disabled,
  isOpen,
  onOpen,
  onClose,
  onChange,
  onNavigate,
  ariaLabel,
}: {
  shiftKey: string;
  value: string;
  disabled: boolean;
  isOpen: boolean;
  onOpen: (key: string) => void;
  onClose: () => void;
  onChange: (next: ShiftOptionValue) => void;
  onNavigate: (e: React.KeyboardEvent<HTMLButtonElement>, shiftKey: string) => void;
  ariaLabel: string;
}) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [panelPos, setPanelPos] = React.useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 460 });
  const isRdo = value.trim().toUpperCase() === 'RDO' || value.trim().toUpperCase() === 'OFF';
  const hasValue = value.trim().length > 0;

  React.useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (evt: MouseEvent) => {
      const rootEl = rootRef.current;
      const panelEl = panelRef.current;
      if (!rootEl) return;
      const target = evt.target as Node;
      if (rootEl.contains(target)) return;
      if (panelEl?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const normalized = value.trim().toUpperCase();
  const selected: ShiftOptionValue =
    normalized === 'RDO' ? 'RDO' : normalized === 'OFF' ? 'OFF' : SHIFT_OPTIONS_8H.includes(value as any) ? (value as any) : '';

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;

    const rect = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const margin = 12;
    const desiredWidth = 460;
    let left = rect.left;
    left = Math.min(left, vw - desiredWidth - margin);
    left = Math.max(margin, left);
    const top = rect.bottom + 8;
    setPanelPos({ top, left, width: desiredWidth });
  }, [isOpen, value]);

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const triggerEl = triggerRef.current;
    const panelEl = panelRef.current;
    if (!triggerEl || !panelEl) return;

    const triggerRect = triggerEl.getBoundingClientRect();
    const panelRect = panelEl.getBoundingClientRect();
    const vh = window.innerHeight;
    const margin = 12;

    const fitsBelow = panelRect.bottom <= vh - margin;
    if (fitsBelow) return;

    const aboveTop = triggerRect.top - panelRect.height - 8;
    const top = Math.max(margin, aboveTop);
    setPanelPos((prev) => ({ ...prev, top }));
  }, [isOpen, panelPos.left, panelPos.width]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? onClose() : onOpen(shiftKey))}
        onKeyDown={(e) => onNavigate(e, shiftKey)}
        disabled={disabled}
        className={
          'w-full text-[11px] px-2 py-1 rounded-full border text-center font-extrabold tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(220,20,60,0.18)] disabled:opacity-60 transition-colors ' +
          (isRdo ? 'bg-sky-50 text-sky-900 border-sky-200' : hasValue ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400')
        }
        style={{
          borderColor: isRdo ? undefined : LIGHT_CRIMSON_BORDER_STRONG,
          backgroundColor: isRdo ? undefined : hasValue ? LIGHT_CRIMSON_BG : undefined,
        }}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        {hasValue ? value : '—'}
      </button>

      {isOpen ? (
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[9999] rounded-[10px] border bg-white dark:bg-gray-900 shadow-lg"
            style={{
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
              borderColor: 'rgba(220, 20, 60, 0.22)',
            }}
            role="dialog"
            aria-label="Select shift time"
          >
            <div className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-extrabold" style={{ color: CRIMSON }}>
                  Shift time
                </div>
                <div className="text-[11px] font-extrabold rounded px-2 py-0.5" style={{ backgroundColor: CRIMSON, color: 'white' }}>
                  8-hour
                </div>
              </div>

              <div role="radiogroup" aria-label="Shift options" className="grid grid-cols-3 gap-2">
                {(['', 'RDO', 'OFF', ...SHIFT_OPTIONS_8H] as ShiftOptionValue[]).map((opt) => {
                  const id = `${shiftKey}-${opt || 'empty'}`;
                  const isChecked = selected === opt;
                  return (
                    <div key={id}>
                      <input
                        id={id}
                        type="radio"
                        name={shiftKey}
                        value={opt}
                        checked={isChecked}
                        onChange={() => {
                          onChange(opt);
                          onClose();
                        }}
                        className="hidden"
                        disabled={disabled}
                      />
                      <label
                        htmlFor={id}
                        className="flex items-center justify-center px-2 py-2 rounded-[10px] cursor-pointer border transition-colors text-center"
                        style={{
                          borderColor: isChecked ? CRIMSON : 'rgba(220, 20, 60, 0.14)',
                          color: isChecked ? CRIMSON : 'rgba(15, 23, 42, 0.9)',
                          backgroundColor: isChecked ? 'rgba(220, 20, 60, 0.04)' : 'rgba(220, 20, 60, 0.02)',
                        }}
                        onMouseEnter={(e) => {
                          if (isChecked) return;
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(220, 20, 60, 0.06)';
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(220, 20, 60, 0.24)';
                        }}
                        onMouseLeave={(e) => {
                          if (isChecked) return;
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(220, 20, 60, 0.02)';
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(220, 20, 60, 0.14)';
                        }}
                      >
                        <span className="text-xs font-semibold">{opt === '' ? '—' : opt}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )
      ) : null}
    </div>
  );
}

const buildEntryMaps = (entries: DutyRosterEntry[]) => {
  const shift = new Map<string, string>();
  const remarks = new Map<string, string>();
  const area = new Map<string, string>();
  for (const e of entries) {
    if (!e.assignee_user_id) continue;
    if (!e.duty_date) continue;
    const dayKey = `${e.assignee_user_id}|${e.duty_date}`;
    if (e.slot_key === 'shift') {
      shift.set(dayKey, e.notes ?? '');
    } else if (e.slot_key === 'remarks') {
      remarks.set(dayKey, e.notes ?? '');
    } else if (e.slot_key === 'assigned_area') {
      area.set(e.assignee_user_id, e.notes ?? '');
    }
  }
  return { shift, remarks, area };
};

export default function DutyRosterTabPage() {
  const [weekStart, setWeekStart] = React.useState<Date>(() => {
    const saved = sessionStorage.getItem(WEEK_STORAGE_KEY);
    const parsed = saved ? parseYmd(saved) : null;
    return startOfWeekSunday(parsed ?? new Date());
  });

  const weekStartYmd = React.useMemo(() => toWeekStartYmd(weekStart), [weekStart]);
  const weekLabel = React.useMemo(() => formatWeekRangeLabel(weekStart), [weekStart]);
  const days = React.useMemo(() => daysOfWeek(weekStart).map((d) => ({ date: d, ymd: formatYmd(d) })), [weekStart]);

  React.useEffect(() => {
    sessionStorage.setItem(WEEK_STORAGE_KEY, weekStartYmd);
  }, [weekStartYmd]);

  const { isLoading: isLoadingUsers, users, error: usersError, reload: reloadUsers } = useDutyRosterDepartmentUsers();
  const { isLoading: isLoadingWeek, week, error: weekError, reload: reloadWeek } = useDutyRosterWeek(weekStartYmd);
  const { isSaving, error: saveError, upsertWeekEntries } = useDutyRosterActions();

  const canEdit = Boolean(week?.can_edit);

  const baseEntryMaps = React.useMemo(() => buildEntryMaps(week?.entries ?? []), [week?.entries]);
  const [draftShift, setDraftShift] = React.useState<Record<string, string>>({});
  const [draftRemarks, setDraftRemarks] = React.useState<Record<string, string>>({});
  const [draftArea, setDraftArea] = React.useState<Record<string, string>>({});
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);
  const [openShiftPickerKey, setOpenShiftPickerKey] = React.useState<string | null>(null);
  const [openRemarksKey, setOpenRemarksKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    const nextShift: Record<string, string> = {};
    const nextRemarks: Record<string, string> = {};
    const nextArea: Record<string, string> = {};
    users.forEach((u) => {
      nextArea[u.user_id] = baseEntryMaps.area.get(u.user_id) ?? '';
      days.forEach((d) => {
        const key = `${u.user_id}|${d.ymd}`;
        nextShift[key] = baseEntryMaps.shift.get(key) ?? '';
        nextRemarks[key] = baseEntryMaps.remarks.get(key) ?? '';
      });
    });
    setDraftShift(nextShift);
    setDraftRemarks(nextRemarks);
    setDraftArea(nextArea);
  }, [users, days, weekStartYmd, baseEntryMaps]);

  const handlePrevWeek = () => {
    setLastSavedAt(null);
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    setWeekStart(startOfWeekSunday(prev));
  };

  const handleNextWeek = () => {
    setLastSavedAt(null);
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(startOfWeekSunday(next));
  };

  const handleThisWeek = () => {
    setLastSavedAt(null);
    setWeekStart(startOfWeekSunday(new Date()));
  };

  const handleReload = async () => {
    setLastSavedAt(null);
    await Promise.all([reloadUsers(), reloadWeek()]);
  };

  const cellRefs = React.useRef<{
    shift: Record<string, Array<HTMLButtonElement | null>>;
    remarks: Record<string, Array<HTMLTextAreaElement | null>>;
  }>({ shift: {}, remarks: {} });
  React.useEffect(() => {
    cellRefs.current = { shift: {}, remarks: {} };
  }, [users, weekStartYmd]);

  const focusCell = (field: 'shift' | 'remarks', userId: string, dayIndex: number) => {
    const row = (cellRefs.current as any)[field]?.[userId] || [];
    const el = row[dayIndex];
    if (el) el.focus();
  };

  React.useEffect(() => {
    if (!openRemarksKey) return;
    const [userId, ymd] = openRemarksKey.split('|');
    if (!userId || !ymd) return;
    const dayIndex = days.findIndex((d) => d.ymd === ymd);
    if (dayIndex < 0) return;
    requestAnimationFrame(() => focusCell('remarks', userId, dayIndex));
  }, [openRemarksKey, days]);

  const onCellKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement | HTMLTextAreaElement>,
    field: 'shift' | 'remarks',
    userId: string,
    userIndex: number,
    dayIndex: number
  ) => {
    if (!e.ctrlKey) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusCell(field, userId, Math.min(6, dayIndex + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusCell(field, userId, Math.max(0, dayIndex - 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextUser = users[Math.min(users.length - 1, userIndex + 1)];
      if (nextUser) focusCell(field, nextUser.user_id, dayIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevUser = users[Math.max(0, userIndex - 1)];
      if (prevUser) focusCell(field, prevUser.user_id, dayIndex);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setLastSavedAt(null);

    const entries: DutyRosterUpsertEntryInput[] = [];
    for (const u of users) {
      const areaText = (draftArea[u.user_id] ?? '').trim();
      entries.push({
        duty_date: weekStartYmd,
        slot_key: 'assigned_area',
        assignee_user_id: u.user_id,
        notes: areaText,
        sort_order: -1,
      });

      for (const d of days) {
        const key = `${u.user_id}|${d.ymd}`;
        const shiftText = (draftShift[key] ?? '').trim();
        const remarksText = (draftRemarks[key] ?? '').trim();
        entries.push({
          duty_date: d.ymd,
          slot_key: 'shift',
          assignee_user_id: u.user_id,
          notes: shiftText,
          sort_order: 0,
        });
        entries.push({
          duty_date: d.ymd,
          slot_key: 'remarks',
          assignee_user_id: u.user_id,
          notes: remarksText,
          sort_order: 1,
        });
      }
    }

    await upsertWeekEntries(weekStartYmd, entries);
    await reloadWeek();
    setLastSavedAt(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
  };

  const isLoading = isLoadingUsers || isLoadingWeek;
  const error = usersError || weekError || saveError;

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-gray-100 dark:bg-gray-900">
      <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4">
        <div className="max-w-7xl mx-auto space-y-3">
          <div
            className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-4 border"
            style={{ borderColor: 'rgba(220, 20, 60, 0.25)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-extrabold flex items-center gap-2" style={{ color: CRIMSON }}>
                  <CalendarDaysIcon size={18} />
                  Duty Roster
                </h1>
                <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">{weekLabel}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {canEdit ? 'Edit enabled' : 'View only'} · Tip: Use Ctrl + Arrow keys to move between cells
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevWeek}
                  className="h-9 w-9 rounded-md inline-flex items-center justify-center border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(220,20,60,0.45)] hover:bg-[rgba(220,20,60,0.08)]"
                  style={{
                    borderColor: 'rgba(220, 20, 60, 0.35)',
                    color: CRIMSON,
                  }}
                  aria-label="Previous week"
                  title="Previous week"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={handleThisWeek}
                  className="px-3 h-9 rounded-md inline-flex items-center justify-center border font-bold text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(220,20,60,0.45)] hover:bg-[rgba(220,20,60,0.08)]"
                  style={{
                    borderColor: 'rgba(220, 20, 60, 0.35)',
                    color: CRIMSON,
                  }}
                  aria-label="Jump to current week"
                  title="Jump to current week"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={handleNextWeek}
                  className="h-9 w-9 rounded-md inline-flex items-center justify-center border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(220,20,60,0.45)] hover:bg-[rgba(220,20,60,0.08)]"
                  style={{
                    borderColor: 'rgba(220, 20, 60, 0.35)',
                    color: CRIMSON,
                  }}
                  aria-label="Next week"
                  title="Next week"
                >
                  ›
                </button>
                <button
                  type="button"
                  onClick={handleReload}
                  className="px-3 h-9 rounded-md inline-flex items-center justify-center border font-bold text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(220,20,60,0.45)] hover:bg-[rgba(220,20,60,0.08)]"
                  style={{
                    borderColor: 'rgba(220, 20, 60, 0.35)',
                    color: CRIMSON,
                  }}
                  aria-label="Reload duty roster"
                  title="Reload"
                >
                  Reload
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 h-9 rounded-md inline-flex items-center justify-center font-extrabold text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(220,20,60,0.45)] hover:bg-[#b31230] disabled:opacity-60"
                    style={{
                      backgroundColor: CRIMSON,
                      color: 'white',
                    }}
                    aria-label="Save duty roster"
                    title="Save"
                  >
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                )}
              </div>
            </div>

            {lastSavedAt && (
              <div className="mt-3 text-sm border rounded-md p-2" style={{ borderColor: 'rgba(220, 20, 60, 0.2)', color: CRIMSON }} role="status" aria-live="polite">
                Saved at {lastSavedAt}
              </div>
            )}

            {error && (
              <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2" role="alert">
                {error}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {isLoading ? (
              <div className="p-4 text-sm text-gray-600 dark:text-gray-300">Loading duty roster…</div>
            ) : users.length === 0 ? (
              <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
                No registered users exist in your department yet.
              </div>
            ) : (
              <div className="w-full overflow-x-hidden overflow-y-visible" role="region" aria-label="Duty roster table">
                <table className="w-full border-collapse table-fixed">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="text-left text-xs font-extrabold px-4 py-3 border-b w-64"
                        style={{ color: CRIMSON, borderColor: LIGHT_CRIMSON_BORDER, backgroundColor: LIGHT_CRIMSON_BG }}
                      >
                        Employee
                      </th>
                      <th
                        scope="col"
                        className="text-left text-xs font-extrabold px-4 py-3 border-b"
                        style={{ color: CRIMSON, borderColor: LIGHT_CRIMSON_BORDER, backgroundColor: LIGHT_CRIMSON_BG }}
                      >
                        <div className="flex flex-wrap lg:flex-nowrap justify-between gap-4">
                          {days.map((d) => (
                            <div key={d.ymd} className="flex-1 text-center">
                              <div className="leading-tight">
                                <div>{d.date.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                                <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                                  {d.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, userIndex) => {
                      const roleLabel = u.role.replace(/_/g, ' ').toUpperCase();
                      return (
                        <tr key={u.user_id} className="border-b border-gray-200 dark:border-gray-700">
                          <td className="px-4 py-4 align-top w-64">
                            <div className="space-y-2">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{u.full_name}</div>
                                <div className="mt-1">
                                  <span className="inline-flex items-center text-xs font-extrabold uppercase tracking-wide" style={{ color: CRIMSON }}>
                                    {roleLabel}
                                  </span>
                                </div>
                              </div>
                              <div>
                                {canEdit ? (
                                  <input
                                    value={draftArea[u.user_id] ?? ''}
                                    onChange={(e) => setDraftArea((prev) => ({ ...prev, [u.user_id]: e.target.value }))}
                                    disabled={isSaving}
                                    className="w-full text-xs px-2 py-1 rounded-full border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(220,20,60,0.45)] disabled:opacity-60"
                                    style={{ borderColor: LIGHT_CRIMSON_BORDER, backgroundColor: LIGHT_CRIMSON_BG }}
                                    placeholder="Assigned area"
                                    aria-label={`Assigned area for ${u.full_name}`}
                                  />
                                ) : (
                                  <div
                                    className="inline-flex items-center text-xs px-2 py-1 rounded-full border max-w-full"
                                    style={{ borderColor: LIGHT_CRIMSON_BORDER, backgroundColor: LIGHT_CRIMSON_BG }}
                                    aria-label={`Assigned area for ${u.full_name}`}
                                  >
                                    {draftArea[u.user_id] ? (
                                      <span className="text-gray-700 dark:text-gray-200 truncate">{draftArea[u.user_id]}</span>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex flex-wrap lg:flex-nowrap justify-between gap-4">
                              {days.map((d, dayIndex) => {
                                const key = `${u.user_id}|${d.ymd}`;
                                const shiftValue = draftShift[key] ?? '';
                                const remarksValue = draftRemarks[key] ?? '';
                                const normalizedShift = shiftValue.trim();
                                const normalizedRemarks = remarksValue.trim();
                                const isRdo = /\brdo\b/i.test(normalizedShift) || /\boff\b/i.test(normalizedShift);
                                const hasTime = normalizedShift.length > 0;
                                const hasRemarks = normalizedRemarks.length > 0;

                                return (
                                  <div key={key} className="flex-1 min-w-0 flex flex-col items-center gap-2">
                                    <div className="w-28">
                                      {canEdit ? (
                                        <ShiftPicker
                                          shiftKey={key}
                                          value={shiftValue}
                                          disabled={isSaving}
                                          isOpen={openShiftPickerKey === key}
                                          onOpen={(k) => setOpenShiftPickerKey(k)}
                                          onClose={() => setOpenShiftPickerKey(null)}
                                          onChange={(next) => setDraftShift((prev) => ({ ...prev, [key]: next }))}
                                          onNavigate={(e) => onCellKeyDown(e, 'shift', u.user_id, userIndex, dayIndex)}
                                          ariaLabel={`Time for ${u.full_name} on ${d.date.toLocaleDateString(undefined, { weekday: 'long' })}`}
                                        />
                                      ) : (
                                        <div
                                          className={
                                            'text-[11px] px-2 py-1 rounded-full border text-center font-extrabold tracking-wide w-full ' +
                                            (isRdo ? 'bg-sky-50 text-sky-900 border-sky-200' : hasTime ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500')
                                          }
                                          style={{
                                            borderColor: isRdo ? undefined : LIGHT_CRIMSON_BORDER_STRONG,
                                            backgroundColor: isRdo ? undefined : hasTime ? LIGHT_CRIMSON_BG : undefined,
                                          }}
                                          aria-label={`Time for ${u.full_name} on ${d.date.toLocaleDateString(undefined, { weekday: 'long' })}`}
                                        >
                                          {hasTime ? shiftValue : '—'}
                                        </div>
                                      )}
                                    </div>

                                    <div className="w-28 flex justify-center">
                                      {canEdit ? (
                                        openRemarksKey === key || hasRemarks ? (
                                          <textarea
                                            ref={(el) => {
                                              if (!cellRefs.current.remarks[u.user_id]) cellRefs.current.remarks[u.user_id] = [];
                                              cellRefs.current.remarks[u.user_id][dayIndex] = el;
                                            }}
                                            value={remarksValue}
                                            onChange={(e) => setDraftRemarks((prev) => ({ ...prev, [key]: e.target.value }))}
                                            onKeyDown={(e) => onCellKeyDown(e, 'remarks', u.user_id, userIndex, dayIndex)}
                                            onBlur={(e) => {
                                              const trimmed = e.currentTarget.value.trim();
                                              if (!trimmed && openRemarksKey === key) setOpenRemarksKey(null);
                                            }}
                                            disabled={isSaving}
                                            rows={2}
                                            className="w-full text-xs px-2 py-1 rounded-md border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(220,20,60,0.45)] disabled:opacity-60 resize-none"
                                            style={{ borderColor: LIGHT_CRIMSON_BORDER }}
                                            placeholder="Remarks"
                                            aria-label={`Remarks for ${u.full_name} on ${d.date.toLocaleDateString(undefined, { weekday: 'long' })}`}
                                          />
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setOpenRemarksKey(key)}
                                            disabled={isSaving}
                                            className="inline-flex items-center justify-center w-7 h-7 rounded-full border text-xs font-extrabold"
                                            style={{ borderColor: LIGHT_CRIMSON_BORDER, color: CRIMSON, backgroundColor: LIGHT_CRIMSON_BG }}
                                            aria-label={`Add remarks for ${u.full_name} on ${d.date.toLocaleDateString(undefined, { weekday: 'long' })}`}
                                          >
                                            +
                                          </button>
                                        )
                                      ) : (
                                        <div
                                          className="w-full text-xs px-2 py-1 rounded-md border text-center"
                                          style={{ borderColor: LIGHT_CRIMSON_BORDER, backgroundColor: LIGHT_CRIMSON_BG }}
                                          aria-label={`Remarks for ${u.full_name} on ${d.date.toLocaleDateString(undefined, { weekday: 'long' })}`}
                                        >
                                          {hasRemarks ? normalizedRemarks : '+'}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
