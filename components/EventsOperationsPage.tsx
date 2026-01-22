import React from 'react';
import { CustomTimePicker } from './CustomTimePicker';
import { useDashboardContext } from './DashboardContext';
import { supabase } from './supabaseClient';
import type { EventOpsItem, EventOpsKind } from './types';
import {
  addDays,
  endOfCalendarGrid,
  formatMonthTitle,
  isSameMonth,
  isSameYmd,
  startOfCalendarGrid,
  startOfMonth,
  toYmd,
} from './eventOpsCalendarUtils';

type EventOpsFormState = {
  kind: EventOpsKind;
  event_date: string;
  name: string;
  location: string;
  pax: string;
  serving_time: string;
  remarks: string;
};

const defaultFormState = (kind: EventOpsKind, eventDate: string): EventOpsFormState => ({
  kind,
  event_date: eventDate,
  name: '',
  location: '',
  pax: '',
  serving_time: '',
  remarks: ''
});

export default function EventsOperationsPage() {
  const { userProfile, setNotificationModal } = useDashboardContext();

  const debugEnabled = React.useMemo(() => {
    try {
      return window.localStorage.getItem('gretel:debug:eventops') === '1';
    } catch {
      return false;
    }
  }, []);

  const log = React.useCallback((event: string, details?: Record<string, unknown>) => {
    if (!debugEnabled) return;
    const payload = details ? { event, ...details } : { event };
    console.debug('[EventOps]', payload);
  }, [debugEnabled]);

  const isMissingTableError = (error: any) => {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('could not find the table') || msg.includes('schema cache') || msg.includes('relation') && msg.includes('does not exist');
  };

  const today = React.useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = React.useState<Date>(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = React.useState<string>(() => toYmd(new Date()));

  const [items, setItems] = React.useState<EventOpsItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalMode, setModalMode] = React.useState<'create' | 'edit'>('create');
  const [activeItemId, setActiveItemId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<EventOpsFormState>(() => defaultFormState('event', selectedDate));
  const [isSaving, setIsSaving] = React.useState(false);

  const gridStart = React.useMemo(() => startOfCalendarGrid(viewMonth), [viewMonth]);
  const gridEnd = React.useMemo(() => endOfCalendarGrid(viewMonth), [viewMonth]);
  const gridDays = React.useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);

  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchItemsForRange = React.useCallback(async () => {
    if (!userProfile?.id) return;
    setIsLoading(true);
    setLoadError(null);
    log('fetch:start', { start: toYmd(gridStart), end: toYmd(gridEnd) });

    const start = toYmd(gridStart);
    const end = toYmd(gridEnd);

    const { data, error } = await supabase
      .from('event_ops_items')
      .select('*')
      .eq('user_id', userProfile.id)
      .gte('event_date', start)
      .lte('event_date', end)
      .order('event_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      if (!mountedRef.current) return;
      log('fetch:error', { message: error.message });
      setLoadError(error.message);
      setItems([]);
      setIsLoading(false);
      return;
    }

    if (!mountedRef.current) return;
    log('fetch:success', { count: Array.isArray(data) ? data.length : 0 });
    setItems((data as EventOpsItem[]) || []);
    setIsLoading(false);
  }, [gridStart, gridEnd, userProfile?.id, log]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchItemsForRange();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [fetchItemsForRange]);

  const itemsByDate = React.useMemo(() => {
    const map = new Map<string, EventOpsItem[]>();
    items.forEach(item => {
      const key = item.event_date;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    });
    return map;
  }, [items]);

  const selectedItems = React.useMemo(() => itemsByDate.get(selectedDate) ?? [], [itemsByDate, selectedDate]);
  const tableMissing = React.useMemo(() => (loadError ? isMissingTableError({ message: loadError }) : false), [loadError]);

  const openCreate = (kind: EventOpsKind) => {
    if (tableMissing) {
      setNotificationModal({
        isOpen: true,
        title: 'Setup Required',
        message: 'Event Ops table is missing in Supabase. Run supabase_schema_update.sql (Event Ops Calendar section), then refresh the app.'
      });
      log('modal:blockCreate:missingTable', { kind });
      return;
    }
    log('modal:openCreate', { kind, selectedDate });
    setModalMode('create');
    setActiveItemId(null);
    setForm(defaultFormState(kind, selectedDate));
    setModalOpen(true);
  };

  const openEdit = (item: EventOpsItem) => {
    log('modal:openEdit', { id: item.id, kind: item.kind });
    setModalMode('edit');
    setActiveItemId(item.id);
    setForm({
      kind: item.kind,
      event_date: item.event_date,
      name: item.name ?? '',
      location: item.location ?? '',
      pax: item.pax == null ? '' : String(item.pax),
      serving_time: item.serving_time ? String(item.serving_time).slice(0, 5) : '',
      remarks: item.remarks ?? '',
    });
    setModalOpen(true);
  };

  const closeModal = React.useCallback(() => {
    log('modal:close');
    setModalOpen(false);
    setIsSaving(false);
    setActiveItemId(null);
  }, [log]);

  React.useEffect(() => {
    if (!modalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        log('modal:escape');
        closeModal();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [modalOpen, log, closeModal]);

  const validateForm = (state: EventOpsFormState) => {
    if (!state.event_date.trim()) return 'Date is required.';
    if (!state.name.trim()) return `Name of the ${state.kind === 'event' ? 'Event' : 'Meeting'} is required.`;
    if (state.kind === 'event' && !state.serving_time.trim()) return 'Serving Time is required for Events.';
    if (state.pax.trim() && Number.isNaN(Number(state.pax))) return 'Number of Pax must be a number.';
    return '';
  };

  const upsertItem = async () => {
    const validationError = validateForm(form);
    if (validationError) {
      setNotificationModal({ isOpen: true, title: 'Invalid Form', message: validationError });
      return;
    }

    setIsSaving(true);
    log('save:start', { mode: modalMode, kind: form.kind, date: form.event_date });
    const paxValue = form.pax.trim() ? Number(form.pax.trim()) : null;
    const servingTimeValue = form.kind === 'event' ? (form.serving_time.trim() || null) : null;
    const payload = {
      user_id: userProfile.id,
      kind: form.kind,
      event_date: form.event_date,
      name: form.name.trim(),
      location: form.location.trim() || null,
      pax: form.kind === 'event' ? paxValue : null,
      serving_time: servingTimeValue,
      remarks: form.remarks.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (modalMode === 'create') {
      const { data, error } = await supabase.from('event_ops_items').insert(payload).select('*').single();
      if (error) {
        const message = isMissingTableError(error)
          ? 'Event Ops table is missing in Supabase. Run supabase_schema_update.sql (Event Ops Calendar section), then refresh the app.'
          : error.message;
        console.error('[EventOps] save failed:', error);
        setNotificationModal({ isOpen: true, title: 'Save Failed', message });
        log('save:error', { message: error.message });
        setIsSaving(false);
        return;
      }
      const created = data as EventOpsItem;
      setItems(prev => [...prev, created].sort((a, b) => (a.event_date || '').localeCompare(b.event_date || '')));
      log('save:success', { id: created.id });
      setIsSaving(false);
      setModalOpen(false);
      return;
    }

    if (!activeItemId) {
      setNotificationModal({ isOpen: true, title: 'Save Failed', message: 'Missing item id for update.' });
      setIsSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from('event_ops_items')
      .update(payload)
      .eq('id', activeItemId)
      .eq('user_id', userProfile.id)
      .select('*')
      .single();

    if (error) {
      const message = isMissingTableError(error)
        ? 'Event Ops table is missing in Supabase. Run supabase_schema_update.sql (Event Ops Calendar section), then refresh the app.'
        : error.message;
      console.error('[EventOps] update failed:', error);
      setNotificationModal({ isOpen: true, title: 'Update Failed', message });
      log('save:error', { message: error.message });
      setIsSaving(false);
      return;
    }

    const updated = data as EventOpsItem;
    setItems(prev => prev.map(item => (item.id === updated.id ? updated : item)));
    log('save:success', { id: updated.id });
    setIsSaving(false);
    setModalOpen(false);
  };

  const deleteItem = async (item: EventOpsItem) => {
    setIsSaving(true);
    log('delete:start', { id: item.id });
    const { error } = await supabase
      .from('event_ops_items')
      .delete()
      .eq('id', item.id)
      .eq('user_id', userProfile.id);

    if (error) {
      const message = isMissingTableError(error)
        ? 'Event Ops table is missing in Supabase. Run supabase_schema_update.sql (Event Ops Calendar section), then refresh the app.'
        : error.message;
      console.error('[EventOps] delete failed:', error);
      setNotificationModal({ isOpen: true, title: 'Delete Failed', message });
      log('delete:error', { message: error.message });
      setIsSaving(false);
      return;
    }

    setItems(prev => prev.filter(i => i.id !== item.id));
    log('delete:success', { id: item.id });
    setIsSaving(false);
  };

  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const isToday = (date: Date) => isSameYmd(date, today);

  const handleCalendarClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const button = target?.closest?.('button[data-date]') as HTMLButtonElement | null;
    const date = button?.dataset?.date;
    if (!date) return;
    setSelectedDate(date);
    log('calendar:selectDate', { date });
  };

  return (
    <div className="flex-1 min-h-0 w-full bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full h-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Event Ops Calendar</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Events and meetings saved to Supabase.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              className="px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Prev
            </button>
            <div className="px-3 py-2 text-sm rounded-md bg-[#DC143C]/10 text-[#DC143C] dark:text-[#ff8aa0] border border-[#DC143C]/20">
              {formatMonthTitle(viewMonth)}
            </div>
            <button
              type="button"
              onClick={() => setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              className="px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setViewMonth(startOfMonth(now));
                setSelectedDate(toYmd(now));
              }}
              className="px-3 py-2 text-sm rounded-md bg-[#DC143C] text-white hover:bg-[#B01030]"
            >
              Today
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
          <div className="lg:col-span-2 flex flex-col min-h-0">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="grid grid-cols-7 bg-[#DC143C] text-white">
                {weekdayLabels.map(label => (
                  <div key={label} className="py-2 text-center text-xs font-bold tracking-wide">
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 bg-white dark:bg-gray-800" onClick={handleCalendarClick}>
                {gridDays.map(day => {
                  const key = toYmd(day);
                  const dayItems = itemsByDate.get(key) ?? [];
                  const isSelected = selectedDate === key;
                  const muted = !isSameMonth(day, viewMonth);

                  return (
                    <button
                      key={key}
                      type="button"
                      data-date={key}
                      className={[
                        'h-24 md:h-28 p-2 border border-gray-100 dark:border-gray-700 text-left flex flex-col justify-between',
                        'hover:bg-[#DC143C]/5 transition-colors',
                        isSelected ? 'bg-[#DC143C]/10 border-[#DC143C]/30' : '',
                        muted ? 'opacity-60' : '',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className={[
                            'h-7 w-7 rounded-full flex items-center justify-center text-sm font-bold',
                            isToday(day) ? 'bg-[#DC143C] text-white' : 'text-gray-900 dark:text-gray-100',
                            isSelected && !isToday(day) ? 'text-[#DC143C]' : '',
                          ].join(' ')}
                        >
                          {day.getDate()}
                        </div>
                        {dayItems.length > 0 && (
                          <div className="text-xs font-semibold text-[#DC143C]">
                            {dayItems.length}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {dayItems.slice(0, 4).map(item => (
                          <span
                            key={item.id}
                            className={[
                              'h-2 w-2 rounded-full',
                              item.kind === 'event' ? 'bg-[#DC143C]' : 'bg-[#DC143C]/50',
                            ].join(' ')}
                            title={`${item.kind === 'event' ? 'Event' : 'Meeting'}: ${item.name}`}
                          />
                        ))}
                        {dayItems.length > 4 && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">+{dayItems.length - 4}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {isLoading ? 'Loading…' : loadError ? `Load error: ${loadError}` : `Loaded ${items.length} items`}
              </div>
              <button
                type="button"
                onClick={() => fetchItemsForRange()}
                className="px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="flex flex-col min-h-0">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-col min-h-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Details</h3>
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">{selectedDate}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openCreate('event')}
                    disabled={tableMissing}
                    className="px-3 py-2 text-sm rounded-md bg-[#DC143C] text-white hover:bg-[#B01030] disabled:opacity-50"
                  >
                    Add Event
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreate('meeting')}
                    disabled={tableMissing}
                    className="px-3 py-2 text-sm rounded-md border border-[#DC143C]/30 text-[#DC143C] hover:bg-[#DC143C]/10 disabled:opacity-50"
                  >
                    Add Meeting
                  </button>
                </div>
              </div>

              {tableMissing && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100 p-3 text-sm">
                  Event Ops table is not available in Supabase. Run the migration in supabase_schema_update.sql (Event Ops Calendar section) and refresh.
                </div>
              )}

              <div className="mt-4 space-y-2 overflow-auto pr-1">
                {selectedItems.length === 0 ? (
                  <div className="text-sm text-gray-600 dark:text-gray-400">No items for this date.</div>
                ) : (
                  selectedItems.map(item => (
                    <div key={item.id} className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                            <span
                              className={[
                                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
                                item.kind === 'event'
                                  ? 'bg-[#DC143C]/15 text-[#DC143C]'
                                  : 'bg-[#DC143C]/10 text-[#DC143C]',
                              ].join(' ')}
                            >
                              {item.kind === 'event' ? 'Event' : 'Meeting'}
                            </span>
                            {item.kind === 'event' && item.serving_time ? (
                              <span>Serving: {String(item.serving_time).slice(0, 5)}</span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-sm font-bold text-gray-900 dark:text-gray-100 break-words">
                            {item.name}
                          </div>
                          {(item.location || item.remarks || item.pax != null) && (
                            <div className="mt-2 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                              {item.location ? <div>Location: {item.location}</div> : null}
                              {item.kind === 'event' && item.pax != null ? <div>Pax: {item.pax}</div> : null}
                              {item.remarks ? <div className="text-gray-600 dark:text-gray-400">Remarks: {item.remarks}</div> : null}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            disabled={isSaving}
                            className="px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteItem(item)}
                            disabled={isSaving}
                            className="px-2 py-1 text-xs rounded-md border border-red-200 text-red-700 dark:border-red-500/40 dark:text-red-200 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700 animate__animated animate__bounceIn"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">
              {modalMode === 'create' ? 'Add' : 'Edit'} {form.kind === 'event' ? 'Event' : 'Meeting'}
            </h3>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Date</label>
                <input
                  type="date"
                  value={form.event_date}
                  onChange={(e) => setForm(prev => ({ ...prev, event_date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#DC143C]"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                  {form.kind === 'event' ? 'Name of the Event' : 'Name of the Meeting'}
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#DC143C]"
                />
              </div>

              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Location</label>
                <input
                  value={form.location}
                  onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#DC143C]"
                />
              </div>

              {form.kind === 'event' && (
                <>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Number of Pax</label>
                    <input
                      value={form.pax}
                      onChange={(e) => setForm(prev => ({ ...prev, pax: e.target.value }))}
                      inputMode="numeric"
                      className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#DC143C]"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Serving Time</label>
                    <CustomTimePicker
                      value={form.serving_time}
                      onChange={(value) => setForm(prev => ({ ...prev, serving_time: value }))}
                      className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-[#DC143C]"
                    />
                  </div>
                </>
              )}

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Remarks</label>
                <textarea
                  value={form.remarks}
                  onChange={(e) => setForm(prev => ({ ...prev, remarks: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#DC143C]"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 active:scale-95"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={upsertItem}
                className="bg-[#DC143C] hover:bg-[#b81030] text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400 transition-all duration-200 active:scale-95"
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
