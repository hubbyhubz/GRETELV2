import React, { useEffect, useMemo, useState } from 'react';
import type { DelegatedTaskItem, Project, TeamMember } from './types';

interface ProjectPlanningModalProps {
  isOpen: boolean;
  teamMembers: TeamMember[];
  onClose: () => void;
  onGenerateDraft: (inputs: { description: string; deadline: string; milestones: string; delegatedTasks: string; owners: string[]; notes: string; }) => Promise<{ project: Project; tasks: DelegatedTaskItem[] } | null>;
  onSaveDraft: (draft: { project: Project; tasks: DelegatedTaskItem[] }) => Promise<void>;
}

interface MilestoneRow {
  name: string;
  deadline: string;
  tasks: string;
  assignee: string;
}

const ProjectPlanningModal: React.FC<ProjectPlanningModalProps> = ({ isOpen, teamMembers, onClose, onGenerateDraft, onSaveDraft }) => {
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [milestoneList, setMilestoneList] = useState('');
  const [milestoneRows, setMilestoneRows] = useState<MilestoneRow[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState<Project | null>(null);
  const [draftTasks, setDraftTasks] = useState<DelegatedTaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 400);
  };

  useEffect(() => {
    if (!isOpen) {
      setDescription('');
      setDeadline('');
      setMilestoneList('');
      setMilestoneRows([]);
      setOwners([]);
      setNotes('');
      setDraft(null);
      setDraftTasks([]);
      setIsLoading(false);
      setError(null);
    }
  }, [isOpen]);

  // Smart Sync: Auto-generate milestone rows from milestone list textarea
  useEffect(() => {
    const lines = milestoneList.split('\n').filter(line => line.trim());
    
    setMilestoneRows(prev => {
      // Map by INDEX: Line 1 = Row 1, Line 2 = Row 2, etc.
      const syncedRows: MilestoneRow[] = lines.map((line, index) => {
        const trimmedName = line.trim();
        
        // If a row at this index already exists, update its name but preserve deadline, tasks, and assignee
        if (prev[index]) {
          return {
            ...prev[index],
            name: trimmedName
          };
        }
        
        // If no row exists at this index, create a new one
        return {
          name: trimmedName,
          deadline: '',
          tasks: '',
          assignee: ''
        };
      });

      // Only update if there are actual changes to avoid infinite loops
      const hasChanges = syncedRows.length !== prev.length || 
        syncedRows.some((row, idx) => row.name !== prev[idx]?.name);
      
      return hasChanges ? syncedRows : prev;
    });
  }, [milestoneList]);

  const handleMilestoneRowChange = (index: number, field: keyof MilestoneRow, value: string) => {
    setMilestoneRows(prev => prev.map((row, i) => 
      i === index ? { ...row, [field]: value } : row
    ));
  };

  const handleAddCustomMilestone = () => {
    const nextNumber = milestoneRows.length + 1;
    setMilestoneRows(prev => [...prev, { 
      name: `Milestone ${nextNumber}`, 
      deadline: '', 
      tasks: '',
      assignee: ''
    }]);
  };

  const handleRemoveMilestone = (index: number) => {
    setMilestoneRows(prev => prev.filter((_, i) => i !== index));
    // Also remove from milestone list if it exists there
    const rowToRemove = milestoneRows[index];
    if (rowToRemove && milestoneList.includes(rowToRemove.name)) {
      const updatedList = milestoneList
        .split('\n')
        .filter(line => line.trim() !== rowToRemove.name)
        .join('\n');
      setMilestoneList(updatedList);
    }
  };

  const handleOwnerToggle = (name: string) => {
    setOwners(prev => prev.includes(name) ? prev.filter(owner => owner !== name) : [...prev, name]);
  };

  const activeMilestones = useMemo(() => 
    milestoneRows.filter(row => row.name.trim() !== ''), 
    [milestoneRows]
  );
  const milestoneCount = activeMilestones.length;
  const canGenerate = description.trim().length > 0 && deadline.trim().length > 0 && milestoneCount > 0;

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Convert milestoneRows to the format expected by the API
      const milestones = activeMilestones.map(row => row.name.trim()).join('\n');
      const delegatedTasks = activeMilestones
        .map((row, index) => {
          if (!row.tasks.trim()) return '';
          const assigneeText = row.assignee ? ` [Assignee: ${row.assignee}]` : '';
          return `Milestone ${index + 1} (${row.name}): ${row.tasks.trim()}${assigneeText}`;
        })
        .filter(Boolean)
        .join('\n');
      
      // Build milestone deadlines and assignees string for AI
      const milestoneDeadlinesText = activeMilestones
        .map((row, index) => {
          const milestoneNum = index + 1;
          const deadlineText = row.deadline 
            ? `Deadline: ${row.deadline}` 
            : 'No deadline set';
          const assigneeText = row.assignee ? ` | Assignee: ${row.assignee}` : '';
          return `Milestone ${milestoneNum} (${row.name}): ${deadlineText}${assigneeText}`;
        })
        .join('\n');

      const result = await onGenerateDraft({
        description: description.trim(),
        deadline: deadline.trim(),
        milestones,
        delegatedTasks,
        owners,
        notes: notes.trim() + (milestoneDeadlinesText ? `\n\nMilestone Deadlines:\n${milestoneDeadlinesText}` : ''),
      });
      if (!result) {
        setError('No draft returned. Please try again.');
        return;
      }
      setDraft(result.project);
      setDraftTasks(result.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate project draft.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setIsLoading(true);
    setError(null);
    try {
      await onSaveDraft({ project: draft, tasks: draftTasks });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project draft.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster" onClick={handleClose}>
      <div
        className={`w-full max-w-4xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate__animated ${isClosing ? 'animate__bounceOut' : 'animate__bounceIn'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
          <div>
            <h2 className="text-xl font-bold text-primary-600">Create a New Project</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Answer a few questions, then generate your draft.</p>
          </div>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-5">
          <div className="bg-white dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-sm text-gray-700 dark:text-gray-200">
            <div className="font-semibold mb-2">Before I draft the project, I need a few details:</div>
            <div className="grid sm:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
              <div>1. Deadline</div>
              <div>2. Key milestones</div>
              <div>3. Delegated tasks per milestone</div>
              <div>4. Owners/assignees</div>
            </div>
          </div>

          <div className="grid gap-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Project description <span className="text-red-500">*</span></label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 p-2 text-sm text-gray-800 dark:text-gray-200"
                placeholder="Describe the project in plain language."
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Project Deadline <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 p-2 text-sm text-gray-800 dark:text-gray-200"
                  placeholder="Select a date"
                  title="Overall project deadline"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Owners / assignees</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {teamMembers.length === 0 && <span className="text-xs text-gray-500">No team members found.</span>}
                  {teamMembers.map(member => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => handleOwnerToggle(member.name)}
                      className={`px-2 py-1 rounded-md text-xs border ${
                        owners.includes(member.name)
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white dark:bg-gray-900/40 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {member.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2 block">
                Milestone List <span className="text-xs font-normal text-gray-500">(paste your milestones, one per line)</span>
              </label>
              <textarea
                value={milestoneList}
                onChange={(e) => setMilestoneList(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 p-2 text-sm text-gray-800 dark:text-gray-200"
                placeholder="Milestone 1&#10;Milestone 2&#10;Milestone 3"
              />
              <div className="text-xs text-gray-500 mt-1">
                Changes here will automatically sync to the Delegated Tasks section below.
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Delegated tasks per milestone <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddCustomMilestone}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors"
                >
                  + Add Custom Milestone
                </button>
              </div>
              {milestoneRows.length === 0 ? (
                <div className="p-4 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg text-center text-sm text-gray-500">
                  Paste milestones in the "Milestone List" above or click "Add Custom Milestone" to get started.
                </div>
              ) : (
                <div className="space-y-4">
                  {milestoneRows.map((row, index) => (
                    <div key={index} className="p-4 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 grid md:grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
                              Milestone Name
                            </label>
                            <input
                              type="text"
                              value={row.name}
                              onChange={(e) => handleMilestoneRowChange(index, 'name', e.target.value)}
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 p-2 text-sm text-gray-800 dark:text-gray-200"
                              placeholder={`Milestone ${index + 1}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
                              Deadline
                            </label>
                            <input
                              type="date"
                              value={row.deadline}
                              onChange={(e) => handleMilestoneRowChange(index, 'deadline', e.target.value)}
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 p-2 text-sm text-gray-800 dark:text-gray-200"
                              placeholder="Select deadline"
                              title={`Deadline for all delegated tasks under ${row.name}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
                              Assignee
                            </label>
                            <select
                              value={row.assignee}
                              onChange={(e) => handleMilestoneRowChange(index, 'assignee', e.target.value)}
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 p-2 text-sm text-gray-800 dark:text-gray-200"
                            >
                              <option value="">Select assignee</option>
                              {teamMembers.map(member => (
                                <option key={member.id} value={member.name}>
                                  {member.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {milestoneRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMilestone(index)}
                            className="mt-6 p-1.5 text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            title="Remove milestone"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
                          Tasks
                        </label>
                        <textarea
                          value={row.tasks}
                          onChange={(e) => handleMilestoneRowChange(index, 'tasks', e.target.value)}
                          rows={2}
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 p-2 text-sm text-gray-800 dark:text-gray-200"
                          placeholder="Task A, Task B, Task C"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-500 mt-2">
                {milestoneCount} milestone{milestoneCount !== 1 ? 's' : ''} configured. Deadlines will be applied to all delegated tasks created under each milestone.
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Additional notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 p-2 text-sm text-gray-800 dark:text-gray-200"
                placeholder="Optional details or constraints."
              />
            </div>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          {draft && (
            <div className="border border-gray-200 dark:border-gray-600 rounded-xl p-4 bg-gray-50 dark:bg-gray-900/40 text-sm">
              <div className="font-semibold text-gray-800 dark:text-gray-100">{draft.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Deadline: {draft.deadline || 'TBD'}</div>
              <div className="mt-3 space-y-2 text-xs text-gray-600 dark:text-gray-300">
                {draft.milestones.map(milestone => (
                  <div key={milestone.id}>
                    <span className="font-semibold">• {milestone.text}</span>
                    {milestone.assigneeName ? <span className="ml-1 text-gray-500">({milestone.assigneeName})</span> : null}
                    {milestone.linkedTaskIds?.length ? (
                      <div className="ml-4 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        {draftTasks
                          .filter(task => milestone.linkedTaskIds?.includes(task.id))
                          .map(task => (
                            <div key={task.id}>- {task.text} {task.assigneeName ? `(${task.assigneeName})` : ''}</div>
                          ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-semibold"
            disabled={isLoading}
          >
            Cancel
          </button>
          {!draft ? (
            <button
              type="button"
              onClick={handleGenerate}
              className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold disabled:opacity-60"
              disabled={!canGenerate || isLoading}
            >
              {isLoading ? 'Generating…' : 'Generate Draft'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold disabled:opacity-60"
              disabled={isLoading}
            >
              {isLoading ? 'Saving…' : 'Create Project'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectPlanningModal;
