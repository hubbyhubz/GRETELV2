import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { BlockedTimeSlot, EventOpsItem, ScheduleItem } from './types';
import { cascadeReschedule, minutesToTimeString, parseScheduleRangeToMinutes, toYmdLocal, buildEventOpsBlocksForToday } from './assistantActionUtils';
import { XIcon } from './AnimatedIcons/XIcon';

interface ScheduleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: ScheduleItem[];
  blockedTimeSlots?: BlockedTimeSlot[];
  workSpan?: { start: number; end: number } | null;
  eventOpsItems?: EventOpsItem[];
  onSave: (schedule: ScheduleItem[]) => void;
  onDraftChange?: (schedule: ScheduleItem[]) => void;
  title?: string;
}

const ScheduleEditorModal: React.FC<ScheduleEditorModalProps> = ({
  isOpen,
  onClose,
  schedule: initialSchedule,
  blockedTimeSlots = [],
  eventOpsItems = [],
  onSave,
  onDraftChange,
  title = 'Edit Schedule',
}) => {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newItem, setNewItem] = useState({ time: '', title: '' });
  const [newItemError, setNewItemError] = useState<string | null>(null);
  const [editErrors, setEditErrors] = useState<Record<number, string | null>>({});
  const [isClosing, setIsClosing] = useState(false);
  const [eventOpsDraftTimes, setEventOpsDraftTimes] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasInitializedOpenRef = useRef(false);
  const lastAppliedRuleSignatureRef = useRef<string>('');

  const ruleSuggestions = React.useMemo(() => {
    const slots = Array.isArray(blockedTimeSlots) ? blockedTimeSlots : [];
    return slots
      .filter((s) => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
      .map((s) => ({
        id: `rule-${s.id}`,
        time: `${minutesToTimeString(s.start)} - ${minutesToTimeString(s.end)}`,
        title: s.title,
        completed: false,
        source: 'rule' as const,
      }))
      .sort((a, b) => {
        const ar = parseScheduleRangeToMinutes(a.time);
        const br = parseScheduleRangeToMinutes(b.time);
        if (!ar) return 1;
        if (!br) return -1;
        return ar.start - br.start;
      });
  }, [blockedTimeSlots]);

  const sortSchedule = useCallback((items: ScheduleItem[]) => {
    const copy = [...items];
    copy.sort((a, b) => {
      const aRange = parseScheduleRangeToMinutes(String(a?.time || ''));
      const bRange = parseScheduleRangeToMinutes(String(b?.time || ''));
      if (!aRange && !bRange) return 0;
      if (!aRange) return 1;
      if (!bRange) return -1;
      return aRange.start - bRange.start;
    });
    return copy;
  }, []);

  const applyRulesToSchedule = useCallback((base: ScheduleItem[]) => {
    let merged = Array.isArray(base) ? [...base] : [];
    (Array.isArray(ruleSuggestions) ? ruleSuggestions : []).forEach((rule) => {
      if (!merged.some((it) => it?.id === rule.id)) {
        merged = [...merged, rule];
      }
      merged = cascadeReschedule(merged, { time: rule.time, title: rule.title });
    });
    const deduped = merged
      .filter(Boolean)
      .filter((it, idx, arr) => arr.findIndex((x) => x.id === it.id) === idx)
      .filter((it, idx, arr) => {
        const range = parseScheduleRangeToMinutes(String(it?.time || ''));
        if (!range) return true;
        const key = `${range.start}-${range.end}-${String(it?.title || '').trim().toLowerCase()}`;
        const firstIdx = arr.findIndex((x) => {
          const xr = parseScheduleRangeToMinutes(String(x?.time || ''));
          if (!xr) return false;
          const xk = `${xr.start}-${xr.end}-${String(x?.title || '').trim().toLowerCase()}`;
          return xk === key;
        });
        return firstIdx === idx;
      });
    return sortSchedule(deduped);
  }, [ruleSuggestions, sortSchedule]);

  // Update local schedule when prop changes - ensure it always displays the full schedule
  useEffect(() => {
    if (!isOpen) {
      hasInitializedOpenRef.current = false;
      lastAppliedRuleSignatureRef.current = '';
      return;
    }

    const nextIncoming = Array.isArray(initialSchedule) ? initialSchedule : [];
    const nextIncomingHasItems = nextIncoming.length > 0;
    const ruleSignature = (Array.isArray(ruleSuggestions) ? ruleSuggestions : []).map((r) => r.id).join('|');

    if (!hasInitializedOpenRef.current) {
      hasInitializedOpenRef.current = true;
      lastAppliedRuleSignatureRef.current = ruleSignature;
      setSchedule(applyRulesToSchedule(nextIncomingHasItems ? nextIncoming : []));
      setEditingIndex(null);
      setNewItem({ time: '', title: '' });
      setNewItemError(null);
      setEditErrors({});
      setIsClosing(false);
      setEventOpsDraftTimes({});
      setSaveError(null);
      return;
    }

    if (
      ruleSignature !== lastAppliedRuleSignatureRef.current &&
      editingIndex === null &&
      !newItem.time &&
      !newItem.title
    ) {
      lastAppliedRuleSignatureRef.current = ruleSignature;
      setSchedule((prev) => applyRulesToSchedule(prev.length > 0 ? prev : (nextIncomingHasItems ? nextIncoming : [])));
    }

    if (
      schedule.length === 0 &&
      nextIncomingHasItems &&
      editingIndex === null &&
      !newItem.time &&
      !newItem.title
    ) {
      setSchedule(applyRulesToSchedule(nextIncoming));
    }
  }, [isOpen, initialSchedule, schedule.length, editingIndex, newItem.time, newItem.title, ruleSuggestions, applyRulesToSchedule]);

  const closeModal = useCallback((persistDraft: boolean) => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      if (persistDraft) {
        if (schedule.length > 0) {
          onDraftChange?.(schedule);
        } else if (Array.isArray(initialSchedule) && initialSchedule.length > 0) {
          onDraftChange?.([...initialSchedule]);
        }
      }
      onClose();
    }, 300);
  }, [onClose, onDraftChange, schedule, initialSchedule]);

  const handleClose = useCallback(() => {
    closeModal(true);
  }, [closeModal]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingIndex === null && !newItem.time && !newItem.title) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, editingIndex, newItem, handleClose]);

  const handleSave = useCallback(() => {
    setSaveError(null);
    const itemsToValidate = schedule.filter((it) => it && it.time && it.title);
    const parsed = itemsToValidate
      .map((it, idx) => ({ idx, it, range: parseScheduleRangeToMinutes(it.time) }))
      .filter((row) => row.range) as Array<{ idx: number; it: ScheduleItem; range: { start: number; end: number } }>;
    parsed.sort((a, b) => a.range.start - b.range.start);
    for (let i = 0; i < parsed.length - 1; i++) {
      const a = parsed[i];
      const b = parsed[i + 1];
      if (Math.max(0, Math.min(a.range.end, b.range.end) - Math.max(a.range.start, b.range.start)) > 0) {
        setSaveError(`Double-booking detected between "${a.it.title}" and "${b.it.title}".`);
        return;
      }
    }
    // Sort schedule by time before saving
    const sorted = [...schedule].sort((a, b) => {
      const aRange = parseScheduleRangeToMinutes(a.time);
      const bRange = parseScheduleRangeToMinutes(b.time);
      if (!aRange) return 1;
      if (!bRange) return -1;
      return aRange.start - bRange.start;
    });
    onSave(sorted);
    closeModal(false);
  }, [schedule, onSave, closeModal]);

  const validateTimeRange = useCallback((time: string) => {
    const raw = String(time || '').trim();
    if (!raw) return { ok: false as const, error: 'Time is required.' };
    if (/^all\s*day$/i.test(raw)) return { ok: false as const, error: 'All Day is not allowed when unavailable slots are enforced.' };
    const range = parseScheduleRangeToMinutes(raw);
    if (!range) return { ok: false as const, error: 'Use a time range like "08:30 AM - 01:00 PM".' };
    if (range.end <= range.start) return { ok: false as const, error: 'End time must be after start time.' };
    return { ok: true as const, range };
  }, []);

  const adjustTimeToAvoidRules = useCallback((time: string, editingItemId?: string) => {
    const parsed = validateTimeRange(time);
    if (!parsed.ok) return parsed;
    const duration = parsed.range.end - parsed.range.start;
    const ruleRanges = schedule
      .filter((it) => it && it.source === 'rule' && it.id !== editingItemId)
      .map((it) => parseScheduleRangeToMinutes(String(it.time || '')))
      .filter(Boolean) as Array<{ start: number; end: number }>;
    ruleRanges.sort((a, b) => a.start - b.start);

    let start = parsed.range.start;
    let end = parsed.range.end;
    const maxIterations = 50;
    let iterations = 0;
    while (iterations < maxIterations) {
      iterations++;
      const overlap = ruleRanges.find((r) => Math.max(0, Math.min(end, r.end) - Math.max(start, r.start)) > 0);
      if (!overlap) break;
      start = overlap.end;
      end = start + duration;
      if (end > 24 * 60) return { ok: false as const, error: 'No available slot after your rules. Try an earlier time.' };
    }

    const adjusted = `${minutesToTimeString(start)} - ${minutesToTimeString(end)}`;
    return { ok: true as const, range: { start, end }, adjustedTime: adjusted };
  }, [schedule, validateTimeRange]);

  const todayYmd = React.useMemo(() => toYmdLocal(new Date()), []);
  const eventOpsForToday = React.useMemo(() => {
    const { todayItems, blocks } = buildEventOpsBlocksForToday(eventOpsItems, todayYmd);
    return { items: todayItems as EventOpsItem[], blocks };
  }, [eventOpsItems, todayYmd]);

  const scheduledEventOpsIds = React.useMemo(() => {
    return new Set(
      schedule
        .filter((s) => s?.source === 'event_ops' && typeof s?.eventOpsId === 'string' && s.eventOpsId.trim())
        .map((s) => String(s.eventOpsId))
    );
  }, [schedule]);

  const handleAddEventOpsItem = useCallback((eventOpsItem: EventOpsItem) => {
    if (!eventOpsItem?.id) return;
    if (scheduledEventOpsIds.has(eventOpsItem.id)) return;

    const existingBlock = eventOpsForToday.blocks.find((b: any) => String(b?.item?.id || '') === eventOpsItem.id) as any;
    const suggestedTime = existingBlock ? `${minutesToTimeString(existingBlock.start)} - ${minutesToTimeString(existingBlock.end)}` : '';
    const draftTime = String(eventOpsDraftTimes[eventOpsItem.id] || '').trim();
    let computedTime = draftTime || suggestedTime;
    if (!computedTime) return;
    const timeCheck = validateTimeRange(computedTime);
    if (!timeCheck.ok) return;
    const adjusted = adjustTimeToAvoidRules(computedTime);
    if (!adjusted.ok) return;
    computedTime = adjusted.adjustedTime;

    const title = `Event Ops — ${eventOpsItem.name}${eventOpsItem.location ? ` (${eventOpsItem.location})` : ''}`;
    let updatedSchedule = cascadeReschedule(schedule, { time: computedTime, title });
    const newScheduleItem: ScheduleItem = {
      id: `eventops-${eventOpsItem.id}`,
      time: computedTime,
      title,
      completed: false,
      source: 'event_ops',
      eventOpsId: eventOpsItem.id,
    };
    updatedSchedule = [...updatedSchedule.filter((s) => s.id !== newScheduleItem.id), newScheduleItem];
    setSchedule(sortSchedule(updatedSchedule));
  }, [scheduledEventOpsIds, eventOpsForToday.blocks, eventOpsDraftTimes, validateTimeRange, schedule, adjustTimeToAvoidRules, sortSchedule]);

  const addTimeCheck = React.useMemo(() => {
    const time = newItem.time.trim();
    if (!time) return { ok: true as const };
    return validateTimeRange(time);
  }, [newItem.time, validateTimeRange]);

  const canAdd = Boolean(newItem.time.trim() && newItem.title.trim() && addTimeCheck.ok);
  const effectiveNewItemError =
    newItemError ||
    (!addTimeCheck.ok && newItem.time.trim() && newItem.title.trim()
      ? ('error' in addTimeCheck ? addTimeCheck.error : 'Invalid time range.')
      : null);

  const handleAddItem = useCallback(() => {
    if (!newItem.time.trim() || !newItem.title.trim()) return;

    let time = newItem.time.trim();
    const title = newItem.title.trim();
    const timeCheck = validateTimeRange(time);
    if (!timeCheck.ok) {
      setNewItemError(timeCheck.error);
      return;
    }
    const adjusted = adjustTimeToAvoidRules(time);
    if (!adjusted.ok) {
      setNewItemError(adjusted.error);
      return;
    }
    time = adjusted.adjustedTime;
    setNewItemError(null);

    // Apply cascade logic to push down conflicting items
    let updatedSchedule = cascadeReschedule(schedule, { time, title });

    // Add the new item
    const newScheduleItem: ScheduleItem = {
      id: `sched-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time,
      title,
      completed: false,
      source: 'user',
    };

    updatedSchedule = [...updatedSchedule, newScheduleItem];

    // Sort by time
    setSchedule(sortSchedule(updatedSchedule));
    setNewItem({ time: '', title: '' });
  }, [schedule, newItem, validateTimeRange, adjustTimeToAvoidRules, sortSchedule]);

  const handleUpdateItem = useCallback((index: number, time: string, title: string) => {
    if (!time.trim() || !title.trim()) return;
    let nextTime = time.trim();
    const timeCheck = validateTimeRange(nextTime);
    if (!timeCheck.ok) {
      setEditErrors((prev) => ({ ...prev, [index]: timeCheck.error }));
      return;
    }

    const itemToUpdate = schedule[index];
    const updatedSchedule = schedule.filter((_, i) => i !== index);

    if (itemToUpdate?.source !== 'rule') {
      const adjusted = adjustTimeToAvoidRules(nextTime, itemToUpdate?.id);
      if (!adjusted.ok) {
        setEditErrors((prev) => ({ ...prev, [index]: adjusted.error }));
        return;
      }
      nextTime = adjusted.adjustedTime;
    }

    // Apply cascade logic with new time
    let cascaded = cascadeReschedule(updatedSchedule, { time: nextTime, title: title.trim() });

    // Update the item
    const updatedItem: ScheduleItem = {
      ...itemToUpdate,
      time: nextTime,
      title: title.trim(),
    };

    cascaded = [...cascaded, updatedItem];

    // Sort by time
    cascaded.sort((a, b) => {
      const aRange = parseScheduleRangeToMinutes(a.time);
      const bRange = parseScheduleRangeToMinutes(b.time);
      if (!aRange) return 1;
      if (!bRange) return -1;
      return aRange.start - bRange.start;
    });

    setSchedule(sortSchedule(cascaded));
    setEditingIndex(null);
    setEditErrors((prev) => ({ ...prev, [index]: null }));
  }, [schedule, validateTimeRange, adjustTimeToAvoidRules, sortSchedule]);

  const handleDeleteItem = useCallback((index: number) => {
    setSchedule(schedule.filter((_, i) => i !== index));
  }, [schedule]);

  const handleStartEdit = useCallback((index: number) => {
    setEditingIndex(index);
    setEditErrors((prev) => ({ ...prev, [index]: null }));
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null);
  }, []);

  if (!isOpen) {
    return null;
  }

  // Get modal root element (or use body as fallback)
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) {
    console.error('[ScheduleEditor] modal-root element not found');
    return null;
  }

  const modalContent = (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-editor-title"
    >
      <div
        className={`w-full max-w-2xl max-h-[90vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 animate__animated ${isClosing ? 'animate__bounceOut' : 'animate__bounceIn'} flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 id="schedule-editor-title" className="text-2xl font-bold text-primary-600">
            {title}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {saveError ? (
            <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-900 text-sm">
              {saveError}
            </div>
          ) : null}

          {/* Schedule Items List */}
          <div className="space-y-3 mb-6">
            {schedule.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No schedule items yet. Add one below.
              </p>
            ) : (
              schedule.map((item, index) => {
                if (!item || !item.time || !item.title) return null;
                const source = item.source || 'user';
                const badge =
                  source === 'event_ops'
                    ? { text: 'Event Ops', className: 'bg-blue-100 text-blue-800 border border-blue-200' }
                    : source === 'rule'
                      ? { text: 'Rule', className: 'bg-amber-100 text-amber-900 border border-amber-200' }
                    : { text: 'User', className: 'bg-gray-100 text-gray-700 border border-gray-200' };
                return (
                <div key={item.id} className="space-y-1">
                  <div
                    data-edit-row={index}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    {editingIndex === index ? (
                      <>
                      <input
                        id={`edit-time-${index}`}
                        type="text"
                        defaultValue={item.time}
                        onBlur={(e) => {
                          const nextTarget = e.relatedTarget as HTMLElement | null;
                          if (nextTarget && nextTarget.closest(`[data-edit-row="${index}"]`)) return;
                          const time = e.target.value.trim();
                          const titleInput = document.getElementById(`edit-title-${index}`) as HTMLInputElement;
                          const title = titleInput?.value.trim() || item.title;
                          if (time && title) {
                            handleUpdateItem(index, time, title);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const time = e.currentTarget.value.trim();
                            const titleInput = document.getElementById(`edit-title-${index}`) as HTMLInputElement;
                            const title = titleInput?.value.trim() || item.title;
                            if (time && title) {
                              handleUpdateItem(index, time, title);
                            }
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                        placeholder="08:30 AM - 01:00 PM"
                        className="flex-1 px-3 py-2 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
                        autoFocus
                      />
                      <input
                        id={`edit-title-${index}`}
                        type="text"
                        defaultValue={item.title}
                        onBlur={(e) => {
                          const nextTarget = e.relatedTarget as HTMLElement | null;
                          if (nextTarget && nextTarget.closest(`[data-edit-row="${index}"]`)) return;
                          const title = e.target.value.trim();
                          const timeInput = document.getElementById(`edit-time-${index}`) as HTMLInputElement;
                          const time = timeInput?.value.trim() || item.time;
                          if (time && title) {
                            handleUpdateItem(index, time, title);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const title = e.currentTarget.value.trim();
                            const timeInput = document.getElementById(`edit-time-${index}`) as HTMLInputElement;
                            const time = timeInput?.value.trim() || item.time;
                            if (time && title) {
                              handleUpdateItem(index, time, title);
                            }
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                        placeholder="Task title"
                        className="flex-1 px-3 py-2 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
                      />
                      <button
                        onClick={() => {
                          const timeInput = document.getElementById(`edit-time-${index}`) as HTMLInputElement;
                          const titleInput = document.getElementById(`edit-title-${index}`) as HTMLInputElement;
                          const time = timeInput?.value.trim() || item.time;
                          const title = titleInput?.value.trim() || item.title;
                          if (time && title) {
                            handleUpdateItem(index, time, title);
                          }
                        }}
                        className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => handleCancelEdit()}
                        className="px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      </>
                    ) : (
                      <>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {item.time}
                        </div>
                        <div className="text-gray-900 dark:text-gray-100">
                          {item.title}
                        </div>
                      </div>
                      <div className={`text-xs font-semibold px-2 py-1 rounded-md whitespace-nowrap ${badge.className}`}>
                        {badge.text}
                      </div>
                      <button
                        onClick={() => handleStartEdit(index)}
                        className="px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-600 hover:text-white rounded-lg transition-colors border border-primary-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteItem(index)}
                        className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                      </>
                    )}
                  </div>
                  {editingIndex === index && editErrors[index] ? (
                    <div className="text-sm text-red-600">
                      {editErrors[index]}
                    </div>
                  ) : null}
                </div>
              );
              })
            )}
          </div>

          {Array.isArray(eventOpsForToday.items) && eventOpsForToday.items.length > 0 ? (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                Event Ops (from Event Ops tab)
              </h3>
              <div className="space-y-2">
                {eventOpsForToday.items.map((it) => {
                  const isScheduled = scheduledEventOpsIds.has(it.id);
                  const existingBlock = eventOpsForToday.blocks.find((b: any) => String(b?.item?.id || '') === it.id) as any;
                  const suggestedTime = existingBlock ? `${minutesToTimeString(existingBlock.start)} - ${minutesToTimeString(existingBlock.end)}` : '';
                  const draftTime = String(eventOpsDraftTimes[it.id] ?? suggestedTime).trim();
                  const effectiveTime = draftTime || suggestedTime;
                  const timeCheck = effectiveTime ? validateTimeRange(effectiveTime) : { ok: false as const, error: 'Time is required.' };
                  return (
                    <div key={it.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-white">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {it.name}
                        </div>
                        <div className="text-xs text-gray-600">
                          {it.kind}{it.location ? ` • ${it.location}` : ''}{it.serving_time ? ` • Serving ${String(it.serving_time).slice(0, 5)}` : ' • Time not set'}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            value={draftTime}
                            onChange={(e) => setEventOpsDraftTimes((prev) => ({ ...prev, [it.id]: e.target.value }))}
                            placeholder="08:30 AM - 10:00 AM"
                            className="flex-1 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600"
                          />
                        </div>
                        {suggestedTime ? (
                          <div className="mt-1 text-xs text-gray-700">
                            Suggested: {suggestedTime}
                          </div>
                        ) : null}
                        {effectiveTime && !timeCheck.ok ? (
                          <div className="mt-1 text-xs text-red-600">
                            {'error' in timeCheck ? timeCheck.error : 'Invalid time.'}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-xs font-semibold px-2 py-1 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                          Event Ops
                        </div>
                        <button
                          onClick={() => handleAddEventOpsItem(it)}
                          disabled={isScheduled || !effectiveTime || !timeCheck.ok}
                          className="px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                          {isScheduled ? 'Added' : 'Add to schedule'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Add New Item */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
              Add New Item
            </h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={newItem.time}
                onChange={(e) => {
                  setNewItem({ ...newItem, time: e.target.value });
                  if (newItemError) setNewItemError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItem.time && newItem.title) {
                    handleAddItem();
                  }
                }}
                placeholder="08:30 AM - 01:00 PM"
                className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
              <input
                type="text"
                value={newItem.title}
                onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItem.time && newItem.title) {
                    handleAddItem();
                  }
                }}
                placeholder="Task title"
                className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
              <button
                onClick={handleAddItem}
                disabled={!canAdd}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
            {effectiveNewItemError ? (
              <div className="mt-2 text-sm text-red-600">
                {effectiveNewItemError}
              </div>
            ) : null}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              💡 Tip: When you add or modify items, conflicting items will automatically be pushed down.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-semibold rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, modalRoot);
};

export default ScheduleEditorModal;
