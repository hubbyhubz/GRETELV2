import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ScheduleItem } from './types';
import { cascadeReschedule, parseScheduleRangeToMinutes } from './assistantActionUtils';
import { XIcon } from './AnimatedIcons/XIcon';

interface ScheduleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: ScheduleItem[];
  onSave: (schedule: ScheduleItem[]) => void;
  onDraftChange?: (schedule: ScheduleItem[]) => void;
  title?: string;
}

const ScheduleEditorModal: React.FC<ScheduleEditorModalProps> = ({
  isOpen,
  onClose,
  schedule: initialSchedule,
  onSave,
  onDraftChange,
  title = 'Edit Schedule',
}) => {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newItem, setNewItem] = useState({ time: '', title: '' });
  const [isClosing, setIsClosing] = useState(false);

  // Update local schedule when prop changes - ensure it always displays the full schedule
  useEffect(() => {
    if (isOpen) {
      // Always use the initialSchedule prop - it should contain the draft schedule
      const scheduleToUse = Array.isArray(initialSchedule) && initialSchedule.length > 0 
        ? [...initialSchedule] 
        : [];
      setSchedule(scheduleToUse);
      setEditingIndex(null);
      setNewItem({ time: '', title: '' });
      setIsClosing(false);
    }
  }, [isOpen, initialSchedule]);

  const closeModal = useCallback((persistDraft: boolean) => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      if (persistDraft) {
        onDraftChange?.(schedule);
      }
      onClose();
    }, 300);
  }, [onClose, onDraftChange, schedule]);

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

  const handleAddItem = useCallback(() => {
    if (!newItem.time.trim() || !newItem.title.trim()) return;

    const time = newItem.time.trim();
    const title = newItem.title.trim();

    // Apply cascade logic to push down conflicting items
    let updatedSchedule = cascadeReschedule(schedule, { time, title });

    // Add the new item
    const newScheduleItem: ScheduleItem = {
      id: `sched-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time,
      title,
      completed: false,
    };

    updatedSchedule = [...updatedSchedule, newScheduleItem];

    // Sort by time
    updatedSchedule.sort((a, b) => {
      const aRange = parseScheduleRangeToMinutes(a.time);
      const bRange = parseScheduleRangeToMinutes(b.time);
      if (!aRange) return 1;
      if (!bRange) return -1;
      return aRange.start - bRange.start;
    });

    setSchedule(updatedSchedule);
    setNewItem({ time: '', title: '' });
  }, [schedule, newItem]);

  const handleUpdateItem = useCallback((index: number, time: string, title: string) => {
    if (!time.trim() || !title.trim()) return;

    const itemToUpdate = schedule[index];
    const updatedSchedule = schedule.filter((_, i) => i !== index);

    // Apply cascade logic with new time
    let cascaded = cascadeReschedule(updatedSchedule, { time: time.trim(), title: title.trim() });

    // Update the item
    const updatedItem: ScheduleItem = {
      ...itemToUpdate,
      time: time.trim(),
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

    setSchedule(cascaded);
    setEditingIndex(null);
  }, [schedule]);

  const handleDeleteItem = useCallback((index: number) => {
    setSchedule(schedule.filter((_, i) => i !== index));
  }, [schedule]);

  const handleStartEdit = useCallback((index: number) => {
    setEditingIndex(index);
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
          {/* Schedule Items List */}
          <div className="space-y-3 mb-6">
            {schedule.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No schedule items yet. Add one below.
              </p>
            ) : (
              schedule.map((item, index) => {
                if (!item || !item.time || !item.title) return null;
                return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  {editingIndex === index ? (
                    <>
                      <input
                        id={`edit-time-${index}`}
                        type="text"
                        defaultValue={item.time}
                        onBlur={(e) => {
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
              );
              })
            )}
          </div>

          {/* Add New Item */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
              Add New Item
            </h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={newItem.time}
                onChange={(e) => setNewItem({ ...newItem, time: e.target.value })}
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
                disabled={!newItem.time.trim() || !newItem.title.trim()}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
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
