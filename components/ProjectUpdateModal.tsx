
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
// FIX: Update import path from '../App' to './types' to resolve module export errors.
import type { Project, Milestone } from './types';

interface ProjectUpdateModalProps {
  project: Project;
  onClose: () => void;
  onUpdate: (updatedProject: Project) => void;
}

const ProjectUpdateModal: React.FC<ProjectUpdateModalProps> = ({ project, onClose, onUpdate }) => {
  const [milestones, setMilestones] = useState<Milestone[]>(project.milestones);
  const [isClosing, setIsClosing] = useState(false);
  // Convert deadline string to YYYY-MM-DD format for date input, or empty if not a valid date
  const parseDeadlineForInput = (deadlineStr: string): string => {
    if (!deadlineStr || deadlineStr === 'TBD') return '';
    // Try parsing as ISO date string (YYYY-MM-DD)
    const isoMatch = deadlineStr.match(/^\d{4}-\d{2}-\d{2}$/);
    if (isoMatch) return deadlineStr;
    // Try parsing as Date object
    const parsed = new Date(deadlineStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    return '';
  };
  const [deadline, setDeadline] = useState<string>(parseDeadlineForInput(project.deadline || ''));

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 400);
  };

  // Handle clicks on the modal background to close it
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };
  
  // Handle Escape key to close the modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleMilestoneProgressChange = (index: number, newProgressStr: string) => {
    const newProgress = parseInt(newProgressStr, 10);
    // Allow empty input for typing, but treat it as 0 for calculation
    const progressValue = isNaN(newProgress) ? 0 : newProgress;

    // Clamp the value between 0 and 100
    const clampedProgress = Math.max(0, Math.min(100, progressValue));

    const newMilestones = [...milestones];
    newMilestones[index] = { ...newMilestones[index], progress: clampedProgress };
    
    // If the input was empty, reflect that, otherwise use the clamped value
    if (newProgressStr === '') {
        newMilestones[index].progress = 0; // Store 0 but allow input to be empty
    } else {
        newMilestones[index].progress = clampedProgress;
    }
    
    setMilestones(newMilestones);
  };

  const handleSaveChanges = () => {
    // Final validation before saving to ensure no empty inputs are saved as NaN
    const finalMilestones = milestones.map(m => ({
        ...m,
        progress: Number(m.progress) || 0
    }));
    onUpdate({ ...project, deadline: deadline.trim() || project.deadline, milestones: finalMilestones });
    handleClose();
  };
  
  const totalMilestones = milestones.length;
  const overallProgress = totalMilestones > 0 
    ? milestones.reduce((sum, m) => sum + (Number(m.progress) || 0), 0) / totalMilestones
    : 0;

  // Get modal root element
  const modalRoot = document.getElementById('modal-root') || document.body;

  return createPortal(
    <div
      className="flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-gray-700">
            <div>
                <h2 id="project-modal-title" className="text-xl font-bold" style={{ color: 'var(--primary-600)' }}>Update Project Progress</h2>
                <p className="text-gray-600 dark:text-gray-400">{project.name}</p>
            </div>
            <button
                onClick={handleClose}
                className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
                style={{ '--tw-ring-color': 'var(--primary-600)' } as React.CSSProperties}
                aria-label="Close modal"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>

        <div className="py-6 max-h-[50vh] overflow-y-auto pr-2">
            <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Project Deadline</label>
                <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full p-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': 'var(--primary-300)' } as React.CSSProperties}
                    placeholder="Select deadline"
                />
            </div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Milestones</h3>
            {milestones.length > 0 ? (
                <ul className="space-y-3">
                    {milestones.map((milestone, index) => (
                        <li key={index} className="flex flex-col p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            {/* Row 1: Task Description (Full Width) */}
                            <div className="w-full mb-3">
                                <span className="text-gray-800 dark:text-gray-200">{milestone.text}</span>
                            </div>
                            
                            {/* Row 2: Footer with Assignee Badge and Percentage Input */}
                            <div className="flex flex-row justify-between items-center">
                                {/* Left Side: Assignee Badge */}
                                <div className="flex-shrink-0">
                                    {milestone.assigneeName && (
                                        <span className="text-xs text-gray-500 bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                                            {milestone.assigneeName}
                                        </span>
                                    )}
                                </div>
                                
                                {/* Right Side: Percentage Input */}
                                <div className="flex items-center">
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={milestone.progress}
                                        onChange={(e) => handleMilestoneProgressChange(index, e.target.value)}
                                        className="w-20 p-1 text-center bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': 'var(--primary-300)' } as React.CSSProperties}
                                        aria-label={`Progress for milestone: ${milestone.text}`}
                                    />
                                    <span className="ml-2 font-semibold text-gray-500 dark:text-gray-400">%</span>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-center text-gray-500 dark:text-gray-400">No milestones found for this project.</p>
            )}
        </div>
        
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
             <div className="mb-4">
                <div className="flex justify-between items-center text-sm font-semibold mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Overall Progress</span>
                    <span style={{ color: 'var(--primary-600)' }}>{Math.round(overallProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full transition-all duration-500" style={{ width: `${overallProgress}%`, backgroundColor: 'var(--primary-600)' }}></div>
                </div>
             </div>

            <div className="flex justify-end space-x-4">
                <button
                    onClick={onClose}
                    className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 active:scale-95"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSaveChanges}
                    className="text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-100"
                    style={{ backgroundColor: 'var(--primary-600)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-700)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-600)')}
                >
                    Save & Close
                </button>
            </div>
        </div>

      </div>
    </div>,
    modalRoot
  );
};

export default ProjectUpdateModal;