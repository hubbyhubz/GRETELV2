import React, { useState, useEffect } from 'react';
import type { WeeklyReport } from './types';

interface WeeklyReportModalProps {
  isOpen: boolean;
  report: WeeklyReport | null;
  onClose: () => void;
  onSave?: (report: WeeklyReport) => void;
  onGenerateEmailVersion?: (report: WeeklyReport) => Promise<null>;
}

const WeeklyReportModal: React.FC<WeeklyReportModalProps> = ({ isOpen, report, onClose, onSave, onGenerateEmailVersion }) => {
  const [editedReport, setEditedReport] = useState<WeeklyReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (report) {
      setEditedReport(JSON.parse(JSON.stringify(report))); // Deep copy
      setError(null); // Clear error when report changes
    }
  }, [report]);

  // Handle close with animation
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 400); // Match bounceOut animation duration
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


  const updateField = (field: keyof WeeklyReport, value: any) => {
    if (!editedReport) return;
    setEditedReport({ ...editedReport, [field]: value });
  };

  const updateArrayItem = (field: 'accomplishments' | 'challenges' | 'nextSteps' | 'projects', index: number, value: string) => {
    if (!editedReport) return;
    const arr = [...(editedReport[field] || [])];
    if (field === 'projects') {
      // For projects, value might be JSON string or we need to handle object updates differently
      return;
    }
    arr[index] = value;
    setEditedReport({ ...editedReport, [field]: arr });
  };

  const addArrayItem = (field: 'accomplishments' | 'challenges' | 'nextSteps') => {
    if (!editedReport) return;
    const arr = [...(editedReport[field] || []), ''];
    setEditedReport({ ...editedReport, [field]: arr });
  };

  const removeArrayItem = (field: 'accomplishments' | 'challenges' | 'nextSteps', index: number) => {
    if (!editedReport) return;
    const arr = [...(editedReport[field] || [])];
    arr.splice(index, 1);
    setEditedReport({ ...editedReport, [field]: arr });
  };

  if (!isOpen || !editedReport) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster"
      onClick={handleBackdropClick}
    >
      <div className={`w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden animate__animated ${isClosing ? 'animate__bounceOut' : 'animate__bounceIn'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
          <div>
            <h2 className="text-xl font-bold text-[#DC143C]">Weekly Report</h2>
            {editedReport.weekRange && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{editedReport.weekRange}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Executive Summary */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Executive Summary</label>
            <textarea
              value={editedReport.summary || ''}
              onChange={(e) => updateField('summary', e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 p-3 text-sm text-gray-800 dark:text-gray-200"
              placeholder="Enter executive summary..."
            />
          </div>

          {/* Mode Activity */}
          {editedReport.modeActivity && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                <span className="inline-flex items-center gap-2">
                  <span>🚨 Operational Highlights</span>
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(Crisis Response / Strategic Planning / Workload Management)</span>
                </span>
              </label>
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
                <p className="text-xs text-gray-600 dark:text-gray-300 mb-2 italic">
                  This section explains how special operational modes were used this week, what challenges were addressed, and what solutions were implemented.
                </p>
                <textarea
                  value={editedReport.modeActivity}
                  onChange={(e) => updateField('modeActivity', e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-gray-900/40 p-3 text-sm text-gray-800 dark:text-gray-200"
                  placeholder="Mode activity context..."
                />
              </div>
            </div>
          )}

          {/* Accomplishments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Accomplishments</label>
              <button
                onClick={() => addArrayItem('accomplishments')}
                className="text-xs text-[#DC143C] hover:underline"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {(editedReport.accomplishments || []).map((acc, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400 mt-2">{idx + 1}.</span>
                  <textarea
                    value={acc}
                    onChange={(e) => updateArrayItem('accomplishments', idx, e.target.value)}
                    rows={2}
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 p-2 text-sm text-gray-800 dark:text-gray-200"
                    placeholder="Enter accomplishment..."
                  />
                  <button
                    onClick={() => removeArrayItem('accomplishments', idx)}
                    className="text-red-500 hover:text-red-700 mt-2"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Challenges */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Challenges</label>
              <button
                onClick={() => addArrayItem('challenges')}
                className="text-xs text-[#DC143C] hover:underline"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {(editedReport.challenges || []).map((ch, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400 mt-2">{idx + 1}.</span>
                  <textarea
                    value={ch}
                    onChange={(e) => updateArrayItem('challenges', idx, e.target.value)}
                    rows={2}
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 p-2 text-sm text-gray-800 dark:text-gray-200"
                    placeholder="Enter challenge..."
                  />
                  <button
                    onClick={() => removeArrayItem('challenges', idx)}
                    className="text-red-500 hover:text-red-700 mt-2"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Projects */}
          {editedReport.projects && editedReport.projects.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Project Updates</label>
              <div className="space-y-3">
                {editedReport.projects.map((proj, idx) => (
                  <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/20">
                    <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{proj.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Progress: {proj.progress}% · Status: {proj.status}
                    </div>
                    {proj.nextMilestone && (
                      <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">Next: {proj.nextMilestone}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Next Steps</label>
              <button
                onClick={() => addArrayItem('nextSteps')}
                className="text-xs text-[#DC143C] hover:underline"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {(editedReport.nextSteps || []).map((step, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400 mt-2">{idx + 1}.</span>
                  <textarea
                    value={step}
                    onChange={(e) => updateArrayItem('nextSteps', idx, e.target.value)}
                    rows={2}
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 p-2 text-sm text-gray-800 dark:text-gray-200"
                    placeholder="Enter next step..."
                  />
                  <button
                    onClick={() => removeArrayItem('nextSteps', idx)}
                    className="text-red-500 hover:text-red-700 mt-2"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {onGenerateEmailVersion && (
            <button
              onClick={async () => {
                if (!editedReport || isGenerating) return;
                setIsGenerating(true);
                setError(null);
                try {
                  await onGenerateEmailVersion(editedReport);
                  handleClose();
                  // Success is handled by parent (success notification + modal opening)
                } catch (err) {
                  console.error('Failed to generate email version:', err);
                  const errorMessage = err instanceof Error ? err.message : 'Failed to generate email version. Please try again.';
                  setError(errorMessage);
                } finally {
                  setIsGenerating(false);
                }
              }}
              disabled={!editedReport || isGenerating}
              className="px-4 py-2 rounded-lg bg-[#DC143C] hover:bg-[#b81030] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold"
            >
              {isGenerating ? 'Generating...' : 'Generate Email Version'}
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-semibold"
            >
              Close
            </button>
            {onSave && (
              <button
                onClick={() => {
                  if (editedReport) {
                    onSave(editedReport);
                    handleClose();
                  }
                }}
                className="px-4 py-2 rounded-lg bg-[#DC143C] hover:bg-[#b81030] text-white text-sm font-semibold"
              >
                Save Changes
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeeklyReportModal;
