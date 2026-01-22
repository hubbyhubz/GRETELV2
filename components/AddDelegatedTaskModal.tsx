import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { TeamMember } from './types';

import { CustomTimePicker } from './CustomTimePicker';

interface AddDelegatedTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamMembers: TeamMember[];
  onAddTask: (task: { text: string; assigneeId: string; deadlineDate: string; deadlineTime: string; }) => Promise<void>;
}

const AddDelegatedTaskModal: React.FC<AddDelegatedTaskModalProps> = ({ isOpen, onClose, teamMembers, onAddTask }) => {
  const [text, setText] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 400);
  };

  useEffect(() => {
    if (isOpen) {
      // Reset form on open
      setText('');
      setAssigneeId(teamMembers.length > 0 ? teamMembers[0].id : '');
      setDeadlineDate('');
      setDeadlineTime('');
      setError('');
      setIsSubmitting(false);
      // Focus the first input field
      setTimeout(() => {
        // Force cleanup any Driver.js elements that appeared
        const allDriverElements = document.querySelectorAll('[class*="driver"]');
        if (allDriverElements.length > 0) {
          document.querySelectorAll('.driver-overlay, .driver-popover, .driver-highlighted, [class*="driver"]').forEach(el => el.remove());
          document.querySelectorAll('.driver-active').forEach(el => el.classList.remove('driver-active'));
        }
        textRef.current?.focus();
      }, 100);
    }
  }, [isOpen, teamMembers]);
  
  // Handle Escape key to close the modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !assigneeId || !deadlineDate) {
      setError('Task description, assignee, and a deadline date are required.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await onAddTask({ text: text.trim(), assigneeId, deadlineDate, deadlineTime });
      handleClose();
    } catch (e: any) {
      setError(`Failed to add task: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  if (!isOpen) return null;

  // Get modal root element
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  // Render modal using Portal
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-task-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
      }}
    >
      <div
        className={`w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700 animate__animated ${isClosing ? 'animate__bounceOut' : 'animate__bounceIn'}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          zIndex: 10000,
        }}
      >
        <form onSubmit={handleSubmit} noValidate>
          <h2 id="add-task-title" className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-6">
            Delegate New Task
          </h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="task-text" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">
                Task Description
              </label>
              <textarea
                id="task-text"
                ref={textRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                className="w-full p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#DC143C]"
                placeholder="Describe the task to be delegated..."
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label htmlFor="task-assignee" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">
                  Assign To
                </label>
                <select
                  id="task-assignee"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#DC143C]"
                  required
                >
                  {teamMembers.length > 0 ? (
                    teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))
                  ) : (
                    <option disabled>Please add team members first</option>
                  )}
                </select>
              </div>
              <div className="sm:col-span-1">
                <label htmlFor="task-deadline-date" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">
                  Deadline Date
                </label>
                <input
                  type="date"
                  id="task-deadline-date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="w-full p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#DC143C]"
                  required
                />
              </div>
              <div className="sm:col-span-1">
                <label htmlFor="task-deadline-time" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">
                  Time (Optional)
                </label>
                <CustomTimePicker
                  id="task-deadline-time"
                  value={deadlineTime}
                  onChange={setDeadlineTime}
                  className="w-full p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus-within:ring-2 focus-within:ring-[#DC143C]"
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-4 text-center">
              {error}
            </p>
          )}

          <div className="flex justify-end space-x-4 mt-8 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleClose}
              className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || teamMembers.length === 0}
              className="bg-[#DC143C] hover:bg-[#b81030] text-white font-bold py-2 px-4 rounded-lg flex items-center disabled:bg-gray-400 transition-all duration-200 active:scale-95"
            >
              {isSubmitting && (
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              )}
              {isSubmitting ? 'Adding...' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    modalRoot
  );
};

export default AddDelegatedTaskModal;
