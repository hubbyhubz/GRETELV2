// FIX: Imported the 'useMemo' hook from React to resolve a "Cannot find name 'useMemo'" error.
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode, useLayoutEffect, useMemo } from 'react';
// FIX: The sendMessageToGemini function was missing an export in geminiService.ts; it has been added, making this import correct.
import { sendMessageToGemini } from './geminiService';
import { getDashboardState, saveDashboardState } from './googleDriveService';
import { batchAddEventsToCalendar, getTodaysEvents } from './googleCalendarService';
import { createTask, findOrCreateTaskList, updateTask, deleteTask } from './googleTasksService';
import type { Session } from '@supabase/supabase-js';
import type { Content } from '@google/genai';
// FIX: All type imports were pointing to App.tsx which doesn't export them. Changed to import from the correct types.ts file.
import type { UserProfile, DashboardView, BriefingInputItem, DashboardState, ScheduleItem, Top3Item, ReminderItem, ReminderBriefingPreference, Project, Milestone, ChatMessage, ChatHistoryItem, BriefingState, DelegatedTaskItem, WeeklyLogItem, WeeklyReport, AssistantMode, ModeHistoryEntry, UserMood, EventOpsItem } from './types';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { applyPriorityOps as applyPriorityOpsUtil, applyProjectOps as applyProjectOpsUtil, applyReminderOps as applyReminderOpsUtil, applyScheduleOps as applyScheduleOpsUtil, detectEventOpsScheduleClarification, normalizeNeedle as normalizeNeedleUtil, parseDeadlineFromText as parseDeadlineFromTextUtil } from './assistantActionUtils';
import { bestFuzzyMatch, inferFinalizePlan, inferFreeStyle } from './freeStyleNlu';

// Version for the dashboard state structure. Increment this to trigger migrations.
const DASHBOARD_STATE_VERSION = "1.1.0";

const knownErrorMessages = [
  "I'm sorry, the connection to the AI service is not configured. This feature is currently unavailable.",
  "I'm sorry, I'm having trouble connecting to my services right now. Please try again in a moment."
];

const CHAT_HISTORY_RETENTION_YEARS = 2;
const MORNING_BRIEFING_HOUR = 8;
const MORNING_BRIEFING_MINUTE = 30;
const AFTERNOON_BRIEFING_HOUR = 15;
const AFTERNOON_BRIEFING_MINUTE = 30;
const BRIEFING_NOW_STORAGE_KEY = 'gretel:briefingNow';
const DEFAULT_REMINDER_BRIEFING_PREF: ReminderBriefingPreference = 'none';

type BriefingWindow = { type: 'morning' | 'afternoon'; start: number; end: number };

const getBriefingNow = (): Date => {
  try {
    const stored = window.localStorage.getItem(BRIEFING_NOW_STORAGE_KEY);
    if (!stored) return new Date();
    const parsedDate = new Date(stored);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
    const parsedNumber = Number(stored);
    if (!Number.isNaN(parsedNumber)) return new Date(parsedNumber);
    return new Date();
  } catch {
    return new Date();
  }
};

const getBriefingNowOverride = (): number | null => {
  try {
    const stored = window.localStorage.getItem(BRIEFING_NOW_STORAGE_KEY);
    if (!stored) return null;
    const parsedDate = new Date(stored);
    if (!isNaN(parsedDate.getTime())) return parsedDate.getTime();
    const parsedNumber = Number(stored);
    if (!Number.isNaN(parsedNumber)) return parsedNumber;
    return null;
  } catch {
    return null;
  }
};

const buildBriefingWindow = (type: 'morning' | 'afternoon', now = new Date()): BriefingWindow => {
  const morningCutoff = new Date(now);
  morningCutoff.setHours(MORNING_BRIEFING_HOUR, MORNING_BRIEFING_MINUTE, 0, 0);

  const afternoonCutoff = new Date(now);
  afternoonCutoff.setHours(AFTERNOON_BRIEFING_HOUR, AFTERNOON_BRIEFING_MINUTE, 0, 0);

  if (type === 'morning') {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(AFTERNOON_BRIEFING_HOUR, AFTERNOON_BRIEFING_MINUTE, 0, 0);
    return { type, start: start.getTime(), end: morningCutoff.getTime() };
  }

  return { type, start: morningCutoff.getTime(), end: afternoonCutoff.getTime() };
};

const resolveLoggedAt = (loggedAt?: number): number => (typeof loggedAt === 'number' ? loggedAt : Date.now());

const resolveReminderBriefingPref = (pref?: ReminderBriefingPreference): ReminderBriefingPreference =>
  pref ?? DEFAULT_REMINDER_BRIEFING_PREF;

const resolveDelegatedStatus = (status?: DelegatedTaskItem['status'], completed?: boolean): DelegatedTaskItem['status'] => {
  if (status) return status;
  return completed ? 'completed' : 'not_started';
};

const normalizeTaskText = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();

const normalizeDelegatedTaskText = (value: string): string => {
  const withoutMetadata = value
    .replace(/\bcontext\s*:\s*[^.?!]*(?:[.?!]|$)/gi, ' ')
    .replace(/\bdeadline\s*:\s*[^.?!]*(?:[.?!]|$)/gi, ' ')
    .replace(/\bdue\s*:\s*[^.?!]*(?:[.?!]|$)/gi, ' ');
  return normalizeTaskText(withoutMetadata);
};

const normalizeDelegatedDeadline = (deadline?: string): string => {
  if (!deadline) return '';
  const parsed = new Date(deadline);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return normalizeTaskText(deadline);
};

const isSameDelegatedTask = (left: DelegatedTaskItem, right: DelegatedTaskItem): boolean => {
  if (left.googleTaskId && right.googleTaskId) {
    return left.googleTaskId === right.googleTaskId;
  }
  const assigneeLeft = left.assigneeId || left.assigneeName || 'unknown';
  const assigneeRight = right.assigneeId || right.assigneeName || 'unknown';
  if (assigneeLeft !== assigneeRight) return false;
  if (normalizeDelegatedTaskText(left.text) !== normalizeDelegatedTaskText(right.text)) return false;

  const leftDeadline = normalizeDelegatedDeadline(left.deadline);
  const rightDeadline = normalizeDelegatedDeadline(right.deadline);
  if (leftDeadline && rightDeadline) return leftDeadline === rightDeadline;
  return true;
};

const mergeDelegatedTask = (base: DelegatedTaskItem, incoming: DelegatedTaskItem): DelegatedTaskItem => ({
  ...base,
  ...incoming,
  googleTaskId: incoming.googleTaskId ?? base.googleTaskId,
  deadline: incoming.deadline || base.deadline,
  status: incoming.status || base.status,
  remarks: incoming.remarks || base.remarks,
  completed: incoming.completed || base.completed,
});

const dedupeDelegatedTasks = (items: DelegatedTaskItem[]): DelegatedTaskItem[] => {
  const deduped: DelegatedTaskItem[] = [];
  items.forEach(task => {
    const existingIndex = deduped.findIndex(candidate => isSameDelegatedTask(candidate, task));
    if (existingIndex === -1) {
      deduped.push(task);
      return;
    }
    const existing = deduped[existingIndex];
    const prefersIncoming =
      (!existing.googleTaskId && task.googleTaskId) ||
      (!existing.remarks && task.remarks) ||
      (task.deadline && !existing.deadline) ||
      (task.text && task.text.length > existing.text.length);
    deduped[existingIndex] = prefersIncoming ? mergeDelegatedTask(existing, task) : mergeDelegatedTask(task, existing);
  });
  return deduped;
};

const updateProjectsFromTasks = (projects: Project[], tasks: DelegatedTaskItem[]): Project[] =>
  projects.map(project => {
    const nextMilestones = project.milestones.map(milestone => {
      if (!milestone.linkedTaskIds || milestone.linkedTaskIds.length === 0) return milestone;
      const linkedTasks = tasks.filter(task => milestone.linkedTaskIds?.includes(task.id));
      if (linkedTasks.length === 0) return milestone;
      const completedCount = linkedTasks.filter(task => task.completed || task.status === 'completed').length;
      const progress = Math.round((completedCount / linkedTasks.length) * 100);
      return { ...milestone, progress };
    });
    return { ...project, milestones: nextMilestones };
  });

const filterBriefingContext = (
  window: BriefingWindow | null,
  reminders: ReminderItem[],
  briefingInputs: BriefingInputItem[],
  delegatedTasks: DelegatedTaskItem[]
) => {
  if (!window) {
    return {
      briefingReminders: reminders.filter(item => resolveReminderBriefingPref(item.includeInBriefing) !== 'none'),
      briefingInputs,
      briefingDelegatedTasks: delegatedTasks.filter(task => !task.completed),
      remainingReminders: reminders,
      remainingBriefingInputs: briefingInputs,
      remainingDelegatedTasks: delegatedTasks,
    };
  }

  const isWithinWindow = (loggedAt: number) => loggedAt > window.start && loggedAt <= window.end;
  const shouldIncludeReminder = (pref: ReminderBriefingPreference) => {
    if (pref === 'both') return true;
    if (window.type === 'morning') return pref === 'morning';
    return pref === 'afternoon';
  };

  const briefingReminders = reminders.filter(item => {
    const pref = resolveReminderBriefingPref(item.includeInBriefing);
    if (pref === 'none') return false;
    if (!shouldIncludeReminder(pref)) return false;
    return isWithinWindow(resolveLoggedAt(item.loggedAt));
  });
  const briefingInputsFiltered = briefingInputs.filter(item => isWithinWindow(resolveLoggedAt(item.loggedAt)));
  const briefingDelegatedTasks = delegatedTasks.filter(task => !task.completed);

  const reminderIds = new Set(briefingReminders.map(item => item.id));
  const inputIds = new Set(briefingInputsFiltered.map(item => item.id));

  return {
    briefingReminders,
    briefingInputs: briefingInputsFiltered,
    briefingDelegatedTasks,
    remainingReminders: reminders.filter(item => !reminderIds.has(item.id)),
    remainingBriefingInputs: briefingInputs.filter(item => !inputIds.has(item.id)),
    remainingDelegatedTasks: delegatedTasks,
  };
};

const formatBriefingContext = (context: {
  briefingReminders: ReminderItem[];
  briefingInputs: BriefingInputItem[];
  briefingDelegatedTasks: DelegatedTaskItem[];
}): string => {
  const lines: string[] = [];

  const buildDelegatedBriefingLine = (task: DelegatedTaskItem): string => {
    const deadline = task.deadline ? ` (Due: ${task.deadline})` : '';
    const status = task.status ? ` [${task.status.replace('_', ' ')}]` : '';
    const remarks = task.remarks?.trim();
    if (remarks) {
      return `- ${task.assigneeName}, I instructed you to ${task.text}. Last update: ${remarks}. Where is the report now?${deadline}${status}`;
    }
    return `- ${task.assigneeName}: ${task.text}${deadline}${status}`;
  };

  if (context.briefingReminders.length > 0) {
    lines.push('REMINDERS:');
    context.briefingReminders.forEach(item => lines.push(`- ${item.text}`));
  }

  if (context.briefingDelegatedTasks.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('DELEGATED TASKS:');
    context.briefingDelegatedTasks.forEach(task => {
      lines.push(buildDelegatedBriefingLine(task));
    });
  }

  if (context.briefingInputs.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('BRIEFING INPUTS:');
    context.briefingInputs.forEach(item => lines.push(`- ${item.type}: ${item.text}`));
  }

  return lines.join('\n').trim();
};

const mergeBriefingNotes = (baseNotes: string, context: {
  briefingReminders: ReminderItem[];
  briefingInputs: BriefingInputItem[];
  briefingDelegatedTasks: DelegatedTaskItem[];
}): string => {
  const formattedContext = formatBriefingContext(context);
  if (!formattedContext) return baseNotes;
  if (!baseNotes.trim()) return formattedContext;
  return `${baseNotes.trim()}\n\n${formattedContext}`;
};

const normalizeReminders = (items: ReminderItem[]): ReminderItem[] =>
  items.map(item => ({
    ...item,
    loggedAt: resolveLoggedAt(item.loggedAt),
    includeInBriefing: resolveReminderBriefingPref(item.includeInBriefing),
  }));

const normalizeBriefingInputs = (items: BriefingInputItem[]): BriefingInputItem[] =>
  items.map(item => ({ ...item, loggedAt: resolveLoggedAt(item.loggedAt) }));

const normalizeDelegatedTasks = (items: DelegatedTaskItem[]): DelegatedTaskItem[] =>
  dedupeDelegatedTasks(
    items.map(item => ({
      ...item,
      loggedAt: resolveLoggedAt(item.loggedAt),
      status: resolveDelegatedStatus(item.status, item.completed),
      remarks: item.remarks ?? '',
    }))
  );

const normalizeChatHistory = (history: ChatHistoryItem[]): ChatHistoryItem[] =>
  history.map(item => (item && (item as ChatHistoryItem)._ts ? item : { ...item, _ts: Date.now() }));

const pruneChatState = (messages: ChatMessage[], history: ChatHistoryItem[]) => {
  const now = new Date();
  const cutoffDate = new Date(
    now.getFullYear() - CHAT_HISTORY_RETENTION_YEARS,
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );
  const cutoff = cutoffDate.getTime();
  
  // Filter by date only (keep 2 years history)
  const prunedMessages = messages
    .filter(msg => typeof msg.id === 'number' ? msg.id >= cutoff : true);
    
  const prunedHistory = history
    .filter(item => (item._ts ?? Date.now()) >= cutoff);

  return { prunedMessages, prunedHistory };
};


const filterErrorMessages = (messages: ChatMessage[], history: ChatHistoryItem[]): { filteredMessages: ChatMessage[], filteredHistory: ChatHistoryItem[] } => {
  const filteredMessages = messages.filter(msg => 
    !(msg.role === 'model' && knownErrorMessages.includes(msg.text))
  );

  const filteredHistory = history.filter(content => {
    if (!content || !content.role || !Array.isArray(content.parts) || content.parts.length === 0) {
        return true; 
    }
    if (content.role === 'model') {
      const text = content.parts[0]?.text;
      if (text && knownErrorMessages.includes(text)) {
        return false;
      }
    }
    return true;
  });

  return { filteredMessages, filteredHistory };
};

const isTasksApiDisabled = (error: any): boolean => {
  const reason = (error as any)?.reason;
  const message = (error as any)?.message || '';
  return (error as any)?.status === 403 && (reason === 'accessNotConfigured' || message.includes('has not been used'));
};

const isGoogleAuthError = (error: any): boolean => {
  if ((error as any)?.status === 401) return true;
  if ((error as any)?.status !== 403) return false;
  return !isTasksApiDisabled(error);
};

// Type for the AI response for weekly log updates
type WeeklyLogUpdatePayload = {
    type: 'accomplishment' | 'challenge';
    text: string;
};

// All props passed to MainDashboardPage are needed here
interface DashboardProviderProps {
  children: ReactNode;
  onLogout: () => void;
  userProfile: UserProfile;
  onProfileUpdate: (updatedProfile: UserProfile) => Promise<void>;
  onNavigateToPrivacy: () => void;
  onNavigateToTerms: () => void;
  activeDashboard: DashboardView;
  setActiveDashboard: (view: DashboardView) => void;
  appVersion: string;
  onGoogleAuthError: () => void;
  shouldShowPatchNotes: boolean;
  onPatchNotesViewed: () => void;
  session: Session | null;
  onAllPrioritiesCompleted?: () => void;
  onAllScheduleCompleted?: () => void;
}

export type ContextMenuState = { visible: boolean; x: number; y: number; text: string; flipped?: boolean; };

// Combine state, setters, and props into one context type
export interface DashboardContextType extends Omit<DashboardProviderProps, 'children'> {
    // All state values
    currentView: 'dashboard' | 'settings';
    isMobileMenuOpen: boolean;
    mobileView: 'chat' | 'today' | 'work';
    chatInput: string;
    isSending: boolean;
    currentTime: Date;
    showResetConfirm: boolean;
    showKeepResetConfirm: boolean;
    isSyncing: boolean;
    quickActionModal: { isOpen: boolean; title: string; prefill?: string; };
    isPatchNotesVisible: boolean;
    isFeedbackVisible: boolean;
    isCommandPaletteOpen: boolean;
    attachedFile: File | null;
    isRecording: boolean;
    initialSettingsTab: 'profile' | 'security' | 'team';
    isCloudLoading: boolean;
    cloudError: string | null;
    suppressCalendarFetch: boolean;
    chatMessages: ChatMessage[];
    chatHistory: ChatHistoryItem[];
    scheduleItems: ScheduleItem[];
    displayedScheduleItems: ScheduleItem[];
    top3Items: Top3Item[];
    reminders: ReminderItem[];
    projects: Project[];
    completedProjects: Project[];
    draftedProject: Project | null;
    draftedProjectTasks: DelegatedTaskItem[];
    draftedSchedule: ScheduleItem[] | null;
    draftedPriorities: Top3Item[] | null;
    keepNotes: string;
    delegatedTasks: DelegatedTaskItem[];
    isScheduleConfirmed: boolean;
    briefingInputs: BriefingInputItem[];
    briefingState: BriefingState;
    collapsedCards: Record<string, boolean>;
    openSidebarSections: Record<string, boolean>;
    dailyProgress: number;
    selectedProject: Project | null;
    isBriefingPointersVisible: boolean;
    showBriefingClearConfirm: boolean;
    contextMenu: ContextMenuState;
    weeklyLog: WeeklyLogItem[];
    priorityForTomorrow: string;
    weeklyReport: WeeklyReport | null;
    isWeeklyReportModalOpen: boolean;
    setIsWeeklyReportModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    emailVersion: string;
    isEmailVersionModalOpen: boolean;
    setIsEmailVersionModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    notificationModal: { isOpen: boolean; title: string; message: string; };
    briefingScript: string;
    isBriefingScriptVisible: boolean;
    showScheduleClearConfirm: boolean;
    showPrioritiesClearConfirm: boolean;
    showRemindersClearConfirm: boolean;
    projectToDelete: Project | null;
    isAddTaskModalOpen: boolean;
    showDelegatedClearConfirm: boolean;
    isSidebarCollapsed: boolean;
    showProjectsClearConfirm: boolean;
    currentMode: AssistantMode;
    currentMood: UserMood;
    recentContext: string[];
    modeHistory: ModeHistoryEntry[];
    modeActivatedAt: number | undefined;
    pendingDelegation: { personName: string; task: string; requestedAt: number } | null;
    pendingScheduleClarification: { reason: 'event_ops_conflict' | 'event_ops_missing_time'; question: string; createdAt: number; eventOpsItems: Array<Pick<EventOpsItem, 'id' | 'kind' | 'event_date' | 'name' | 'location' | 'serving_time'>> } | null;


    // All refs needed by UI (if any, usually not)
    desktopTextareaRef: React.RefObject<HTMLTextAreaElement>;
    mobileTextareaRef: React.RefObject<HTMLTextAreaElement>;
    desktopFileInputRef: React.RefObject<HTMLInputElement>;
    mobileFileInputRef: React.RefObject<HTMLInputElement>;
    
    // All setters and handlers
    setCurrentView: React.Dispatch<React.SetStateAction<'dashboard' | 'settings'>>;
    setIsMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setMobileView: React.Dispatch<React.SetStateAction<'chat' | 'today' | 'work'>>;
    setChatInput: React.Dispatch<React.SetStateAction<string>>;
    setShowResetConfirm: React.Dispatch<React.SetStateAction<boolean>>;
    setShowKeepResetConfirm: React.Dispatch<React.SetStateAction<boolean>>;
    setQuickActionModal: React.Dispatch<React.SetStateAction<{ isOpen: boolean; title: string; prefill?: string; }>>;
    setIsPatchNotesVisible: React.Dispatch<React.SetStateAction<boolean>>;
    setIsFeedbackVisible: React.Dispatch<React.SetStateAction<boolean>>;
    setIsCommandPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setAttachedFile: React.Dispatch<React.SetStateAction<File | null>>;
    setInitialSettingsTab: React.Dispatch<React.SetStateAction<'profile' | 'security' | 'team'>>;
    setSuppressCalendarFetch: React.Dispatch<React.SetStateAction<boolean>>;
    setProjects: React.Dispatch<React.SetStateAction<Project[]>>; 
    setCompletedProjects: React.Dispatch<React.SetStateAction<Project[]>>;
    setReminders: React.Dispatch<React.SetStateAction<ReminderItem[]>>;
    setDelegatedTasks: React.Dispatch<React.SetStateAction<DelegatedTaskItem[]>>;
    setOpenSidebarSections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    setSelectedProject: React.Dispatch<React.SetStateAction<Project | null>>;
    setIsBriefingPointersVisible: React.Dispatch<React.SetStateAction<boolean>>;
    setShowBriefingClearConfirm: React.Dispatch<React.SetStateAction<boolean>>;
    setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
    setWeeklyLog: React.Dispatch<React.SetStateAction<WeeklyLogItem[]>>;
    setPriorityForTomorrow: React.Dispatch<React.SetStateAction<string>>;
    setNotificationModal: React.Dispatch<React.SetStateAction<{ isOpen: boolean; title: string; message: string; }>>;
    setBriefingScript: React.Dispatch<React.SetStateAction<string>>;
    setIsBriefingScriptVisible: React.Dispatch<React.SetStateAction<boolean>>;
    setShowScheduleClearConfirm: React.Dispatch<React.SetStateAction<boolean>>;
    setShowPrioritiesClearConfirm: React.Dispatch<React.SetStateAction<boolean>>;
    setShowRemindersClearConfirm: React.Dispatch<React.SetStateAction<boolean>>;
    setProjectToDelete: React.Dispatch<React.SetStateAction<Project | null>>;
    setIsAddTaskModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setShowDelegatedClearConfirm: React.Dispatch<React.SetStateAction<boolean>>;
    setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    setShowProjectsClearConfirm: React.Dispatch<React.SetStateAction<boolean>>;
    setWeeklyReport: React.Dispatch<React.SetStateAction<WeeklyReport | null>>;
    setPendingDelegation: React.Dispatch<React.SetStateAction<{ personName: string; task: string; requestedAt: number } | null>>;
    setPendingScheduleClarification: React.Dispatch<React.SetStateAction<{ reason: 'event_ops_conflict' | 'event_ops_missing_time'; question: string; createdAt: number; eventOpsItems: Array<Pick<EventOpsItem, 'id' | 'kind' | 'event_date' | 'name' | 'location' | 'serving_time'>> } | null>>;


    handleSendMessage: (e?: React.FormEvent, prompt?: string, imageUrl?: string) => Promise<void>;
    handleManualReset: () => void;
    handleDailyKickoff: () => Promise<void>;
    handleToggleCard: (cardId: string) => void;
    handleClosePatchNotes: () => void;
    handleClearErrors: () => void;
    handleToggleRecording: () => void;
    handleChatInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleChatKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleLinkedToggle: (itemId: string, isGCal: boolean, itemTitle: string, isCompleted: boolean) => void;
    handleSimpleToggle: <T extends { id: string; completed: boolean }>(id: string, items: T[], setItems: React.Dispatch<React.SetStateAction<T[]>>) => void;
    handleReminderBriefingPreferenceChange: (id: string, preference: ReminderBriefingPreference) => void;
    handleDelegatedTaskToggle: (taskId: string) => Promise<void>;
    handleDelegatedTaskStatusChange: (taskId: string, status: DelegatedTaskItem['status']) => Promise<void>;
    handleDelegatedTaskRemarksChange: (taskId: string, remarks: string) => void;
    handleDelegatedTaskDeadlineChange: (taskId: string, deadline: string) => void;
    handleConfirmPlan: () => Promise<void>;
    handleMakeChanges: () => void;
    handleConfirmProjectDraft: () => Promise<void>;
    handleMakeProjectChanges: () => void;
    handleProjectUpdate: (updatedProject: Project) => void;
    requestProjectDraft: (inputs: { description: string; deadline: string; milestones: string; delegatedTasks: string; owners: string[]; notes: string; }) => Promise<{ project: Project; tasks: DelegatedTaskItem[] } | null>;
    saveProjectDraft: (draft: { project: Project; tasks: DelegatedTaskItem[] }) => Promise<void>;
    handleFinalizeBriefing: () => void;
    openQuickActionModal: (title: string, prefill?: string) => void;
    handleModalConfirm: (value: string) => void;
    setKeepNotes: React.Dispatch<React.SetStateAction<string>>;
    setBriefingState: React.Dispatch<React.SetStateAction<BriefingState>>;
    handleStopGeneration: () => void;
    handleClearBriefingPointers: () => void;
    confirmClearBriefingPointers: () => void;
    handleCreateReminderFromText: (text: string) => void;
    handleAddBriefingFromText: (text: string) => void;
    handleCreateWeeklyReport: () => void;
    handleGenerateEmailReport: (report: WeeklyReport) => Promise<string | null>;
    handleClearSchedule: () => void;
    handleClearPriorities: () => void;
    handleClearReminders: () => void;
    handleClearKeepNotes: () => void;
    handleClearProjects: () => void;
    handleConfirmDeleteProject: () => void;
    setTop3Items: React.Dispatch<React.SetStateAction<Top3Item[]>>;
    onAllPrioritiesCompleted?: () => void;
    handleOpenAddTaskModal: () => void;
    handleActivateMode: (mode: 'crisis' | 'strategic' | 'red-day') => void;
    handleDeactivateMode: () => void;
    cancelPendingDelegation: () => void;
    cancelPendingScheduleClarification: () => void;
    handleAddDelegatedTask: (task: { text: string; assigneeId: string; deadlineDate: string; deadlineTime: string; }) => Promise<void>;
    handleClearDelegatedTasks: () => void;
    createScheduleItem: (item: { time: string; title: string }) => void;
    updateScheduleItem: (id: string, updates: Partial<Pick<ScheduleItem, 'time' | 'title' | 'completed'>>) => void;
    deleteScheduleItem: (id: string) => void;
    syncScheduleToGoogleCalendar: (scheduleOverride?: ScheduleItem[]) => Promise<void>;
    refreshGoogleCalendarEvents: () => Promise<void>;
    clearGoogleCalendarEvents: () => void;

    pendingSchedule: ScheduleItem[] | null;
    finalizeSchedule: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

// FIX: Export the useDashboard hook so it can be used in other components.
export const useDashboard = (): DashboardContextType => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};

const parseScheduleArray = (scheduleArray: string[]): ScheduleItem[] => {
    // Enhanced regex patterns to handle multiple formats:
    // 1. "08:00 AM - 09:00 AM: Title" (time range with colon separator after time)
    // 2. "08:00 AM - 09:00 AM - Title" (time range with hyphen separator)
    // 3. "All Day - Title"
    // 4. "08:00 AM - 09:00 AM Title" (time range with space separator)
    const timePatternWithColon = /^((?:\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)\s*(?:-|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)|all\s*day|All\s*Day))\s*:?\s*-\s*(.*)/i;
    const timePatternWithSpace = /^((?:\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)\s*(?:-|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)|all\s*day|All\s*Day))\s+(.*)/i;

    return scheduleArray
        .filter((line: string) => line.trim() !== '')
        .map((line: string, index: number) => {
            const trimmedLine = line.trim();
            let match = trimmedLine.match(timePatternWithColon);
            let time: string;
            let title: string;

            if (match) {
                // Found time pattern with colon or hyphen separator
                time = match[1].trim();
                title = match[2].trim();
            } else {
                // Try pattern with space separator
                match = trimmedLine.match(timePatternWithSpace);
                if (match) {
                    time = match[1].trim();
                    title = match[2].trim();
                } else {
                    // No time pattern found. Treat the entire line as the title of an "All Day" task.
                    time = 'All Day';
                    title = trimmedLine;
                }
            }

            // Standardize time format
            if (time.toLowerCase() === 'all day') {
                time = 'All Day';
            }

            // Ensure we don't create items with empty titles.
            // Use stable IDs based on time and title hash to prevent re-rendering glitches
            // Include index to ensure uniqueness even if time+title are identical
            if (title) {
                // Create a hash-like stable ID from time and title (first 30 chars)
                const timeHash = time.replace(/[:\s-]/g, '').toLowerCase();
                const titleHash = title.substring(0, 30).replace(/[^\w\s]/g, '').replace(/\s+/g, '-').toLowerCase();
                const stableId = `sched-${timeHash}-${titleHash}-${index}`;
                return { id: stableId, time, title, completed: false };
            }
            return null;
        })
        .filter((item: ScheduleItem | null): item is ScheduleItem => item !== null);
};

export const DashboardProvider: React.FC<DashboardProviderProps> = ({ children, ...props }) => {
    const { userProfile, onGoogleAuthError, onProfileUpdate, shouldShowPatchNotes, onPatchNotesViewed, session, onAllPrioritiesCompleted, onAllScheduleCompleted } = props;

    // All state and logic from MainDashboardPage goes here
    const [currentView, setCurrentView] = useState<'dashboard' | 'settings'>('dashboard');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [mobileView, setMobileView] = useState<'chat' | 'today' | 'work'>('chat');
    const [chatInput, setChatInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isSyncing, setIsSyncing] = useState(false);
    const [quickActionModal, setQuickActionModal] = useState<{ isOpen: boolean; title: string, prefill?: string }>({ isOpen: false, title: '' });
    const [isPatchNotesVisible, setIsPatchNotesVisible] = useState(false);
    const [isFeedbackVisible, setIsFeedbackVisible] = useState(false);
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
    const [aiCooldownUntil, setAiCooldownUntil] = useState<number | null>(null);
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [initialSettingsTab, setInitialSettingsTab] = useState<'profile' | 'security' | 'team'>('profile');
  
    // Cloud persistence state
    const [isCloudLoading, setIsCloudLoading] = useState(true);
    const [cloudError, setCloudError] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);
  
    // Dashboard state
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
    const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
    const [top3Items, setTop3Items] = useState<Top3Item[]>([]);
    const [reminders, setReminders] = useState<ReminderItem[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [completedProjects, setCompletedProjects] = useState<Project[]>([]);
    const [draftedProject, setDraftedProject] = useState<Project | null>(null);
    const [draftedProjectTasks, setDraftedProjectTasks] = useState<DelegatedTaskItem[]>([]);
    const [keepNotes, setKeepNotes] = useState<string>('');
    const [delegatedTasks, setDelegatedTasks] = useState<DelegatedTaskItem[]>([]);
    const [hasGreeted, setHasGreeted] = useState<boolean>(false);
    const [lastResetDate, setLastResetDate] = useState<string>('');
    const [isScheduleConfirmed, setIsScheduleConfirmed] = useState<boolean>(false);
    const [briefingInputs, setBriefingInputs] = useState<BriefingInputItem[]>([]);
    const [briefingState, setBriefingState] = useState<BriefingState>('idle');
    const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [weeklyLog, setWeeklyLog] = useState<WeeklyLogItem[]>([]);
    const [priorityForTomorrow, setPriorityForTomorrow] = useState('');
    const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
    const [isWeeklyReportModalOpen, setIsWeeklyReportModalOpen] = useState(false);
    const [emailVersion, setEmailVersion] = useState<string>('');
    const [isEmailVersionModalOpen, setIsEmailVersionModalOpen] = useState(false);
    const messageIdRef = useRef(0);
    
    // Mode State
    const [currentMode, setCurrentMode] = useState<AssistantMode>(null);
    const [currentMood, setCurrentMood] = useState<UserMood>('neutral');
    const [recentContext, setRecentContext] = useState<string[]>([]);
    const [lastInteraction, setLastInteraction] = useState<number>(Date.now());
    const [modeHistory, setModeHistory] = useState<ModeHistoryEntry[]>([]);
    const [modeActivatedAt, setModeActivatedAt] = useState<number | undefined>(undefined);
    
    // Proactive AI State
    const [notifiedEventIds, setNotifiedEventIds] = useState<Set<string>>(new Set());
    const [nudgedTaskIds, setNudgedTaskIds] = useState<Set<string>>(new Set());
    const [nudgedDelegatedTaskIds, setNudgedDelegatedTaskIds] = useState<Set<string>>(new Set());
    const [eventOpsItems, setEventOpsItems] = useState<EventOpsItem[]>([]);
    const [lastEventOpsNudgeDate, setLastEventOpsNudgeDate] = useState<string>('');
    const [pendingDelegation, setPendingDelegation] = useState<{ personName: string; task: string; requestedAt: number } | null>(null);
    const [pendingScheduleClarification, setPendingScheduleClarification] = useState<{
      reason: 'event_ops_conflict' | 'event_ops_missing_time';
      question: string;
      createdAt: number;
      eventOpsItems: Array<Pick<EventOpsItem, 'id' | 'kind' | 'event_date' | 'name' | 'location' | 'serving_time'>>;
    } | null>(null);
    const eventOpsFetchCacheRef = useRef<{ at: number; items: EventOpsItem[]; error: string | null }>({
      at: 0,
      items: [],
      error: null,
    });
    
    const [openSidebarSections, setOpenSidebarSections] = useState<Record<string, boolean>>({});
    const [isBriefingPointersVisible, setIsBriefingPointersVisible] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, text: '', flipped: false });
  
    // New State for Confirmations & Notifications
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [showKeepResetConfirm, setShowKeepResetConfirm] = useState(false);
    const [showScheduleClearConfirm, setShowScheduleClearConfirm] = useState(false);
    const [showPrioritiesClearConfirm, setShowPrioritiesClearConfirm] = useState(false);
    const [showRemindersClearConfirm, setShowRemindersClearConfirm] = useState(false);
    const [showBriefingClearConfirm, setShowBriefingClearConfirm] = useState(false);
    const [showProjectsClearConfirm, setShowProjectsClearConfirm] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
    const [notificationModal, setNotificationModal] = useState({ isOpen: false, title: '', message: '' });
    const [briefingScript, setBriefingScript] = useState('');
    const [isBriefingScriptVisible, setIsBriefingScriptVisible] = useState(false);
    const briefingFinalizeTimeoutRef = useRef<number | null>(null);
    const briefingFinalizeRequestRef = useRef<symbol | null>(null);
    const [pendingBriefingWindow, setPendingBriefingWindow] = useState<BriefingWindow | null>(null);
    const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
    const [showDelegatedClearConfirm, setShowDelegatedClearConfirm] = useState(false);

    // New State for holding drafted schedule and priorities
    const [draftedSchedule, setDraftedSchedule] = useState<ScheduleItem[] | null>(null);
    const [draftedPriorities, setDraftedPriorities] = useState<Top3Item[] | null>(null);
    const [_lastPlanDraftText, setLastPlanDraftText] = useState<string>('');
    const buildTopPriorities = useCallback((lines: string[]) => {
        const cleaned = lines
            .map((line) => line.replace(/^\d+\.\s*/, '').trim())
            .filter((line) => line !== '');

        const isImportant = (text: string) => /^(important|urgent|critical)\b[:\-]*/i.test(text);
        const normalizeLabel = (text: string) => {
            const colonSplit = text.split(':');
            const label = colonSplit.length > 1 ? colonSplit[0] : text;
            return label.replace(/\s+/g, ' ').trim();
        };

        const result: Top3Item[] = [];
        cleaned.forEach((text, index) => {
            const shouldInclude = result.length < 3 || isImportant(text);
            if (shouldInclude) {
                result.push({
                    id: `pri-${Date.now()}-${index}`,
                    text: normalizeLabel(text),
                    completed: false,
                });
            }
        });

        return result;
    }, []);

    const extractDraftScheduleFromText = useCallback((text: string) => {
        const normalizedText = text.replace(/<br\s*\/?>/gi, '\n');
        const normalizeLine = (line: string) => {
            let normalized = line
                .replace(/\*\*/g, '') // remove bold
                .replace(/\*/g, '') // remove italics
                .replace(/<[^>]+>/g, '') // remove any HTML tags
                .replace(/[–—]/g, '-') // normalize dash variants
                .trim();

            normalized = normalized.replace(/^[-•*]\s+/, ''); // strip bullet
            normalized = normalized.replace(/^\d+\.\s*/, ''); // strip numbering
            return normalized.trim();
        };

        const lines = normalizedText.split('\n').map(normalizeLine).filter(Boolean);
        const timeRegex = /^(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(.+)$/i;
        const scheduleLines = lines.filter(line => timeRegex.test(line));

        return scheduleLines.length > 0 ? parseScheduleArray(scheduleLines) : [];
    }, [parseScheduleArray]);

    const extractPrioritiesFromText = useCallback((text: string) => {
        const normalizedText = text.replace(/<br\s*\/?>/gi, '\n');
        const normalizeLine = (line: string) => {
            let normalized = line
                .replace(/\*\*/g, '')
                .replace(/\*/g, '')
                .replace(/<[^>]+>/g, '')
                .replace(/[–—]/g, '-')
                .trim();

            normalized = normalized.replace(/^[-•*]\s+/, '');
            return normalized.trim();
        };

        const rawLines = normalizedText.split('\n').map(line => line.trim()).filter(Boolean);
        const numbered = rawLines
            .map(normalizeLine)
            .filter(line => /^\d+\.\s+/.test(line));

        if (numbered.length > 0) {
            return numbered.map(line => line.replace(/^\d+\.\s+/, '').trim()).filter(Boolean);
        }

        const lines = rawLines.map(normalizeLine).filter(Boolean);
        const bulletLines = lines.filter(line => !/^top priorities/i.test(line) && !/^today'?s schedule/i.test(line));
        return bulletLines;
    }, []);

    const [googleCalendarEvents, setGoogleCalendarEvents] = useState<any[]>([]);
    const [suppressCalendarFetch, setSuppressCalendarFetch] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

    const [completedGCalEventIds, setCompletedGCalEventIds] = useState<Set<string>>(new Set());


    const desktopTextareaRef = useRef<HTMLTextAreaElement>(null);
    const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);
    const saveTimeoutRef = useRef<number | null>(null);
    const forceSaveRef = useRef<boolean>(false);
    const desktopFileInputRef = useRef<HTMLInputElement>(null);
    const mobileFileInputRef = useRef<HTMLInputElement>(null);
    const generationRequestRef = useRef<symbol | null>(null);
    const taskListIdRef = useRef<string | null>(null);
    const lastWellnessCheckRef = useRef<number>(0); // Timestamp of last wellness check
    
    // Proactive Wellness Check
    useEffect(() => {
        if (!scheduleItems || scheduleItems.length === 0) return;

        const checkWellness = () => {
            const now = Date.now();
            // Only check once every hour to avoid spam
            if (now - lastWellnessCheckRef.current < 3600000) return;

            // Simple check: Count contiguous busy hours
            // This is a simplified heuristic. In a real implementation, we'd parse times more robustly.
            // For now, if we have > 3 items that look like they are back-to-back (or just > 4 items total in a day), trigger a check.
            const busyItems = scheduleItems.filter(item => !item.completed && item.title.toLowerCase() !== 'lunch' && item.title.toLowerCase() !== 'break');
            
            if (busyItems.length >= 4) {
                 // Trigger Wellness Interjection
                 setChatMessages(prev => [...prev, {
                     id: Date.now(),
                     role: 'model',
                     text: "⚠️ **Wellness Check:** I noticed your schedule is quite packed today with multiple back-to-back items. \n\nI strongly recommend marking a 30-minute block as **'Protected Time'** or **'Lunch'** to recharge. Would you like me to find a slot for you?"
                 }]);
                 lastWellnessCheckRef.current = now;
            }
        };

        const timer = setTimeout(checkWellness, 5000); // Check 5s after schedule update
        return () => clearTimeout(timer);
    }, [scheduleItems]);

    // Global key listener for Command Palette (F2)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                setIsCommandPaletteOpen(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    useEffect(() => {
      // Only auto-open when shouldShowPatchNotes becomes true
      // Do NOT auto-close when shouldShowPatchNotes is false - allow manual opens to persist
      if (shouldShowPatchNotes) {
        setIsPatchNotesVisible(true);
      }
      // Removed the else clause that was auto-closing the modal
      // This allows users to manually open the modal even when shouldShowPatchNotes is false
    }, [shouldShowPatchNotes]);

    // Effect to find or create the Google Tasks list on load to ensure sync works reliably.
    useEffect(() => {
        if (session?.provider_token) {
            const token = session.provider_token;
            findOrCreateTaskList(token, `${userProfile.assistantName} Delegated Tasks`)
                .then(listId => {
                    taskListIdRef.current = listId;
                    console.log('Delegated tasks list ID initialized:', listId);
                })
                .catch(error => {
                    // Handle network errors (e.g. offline, ad-blockers) gracefully
                    if (error instanceof TypeError && error.message === 'Failed to fetch') {
                        console.warn("Google Tasks initialization failed: Network error or blocked request.");
                        // Optional: notify user, or just silently fail and let them retry later
                        return;
                    }

                    console.error("Failed to initialize Google Tasks list on load:", error);
                    if (isTasksApiDisabled(error)) {
                        setNotificationModal({
                            isOpen: true,
                            title: 'Google Tasks Disabled',
                            message: 'Google Tasks API is not enabled for this project. Task sync is paused until it is enabled in Google Cloud.',
                        });
                        return;
                    }
                    if (isGoogleAuthError(error)) {
                        onGoogleAuthError();
                    }
                });
        }
    }, [session, userProfile.assistantName, onGoogleAuthError]);
  
    useEffect(() => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.warn("Speech Recognition API is not supported in this browser.");
        return;
      }
  
      const recognition = new SpeechRecognition();
      recognition.continuous = false; recognition.interimResults = true; recognition.lang = 'en-US';
  
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results).map((result: any) => result[0]).map((result: any) => result.transcript).join('');
        setChatInput(transcript);
        const textarea = desktopTextareaRef.current || mobileTextareaRef.current;
        if (textarea) {
          textarea.style.height = 'auto';
          textarea.style.height = `${textarea.scrollHeight}px`;
        }
      };
      recognition.onend = () => setIsRecording(false);
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        if (event.error === 'not-allowed') {
          setCloudError("Microphone access was denied. Please allow microphone access in your browser settings to use voice input.");
        }
        setIsRecording(false);
      };
      recognitionRef.current = recognition;
      return () => recognitionRef.current?.abort();
    }, []);
  
    const handleToggleRecording = useCallback(() => {
      if (!recognitionRef.current) return;
      if (isRecording) {
        recognitionRef.current.stop();
      } else {
        setChatInput('');
        recognitionRef.current.start();
        setIsRecording(true);
      }
    }, [isRecording]);
  
    const handleClosePatchNotes = useCallback(() => {
      // Close immediately (synchronous) first
      setIsPatchNotesVisible(false);
      // Then call async handler (non-blocking)
      try {
        onPatchNotesViewed();
      } catch (error) {
        console.error('Error in onPatchNotesViewed:', error);
      }
    }, [onPatchNotesViewed]);
  
    const handleClearErrors = useCallback(() => {
        const { filteredMessages, filteredHistory } = filterErrorMessages(chatMessages, chatHistory);
        setChatHistory(filteredHistory);
        setChatMessages(filteredMessages);
        setNotificationModal({
            isOpen: true,
            title: "Cache Cleared",
            message: "Cached AI error messages have been successfully cleared from your conversation history."
        });
    }, [chatMessages, chatHistory]);
  
    const loadState = useCallback(async () => {
      setIsCloudLoading(true);
      setCloudError(null);
      try {
        const state = await getDashboardState(userProfile.id);
        if (state) {
          if (state.stateVersion !== DASHBOARD_STATE_VERSION) {
            console.warn(`Old state version detected. Migrating from ${state.stateVersion || 'undefined'} to ${DASHBOARD_STATE_VERSION}. Chat history will be cleared.`);
            setScheduleItems(Array.isArray(state.scheduleItems) ? state.scheduleItems : []);
            setTop3Items(Array.isArray(state.top3Items) ? state.top3Items : []);
            setReminders(normalizeReminders(Array.isArray(state.reminders) ? state.reminders : []));
            setProjects(Array.isArray(state.projects) ? state.projects : []);
            setCompletedProjects(Array.isArray(state.completedProjects) ? state.completedProjects : []);
            setKeepNotes(state.keepNotes || '');
            const rawDelegated = Array.isArray(state.delegatedTasks) ? state.delegatedTasks : [];
            const normalizedDelegated = normalizeDelegatedTasks(rawDelegated);
            setDelegatedTasks(normalizedDelegated);
            if (normalizedDelegated.length !== rawDelegated.length) {
              console.log('Deduplicated delegated tasks during migration.');
            }
            setLastResetDate(state.lastResetDate || '');
            setIsScheduleConfirmed(state.isScheduleConfirmed || false);
            setBriefingInputs(normalizeBriefingInputs(Array.isArray(state.briefingInputs) ? state.briefingInputs : []));
            setBriefingState(state.briefingState || 'idle');
            setCollapsedCards(state.collapsedCards || {});
            setWeeklyLog(Array.isArray(state.weeklyLog) ? state.weeklyLog : []);
            setPriorityForTomorrow(state.priorityForTomorrow || '');
            setCompletedGCalEventIds(new Set());
            setCurrentMode(state.currentMode || null);
            setCurrentMood(state.currentMood || 'neutral');
            setRecentContext(state.recentContext || []);
            setLastInteraction(state.lastInteraction || Date.now());
            setModeHistory(Array.isArray(state.modeHistory) ? state.modeHistory : []);
            setModeActivatedAt(state.modeActivatedAt);
            setChatMessages([]); setChatHistory([]); setHasGreeted(false);
            setPendingDelegation(null);
            setPendingScheduleClarification(null);
          } else {
            const rawHistory = Array.isArray(state.chatHistory) ? state.chatHistory : [];
            const normalizedHistory = normalizeChatHistory(rawHistory as ChatHistoryItem[]);
            const { filteredMessages, filteredHistory } = filterErrorMessages(
              Array.isArray(state.chatMessages) ? state.chatMessages : [],
              normalizedHistory
            );
            const { prunedMessages, prunedHistory } = pruneChatState(filteredMessages, filteredHistory);
            if (filteredMessages.length < (state.chatMessages?.length || 0)) console.log("Found and cleared cached AI error messages on load.");
            setChatMessages(prunedMessages);
            setChatHistory(prunedHistory);
            setScheduleItems(Array.isArray(state.scheduleItems) ? state.scheduleItems : []);
            setTop3Items(Array.isArray(state.top3Items) ? state.top3Items : []);
            setReminders(normalizeReminders(Array.isArray(state.reminders) ? state.reminders : []));
            setProjects(Array.isArray(state.projects) ? state.projects : []);
            setCompletedProjects(Array.isArray(state.completedProjects) ? state.completedProjects : []);
            setKeepNotes(state.keepNotes || '');
            const rawDelegated = Array.isArray(state.delegatedTasks) ? state.delegatedTasks : [];
            const normalizedDelegated = normalizeDelegatedTasks(rawDelegated);
            setDelegatedTasks(normalizedDelegated);
            if (normalizedDelegated.length !== rawDelegated.length) {
              console.log('Deduplicated delegated tasks on load.');
            }
            setHasGreeted(state.hasGreeted || false);
            setLastResetDate(state.lastResetDate || '');
            setIsScheduleConfirmed(state.isScheduleConfirmed || false);
            setBriefingInputs(normalizeBriefingInputs(Array.isArray(state.briefingInputs) ? state.briefingInputs : []));
            setBriefingState(state.briefingState || 'idle');
            setCollapsedCards(state.collapsedCards || {});
            setWeeklyLog(Array.isArray(state.weeklyLog) ? state.weeklyLog : []);
            setPriorityForTomorrow(state.priorityForTomorrow || '');
            setCompletedGCalEventIds(new Set(Array.isArray(state.completedGCalEventIds) ? state.completedGCalEventIds : []));
            setCurrentMode(state.currentMode || null);
            setCurrentMood(state.currentMood || 'neutral');
            setRecentContext(state.recentContext || []);
            setModeHistory(Array.isArray(state.modeHistory) ? state.modeHistory : []);
            setModeActivatedAt(state.modeActivatedAt);
            setNudgedTaskIds(new Set(Array.isArray(state.nudgedTaskIds) ? state.nudgedTaskIds : []));
            setNotifiedEventIds(new Set(Array.isArray(state.notifiedEventIds) ? state.notifiedEventIds : []));
            setNudgedDelegatedTaskIds(new Set(Array.isArray(state.nudgedDelegatedTaskIds) ? state.nudgedDelegatedTaskIds : []));
            setSuppressCalendarFetch(state.suppressCalendarFetch || false);
            setLastEventOpsNudgeDate(typeof state.lastEventOpsNudgeDate === 'string' ? state.lastEventOpsNudgeDate : '');
            setPendingDelegation(
              state.pendingDelegation &&
                typeof state.pendingDelegation.personName === 'string' &&
                typeof state.pendingDelegation.task === 'string'
                ? {
                    personName: state.pendingDelegation.personName,
                    task: state.pendingDelegation.task,
                    requestedAt: typeof state.pendingDelegation.requestedAt === 'number' ? state.pendingDelegation.requestedAt : Date.now(),
                  }
                : null
            );
            const psc = state.pendingScheduleClarification as any;
            setPendingScheduleClarification(
              psc &&
                (psc.reason === 'event_ops_conflict' || psc.reason === 'event_ops_missing_time') &&
                typeof psc.question === 'string' &&
                typeof psc.createdAt === 'number' &&
                Array.isArray(psc.eventOpsItems)
                ? {
                    reason: psc.reason,
                    question: psc.question,
                    createdAt: psc.createdAt,
                    eventOpsItems: psc.eventOpsItems,
                  }
                : null
            );
          }
        }
      } catch (error) {
        console.error("Failed to load state from Supabase:", error);
        setCloudError("Failed to load dashboard data. Please try refreshing.");
      } finally {
        setIsCloudLoading(false);
      }
    }, [userProfile.id]);
  
    useEffect(() => { loadState(); }, [loadState]); 

    // Auto-resize textarea when chatInput changes (including when cleared programmatically)
    useEffect(() => {
        const textarea = desktopTextareaRef.current || mobileTextareaRef.current;
        if (textarea) {
            // Reset to auto first to allow proper shrinking
            textarea.style.height = 'auto';
            
            // Use requestAnimationFrame to ensure DOM updates before measuring
            requestAnimationFrame(() => {
                if (textarea) {
                    textarea.style.height = `${textarea.scrollHeight}px`;
                }
            });
        }
    }, [chatInput]);

    useEffect(() => {
      if (isCloudLoading) return;
      const applyDailyReset = () => {
        const today = new Date().toISOString().split('T')[0];
        if (lastResetDate === today) return;
        setScheduleItems([]);
        setTop3Items([]);
        setDraftedSchedule(null); // Clear drafted schedule on daily reset
        setDraftedPriorities(null); // Clear drafted priorities on daily reset
        setKeepNotes('');
        setBriefingInputs([]);
        setBriefingState('idle');
        setReminders(prev => prev.filter(item => !item.completed));
        setLastResetDate(today);
      };

      applyDailyReset();
      const timer = window.setInterval(applyDailyReset, 60 * 1000);
      return () => window.clearInterval(timer);
    }, [isCloudLoading, lastResetDate]);
    
    const resetDailyState = useCallback(() => {
      setScheduleItems([]); 
      setTop3Items([]); 
      setDraftedSchedule(null); // Clear drafted schedule on daily reset
      setDraftedPriorities(null); // Clear drafted priorities on daily reset
      setPendingDelegation(null);
      setPendingScheduleClarification(null);
      setBriefingInputs([]); 
      setBriefingState('idle'); 
      setIsScheduleConfirmed(false);
      setPriorityForTomorrow('');
      const today = new Date().toISOString().split('T')[0];
      setLastResetDate(today);
      setNotifiedEventIds(new Set()); 
      setNudgedTaskIds(new Set()); 
      setNudgedDelegatedTaskIds(new Set());
      setCompletedGCalEventIds(new Set());
    }, []);
    
    useEffect(() => {
      if (!isCloudLoading) {
        const today = new Date().toISOString().split('T')[0];
        if (lastResetDate !== today) {
          console.log("New day detected. Resetting daily dashboard state.");
          resetDailyState();
        }
      }
    }, [isCloudLoading, lastResetDate, resetDailyState]);
  
    useEffect(() => {
      if (isCloudLoading || cloudError) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      // Use shorter delay if force save is requested (e.g., after finalization)
      const saveDelay = forceSaveRef.current ? 100 : 1500;
      forceSaveRef.current = false; // Reset flag after use
      
      saveTimeoutRef.current = window.setTimeout(() => {
          const currentState: DashboardState = {
              chatMessages, chatHistory, scheduleItems, top3Items, reminders, projects, completedProjects, keepNotes, delegatedTasks,
              team: userProfile.team, hasGreeted, lastResetDate, isScheduleConfirmed, briefingInputs, briefingState,
              collapsedCards, weeklyLog, priorityForTomorrow, stateVersion: DASHBOARD_STATE_VERSION,
              completedGCalEventIds: Array.from(completedGCalEventIds),
              currentMode, currentMood, recentContext, lastInteraction, modeHistory, modeActivatedAt,
              nudgedTaskIds: Array.from(nudgedTaskIds),
              notifiedEventIds: Array.from(notifiedEventIds),
              nudgedDelegatedTaskIds: Array.from(nudgedDelegatedTaskIds),
              suppressCalendarFetch,
              lastEventOpsNudgeDate,
              pendingDelegation: pendingDelegation ?? undefined,
              pendingScheduleClarification: pendingScheduleClarification ?? undefined
          };
          saveDashboardState(userProfile.id, currentState).catch((err: any) => console.error("Failed to save state to Supabase:", err));
      }, saveDelay);
      return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
    }, [chatMessages, chatHistory, scheduleItems, top3Items, reminders, projects, completedProjects, keepNotes, delegatedTasks, userProfile.team, hasGreeted, lastResetDate, isScheduleConfirmed, briefingInputs, briefingState, collapsedCards, weeklyLog, priorityForTomorrow, userProfile.id, isCloudLoading, cloudError, completedGCalEventIds, currentMode, modeHistory, modeActivatedAt, suppressCalendarFetch, lastEventOpsNudgeDate, pendingDelegation, pendingScheduleClarification]);

    const toYmdLocal = useCallback((date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }, []);

    const fetchEventOpsItemsForAI = useCallback(async (daysAhead = 7, force = false): Promise<EventOpsItem[]> => {
      const nowMs = Date.now();
      const cached = eventOpsFetchCacheRef.current;
      const ttlMs = 30_000;
      if (!force && cached.at > 0 && nowMs - cached.at < ttlMs) return cached.items;
      if (!isSupabaseConfigured || isCloudLoading || cloudError || !userProfile.id) return cached.items;

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + daysAhead);
      const start = toYmdLocal(startDate);
      const end = toYmdLocal(endDate);

      try {
        const { data, error } = await supabase
          .from('event_ops_items')
          .select('*')
          .eq('user_id', userProfile.id)
          .gte('event_date', start)
          .lte('event_date', end)
          .order('event_date', { ascending: true })
          .order('created_at', { ascending: true });

        if (error) {
          eventOpsFetchCacheRef.current = { at: nowMs, items: [], error: error.message };
          console.warn('[EventOpsSync] Failed to fetch event_ops_items:', error.message);
          return [];
        }

        const items = (data as EventOpsItem[]) || [];
        eventOpsFetchCacheRef.current = { at: nowMs, items, error: null };
        return items;
      } catch (err) {
        eventOpsFetchCacheRef.current = { at: nowMs, items: [], error: 'fetch_failed' };
        console.warn('[EventOpsSync] Failed to fetch event_ops_items:', err);
        return [];
      }
    }, [isCloudLoading, cloudError, userProfile.id, toYmdLocal]);

    useEffect(() => {
      if (!isSupabaseConfigured) return;
      if (isCloudLoading || cloudError) return;
      const userId = userProfile.id;
      if (!userId) return;
      const fetchUpcoming = async () => {
        const items = await fetchEventOpsItemsForAI(7, true);
        setEventOpsItems(items);
      };

      fetchUpcoming();
      const interval = window.setInterval(fetchUpcoming, 10 * 60 * 1000);
      return () => window.clearInterval(interval);
    }, [isCloudLoading, cloudError, userProfile.id, fetchEventOpsItemsForAI]);
    
    useEffect(() => {
        const fetchGoogleCalendarEvents = async () => {
            if (session?.provider_token && googleCalendarEvents.length === 0) {
                try {
                    console.log("Fetching today's Google Calendar events...");
                    const events = await getTodaysEvents(session.provider_token);
                    setGoogleCalendarEvents(events);
                    console.log("Fetched Google Calendar events for today:", events);
                } catch (error: any) {
                    console.error("Failed to fetch Google Calendar events:", error);
                    if (error.message.includes('401') || error.message.includes('403') || error.status === 401 || error.status === 403) {
                        onGoogleAuthError();
                    }
                }
            }
        };

        if (!isCloudLoading && !suppressCalendarFetch) {
            fetchGoogleCalendarEvents();
        }
    }, [session, onGoogleAuthError, isCloudLoading, googleCalendarEvents.length, suppressCalendarFetch]);
  
    useEffect(() => {
      if (!isCloudLoading && !cloudError && !hasGreeted) {
        // Check for Contextual Continuity
        const now = Date.now();
        const timeSinceLastInteraction = now - (lastInteraction || 0);
        const SESSION_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours
        const userNameToGreet = userProfile.nickname || userProfile.name;
        
        let greetingText = '';

        // Contextual Greeting Logic (P0: Contextual Continuity)
        if (timeSinceLastInteraction < SESSION_TIMEOUT && currentMood && currentMood !== 'neutral') {
             if (currentMood === 'stressed') {
                 greetingText = `Welcome back, ${userNameToGreet}. I hope you've had a chance to decompress since we last spoke. Ready to tackle what's left, or shall we prioritize?`;
             } else if (currentMood === 'excited') {
                 greetingText = `Welcome back! Let's keep that momentum going, ${userNameToGreet}. What's the next big win?`;
             } else if (currentMood === 'tired') {
                 greetingText = `Hey ${userNameToGreet}. I hope you got some rest. Let's keep things light today.`;
             }
        }

        // Standard Greeting Fallback
        if (!greetingText) {
            const hour = new Date().getHours();
            let timeGreeting = 'Good morning';
            if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon';
            else if (hour >= 17) timeGreeting = 'Good evening';
            greetingText = `${timeGreeting}, ${userNameToGreet}. As your Virtual Assistant, how can I help you structure your day?`;
        }
        
        const greetingId = Date.now() * 1000 + (messageIdRef.current++ % 1000);
        setChatMessages([{ id: greetingId, role: 'model', text: greetingText }]);
        setHasGreeted(true);
      }
    }, [hasGreeted, userProfile.name, userProfile.nickname, isCloudLoading, cloudError, currentMood, lastInteraction]);
    
    useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);
    
    useLayoutEffect(() => {
      // Scrolling is now handled in MainDashboardPage
    }, [chatMessages]);

    useEffect(() => {
      const { prunedMessages, prunedHistory } = pruneChatState(chatMessages, chatHistory);
      if (prunedMessages.length !== chatMessages.length) {
        setChatMessages(prunedMessages);
      }
      if (prunedHistory.length !== chatHistory.length) {
        setChatHistory(prunedHistory);
      }
    }, [chatMessages, chatHistory]);

    const buildProjectDraft = useCallback((draft: any) => {
        if (!draft?.name || !draft?.deadline || !Array.isArray(draft?.milestones)) return null;
        const baseTs = Date.now();
        const draftTasks: DelegatedTaskItem[] = [];
        const milestones = draft.milestones
            .map((milestone: any, index: number) => {
                const text = String(milestone?.text ?? '').trim();
                if (!text) return null;
                const milestoneId = `milestone-${baseTs}-${index}`;
                const assigneeName = typeof milestone?.assigneeName === 'string' ? milestone.assigneeName.trim() : undefined;
                const rawTasks = Array.isArray(milestone?.delegatedTasks)
                    ? milestone.delegatedTasks
                    : Array.isArray(milestone?.tasks)
                        ? milestone.tasks
                        : [];
                const linkedTaskIds: string[] = [];
                rawTasks.forEach((task: any, taskIndex: number) => {
                    const taskText = typeof task === 'string' ? task : task?.text;
                    if (!taskText) return;
                    const taskAssignee = (task?.assigneeName ?? assigneeName ?? '').toString().trim();
                    const matchedAssignee = userProfile.team.find(m => m.name.toLowerCase() === taskAssignee.toLowerCase());
                    const assigneeNameFinal = matchedAssignee?.name || taskAssignee || 'Unassigned';
                    const taskId = `delegated-${baseTs}-${index}-${taskIndex}`;
                    const deadline = (task?.deadline ?? '').toString().trim();
                    const newTask: DelegatedTaskItem = {
                        id: taskId,
                        assigneeId: matchedAssignee?.id ?? '',
                        assigneeName: assigneeNameFinal,
                        text: String(taskText).trim(),
                        deadline: deadline || 'TBD',
                        completed: false,
                        loggedAt: baseTs,
                        status: 'not_started',
                        remarks: '',
                    };
                    linkedTaskIds.push(taskId);
                    draftTasks.push(newTask);
                });
                return {
                    id: milestoneId,
                    text,
                    progress: 0,
                    assigneeName,
                    linkedTaskIds: linkedTaskIds.length ? linkedTaskIds : undefined,
                };
            })
            .filter(Boolean) as Milestone[];

        if (milestones.length === 0) return null;
        const project: Project = {
            id: `proj-${baseTs}`,
            name: String(draft.name).trim(),
            deadline: String(draft.deadline).trim(),
            milestones,
        };
        return { project, tasks: draftTasks };
    }, [userProfile.team]);

    const tryParseDeadlineISO = useCallback((value: string) => {
        if (!value) return undefined;
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return undefined;
        return parsed.toISOString();
    }, []);

    const syncDelegatedTasks = useCallback(async (tasksToSync: DelegatedTaskItem[]) => {
        if (!tasksToSync.length) return;
        const token = session?.provider_token;
        if (!token) {
            setNotificationModal({
                isOpen: true,
                title: 'Connection Issue',
                message: 'Project created locally, but Google Tasks sync is paused until your Google account is connected.',
            });
            return;
        }
        try {
            if (!taskListIdRef.current) {
                const listId = await findOrCreateTaskList(token, `${userProfile.assistantName} Delegated Tasks`);
                taskListIdRef.current = listId;
            }
            for (const task of tasksToSync) {
                const notes = `Assigned to: ${task.assigneeName}\nStatus: ${task.status === 'completed' ? 'Completed' : 'In Progress'}`;
                const deadlineISO = tryParseDeadlineISO(task.deadline);
                const googleTask = await createTask(token, taskListIdRef.current, task.text, notes, deadlineISO);
                setDelegatedTasks(prev => prev.map(existing =>
                    existing.id === task.id ? { ...existing, googleTaskId: googleTask.id } : existing
                ));
            }
        } catch (error: any) {
            console.error('Failed to sync project tasks to Google Tasks:', error);
            if (isTasksApiDisabled(error)) {
                setNotificationModal({
                    isOpen: true,
                    title: 'Google Tasks Disabled',
                    message: 'Project tasks were created locally, but Google Tasks API is disabled.',
                });
                return;
            }
            if (isGoogleAuthError(error)) {
                onGoogleAuthError();
                setNotificationModal({
                    isOpen: true,
                    title: 'Google Connection Expired',
                    message: 'Project tasks were created locally, but Google sync needs to be reconnected.',
                });
            }
        }
    }, [session, userProfile.assistantName, onGoogleAuthError, tryParseDeadlineISO]);

    const requestProjectDraft = useCallback(async (inputs: { description: string; deadline: string; milestones: string; delegatedTasks: string; owners: string[]; notes: string; }) => {
        const { description, deadline, milestones, delegatedTasks: taskBlock, owners, notes } = inputs;
        
        // Extract milestone deadlines from notes if they were provided
        const milestoneDeadlinesMatch = notes.match(/Milestone Deadlines:\n((?:Milestone \d+.*\n?)+)/);
        const milestoneDeadlinesMap: Record<number, string> = {};
        const milestoneNames: string[] = milestones.split('\n').filter(line => line.trim());
        
        if (milestoneDeadlinesMatch) {
            milestoneDeadlinesMatch[1].split('\n').forEach(line => {
                const match = line.match(/Milestone (\d+) \(.*?\): (.+)/);
                if (match) {
                    const milestoneNum = parseInt(match[1]);
                    const milestoneDeadline = match[2].trim();
                    if (milestoneDeadline && milestoneDeadline !== 'No deadline set') {
                        milestoneDeadlinesMap[milestoneNum] = milestoneDeadline;
                    }
                }
            });
        }
        
        const cleanNotes = notes.replace(/Milestone Deadlines:[\s\S]*/, '').trim();
        
        const prompt = [
            `Create a new project plan using the details below.`,
            `Project description: ${description}`,
            `Deadline: ${deadline || 'Not provided'}`,
            `Milestones (one per line): ${milestones || 'Not provided'}`,
            `Delegated tasks per milestone: ${taskBlock || 'Not provided'}`,
            `Owners / assignees: ${owners.length ? owners.join(', ') : 'Not provided'}`,
            cleanNotes ? `Additional notes: ${cleanNotes}` : '',
            Object.keys(milestoneDeadlinesMap).length > 0 ? `\nMILESTONE DEADLINES (MANDATORY - Use these exact deadlines for ALL delegated tasks under each milestone):\n${milestoneNames.map((name, idx) => {
                const milestoneNum = idx + 1;
                const milestoneDeadline = milestoneDeadlinesMap[milestoneNum];
                return milestoneDeadline ? `Milestone ${milestoneNum} ("${name.trim()}"): ${milestoneDeadline}` : null;
            }).filter(Boolean).join('\n')}` : '',
            `Return a JSON response with projectDraft and isProjectDraft: true, including milestones and delegatedTasks.`,
            `IMPORTANT: For delegatedTasks, the "text" field must describe the actual work/task to be done (e.g., "Arrange storeroom shelves on 2nd floor"), NOT just who it's assigned to (e.g., NOT "Assign to John"). The assigneeName field should contain the person's name if specified.`,
            Object.keys(milestoneDeadlinesMap).length > 0 
                ? `CRITICAL DEADLINE RULE: Each delegatedTask MUST use the EXACT deadline specified for its milestone above. For example, if Milestone 1 has deadline "2026-02-15", then ALL delegated tasks under Milestone 1 must have deadline="2026-02-15". Use the exact YYYY-MM-DD format provided. Do NOT generate, calculate, or modify deadlines - use the milestone deadline exactly as provided. If a milestone has no deadline specified, use "TBD" for its delegated tasks.`
                : `CRITICAL: Each delegatedTask MUST include a "deadline" field. Calculate reasonable deadlines based on the project deadline and milestone sequence. Use date format YYYY-MM-DD or a relative date like "end of week" or "within 2 weeks". Do NOT leave deadlines empty or use "TBD" unless absolutely necessary.`
        ].filter(Boolean).join('\n');

        const minimalState: DashboardState = {
            chatMessages: [],
            chatHistory: [],
            scheduleItems: [],
            top3Items: [],
            reminders: [],
            projects: [],
            completedProjects: [],
            keepNotes: '',
            delegatedTasks: [],
            team: userProfile.team,
            hasGreeted,
            lastResetDate,
            isScheduleConfirmed,
            briefingInputs: [],
            briefingState,
            collapsedCards: {},
            weeklyLog: [],
            priorityForTomorrow,
            stateVersion: DASHBOARD_STATE_VERSION,
            completedGCalEventIds: Array.from(completedGCalEventIds)
        };

        const historyForRequest: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
        const response = await sendMessageToGemini(historyForRequest, { ...userProfile, team: userProfile.team }, minimalState, [], new Date(), session?.provider_token || null, eventOpsItems);
        if (response?.isError) {
            throw new Error(response.text || 'Failed to generate project draft.');
        }
        const payload = response.projectDraft ?? response.project;
        if (!payload) {
            throw new Error('The assistant did not return a project draft. Please try again.');
        }
        const draftResult = buildProjectDraft(payload);
        if (!draftResult) {
            throw new Error('Unable to build a project draft from the response.');
        }
        return draftResult;
    }, [userProfile, hasGreeted, lastResetDate, isScheduleConfirmed, briefingState, priorityForTomorrow, completedGCalEventIds, session, buildProjectDraft]);

    const saveProjectDraft = useCallback(async (draft: { project: Project; tasks: DelegatedTaskItem[] }) => {
        const nextTasks = dedupeDelegatedTasks([...delegatedTasks, ...draft.tasks]);
        setDelegatedTasks(nextTasks);
        setProjects(prev => updateProjectsFromTasks([...prev, draft.project], nextTasks));
        await syncDelegatedTasks(draft.tasks);
        setDraftedProject(null);
        setDraftedProjectTasks([]);
    }, [delegatedTasks, syncDelegatedTasks]);

    const parseDeadlineFromText = useCallback((input: string) => parseDeadlineFromTextUtil(input, new Date()), []);

    const finalizeDelegation = useCallback(async (payload: { personName: string; task: string }, deadlineText: string) => {
      const parsed = parseDeadlineFromText(deadlineText);
      if (!parsed) {
        return { ok: false, message: 'What deadline should I use? Try “tomorrow”, “2026-02-15”, or “2026-02-15 15:00”.' };
      }

      const assignee = userProfile.team.find(m => m.name.toLowerCase() === payload.personName.toLowerCase());
      if (!assignee) {
        return { ok: false, message: `I couldn't find a team member named "${payload.personName}". Please add them in Settings → Team.` };
      }

      const token = session?.provider_token;
      const localId = `delegated-${Date.now()}`;
      const loggedAt = getBriefingNowOverride() ?? Date.now();
      const newTask: DelegatedTaskItem = {
        id: localId,
        assigneeId: assignee.id,
        assigneeName: assignee.name,
        text: payload.task,
        deadline: parsed.deadline,
        completed: false,
        loggedAt,
        status: 'not_started',
        remarks: '',
      };
      setDelegatedTasks(prev => dedupeDelegatedTasks([...prev, newTask]));

      if (!token) {
        return { ok: true, message: `Got it — delegated to ${assignee.name} (deadline: ${parsed.deadline}). Google sync is not connected, so I saved it locally.` };
      }

      try {
        if (!taskListIdRef.current) {
          const listId = await findOrCreateTaskList(token, `${userProfile.assistantName} Delegated Tasks`);
          taskListIdRef.current = listId;
        }
        const notes = `Assigned to: ${assignee.name}\nStatus: In Progress`;
        const googleTask = await createTask(token, taskListIdRef.current, payload.task, notes, parsed.deadlineISO);
        setDelegatedTasks(prev => prev.map(t => (t.id === localId ? { ...t, googleTaskId: googleTask.id } : t)));
        return { ok: true, message: `Done — delegated to ${assignee.name} with deadline **${parsed.deadline}**.` };
      } catch (error: any) {
        setDelegatedTasks(prev => prev.filter(t => t.id !== localId));
        if (isTasksApiDisabled(error)) {
          return { ok: false, message: "Google Tasks API isn't enabled. I couldn't sync this delegation." };
        }
        if (isGoogleAuthError(error)) {
          onGoogleAuthError();
          return { ok: false, message: 'Your Google connection expired. Please reconnect and try again.' };
        }
        return { ok: false, message: `I couldn't create the delegated task in Google Tasks: ${error.message}` };
      }

    }, [parseDeadlineFromText, userProfile.team, session, userProfile.assistantName, onGoogleAuthError]);

    const normalizeNeedle = normalizeNeedleUtil;
    const applyScheduleOps = useCallback((current: ScheduleItem[], ops: any[]) => applyScheduleOpsUtil(current, ops), []);
    const applyPriorityOps = useCallback((current: Top3Item[], ops: any[]) => applyPriorityOpsUtil(current, ops), []);
    const applyReminderOps = useCallback((current: ReminderItem[], ops: any[]) => applyReminderOpsUtil(current, ops, {
      nowTs: getBriefingNowOverride() ?? Date.now(),
      defaultIncludeInBriefing: DEFAULT_REMINDER_BRIEFING_PREF,
      resolveInclude: (value: unknown) => resolveReminderBriefingPref(value as any),
      normalize: normalizeReminders,
    }), []);
    const applyProjectOps = useCallback((current: Project[], ops: any[]) => applyProjectOpsUtil(current, ops), []);
  
    const handleSendMessage = useCallback(async (e?: React.FormEvent, prompt?: string, imageUrl?: string): Promise<void> => {
      if (e) e.preventDefault();
      setLastInteraction(Date.now()); // Update interaction timestamp
      const rawText = (prompt || chatInput).trim();
      const projectRequestPrefix = 'PROJECT_DRAFT_REQUEST::';
      const isProjectDraftRequest = rawText.startsWith(projectRequestPrefix);
      const messageText = isProjectDraftRequest ? rawText.replace(projectRequestPrefix, '').trim() : rawText;
      if (!messageText && !attachedFile && !imageUrl) return;
      if (aiCooldownUntil && Date.now() < aiCooldownUntil) {
        setChatMessages(prev => [
          ...prev,
          { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: "The AI service is rate-limited right now. Please wait about a minute and try again." }
        ]);
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setChatMessages(prev => [
          ...prev,
          { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: "You're offline. Please reconnect to the internet and try again." }
        ]);
        return;
      }
      if (isMobileMenuOpen) setIsMobileMenuOpen(false);
      if (isCommandPaletteOpen) setIsCommandPaletteOpen(false);

      const isSystemPromptPreview = messageText.startsWith('SYSTEM:');
      if (pendingDelegation && !isProjectDraftRequest && !attachedFile && !imageUrl && !isSystemPromptPreview) {
        const userMessageId = Date.now() * 1000 + (messageIdRef.current++ % 1000);
        setChatMessages(prev => [...prev, { id: userMessageId, role: 'user', text: messageText }]);
        setChatInput('');
        setAttachedFile(null);

        const result = await finalizeDelegation({ personName: pendingDelegation.personName, task: pendingDelegation.task }, messageText);
        if (result.ok) setPendingDelegation(null);
        const modelText = result.message;
        setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
        const nowTs = Date.now();
        setChatHistory(prev => [
          ...prev,
          { role: 'user', parts: [{ text: messageText }], _ts: nowTs },
          { role: 'model', parts: [{ text: JSON.stringify({ text: modelText }) }], _ts: nowTs }
        ]);
        return;
      }

      const freeStyle = inferFreeStyle({
        messageText,
        pendingScheduleClarification: !!pendingScheduleClarification,
        eventOpsItems: pendingScheduleClarification?.eventOpsItems?.map((it) => ({ id: it.id, name: it.name })) ?? [],
        scheduleItems: scheduleItems.map((it) => ({ id: it.id, title: it.title })),
        reminders: reminders.map((it) => ({ id: it.id, text: it.text })),
      });

      const hasDraftPlan = Boolean((draftedSchedule && draftedSchedule.length > 0) || (draftedPriorities && draftedPriorities.length > 0));
      const freeStyleFinalize = hasDraftPlan && inferFinalizePlan(messageText);
      if (freeStyleFinalize && !isProjectDraftRequest && !attachedFile && !imageUrl && !isSystemPromptPreview) {
        const userMessageId = Date.now() * 1000 + (messageIdRef.current++ % 1000);
        setChatMessages(prev => [...prev, { id: userMessageId, role: 'user', text: messageText }]);
        setChatInput('');
        setAttachedFile(null);
        setIsSending(true);
        try {
          await handleConfirmPlan();
          const modelText = "Locked in — I finalized your plan and synced it to Google Calendar.";
          setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
          const nowTs = Date.now();
          setChatHistory(prev => [
            ...prev,
            { role: 'user', parts: [{ text: messageText }], _ts: nowTs },
            { role: 'model', parts: [{ text: JSON.stringify({ text: modelText }) }], _ts: nowTs }
          ]);
        } finally {
          if (generationRequestRef.current == null) {
            setIsSending(false);
          } else {
            setIsSending(false);
          }
        }
        return;
      }

      if (freeStyle.intent === 'cancel_pending' && pendingScheduleClarification && !isProjectDraftRequest && !attachedFile && !imageUrl && !isSystemPromptPreview) {
        const userMessageId = Date.now() * 1000 + (messageIdRef.current++ % 1000);
        setChatMessages(prev => [...prev, { id: userMessageId, role: 'user', text: messageText }]);
        setChatInput('');
        setAttachedFile(null);
        cancelPendingScheduleClarification();
        const nowTs = Date.now();
        setChatHistory(prev => [
          ...prev,
          { role: 'user', parts: [{ text: messageText }], _ts: nowTs },
          { role: 'model', parts: [{ text: JSON.stringify({ text: 'Canceled pending schedule blocking.' }) }], _ts: nowTs }
        ]);
        return;
      }

      if ((freeStyle.intent === 'exclude_item' || freeStyle.intent === 'mark_done') && freeStyle.entities[0]?.confidence >= 0.7 && !isProjectDraftRequest && !attachedFile && !imageUrl && !isSystemPromptPreview) {
        const target = freeStyle.entities[0];
        const userMessageId = Date.now() * 1000 + (messageIdRef.current++ % 1000);
        setChatMessages(prev => [...prev, { id: userMessageId, role: 'user', text: messageText }]);
        setChatInput('');
        setAttachedFile(null);

        if (target.kind === 'schedule_item' && target.id) {
          if (freeStyle.intent === 'exclude_item') {
            setScheduleItems(prev => prev.filter((it) => it.id !== target.id));
            const modelText = `Okay — I removed “${target.name || 'that item'}” from today’s schedule.`;
            setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
          } else {
            setScheduleItems(prev => prev.map((it) => (it.id === target.id ? { ...it, completed: true } : it)));
            const modelText = `Got it — I marked “${target.name || 'that item'}” as completed.`;
            setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
          }
          return;
        }

        if (target.kind === 'reminder' && target.id) {
          if (freeStyle.intent === 'exclude_item') {
            setReminders(prev => prev.filter((it) => it.id !== target.id));
            const modelText = `Okay — I removed the reminder “${target.name || 'that reminder'}”.`;
            setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
          } else {
            setReminders(prev => prev.map((it) => (it.id === target.id ? { ...it, completed: true } : it)));
            const modelText = `Got it — I marked the reminder “${target.name || 'that reminder'}” as completed.`;
            setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
          }
          return;
        }
      }

      const requestId = Symbol('generation-request');
      generationRequestRef.current = requestId;

        // Check if this is a SYSTEM prompt
        const isSystemPrompt = messageText.startsWith('SYSTEM:');
        
        // For mode activation SYSTEM prompts, don't show in chat at all
        const shouldHideMessage = isSystemPrompt && (
            messageText.includes('CRISIS MODE') || 
            messageText.includes('STRATEGIC MODE') || 
            messageText.includes('RED DAY MODE')
        );
        
        const userMessageForUI = isSystemPrompt && !shouldHideMessage
            ? (messageText.includes('weekly report') ? 'Create my Weekly Report' : messageText.replace('SYSTEM: ', ''))
            : (attachedFile ? `${messageText}\n[Attached: ${attachedFile.name}]` : messageText);
            
      const userMessageId = Date.now() * 1000 + (messageIdRef.current++ % 1000);
      const newUserMessage: ChatMessage = { id: userMessageId, role: 'user', text: userMessageForUI };
      
      if (imageUrl) {
          newUserMessage.imageUrl = imageUrl;
      }
      
      const isFinalization = hasDraftPlan && inferFinalizePlan(messageText);
      const briefingNow = getBriefingNow();
      const isMorningBriefingTrigger = messageText === "Prepare the morning briefing.";
      const isAfternoonBriefingTrigger = messageText === "Prepare the afternoon briefing.";
      const briefingWindowForRequest = isMorningBriefingTrigger
        ? buildBriefingWindow('morning', briefingNow)
        : isAfternoonBriefingTrigger
          ? buildBriefingWindow('afternoon', briefingNow)
          : pendingBriefingWindow;
      const briefingContext = filterBriefingContext(
        briefingWindowForRequest,
        reminders,
        briefingInputs,
        delegatedTasks
      );
      if (briefingWindowForRequest && (isMorningBriefingTrigger || isAfternoonBriefingTrigger)) {
        setPendingBriefingWindow(briefingWindowForRequest);
      }
      const isBriefingFinalizeRequest = messageText.toLowerCase().includes("finalize the briefing as talking points.");
      if (isBriefingFinalizeRequest) {
        briefingFinalizeRequestRef.current = requestId;
      }

      // Only add message to chat if it should be visible
      if (!shouldHideMessage) {
          setChatMessages(prev => [...prev, newUserMessage]);
      }
      setIsSending(true);
      const fileToProcess = attachedFile;
      setChatInput(''); setAttachedFile(null);
      if (desktopTextareaRef.current) desktopTextareaRef.current.style.height = 'auto';
      if (mobileTextareaRef.current) mobileTextareaRef.current.style.height = 'auto';
      let fullPrompt = messageText;
      if (isProjectDraftRequest) {
          fullPrompt = `Create a new project plan from this description: "${messageText}". Return a JSON response with projectDraft and isProjectDraft: true, including milestones and delegatedTasks.`;
      }
      if (fileToProcess) {
          try {
              fullPrompt += `\n\n--- Attached File Content: ${fileToProcess.name} ---\n${await fileToProcess.text()}`;
          } catch (readError) {
              console.error("Error reading file:", readError);
              setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: `Sorry, I was unable to read the file "${fileToProcess.name}".` }]);
              if (generationRequestRef.current === requestId) {
                setIsSending(false);
              }
              return;
          }
      }

      if (pendingScheduleClarification && !isProjectDraftRequest && !fileToProcess && !imageUrl && !isSystemPrompt && !isFinalization) {
          const exclusions = new Set<string>();
          const exclusionLabels: string[] = [];
          if (freeStyle.intent === 'exclude_item' || freeStyle.intent === 'mark_done') {
            const entity = freeStyle.entities[0];
            if (entity?.kind === 'event_ops_item' && entity.id) {
              exclusions.add(entity.id);
              if (entity.name) exclusionLabels.push(entity.name);
            } else if (entity?.name) {
              const match = bestFuzzyMatch(entity.name, pendingScheduleClarification.eventOpsItems);
              if (match && match.score >= 0.45) {
                exclusions.add(match.item.id);
                exclusionLabels.push(match.label);
              }
            }
          }

          const effectiveEventOpsItems = pendingScheduleClarification.eventOpsItems.filter((it) => !exclusions.has(it.id));
          const eventOpsSummary = effectiveEventOpsItems
              .map(item => {
                  const timePart = item.serving_time ? ` • ${String(item.serving_time).slice(0, 5)}` : '';
                  const locationPart = item.location ? ` • ${item.location}` : '';
                  return `- ${item.event_date}: ${item.kind} — ${item.name}${timePart}${locationPart}`;
              })
              .join('\n');
          fullPrompt = [
              `Draft an 8-hour time-blocked schedule for today.`,
              `Event Ops items today:`,
              eventOpsSummary || '- None',
              exclusionLabels.length > 0 ? `User constraints: Exclude these Event Ops items (already handled): ${exclusionLabels.join(', ')}` : '',
              freeStyle.intent === 'proceed' ? `User signal: Proceed without unnecessary questions; make reasonable assumptions if needed.` : '',
              `User’s plan/context (most recent message):`,
              messageText,
              `Return a JSON response with text, schedule (array of objects with time/title), priorities, and isPlanDraft: true.`,
          ].filter(Boolean).join('\n');
      }
      
      const historyForGemini: Content[] = chatHistory.map(({ role, parts }) => ({ role, parts }));
      const trimmedHistory = isBriefingFinalizeRequest ? historyForGemini.slice(-10) : historyForGemini;
      
      const newMessagePart: Content = { 
          role: 'user', 
          parts: imageUrl 
            ? [{ text: fullPrompt }, { inlineData: { mimeType: "image/jpeg", data: imageUrl.split(',')[1] } }] 
            : [{ text: fullPrompt }] 
      };

      const newHistory: Content[] = [...trimmedHistory, newMessagePart];
      const currentDashboardState: DashboardState = isBriefingFinalizeRequest
        ? {
            chatMessages: shouldHideMessage ? chatMessages : [...chatMessages, newUserMessage],
            chatHistory: chatHistory.slice(-10),
            scheduleItems: [],
            top3Items: [],
            reminders: briefingContext.briefingReminders,
            projects: [],
            completedProjects: [],
            keepNotes,
            delegatedTasks: briefingContext.briefingDelegatedTasks,
            team: userProfile.team,
            hasGreeted,
            lastResetDate,
            isScheduleConfirmed,
            briefingInputs: briefingContext.briefingInputs,
            briefingState,
            collapsedCards,
            weeklyLog: [],
            priorityForTomorrow,
            stateVersion: DASHBOARD_STATE_VERSION,
            completedGCalEventIds: Array.from(completedGCalEventIds),
            currentMode,
            modeHistory,
            modeActivatedAt
          }
        : {
            chatMessages: shouldHideMessage ? chatMessages : [...chatMessages, newUserMessage],
            chatHistory,
            scheduleItems,
            top3Items,
            reminders: briefingContext.briefingReminders,
            projects,
            completedProjects,
            keepNotes,
            delegatedTasks: briefingContext.briefingDelegatedTasks,
            team: userProfile.team,
            hasGreeted,
            lastResetDate,
            isScheduleConfirmed,
            briefingInputs: briefingContext.briefingInputs,
            briefingState,
            collapsedCards,
            weeklyLog,
            priorityForTomorrow,
            stateVersion: DASHBOARD_STATE_VERSION,
            completedGCalEventIds: Array.from(completedGCalEventIds),
            currentMode,
            modeHistory,
            modeActivatedAt
          };
      try {
          const currentAccessToken = session?.provider_token || null;
          const freshEventOpsItems = await fetchEventOpsItemsForAI(14, true);
          if (freshEventOpsItems.length > 0) setEventOpsItems(freshEventOpsItems);
          const response = await sendMessageToGemini(newHistory, { ...userProfile, team: userProfile.team }, currentDashboardState, googleCalendarEvents, new Date(), currentAccessToken, freshEventOpsItems);
          let overrideChatText: string | null = null;
          let overrideIsPlanDraft: boolean | null = null;
          let shouldClearPendingScheduleClarification = false;

          if (generationRequestRef.current !== requestId) {
            console.log("Generation stopped by user. Ignoring response.");
            return;
          }
          const isBriefingFinalizeResponse = briefingFinalizeRequestRef.current === requestId;
          
          if (response?.isError) {
            // Error text already carries user-facing context; skip side effects.
          } else if (response.newMemoryToSave) {
            const newFact = `- ${response.newMemoryToSave}`;
            const updatedMemory = userProfile.assistantMemory ? `${userProfile.assistantMemory}\n${newFact}` : newFact;
            onProfileUpdate({ ...userProfile, assistantMemory: updatedMemory });
          }
          if (response.weeklyLogUpdates) {
            const todayStr = new Date().toISOString().split('T')[0];
            const newLogs = response.weeklyLogUpdates.map((log: WeeklyLogUpdatePayload, index: number) => ({
                ...log,
                id: `log-${Date.now()}-${index}`,
                date: todayStr
            }));
            setWeeklyLog(prev => [...prev, ...newLogs]);
          }
          if (response.weeklyReport) {
            setWeeklyReport(response.weeklyReport);
            setIsWeeklyReportModalOpen(true);
          }
          if (response.priorityForTomorrowUpdate) {
              setPriorityForTomorrow(response.priorityForTomorrowUpdate);
          }
          if (response.projectUpdate) {
              const { projectName, milestoneText } = response.projectUpdate;
              setProjects(prev => prev.map(p => p.name.toLowerCase() === projectName.toLowerCase() ? { ...p, milestones: p.milestones.map(m => m.text.toLowerCase() === milestoneText.toLowerCase() ? { ...m, progress: 100 } : m) } : p));
          }
          if (response.clarificationRequest && !isBriefingFinalizeResponse) {
              const { type, personName, task, question } = response.clarificationRequest;
              if (type === 'delegation_deadline' && typeof personName === 'string' && typeof task === 'string') {
                  setPendingDelegation({ personName, task, requestedAt: Date.now() });
                  if (typeof question === 'string' && question.trim()) {
                      setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: question.trim() }]);
                  }
              }
              if (type === 'schedule_event_ops_plan') {
                  const todayYmd = toYmdLocal(new Date());
                  const todayItems = freshEventOpsItems
                      .filter(item => item.event_date === todayYmd)
                      .map(item => ({ id: item.id, kind: item.kind, event_date: item.event_date, name: item.name, location: item.location, serving_time: item.serving_time }));
                  const q = typeof question === 'string' && question.trim()
                      ? question.trim()
                      : `I see there is an Event Ops item today. What’s your plan for today so I can block your schedule properly?`;
                  setDraftedSchedule(null);
                  setDraftedPriorities(null);
                  setPendingScheduleClarification({ reason: 'event_ops_missing_time', question: q, createdAt: Date.now(), eventOpsItems: todayItems });
                  overrideChatText = q;
                  overrideIsPlanDraft = false;
              }
          }
          if (response.delegationUpdate && !isBriefingFinalizeResponse) {
              const { personName, task, deadline, deadlineISO } = response.delegationUpdate;
              if (!personName || !task) {
                  setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: "To delegate a task, tell me who it's for and what the task is." }]);
              } else if (!deadline || !deadlineISO) {
                  setPendingDelegation({ personName, task, requestedAt: Date.now() });
                  setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: `What deadline should I set for "${task}" (assigned to ${personName})? Try “tomorrow”, “2026-02-15”, or “2026-02-15 15:00”.` }]);
              } else {
              const assignee = userProfile.team.find(m => m.name.toLowerCase() === personName.toLowerCase());
              
              if (assignee) {
                  const token = session?.provider_token;
                  if (!token) {
                  setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: "I can't delegate this task because your Google account isn't properly connected. Please try reconnecting from the settings." }]);
                  } else {
                      try {
                          if (!taskListIdRef.current) {
                              const listId = await findOrCreateTaskList(token, `${userProfile.assistantName} Delegated Tasks`);
                              taskListIdRef.current = listId;
                          }
                          const notes = `Assigned to: ${assignee.name}\nStatus: In Progress`;
                          const googleTask = await createTask(token, taskListIdRef.current, task, notes, deadlineISO);
                          
                          const loggedAt = getBriefingNowOverride() ?? Date.now();
                          const newTask: DelegatedTaskItem = {
                            id: `delegated-${Date.now()}`,
                            assigneeId: assignee.id,
                            assigneeName: assignee.name,
                            text: task,
                            deadline: deadline,
                            completed: false,
                            googleTaskId: googleTask.id,
                            loggedAt,
                            status: 'not_started',
                            remarks: '',
                          };
                          setDelegatedTasks(prev => dedupeDelegatedTasks([...prev, newTask]));
                      } catch (error: any) {
                          console.error('Failed to delegate task to Google Tasks:', error);
                          if (isTasksApiDisabled(error)) {
                              setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: "Google Tasks API isn't enabled for this project. Task sync is paused until it is enabled in Google Cloud." }]);
                              return;
                          }
                          if (isGoogleAuthError(error)) {
                              onGoogleAuthError();
                              setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: "Your Google connection has expired. I couldn't delegate the task. Please reconnect via settings." }]);
                          } else {
                              setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: `I ran into an issue delegating that task: ${error.message}` }]);
                          }
                      }
                  }
              } else {
                  console.warn(`Could not find team member: ${personName} to assign task.`);
                  setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: `I couldn't find a team member named "${personName}". Please make sure they are added to your team in the settings.` }]);
              }
              }
          }

          if (response.delegatedTaskOps && Array.isArray(response.delegatedTaskOps) && !isBriefingFinalizeResponse) {
              const opMessages: string[] = [];
              for (const op of response.delegatedTaskOps) {
                  const operation = String(op?.op || '').toLowerCase();
                  const matchId = op?.match?.id ? String(op.match.id) : '';
                  const matchText = normalizeNeedle(op?.match?.textContains);
                  const matchAssignee = normalizeNeedle(op?.match?.assigneeName);

                  const snapshot = delegatedTasks;
                  const matches = snapshot
                      .map((item, index) => ({ item, index }))
                      .filter(({ item }) => (matchId ? item.id === matchId : true))
                      .filter(({ item }) => (matchAssignee ? item.assigneeName.toLowerCase().includes(matchAssignee) : true))
                      .filter(({ item }) => (matchText ? item.text.toLowerCase().includes(matchText) : true));

                  if (operation === 'add') {
                      const assigneeName = String(op?.item?.assigneeName || '').trim();
                      const text = String(op?.item?.text || '').trim();
                      const deadline = String(op?.item?.deadline || '').trim();
                      if (!assigneeName || !text) continue;
                      if (!deadline) {
                          setPendingDelegation({ personName: assigneeName, task: text, requestedAt: Date.now() });
                          opMessages.push(`What deadline should I set for "${text}" (assigned to ${assigneeName})?`);
                          continue;
                      }
                      const result = await finalizeDelegation({ personName: assigneeName, task: text }, deadline);
                      opMessages.push(result.message);
                      continue;
                  }

                  if (matches.length !== 1) {
                      const targetLabel = matchId ? `id=${matchId}` : matchText ? `text contains "${matchText}"` : 'unspecified target';
                      opMessages.push(matches.length === 0 ? `I couldn’t find a delegated task to ${operation} (${targetLabel}).` : `Multiple delegated tasks match (${targetLabel}). Please be more specific.`);
                      continue;
                  }

                  const target = matches[0].item;
                  if (operation === 'delete') {
                      setDelegatedTasks(prev => prev.filter(t => t.id !== target.id));
                      continue;
                  }
                  if (operation === 'update') {
                      const nextText = op?.item?.text != null ? String(op.item.text).trim() : target.text;
                      const nextDeadline = op?.item?.deadline != null ? String(op.item.deadline).trim() : target.deadline;
                      setDelegatedTasks(prev => prev.map(t => (t.id === target.id ? { ...t, text: nextText, deadline: nextDeadline } : t)));
                  }
              }
              if (opMessages.length > 0) {
                  setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: opMessages.join('\n') }]);
              }
          }

          if (isFinalization) {
              if (draftedSchedule) {
                  setScheduleItems(draftedSchedule);
                  setDraftedSchedule(null);
              }
              if (draftedPriorities) {
                  setTop3Items(draftedPriorities);
                  setDraftedPriorities(null);
              }
          } else if (response.isPlanDraft === true || response.isPlanDraft === "true") {
              if (response.text) {
                  setLastPlanDraftText(response.text);
              }
              let scheduleCandidate: ScheduleItem[] = [];
              const fallbackSchedule = response.text ? extractDraftScheduleFromText(response.text) : [];
              if (response.schedule || fallbackSchedule.length > 0) {
                  if (Array.isArray(response.schedule) && response.schedule.length > 0 && typeof response.schedule[0] === 'object' && response.schedule[0].time) {
                      scheduleCandidate = response.schedule.map((item: any, index: number) => {
                          const time = item.time || 'All Day';
                          const title = item.title || item.name || '';
                          const timeHash = time.replace(/[:\s-]/g, '').toLowerCase();
                          const titleHash = title.substring(0, 30).replace(/[^\w\s]/g, '').replace(/\s+/g, '-').toLowerCase();
                          const stableId = item.id || `sched-${timeHash}-${titleHash}-${index}`;
                          return { id: stableId, time, title, completed: Boolean(item.completed), isGoogleEvent: Boolean(item.isGoogleEvent) };
                      }).filter((item: ScheduleItem) => item.title);
                  } else {
                      const scheduleArray = Array.isArray(response.schedule) 
                          ? response.schedule 
                          : typeof response.schedule === 'string' ? response.schedule.split('\n') : [];
                      scheduleCandidate = scheduleArray.length > 0 ? parseScheduleArray(scheduleArray) : fallbackSchedule;
                  }
              }

              const fallbackPriorities = response.text ? extractPrioritiesFromText(response.text) : [];
              const prioritiesArray = Array.isArray(response.priorities)
                  ? response.priorities
                  : typeof response.priorities === 'string' ? response.priorities.split('\n') : [];
              const prioritiesCandidate = buildTopPriorities(prioritiesArray.length > 0 ? prioritiesArray : fallbackPriorities);

              const todayYmd = toYmdLocal(new Date());
              const eventOpsCompact = freshEventOpsItems.map(item => ({
                id: item.id,
                kind: item.kind,
                event_date: item.event_date,
                name: item.name,
                location: item.location,
                serving_time: item.serving_time,
              }));
              const validation = detectEventOpsScheduleClarification({
                todayYmd,
                eventOpsItems: eventOpsCompact,
                proposedSchedule: scheduleCandidate.map(s => ({ time: s.time, title: s.title })),
              });

              if ('needsClarification' in validation && validation.needsClarification) {
                  setDraftedSchedule(null);
                  setDraftedPriorities(null);
                  setPendingScheduleClarification({
                      reason: validation.reason,
                      question: validation.question,
                      createdAt: Date.now(),
                      eventOpsItems: validation.eventOpsItems.map((it: any) => ({
                        id: it.id,
                        kind: it.kind,
                        event_date: it.event_date,
                        name: it.name,
                        location: it.location,
                        serving_time: it.serving_time,
                      })),
                  });
                  overrideChatText = validation.question;
                  overrideIsPlanDraft = false;
              } else {
                  if (scheduleCandidate.length > 0) setDraftedSchedule(scheduleCandidate);
                  if (prioritiesCandidate.length > 0) setDraftedPriorities(prioritiesCandidate);
                  if (pendingScheduleClarification) shouldClearPendingScheduleClarification = true;
              }
          } else {
              // Handle normal, non-draft updates
              if (response.currentMood) {
              setCurrentMood(response.currentMood as UserMood);
          }

          if (response.newMemoryToSave) {
              const memoryText = response.newMemoryToSave.trim();
              if (memoryText) {
                  const updatedPassiveMemory = [...(userProfile.passiveMemory || []), memoryText];
                  const updatedProfile = { ...userProfile, passiveMemory: updatedPassiveMemory };
                  onProfileUpdate(updatedProfile);
                  console.log("Saved passive memory:", memoryText);
              }
          }

          if (response.memoryUpdate && response.memoryUpdate.operations) {
              let updatedGraph: any = userProfile.relationalMemory ? { ...userProfile.relationalMemory } : { nodes: [], edges: [] };
              if (!Array.isArray(updatedGraph.nodes)) updatedGraph.nodes = [];
              if (!Array.isArray(updatedGraph.edges)) updatedGraph.edges = [];

              response.memoryUpdate.operations.forEach((op: any) => {
                  if (op.type === 'add_node') {
                      const { type, name, attributes } = op.node;
                      // Check if node exists
                      const exists = updatedGraph.nodes.some((n: any) => n.name.toLowerCase() === name.toLowerCase() && n.type === type);
                      if (!exists) {
                          updatedGraph.nodes.push({
                              id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                              type,
                              name,
                              attributes: attributes || {},
                              created_at: Date.now(),
                              last_accessed: Date.now()
                          });
                      }
                  } else if (op.type === 'add_edge') {
                      const { sourceName, targetName, relationship, context } = op.edge;
                      const sourceNode = updatedGraph.nodes.find((n: any) => n.name.toLowerCase() === sourceName.toLowerCase());
                      const targetNode = updatedGraph.nodes.find((n: any) => n.name.toLowerCase() === targetName.toLowerCase());
                      
                      if (sourceNode && targetNode) {
                          // Check if edge exists
                          const exists = updatedGraph.edges.some((e: any) => 
                              e.sourceId === sourceNode.id && 
                              e.targetId === targetNode.id && 
                              e.relationship === relationship
                          );
                          
                          if (!exists) {
                              updatedGraph.edges.push({
                                  sourceId: sourceNode.id,
                                  targetId: targetNode.id,
                                  relationship,
                                  context: context || '',
                                  created_at: Date.now()
                              });
                          }
                      }
                  }
              });
              
              const updatedProfile = { ...userProfile, relationalMemory: updatedGraph };
              onProfileUpdate(updatedProfile);
              console.log("Updated Relational Memory Graph:", updatedGraph);
          }

          const opMessages: string[] = [];
          const hasScheduleOps = Array.isArray(response.scheduleOps) && response.scheduleOps.length > 0;
          if (hasScheduleOps) {
              const result = applyScheduleOps(scheduleItems, response.scheduleOps);
              setScheduleItems(result.next);
              setIsScheduleConfirmed(false);
              opMessages.push(...result.messages);
          } else if (response.schedule) {
              const scheduleArray = Array.isArray(response.schedule) 
                  ? response.schedule 
                  : typeof response.schedule === 'string' ? response.schedule.split('\n') : [];
              setScheduleItems(parseScheduleArray(scheduleArray));
              setIsScheduleConfirmed(false);
          }

          const hasPriorityOps = Array.isArray(response.priorityOps) && response.priorityOps.length > 0;
          if (hasPriorityOps) {
              const result = applyPriorityOps(top3Items, response.priorityOps);
              setTop3Items(result.next);
              opMessages.push(...result.messages);
          } else if (response.priorities) {
              const prioritiesArray = Array.isArray(response.priorities)
                  ? response.priorities
                  : typeof response.priorities === 'string' ? response.priorities.split('\n') : [];
              setTop3Items(buildTopPriorities(prioritiesArray));
          }

          const hasReminderOps = Array.isArray(response.reminderOps) && response.reminderOps.length > 0;
          if (hasReminderOps) {
              const result = applyReminderOps(reminders, response.reminderOps);
              setReminders(result.next);
              opMessages.push(...result.messages);
          } else if (response.reminders) {
              const remindersArray = Array.isArray(response.reminders)
                  ? response.reminders
                  : typeof response.reminders === 'string'
                      ? response.reminders.split('\n')
                      : [];
              const baseTs = getBriefingNowOverride() ?? Date.now();
              const nextReminders: ReminderItem[] = remindersArray
                  .map((item: any, index: number) => {
                      if (typeof item === 'string') {
                          const text = item.trim();
                          if (!text) return null;
                          return {
                              id: `rem-${baseTs}-${index}`,
                              text,
                              completed: false,
                              loggedAt: baseTs,
                              includeInBriefing: DEFAULT_REMINDER_BRIEFING_PREF,
                          };
                      }
                      if (item && typeof item.text === 'string') {
                          const text = String(item.text).trim();
                          if (!text) return null;
                          return {
                              id: String(item.id || `rem-${baseTs}-${index}`),
                              text,
                              completed: Boolean(item.completed),
                              loggedAt: resolveLoggedAt(item.loggedAt ?? baseTs),
                              includeInBriefing: resolveReminderBriefingPref(item.includeInBriefing),
                          };
                      }
                      return null;
                  })
                  .filter(Boolean) as ReminderItem[];
              setReminders(normalizeReminders(nextReminders));
          }

          const hasProjectOps = Array.isArray(response.projectOps) && response.projectOps.length > 0;
          if (hasProjectOps) {
              const result = applyProjectOps(projects, response.projectOps);
              setProjects(result.next);
              opMessages.push(...result.messages);
          }

          if (opMessages.length > 0) {
              setChatMessages(prev => [
                  ...prev,
                  { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: opMessages.join('\n') }
              ]);
          }
          }

          let nextKeepNotes: string | null = null;
          let nextBriefingState: BriefingState | null = null;

          if (response.keep_draft) {
              nextKeepNotes = response.keep_draft.trim();
              nextBriefingState = 'draft';
          }

          if (response.keep) {
              if (isBriefingFinalizeResponse) {
                  setBriefingScript(response.keep.trim());
                  setIsBriefingScriptVisible(true);
                  if (briefingFinalizeTimeoutRef.current) {
                      clearTimeout(briefingFinalizeTimeoutRef.current);
                  }
                  briefingFinalizeRequestRef.current = null;
                  setBriefingState('finalized');
              } else {
                  nextKeepNotes = response.keep.trim();
                  nextBriefingState = 'finalized';
              }
          } else if (isBriefingFinalizeResponse) {
              const fallbackScript = response.text?.trim() || "No script generated.";
              setBriefingScript(fallbackScript);
              setIsBriefingScriptVisible(true);
              if (briefingFinalizeTimeoutRef.current) {
                  clearTimeout(briefingFinalizeTimeoutRef.current);
              }
              briefingFinalizeRequestRef.current = null;
          }
          const shouldConsumeBriefingContext =
            pendingBriefingWindow &&
            (response.keep_draft || (response.keep && !isBriefingFinalizeResponse));
          if (nextKeepNotes !== null) {
            const mergedNotes = shouldConsumeBriefingContext
              ? mergeBriefingNotes(nextKeepNotes, briefingContext)
              : nextKeepNotes;
            setKeepNotes(mergedNotes);
          }
          if (nextBriefingState) {
            setBriefingState(nextBriefingState);
          }
          if (shouldConsumeBriefingContext) {
            setReminders(briefingContext.remainingReminders);
            setBriefingInputs(briefingContext.remainingBriefingInputs);
            setDelegatedTasks(briefingContext.remainingDelegatedTasks);
            setPendingBriefingWindow(null);
          }
          if (response.project && !response.isProjectDraft && !response.projectDraft) {
              const rawProject = response.project;
              const name = String(rawProject.name || '').trim();
              const deadline = String(rawProject.deadline || '').trim();
              const rawMilestones = Array.isArray(rawProject.milestones) ? rawProject.milestones : [];
              if (name) {
                  const baseTs = Date.now();
                  const milestones: Milestone[] = rawMilestones
                      .map((m: any, index: number) => {
                          const text = String(m?.text || '').trim();
                          if (!text) return null;
                          const assigneeName = m?.assigneeName ? String(m.assigneeName).trim() : undefined;
                          return { id: `ms-${baseTs}-${index}`, text, progress: 0, assigneeName };
                      })
                      .filter(Boolean) as Milestone[];
                  const project: Project = { id: `proj-${baseTs}`, name, deadline, milestones };
                  setProjects(prev => [...prev, project]);
              }
          }
          const projectDraftPayload = response.projectDraft ?? (response.isProjectDraft ? response.project : null);
          if (projectDraftPayload) {
              const draftResult = buildProjectDraft(projectDraftPayload);
              if (draftResult) {
                  setDraftedProject(draftResult.project);
                  setDraftedProjectTasks(draftResult.tasks);
              }
          }

          const chatText = overrideChatText ?? response.text;
          if (chatText || response.imageUrl || response.sources) {
              // Ensure isPlanDraft is always a boolean (handle string "true"/"false" or missing values)
              // Also check if response has schedule and priorities (Step 2 of daily kick-off) as fallback
              const hasSchedule = response.schedule && Array.isArray(response.schedule) && response.schedule.length > 0;
              const hasPriorities = response.priorities && Array.isArray(response.priorities) && response.priorities.length > 0;
              
              // More aggressive detection: if EITHER schedule OR priorities exist (not just both), treat as draft
              const hasAnyDraftContent = hasSchedule || hasPriorities;
              const isPlanDraft = overrideIsPlanDraft ?? (response.isPlanDraft === true || 
                                  response.isPlanDraft === "true" || 
                                  (hasAnyDraftContent && response.isPlanDraft !== false));
              
              // Debug logging to track what AI is returning
              if (hasAnyDraftContent) {
                  console.log('🔍 Plan Draft Detection:', {
                      hasSchedule,
                      hasPriorities,
                      isPlanDraftFromAI: response.isPlanDraft,
                      finalIsPlanDraft: isPlanDraft,
                      scheduleLength: response.schedule?.length,
                      prioritiesLength: response.priorities?.length
                  });
              }
              
              setChatMessages(prev => [...prev, { 
                  id: Date.now() * 1000 + (messageIdRef.current++ % 1000), 
                  role: 'model', 
                  text: chatText,
                  imageUrl: response.imageUrl,
                  sources: response.sources,
                  isPlanDraft: isPlanDraft,
                  isProjectDraft: Boolean(projectDraftPayload),
                  isWeeklyReport: Boolean(response.weeklyReport),
              }]);
          } else if (response.weeklyReport) {
              // If AI didn't provide text but created a weekly report, add a completion message
              setChatMessages(prev => [...prev, { 
                  id: Date.now() * 1000 + (messageIdRef.current++ % 1000), 
                  role: 'model', 
                  text: `All done! Your weekly report for ${response.weeklyReport.weekRange || 'this week'} is ready. I've compiled ${response.weeklyReport.accomplishments?.length || 0} accomplishments, ${response.weeklyReport.projects?.length || 0} project updates, and ${response.weeklyReport.nextSteps?.length || 0} action items for next week. Click the button below to review the full report, or I can generate an email-friendly version if you need to share it.`,
                  isPlanDraft: false,
                  isProjectDraft: false,
                  isWeeklyReport: true,
              }]);
          }
          if (shouldClearPendingScheduleClarification) setPendingScheduleClarification(null);
          const nowTs = Date.now();
          setChatHistory(prev => [
            ...prev,
            { role: 'user', parts: [{ text: fullPrompt }], _ts: nowTs },
            { role: 'model', parts: [{ text: JSON.stringify(response) }], _ts: nowTs }
          ]);
      } catch (error) {
          console.error(error);
          const fallbackMessage =
            error instanceof Error && error.message
              ? error.message
              : "Sorry, I'm having trouble connecting. Please try again.";
          if (fallbackMessage.toLowerCase().includes('rate-limited')) {
            setAiCooldownUntil(Date.now() + 60_000);
          }
          setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: fallbackMessage }]);
          const isBriefingFinalizeResponse = briefingFinalizeRequestRef.current === requestId;
          if (isBriefingFinalizeResponse) {
              setBriefingScript(fallbackMessage);
              setIsBriefingScriptVisible(true);
              if (briefingFinalizeTimeoutRef.current) {
                  clearTimeout(briefingFinalizeTimeoutRef.current);
              }
              briefingFinalizeRequestRef.current = null;
          }
      } finally {
        if (generationRequestRef.current === requestId) {
          setIsSending(false);
        }
      }
    }, [chatInput, attachedFile, isMobileMenuOpen, isCommandPaletteOpen, chatHistory, chatMessages, scheduleItems, top3Items, reminders, projects, completedProjects, keepNotes, delegatedTasks, userProfile, hasGreeted, lastResetDate, isScheduleConfirmed, briefingInputs, briefingState, collapsedCards, weeklyLog, priorityForTomorrow, session, onProfileUpdate, onGoogleAuthError, googleCalendarEvents, draftedSchedule, draftedPriorities, completedGCalEventIds, pendingBriefingWindow, buildProjectDraft, fetchEventOpsItemsForAI, pendingDelegation, finalizeDelegation, applyScheduleOps, applyPriorityOps, applyReminderOps, applyProjectOps, normalizeNeedle]);
    
    const handleProactiveAIMessage = useCallback(async (prompt: string) => {
        if (isSending) return;
        setIsSending(true);
        const currentAccessToken = session?.provider_token || null;
        const currentDashboardState: DashboardState = { chatMessages, chatHistory, scheduleItems, top3Items, reminders, projects, completedProjects, keepNotes, delegatedTasks, team: userProfile.team, hasGreeted, lastResetDate, isScheduleConfirmed, briefingInputs, briefingState, collapsedCards, weeklyLog, priorityForTomorrow, stateVersion: DASHBOARD_STATE_VERSION, completedGCalEventIds: Array.from(completedGCalEventIds) };
        const historyForGemini: Content[] = chatHistory.map(({ role, parts }) => ({ role, parts }));
        const newHistory: Content[] = [...historyForGemini, { role: 'user', parts: [{ text: prompt }] }];
        try {
          const freshEventOpsItems = await fetchEventOpsItemsForAI(14, false);
          const response = await sendMessageToGemini(newHistory, { ...userProfile, team: userProfile.team }, currentDashboardState, googleCalendarEvents, new Date(), currentAccessToken, freshEventOpsItems);
          const modelResponseText = response.text;
          if (modelResponseText) setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelResponseText }]);
          const nowTs = Date.now();
          setChatHistory(prev => [
            ...prev,
            { role: 'user', parts: [{ text: prompt }], _ts: nowTs },
            { role: 'model', parts: [{ text: modelResponseText }], _ts: nowTs }
          ]);
        } catch (error) {
          console.error("Proactive AI message failed:", error);
        } finally {
          setIsSending(false);
        }
      }, [isSending, chatMessages, chatHistory, scheduleItems, top3Items, reminders, projects, completedProjects, keepNotes, delegatedTasks, userProfile, hasGreeted, lastResetDate, isScheduleConfirmed, briefingInputs, briefingState, collapsedCards, weeklyLog, priorityForTomorrow, session, googleCalendarEvents, completedGCalEventIds, fetchEventOpsItemsForAI]);

    const handleLinkedToggle = useCallback((itemId: string, isGCal: boolean, itemTitle: string, isCompleted: boolean) => {
      const newStatus = !isCompleted;

      const normalize = (str: string) =>
          str
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
      const stopWords = new Set(['the', 'and', 'for', 'with', 'to', 'in', 'on', 'of', 'a', 'an', 'is', 'are', 'be', 'my', 'your']);
      const stem = (token: string) =>
          token
              .replace(/(ing|ed|ions|ion|al|ers|er|ment|s)$/i, '')
              .trim();
      const tokenize = (str: string) =>
          normalize(str)
              .split(' ')
              .filter(token => token.length > 2 && !stopWords.has(token))
              .map(stem)
              .filter(token => token.length > 2);
      const isSubsetMatch = (a: string, b: string) => {
          const aTokens = new Set(tokenize(a));
          const bTokens = new Set(tokenize(b));
          if (aTokens.size === 0 || bTokens.size === 0) return false;
          const smaller = aTokens.size <= bTokens.size ? aTokens : bTokens;
          const larger = aTokens.size <= bTokens.size ? bTokens : aTokens;
          const overlap = [...smaller].filter(token => larger.has(token)).length;
          return overlap >= 2 && overlap === smaller.size;
      };
      const matchingIds = (items: { id: string; title: string }[]) =>
          items.filter(item => isSubsetMatch(item.title, itemTitle)).map(item => item.id);

      const isPriorityToggle = itemId.startsWith('pri-');

      if (isGCal) {
          setCompletedGCalEventIds(prev => {
              const newSet = new Set(prev);
              if (newStatus) newSet.add(itemId);
              else newSet.delete(itemId);
              return newSet;
          });
      } else {
          const bestGCalIds = matchingIds(
              googleCalendarEvents.map((event: any, index: number) => ({
                  id: `gcal-${event.id || index}`,
                  title: event.summary || '',
              }))
          );
          if (bestGCalIds.length > 0) {
              setCompletedGCalEventIds(prev => {
                  const newSet = new Set(prev);
                  bestGCalIds.forEach(id => {
                      if (newStatus) newSet.add(id);
                      else newSet.delete(id);
                  });
                  return newSet;
              });
          }
      }

      setScheduleItems(prev => {
          let updated: ScheduleItem[];
          if (!isPriorityToggle) {
              updated = prev.map(item =>
                  (item.id === itemId && !isGCal) ? { ...item, completed: newStatus } : item
              );
          } else {
              const bestIds = matchingIds(prev.map(item => ({ id: item.id, title: item.title })));
              if (bestIds.length === 0) return prev;
              updated = prev.map(item => bestIds.includes(item.id) ? { ...item, completed: newStatus } : item);
          }
          
          // Check if all schedule items are now completed - trigger animation immediately
          if (newStatus && updated.length > 0 && updated.every(item => item.completed)) {
              // Use setTimeout to ensure state is updated, then trigger animation immediately
              setTimeout(() => {
                  if (onAllScheduleCompleted) {
                      onAllScheduleCompleted();
                  }
              }, 0);
          }
          
          return updated;
      });

      setTop3Items(prev => {
          let updated: Top3Item[];
          if (isPriorityToggle) {
              updated = prev.map(item => item.id === itemId ? { ...item, completed: newStatus } : item);
          } else {
              const bestIds = matchingIds(prev.map(item => ({ id: item.id, title: item.text })));
              if (bestIds.length === 0) return prev;
              updated = prev.map(item => bestIds.includes(item.id) ? { ...item, completed: newStatus } : item);
          }
          
          // Check if all priorities are now completed - trigger confetti immediately
          if (newStatus && updated.length > 0 && updated.every(item => item.completed)) {
              // Use setTimeout to ensure state is updated, then trigger confetti immediately
              setTimeout(() => {
                  if (onAllPrioritiesCompleted) {
                      onAllPrioritiesCompleted();
                  }
              }, 0);
          }
          
          return updated;
      });

      if (newStatus) {
          handleProactiveAIMessage(`SYSTEM_ALERT:USER_COMPLETED_TASK:Type='General', Task='${itemTitle}'`);
      }
    }, [googleCalendarEvents, handleProactiveAIMessage, onAllPrioritiesCompleted, onAllScheduleCompleted]);
    
    const handleSimpleToggle = useCallback(
      <T extends { id: string; completed: boolean }>(id: string, items: T[], setItems: React.Dispatch<React.SetStateAction<T[]>>) =>
        setItems(items.map(item => item.id === id ? { ...item, completed: !item.completed } : item)),
      []
    );

    const handleReminderBriefingPreferenceChange = useCallback((id: string, preference: ReminderBriefingPreference) => {
      setReminders(prev => prev.map(item => item.id === id ? { ...item, includeInBriefing: preference } : item));
    }, []);
    
    const handleDelegatedTaskToggle = useCallback(async (taskId: string) => {
        const taskToToggle = delegatedTasks.find(t => t.id === taskId);
        if (!taskToToggle) return;

        const nextCompleted = !taskToToggle.completed;
        const nextStatus: DelegatedTaskItem['status'] = nextCompleted ? 'completed' : 'not_started';
        const nextTasks = delegatedTasks.map(task =>
          task.id === taskId ? { ...task, completed: nextCompleted, status: nextStatus } : task
        );
        setDelegatedTasks(nextTasks);
        setProjects(prev => updateProjectsFromTasks(prev, nextTasks));

        if (nextCompleted) {
          handleProactiveAIMessage(`SYSTEM_ALERT:USER_COMPLETED_TASK:Type='Delegated', Task='${taskToToggle.text}'`);
        }

        if (taskToToggle.googleTaskId) {
            const token = session?.provider_token;
            if (token && taskListIdRef.current) {
                try {
                    await updateTask(token, taskListIdRef.current, taskToToggle.googleTaskId, { status: nextCompleted ? 'completed' : 'needsAction' });
                    console.log(`Task ${taskToToggle.googleTaskId} updated in Google Tasks.`);
                } catch (error: any) {
                    console.error('Failed to sync task completion to Google Tasks:', error);
                    setNotificationModal({ isOpen: true, title: 'Sync Failed', message: `Could not update task in Google Tasks. Please try again.` });
                    const revertedTasks = delegatedTasks.map(task =>
                      task.id === taskId ? { ...task, completed: taskToToggle.completed, status: taskToToggle.status } : task
                    );
                    setDelegatedTasks(revertedTasks);
                    setProjects(prev => updateProjectsFromTasks(prev, revertedTasks));
                    if (isTasksApiDisabled(error)) {
                        return;
                    }
                    if (isGoogleAuthError(error)) {
                        onGoogleAuthError();
                    }
                }
            } else {
                 console.warn("No Google token or taskListId, skipping task completion sync.");
            }
        } else {
            console.warn(`Task ${taskId} does not have a googleTaskId, cannot sync completion.`);
        }
    }, [delegatedTasks, session, onGoogleAuthError, handleProactiveAIMessage]);

    const handleDelegatedTaskStatusChange = useCallback(async (taskId: string, status: DelegatedTaskItem['status']) => {
      const taskToUpdate = delegatedTasks.find(task => task.id === taskId);
      if (!taskToUpdate) return;
      const completed = status === 'completed';
      if (completed && !taskToUpdate.completed) {
        handleProactiveAIMessage(`SYSTEM_ALERT:USER_COMPLETED_TASK:Type='Delegated', Task='${taskToUpdate.text}'`);
      }
      const nextTasks = delegatedTasks.map(task => task.id === taskId ? { ...task, status, completed } : task);
      setDelegatedTasks(nextTasks);
      setProjects(prev => updateProjectsFromTasks(prev, nextTasks));

      if (taskToUpdate.googleTaskId) {
        const token = session?.provider_token;
        if (token && taskListIdRef.current) {
          try {
            await updateTask(token, taskListIdRef.current, taskToUpdate.googleTaskId, { status: completed ? 'completed' : 'needsAction' });
          } catch (error: any) {
            console.error('Failed to sync task status to Google Tasks:', error);
            if (isTasksApiDisabled(error)) {
              return;
            }
            if (isGoogleAuthError(error)) {
              onGoogleAuthError();
            }
          }
        }
      }
    }, [delegatedTasks, session, onGoogleAuthError, handleProactiveAIMessage]);

    const handleDelegatedTaskRemarksChange = useCallback((taskId: string, remarks: string) => {
      setDelegatedTasks(prev => prev.map(task => task.id === taskId ? { ...task, remarks } : task));
    }, []);

    const handleDelegatedTaskDeadlineChange = useCallback((taskId: string, deadline: string) => {
      setDelegatedTasks(prev => prev.map(task => task.id === taskId ? { ...task, deadline: deadline.trim() || 'TBD' } : task));
    }, []);
    
    const handleConfirmPlan = useCallback(async () => {
      // Use ONLY the drafted items from the AI's JSON response - no text parsing fallback
      // The draftedSchedule and draftedPriorities are already correctly parsed from the AI's response
      // Store them in local variables before clearing state
      const scheduleToFinalize = draftedSchedule && draftedSchedule.length > 0 ? draftedSchedule : null;
      const prioritiesToFinalize = draftedPriorities && draftedPriorities.length > 0 ? draftedPriorities : null;
      
      if (scheduleToFinalize) {
        setScheduleItems(scheduleToFinalize);
      }
      if (prioritiesToFinalize) {
        setTop3Items(prioritiesToFinalize);
      }

      // Clear drafted items after finalization
      setDraftedSchedule(null);
      setDraftedPriorities(null);

      setIsScheduleConfirmed(true);
      
      // Force immediate save to cloud state after finalization - save directly with finalized data
      // Save immediately with the finalized data to ensure persistence on refresh
      const stateToSave: DashboardState = {
        chatMessages, chatHistory, 
        scheduleItems: scheduleToFinalize || scheduleItems, 
        top3Items: prioritiesToFinalize || top3Items, 
        reminders, projects, completedProjects, keepNotes, delegatedTasks,
        team: userProfile.team, hasGreeted, lastResetDate, isScheduleConfirmed: true, briefingInputs, briefingState,
        collapsedCards, weeklyLog, priorityForTomorrow, stateVersion: DASHBOARD_STATE_VERSION,
        completedGCalEventIds: Array.from(completedGCalEventIds),
        currentMode, modeHistory, modeActivatedAt,
        nudgedTaskIds: Array.from(nudgedTaskIds),
        notifiedEventIds: Array.from(notifiedEventIds),
        nudgedDelegatedTaskIds: Array.from(nudgedDelegatedTaskIds),
        suppressCalendarFetch
      };
      // Save immediately - don't wait for useEffect
      saveDashboardState(userProfile.id, stateToSave).catch((err: any) => console.error("Failed to save state after finalization:", err));
      
      // Also trigger force save flag for the useEffect to catch any subsequent state changes
      forceSaveRef.current = true;
      
      const currentAccessToken = session?.provider_token || null;
      // Use the finalized schedule for calendar sync
      const scheduleToSync = scheduleToFinalize || scheduleItems;
      if (scheduleToSync.length === 0) { 
        console.warn("No schedule items to sync.");
        return; 
      }
      
      try {
        setIsSyncing(true);
        await batchAddEventsToCalendar(currentAccessToken, scheduleToSync);
        setNotificationModal({
            isOpen: true,
            title: 'Sync Successful',
            message: 'Your schedule has been successfully synced with your Google Calendar.'
        });
      } catch (error: any) { 
          console.error('Error during calendar sync:', error);
          if (error.status === 401 || error.status === 403) {
              setCloudError("Your Google connection has expired. Please reconnect.");
              onGoogleAuthError();
          } else {
              setCloudError(`Failed to sync schedule: ${error.message}. Please try reconnecting your Google account.`);
          }
      } finally { 
        setIsSyncing(false); 
      }
    }, [session, scheduleItems, draftedSchedule, draftedPriorities, onGoogleAuthError]);
    
    useEffect(() => {
      if (cloudError || isCloudLoading) return;
      const nowForEventOps = new Date();
      const todayYmd = toYmdLocal(nowForEventOps);
      if (eventOpsItems.length > 0 && lastEventOpsNudgeDate !== todayYmd) {
        const upcomingSummary = eventOpsItems
          .slice(0, 6)
          .map(item => {
            const label = item.kind === 'event' ? 'Event' : 'Meeting';
            const timePart = item.kind === 'event' && item.serving_time ? ` • Serving ${String(item.serving_time).slice(0, 5)}` : '';
            const locationPart = item.location ? ` • ${item.location}` : '';
            return `- ${item.event_date}: ${label} — ${item.name}${timePart}${locationPart}`;
          })
          .join('\n');

        const messageText =
          `Heads up — here are your upcoming **Event Ops** items (next 7 days):\n\n${upcomingSummary}\n\nWant me to add prep tasks to your **Today’s Schedule**?`;

        setChatMessages(prev => [
          ...prev,
          { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: messageText }
        ]);
        setLastEventOpsNudgeDate(todayYmd);
      }
  
      const parseGenericDate = (dateString: string): Date | null => {
        const today = new Date();
        today.setHours(17, 0, 0, 0); // Default to 5 PM
        
        const lowerCaseDate = dateString.toLowerCase();
        
        if (lowerCaseDate === 'today' || lowerCaseDate === 'eod today') {
            return today;
        }
    
        if (lowerCaseDate === 'tomorrow') {
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            return tomorrow;
        }
    
        const parsedDate = new Date(dateString);
        if (!isNaN(parsedDate.getTime())) {
            parsedDate.setHours(17, 0, 0, 0);
            return parsedDate;
        }
    
        return null; 
    };
  
      const parseTime = (timeString: string, date: Date): Date => {
          const timeStr = timeString.trim().toLowerCase();
          
          const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
      
          if (!match) {
              console.warn(`Proactive AI could not parse time: "${timeString}"`);
              return new Date('invalid');
          }
      
          let hours = parseInt(match[1], 10);
          const minutes = match[2] ? parseInt(match[2], 10) : 0;
          const modifier = match[3];
      
          if (modifier === 'pm' && hours < 12) {
              hours += 12;
          }
          if (modifier === 'am' && hours === 12) {
              hours = 0; // Midnight case
          }
          // Simple heuristic for times without am/pm, e.g., "4" becomes 4 PM.
          if (!modifier && hours >= 1 && hours <= 7) {
              hours += 12;
          }
      
          const eventDate = new Date(date);
          eventDate.setHours(hours, minutes, 0, 0);
          return eventDate;
      };
  
      const timer = setInterval(() => {
          const now = new Date();
          scheduleItems.forEach(item => {
              if (item.completed || notifiedEventIds.has(item.id)) return;
              const startTimeString = item.time.split(' - ')[0]?.trim();
              if (!startTimeString) return;
              const eventTime = parseTime(startTimeString, now);
              const minutesUntilEvent = (eventTime.getTime() - now.getTime()) / (1000 * 60);
              if (minutesUntilEvent > 0 && minutesUntilEvent <= 15) {
                  const isFocusBlock = item.title.toLowerCase().includes('focus block');
                  const prompt = isFocusBlock ? `SYSTEM_ALERT:FOCUS_BLOCK_STARTING:Title='${item.title}', StartTime='${startTimeString}'` : `SYSTEM_ALERT:UPCOMING_MEETING:Title='${item.title}', StartTime='${startTimeString}'`;
                  handleProactiveAIMessage(prompt);
                  setNotifiedEventIds(prev => new Set(prev).add(item.id));
              }
          });
          if (now.getHours() >= 16) { 
              const incompletePriorities = top3Items.filter(item => !item.completed && !nudgedTaskIds.has(item.id));
              incompletePriorities.forEach(item => {
                  handleProactiveAIMessage(`SYSTEM_ALERT:DEADLINE_NUDGE:Item='${item.text}'`);
                  setNudgedTaskIds(prev => new Set(prev).add(item.id));
              });
          }
          delegatedTasks.forEach(task => {
              if (task.completed || nudgedDelegatedTaskIds.has(task.id)) return;
              const deadlineDate = parseGenericDate(task.deadline);
              if (deadlineDate) {
                  const hoursUntilDeadline = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);
                  if (hoursUntilDeadline > 0 && hoursUntilDeadline <= 24) {
                      handleProactiveAIMessage(`SYSTEM_ALERT:DELEGATED_TASK_DUE:Assignee='${task.assigneeName}', Task='${task.text}', Deadline='${task.deadline}'`);
                      setNudgedDelegatedTaskIds(prev => new Set(prev).add(task.id));
                  } else if (hoursUntilDeadline < 0 && hoursUntilDeadline >= -24) {
                      handleProactiveAIMessage(`SYSTEM_ALERT:DELEGATED_TASK_OVERDUE:Assignee='${task.assigneeName}', Task='${task.text}', Deadline='${task.deadline}'`);
                      setNudgedDelegatedTaskIds(prev => new Set(prev).add(task.id));
                  }
              }
          });
          projects.forEach(project => {
            if (nudgedDelegatedTaskIds.has(project.id)) return;
            const deadlineDate = parseGenericDate(project.deadline);
            if (deadlineDate) {
              const daysUntilDeadline = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
              const totalMilestones = project.milestones.length;
              if (totalMilestones > 0) {
                const completedMilestones = project.milestones.filter(m => m.progress === 100).length;
                const progress = (completedMilestones / totalMilestones) * 100;
                if (daysUntilDeadline <= 7 && progress < 50) {
                  handleProactiveAIMessage(`SYSTEM_ALERT:PROJECT_AT_RISK:ProjectName='${project.name}', Deadline='${project.deadline}', Progress='${Math.round(progress)}%'`);
                  setNudgedDelegatedTaskIds(prev => new Set(prev).add(project.id));
                }
              }
            }
          });
      }, 60 * 1000);
      return () => clearInterval(timer);
    }, [scheduleItems, top3Items, delegatedTasks, projects, notifiedEventIds, nudgedTaskIds, nudgedDelegatedTaskIds, isCloudLoading, cloudError, handleProactiveAIMessage, eventOpsItems, lastEventOpsNudgeDate, toYmdLocal]);

    const handleStopGeneration = useCallback(() => {
      generationRequestRef.current = null;
      briefingFinalizeRequestRef.current = null;
      if (briefingFinalizeTimeoutRef.current) {
        clearTimeout(briefingFinalizeTimeoutRef.current);
      }
      setIsSending(false);
    }, []);
  
    const handleManualReset = useCallback(() => {
        resetDailyState();
        setShowResetConfirm(false);
        setNotificationModal({
            isOpen: true,
            title: "Day Reset",
            message: "Your daily progress, schedule, and priorities have been successfully reset."
        });
    }, [resetDailyState]);

    const handleClearSchedule = useCallback(() => {
        setScheduleItems([]);
        setDraftedSchedule(null);
        setGoogleCalendarEvents([]);
        setCompletedGCalEventIds(new Set());
        setSuppressCalendarFetch(true);
        setShowScheduleClearConfirm(false);
    }, []);

    const createScheduleItem = useCallback((item: { time: string; title: string }) => {
        const title = item.title.trim();
        if (!title) return;
        const time = item.time.trim() || 'All Day';
        const id = `sched-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        setScheduleItems(prev => [...prev, { id, time, title, completed: false }]);
    }, []);

    const updateScheduleItem = useCallback((id: string, updates: Partial<Pick<ScheduleItem, 'time' | 'title' | 'completed'>>) => {
        setScheduleItems(prev =>
            prev.map(item => {
                if (item.id !== id) return item;
                const nextTime = typeof updates.time === 'string' ? updates.time.trim() : item.time;
                const nextTitle = typeof updates.title === 'string' ? updates.title.trim() : item.title;
                return { ...item, ...updates, time: nextTime || 'All Day', title: nextTitle || item.title };
            })
        );
    }, []);

    const deleteScheduleItem = useCallback((id: string) => {
        setScheduleItems(prev => prev.filter(item => item.id !== id));
    }, []);

    const refreshGoogleCalendarEvents = useCallback(async () => {
        const token = session?.provider_token;
        if (!token) {
            setNotificationModal({
                isOpen: true,
                title: 'Google Not Connected',
                message: 'Connect Google to fetch your calendar events.'
            });
            return;
        }

        try {
            const events = await getTodaysEvents(token);
            setGoogleCalendarEvents(events);
        } catch (error: any) {
            console.error("Failed to fetch Google Calendar events:", error);
            if (error?.message?.includes('401') || error?.message?.includes('403') || error?.status === 401 || error?.status === 403) {
                onGoogleAuthError();
                return;
            }
            setCloudError(`Failed to fetch Google Calendar events: ${error?.message || error}`);
        }
    }, [session, onGoogleAuthError]);

    const syncScheduleToGoogleCalendar = useCallback(async (scheduleOverride?: ScheduleItem[]) => {
        const token = session?.provider_token;
        if (!token) {
            setNotificationModal({
                isOpen: true,
                title: 'Google Not Connected',
                message: 'Connect Google to sync your schedule.'
            });
            return;
        }

        const scheduleToSync = (scheduleOverride ?? scheduleItems).filter(item => !item.isGoogleEvent);
        if (scheduleToSync.length === 0) {
            setNotificationModal({
                isOpen: true,
                title: 'Nothing To Sync',
                message: 'There are no local schedule items to sync.'
            });
            return;
        }

        try {
            setIsSyncing(true);
            await batchAddEventsToCalendar(token, scheduleToSync);
            setNotificationModal({
                isOpen: true,
                title: 'Sync Successful',
                message: 'Your schedule has been successfully synced with your Google Calendar.'
            });
        } catch (error: any) {
            console.error('Error during calendar sync:', error);
            if (error?.status === 401 || error?.status === 403) {
                setCloudError("Your Google connection has expired. Please reconnect.");
                onGoogleAuthError();
                return;
            }
            setCloudError(`Failed to sync schedule: ${error?.message || error}. Please try reconnecting your Google account.`);
        } finally {
            setIsSyncing(false);
        }
    }, [session, scheduleItems, onGoogleAuthError]);

    const clearGoogleCalendarEvents = useCallback(() => {
        setGoogleCalendarEvents([]);
        setCompletedGCalEventIds(new Set());
    }, []);
    const handleClearPriorities = useCallback(() => { 
        setTop3Items([]); 
        setDraftedPriorities(null); // Also clear drafted priorities so they don't reappear on refresh
        setShowPrioritiesClearConfirm(false); 
    }, []);
    const handleClearReminders = useCallback(() => { setReminders([]); setShowRemindersClearConfirm(false); }, []);
    const handleClearKeepNotes = useCallback(() => {
        setKeepNotes('');
        setBriefingState('idle');
        setShowKeepResetConfirm(false);
    }, []);
    const handleConfirmDeleteProject = useCallback(() => {
        if (projectToDelete) {
            setProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
            setProjectToDelete(null);
        }
    }, [projectToDelete]);

    const handleClearDelegatedTasks = useCallback(async () => {
        const tasksToClear = [...delegatedTasks]; // Make a copy before clearing state
        setShowDelegatedClearConfirm(false);
        setDelegatedTasks([]); // Optimistic UI update
        
        const token = session?.provider_token;
        if (!token || !taskListIdRef.current) {
            setNotificationModal({ isOpen: true, title: 'Cleared Locally', message: 'Tasks were cleared on the dashboard. Google Tasks sync is unavailable right now.' });
            return;
        }

        const deletionPromises = tasksToClear
            .filter(task => task.googleTaskId)
            .map(task => deleteTask(token, taskListIdRef.current!, task.googleTaskId!));

        try {
            await Promise.all(deletionPromises);
            setNotificationModal({ isOpen: true, title: 'Success', message: 'All delegated tasks have been cleared.' });
        } catch (error: any) {
            console.error("Failed to clear some tasks in Google Tasks:", error);
            setNotificationModal({ isOpen: true, title: 'Partial Sync Error', message: 'Tasks were cleared from the dashboard, but we failed to clear them from Google Tasks.' });
            if (isTasksApiDisabled(error)) {
                return;
            }
            if (isGoogleAuthError(error)) {
                onGoogleAuthError();
            }
        }
    }, [delegatedTasks, session, onGoogleAuthError]);
  
    const handleCreateReminderFromText = useCallback((text: string) => {
      const loggedAt = getBriefingNowOverride() ?? Date.now();
      const newReminder: ReminderItem = {
        id: `rem-${Date.now()}`,
        text,
        completed: false,
        loggedAt,
        includeInBriefing: DEFAULT_REMINDER_BRIEFING_PREF,
      };
      setReminders(prev => [...prev, newReminder]);
      if (newReminder.includeInBriefing === 'none') {
        setNotificationModal({
          isOpen: true,
          title: 'Personal Reminder',
          message: `Reminder saved: ${text}`,
        });
        setChatMessages(prev => [
          ...prev,
          { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: `Personal reminder noted: ${text}` }
        ]);
      }
    }, []);
  
    const handleAddBriefingFromText = useCallback((text: string) => {
      const loggedAt = getBriefingNowOverride() ?? Date.now();
      setBriefingInputs(prev => [...prev, { id: `brief-item-${Date.now()}`, type: 'Logged from chat', text, loggedAt }]);
    }, []);
    
    const handleLogQuickAction = useCallback((value: string) => {
        const loggedAt = getBriefingNowOverride() ?? Date.now();
        setBriefingInputs(prev => [
          ...prev,
          { id: `brief-item-${Date.now()}`, type: quickActionModal.title, text: value, loggedAt }
        ]);
        setQuickActionModal({ isOpen: false, title: '', prefill: '' });
    }, [quickActionModal.title]);
    
    const handleMakeChanges = useCallback(() => handleSendMessage(undefined, "I'd like to make some changes to the schedule."), [handleSendMessage]);
    const handleConfirmProjectDraft = useCallback(async () => {
        if (!draftedProject) return;
        const nextTasks = dedupeDelegatedTasks([...delegatedTasks, ...draftedProjectTasks]);
        setDelegatedTasks(nextTasks);
        setProjects(prev => updateProjectsFromTasks([...prev, draftedProject], nextTasks));
        setDraftedProject(null);
        setDraftedProjectTasks([]);
        await syncDelegatedTasks(draftedProjectTasks);
    }, [draftedProject, draftedProjectTasks, delegatedTasks, syncDelegatedTasks]);

    const handleMakeProjectChanges = useCallback(() => {
        setDraftedProject(null);
        setDraftedProjectTasks([]);
        handleSendMessage(undefined, "I'd like to make changes to the project plan.");
    }, [handleSendMessage]);

    const handleProjectUpdate = useCallback((updatedProject: Project) => {
        setProjects(prev => prev.map(project => project.id === updatedProject.id ? updatedProject : project));
        setSelectedProject(null);
    }, []);

    const handleFinalizeBriefing = useCallback(() => {
        const trimmedNotes = keepNotes?.trim();
        const notesBlock = trimmedNotes ? `\n\n--- BRIEFING NOTES TO CONVERT ---\n${trimmedNotes}` : '';
        setBriefingScript('Generating briefing script...');
        setIsBriefingScriptVisible(true);
        if (briefingFinalizeTimeoutRef.current) {
            clearTimeout(briefingFinalizeTimeoutRef.current);
        }
        briefingFinalizeTimeoutRef.current = window.setTimeout(() => {
            setBriefingScript("This is taking longer than expected. Please try Finalize again.");
            setIsBriefingScriptVisible(true);
        }, 30000);
        handleSendMessage(
            undefined,
            `Finalize the briefing as talking points. Convert the briefing notes into a spoken script with numbered sections and bullet points. Use plain text only in the final output.${notesBlock}`
        );
    }, [handleSendMessage, keepNotes]);
    const handleChatInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => { 
        const textarea = e.target;
        setChatInput(textarea.value); 
        
        // Reset height to 'auto' first - this is crucial for shrinking
        textarea.style.height = 'auto';
        
        // Use requestAnimationFrame to ensure DOM has updated before calculating
        requestAnimationFrame(() => {
            // Calculate new height, ensuring it doesn't go below the default single-line height
            // scrollHeight includes padding, so we get the actual content height
            const newHeight = textarea.scrollHeight;
            textarea.style.height = `${newHeight}px`;
        });
    }, []);
    const handleChatKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }, [handleSendMessage]);
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) setAttachedFile(e.target.files[0]); e.target.value = ''; }, []);
    
    const openQuickActionModal = useCallback((title: string, prefill: string = '') => setQuickActionModal({ isOpen: true, title, prefill }), []);
    const handleModalConfirm = useCallback((value: string) => { 
        if (quickActionModal.title === 'Create New Reminder') {
          handleCreateReminderFromText(value);
        } else if (quickActionModal.title === 'Delegate Task') {
          handleSendMessage(undefined, `Delegate this task: "${value}"`);
        } else if (quickActionModal.title === 'Create a new project') {
          handleSendMessage(undefined, `PROJECT_DRAFT_REQUEST::${value}`);
        } else {
          handleLogQuickAction(value);
        }
        setQuickActionModal({ isOpen: false, title: '', prefill: '' });
    }, [quickActionModal.title, handleCreateReminderFromText, handleSendMessage, handleLogQuickAction]);

    const handleDailyKickoff = useCallback(async () => {
      // Clear any existing drafted plans first
      setDraftedSchedule(null);
      setDraftedPriorities(null);
      await handleSendMessage(undefined, "Time for my daily kick-off.");
    }, [handleSendMessage]);
    const handleToggleCard = useCallback((cardId: string) => setCollapsedCards(prev => ({ ...prev, [cardId]: !prev[cardId] })), []);

    // Mode Handlers
    const handleActivateMode = useCallback((mode: 'crisis' | 'strategic' | 'red-day') => {
        // Deactivate current mode if any
        if (currentMode && modeActivatedAt) {
            setModeHistory(prev => [
                ...prev,
                { mode: currentMode, activatedAt: modeActivatedAt, deactivatedAt: Date.now() }
            ]);
        }
        
        setCurrentMode(mode);
        setModeActivatedAt(Date.now());
        
        // Build role-specific context from user profile
        const roleContext = `The user is a ${userProfile.role}. Their core responsibilities include: ${userProfile.responsibilities}. Their daily tasks: ${userProfile.dailyTasks}.`;
        
        // Mode-specific workflow prompts tailored to user's role
        const modePrompts = {
            crisis: `SYSTEM: User has activated CRISIS MODE. ${roleContext} You MUST respond in Crisis Mode style: be concise, urgent, bullet-pointed, action-focused. 

First, briefly explain: "CRISIS MODE is for urgent issues needing immediate action - equipment failures, staff emergencies, critical incidents. I'll focus on rapid-fire solutions and action steps."

Then based on their role as ${userProfile.role}, ask them about the SPECIFIC crisis situation they're facing (e.g., equipment failure, staff shortage, inventory emergency, operational disruption, quality incident). Keep your total response under 5 sentences and make questions ROLE-SPECIFIC.`,
            
            strategic: `SYSTEM: User has activated STRATEGIC MODE. ${roleContext} You MUST respond in Strategic Mode style: be analytical, thoughtful, consider long-term implications.

First, briefly explain: "STRATEGIC MODE is for long-term planning, process analysis, and important decisions. I'll provide deep analysis with pros/cons and future implications."

Then based on their role as ${userProfile.role}, ask what strategic area they want to explore: operational improvements, process optimization, team development, resource planning, quality enhancement, or system improvements. Make your questions ROLE-SPECIFIC and analytical.`,
            
            'red-day': `SYSTEM: User has activated RED DAY MODE. ${roleContext} You MUST respond in Red Day Mode style: be supportive, understanding, stress-aware.

First, briefly explain: "RED DAY MODE is for when you're overwhelmed. I'll help prioritize what truly matters, suggest what to delegate or defer, and lighten your load."

Then based on their role as ${userProfile.role}, acknowledge their typical workload (briefings, operations oversight, team management, administrative tasks) and ask what aspect feels most overwhelming right now. Be empathetic and ROLE-SPECIFIC in your support.`
        };
        
        handleSendMessage(undefined, modePrompts[mode]);
    }, [currentMode, modeActivatedAt, handleSendMessage, userProfile]);

    const handleDeactivateMode = useCallback(() => {
        if (currentMode && modeActivatedAt) {
            setModeHistory(prev => [
                ...prev,
                { mode: currentMode, activatedAt: modeActivatedAt, deactivatedAt: Date.now() }
            ]);
        }
        setCurrentMode(null);
        setModeActivatedAt(undefined);
        
        // Send a confirmation message
        const userMessage: ChatMessage = {
            id: Date.now(),
            role: 'user',
            text: 'Exit mode'
        };
        setChatMessages(prev => [...prev, userMessage]);
        
        const assistantMessage: ChatMessage = {
            id: Date.now() + 1,
            role: 'model',
            text: "Mode deactivated. I'm back to my normal operational mode. How can I assist you?"
        };
        setChatMessages(prev => [...prev, assistantMessage]);
    }, [currentMode, modeActivatedAt]);

    // Auto-deactivation: Check mode duration every minute
    useEffect(() => {
        if (!currentMode || !modeActivatedAt) return;
        
        const checkInterval = setInterval(() => {
            const now = Date.now();
            const durationMs = now - modeActivatedAt;
            const durationHours = durationMs / (1000 * 60 * 60);
            
            // Auto-deactivate Crisis Mode after 2 hours
            if (currentMode === 'crisis' && durationHours >= 2) {
                handleDeactivateMode();
                const notificationMessage: ChatMessage = {
                    id: Date.now(),
                    role: 'model',
                    text: "Crisis Mode has been automatically deactivated after 2 hours. If you still need urgent assistance, you can reactivate it anytime."
                };
                setChatMessages(prev => [...prev, notificationMessage]);
            }
            
            // Auto-deactivate at end of day (5 PM or later)
            const currentHour = new Date().getHours();
            if (currentHour >= 17 && durationHours >= 1) {
                handleDeactivateMode();
                const notificationMessage: ChatMessage = {
                    id: Date.now(),
                    role: 'model',
                    text: `${currentMode === 'crisis' ? 'Crisis Mode' : currentMode === 'strategic' ? 'Strategic Mode' : 'Red Day Mode'} has been automatically deactivated at end of day. See you tomorrow!`
                };
                setChatMessages(prev => [...prev, notificationMessage]);
            }
        }, 60000); // Check every minute
        
        return () => clearInterval(checkInterval);
    }, [currentMode, modeActivatedAt, handleDeactivateMode]);

    const handleCreateWeeklyReport = useCallback(async () => {
        // Clear previous email version for new report
        setEmailVersion('');
        
        // Calculate week range
        const today = new Date();
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday
        const weekStart = new Date(today.setDate(diff));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const weekRange = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        
        // Add user message and friendly assistant acknowledgment
        const userMessage: ChatMessage = {
            id: Date.now(),
            role: 'user',
            text: 'Create my weekly report.'
        };
        setChatMessages(prev => [...prev, userMessage]);
        
        const assistantAck: ChatMessage = {
            id: Date.now() + 1,
            role: 'model',
            text: `Perfect timing! Let me pull together your weekly report for ${weekRange}. I'll compile your accomplishments, project updates, and key metrics from this week...`
        };
        setChatMessages(prev => [...prev, assistantAck]);
        
        // Auto-populate data from dashboard
        const completedTasks = delegatedTasks.filter(t => t.completed).length;
        const totalTasks = delegatedTasks.length;
        const completedProjects = projects.filter(p => {
            const avgProgress = p.milestones.length > 0 
                ? p.milestones.reduce((sum, m) => sum + (Number(m.progress) || 0), 0) / p.milestones.length 
                : 0;
            return avgProgress >= 100;
        });
        
        const projectUpdates = projects.map(p => {
            const avgProgress = p.milestones.length > 0 
                ? Math.round(p.milestones.reduce((sum, m) => sum + (Number(m.progress) || 0), 0) / p.milestones.length)
                : 0;
            const nextMilestone = p.milestones.find(m => (Number(m.progress) || 0) < 100);
            return {
                name: p.name,
                progress: avgProgress,
                status: avgProgress === 100 ? 'Completed' : avgProgress >= 75 ? 'On Track' : avgProgress >= 50 ? 'In Progress' : 'Starting',
                nextMilestone: nextMilestone?.text
            };
        });
        
        const accomplishments = weeklyLog.filter(log => log.type === 'accomplishment').map(log => log.text);
        const challenges = weeklyLog.filter(log => log.type === 'challenge').map(log => log.text);
        
        // Calculate mode usage for the week
        const weekStartTime = weekStart.getTime();
        const weekEndTime = weekEnd.getTime();
        const weekModeHistory = modeHistory.filter(entry => {
            const activatedInWeek = entry.activatedAt >= weekStartTime && entry.activatedAt <= weekEndTime;
            const deactivatedInWeek = entry.deactivatedAt && entry.deactivatedAt >= weekStartTime;
            return activatedInWeek || deactivatedInWeek;
        });
        
        const modeStats = {
            crisis: weekModeHistory.filter(m => m.mode === 'crisis').length,
            strategic: weekModeHistory.filter(m => m.mode === 'strategic').length,
            redDay: weekModeHistory.filter(m => m.mode === 'red-day').length
        };
        
        // Extract chat context for each mode session
        const modeSessionDetails = weekModeHistory.map(entry => {
            const modeName = entry.mode === 'crisis' ? 'Crisis' : entry.mode === 'strategic' ? 'Strategic' : 'Red Day';
            const activatedDate = new Date(entry.activatedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const duration = entry.deactivatedAt 
                ? Math.round((entry.deactivatedAt - entry.activatedAt) / (1000 * 60)) + ' minutes'
                : 'still active';
            
            // Find chat messages that occurred during this mode session
            const sessionEndTime = entry.deactivatedAt || Date.now();
            const sessionMessages = chatMessages.filter(msg => {
                // Messages have id as timestamp
                return msg.id >= entry.activatedAt && msg.id <= sessionEndTime && !msg.text.startsWith('SYSTEM:');
            });
            
            // Extract user messages and assistant responses to understand the context
            const userMessages = sessionMessages.filter(msg => msg.role === 'user').map(msg => msg.text);
            const assistantMessages = sessionMessages.filter(msg => msg.role === 'model').map(msg => msg.text);
            
            return {
                modeName,
                activatedDate,
                duration,
                userMessages: userMessages.slice(0, 5), // First 5 messages to understand context
                assistantMessages: assistantMessages.slice(0, 5),
                messageCount: sessionMessages.length
            };
        });
        
        const modeSummary = weekModeHistory.length > 0 ? `
Mode Usage This Week (${modeStats.crisis + modeStats.strategic + modeStats.redDay} total activations):
- Crisis Mode: ${modeStats.crisis} time${modeStats.crisis !== 1 ? 's' : ''} (urgent operational issues)
- Strategic Mode: ${modeStats.strategic} time${modeStats.strategic !== 1 ? 's' : ''} (planning and analysis)
- Red Day Mode: ${modeStats.redDay} time${modeStats.redDay !== 1 ? 's' : ''} (workload management)

DETAILED MODE SESSIONS:
${modeSessionDetails.map((session, idx) => `
Session ${idx + 1}: ${session.modeName} Mode
- When: ${session.activatedDate}
- Duration: ${session.duration}
- Chat Activity: ${session.messageCount} messages exchanged
- User's Key Topics/Issues: ${session.userMessages.length > 0 ? session.userMessages.join(' | ') : 'No specific messages logged'}
- Assistant's Responses: ${session.assistantMessages.length > 0 ? session.assistantMessages.slice(0, 2).join(' | ') : 'No responses logged'}
`).join('\n')}` : 'No special modes activated this week.';
        
        // Detailed prompt for AI (sent internally)
        const aiPrompt = `SYSTEM: Generate a comprehensive weekly report for the week of ${weekRange}. Use the following data:
- Completed Tasks: ${completedTasks} of ${totalTasks} delegated tasks
- Active Projects: ${projects.length} (${completedProjects.length} completed)
- Weekly Log Entries: ${weeklyLog.length} items (${accomplishments.length} accomplishments, ${challenges.length} challenges)

${modeSummary}

Project Details:
${projectUpdates.map(p => `- ${p.name}: ${p.progress}% progress, ${p.status}${p.nextMilestone ? `, Next: ${p.nextMilestone}` : ''}`).join('\n')}

CRITICAL INSTRUCTIONS FOR MODE ACTIVITY SECTION:
${weekModeHistory.length > 0 ? `
The user activated special operational modes this week (Crisis/Strategic/Red Day). This is VERY IMPORTANT context.

For the "modeActivity" field in the weekly report, you MUST:
1. Analyze each mode session listed above to understand WHAT happened
2. Explain HOW the user handled each situation based on the chat messages
3. Identify and describe the SOLUTIONS or ACTIONS taken during each mode
4. Write this as a narrative paragraph (not bullet points) that tells the story of the week's intensity
5. Focus on outcomes and resolutions, not just that modes were activated
6. Use professional language suitable for management reporting

Example format: "This week required elevated operational focus with [X] crisis responses and [Y] strategic planning sessions. During the crisis mode activations on [dates], the team addressed [issues mentioned in chat]. Solutions implemented included [actions from assistant responses]. Strategic planning sessions focused on [topics from strategic mode chats], resulting in [outcomes]. The red day mode on [date] helped prioritize [workload items] effectively."

If you cannot determine specific details from the chat messages, provide a general professional summary of the mode usage and its implications for the week's operations.
` : 'No special modes were activated this week.'}

CRITICAL: Your response MUST be a JSON object with EXACTLY this structure:
{
  "text": "A friendly message confirming the report is ready (e.g., 'All done! Your weekly report is ready. I've compiled X accomplishments, Y projects, and Z action items...')",
  "weeklyReport": {
    "summary": "Executive summary of the week as a string",
    "accomplishments": ["accomplishment 1", "accomplishment 2", "..."],
    "challenges": ["challenge 1", "challenge 2", "..."],
    "projects": [
      {
        "name": "Project Name",
        "progress": 75,
        "status": "On Track",
        "nextMilestone": "Next milestone description"
      }
    ],
    ${weekModeHistory.length > 0 ? `"modeActivity": "REQUIRED - Narrative paragraph explaining: 1) What operational challenges arose (from chat messages), 2) How they were handled (actions taken), 3) Solutions implemented (outcomes). Be specific and professional. This should be a comprehensive paragraph, not bullet points.",` : ''}
    "nextSteps": ["action item 1", "action item 2", "..."],
    "weekRange": "${weekRange}"
  }
}

IMPORTANT RULES:
1. You MUST include BOTH the "text" and "weeklyReport" fields at the top level
2. The "weeklyReport" object MUST include ALL required fields
3. ${weekModeHistory.length > 0 ? 'The "modeActivity" field is MANDATORY when modes were used - analyze the chat messages and write a professional narrative' : 'Omit the "modeActivity" field'}
4. Make the report comprehensive and professional
5. Arrays can be empty [] if no data is available, but they must be present`;

        // Send the detailed prompt - handleSendMessage will convert "SYSTEM:" prompts to user-friendly messages
        await handleSendMessage(undefined, aiPrompt);
    }, [handleSendMessage, delegatedTasks, projects, weeklyLog, modeHistory, chatMessages]);

    const handleGenerateEmailReport = useCallback(async (report: WeeklyReport): Promise<string | null> => {
        setEmailVersion(''); // Clear previous email version
        const reportJson = JSON.stringify(report, null, 2);
        
        const prompt = `Transform the following weekly report into a professional email format suitable for sending to management or stakeholders.

CRITICAL INSTRUCTIONS:
- Format it as a complete email with Subject line, greeting, body, and signature
- The email should look like a real professional email, not a report document
- Include placeholders [Recipient Name], [Your Name], and [Your Job Title] for personalization
- Use proper email formatting with clear sections
- **IF modeActivity field is present**: This is CRITICAL context showing crisis situations, strategic planning, or high-workload periods. Integrate this prominently as a dedicated section or weave it naturally into the narrative

REQUIRED EMAIL STRUCTURE:
Subject: Weekly Report: [Week Range]

Dear [Recipient Name],

[Opening paragraph introducing the report and setting context - if modeActivity exists, mention it here: e.g., "This week presented several challenges requiring elevated operational response..." or "This was a particularly intensive week..."]

[Executive Summary section - transform the summary into a natural paragraph]

${report.modeActivity ? `
**Operational Context & Challenge Resolution**
[IF modeActivity field exists in the report, include a dedicated section here that presents the mode activity information professionally. This section should explain:
- What operational challenges or strategic needs arose
- How they were handled (crisis response, strategic planning, workload management)
- What solutions or actions were taken
- The outcomes or current status
Format this naturally as paragraph(s), not as technical "mode activation" language. Frame it as professional operational reporting.]
` : ''}

[Accomplishments section - if any, format as a bulleted list with strong action verbs]

[Challenges section - if any, format clearly with context about how they're being addressed]

[Projects section - if any, format as a table or clear list with progress indicators]

Next Steps & Action Items
[Moving forward section - transform nextSteps into formatted, actionable bullet points]

Best regards,

[Your Name]
[Your Job Title]

IMPORTANT: Your response MUST be a valid JSON object with the following structure:
{
  "text": "Email version generated successfully",
  "emailVersion": "[the complete email text here with line breaks]"
}

Here's the current report data:
${reportJson}`;
        
        try {
            const minimalState: DashboardState = {
                chatMessages: [],
                chatHistory: [],
                scheduleItems: [],
                top3Items: [],
                reminders: [],
                projects: [],
                completedProjects: [],
                keepNotes: '',
                delegatedTasks: [],
                team: userProfile.team,
                hasGreeted: false,
                lastResetDate: '',
                isScheduleConfirmed: false,
                briefingInputs: [],
                briefingState: 'idle',
                collapsedCards: {},
                weeklyLog: [],
                priorityForTomorrow: '',
                stateVersion: DASHBOARD_STATE_VERSION,
                completedGCalEventIds: []
            };

            const historyForRequest: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
            const response = await sendMessageToGemini(historyForRequest, { ...userProfile, team: userProfile.team }, minimalState, [], new Date(), session?.provider_token || null, eventOpsItems);
            
            if (response?.isError) {
                console.error('AI returned error:', response);
                throw new Error(response.text || 'Failed to generate email version.');
            }
            
            console.log('AI response for email generation:', response);
            
            if (response.emailVersion) {
                console.log('Email version generated successfully');
                setEmailVersion(response.emailVersion);
                return response.emailVersion;
            }
            
            // Fallback: try to extract from text field if emailVersion not found
            if (response.text && response.text.includes('Subject:')) {
                setEmailVersion(response.text);
                return response.text;
            }
            
            console.warn('AI did not return emailVersion field. Response:', response);
            throw new Error('The AI did not generate an email version. Please try again.');
        } catch (error) {
            console.error('Failed to generate email version:', error);
            throw error;
        }
    }, [userProfile, session]);

    const handleClearBriefingPointers = useCallback(() => {
        setShowBriefingClearConfirm(true);
    }, []);

    const confirmClearBriefingPointers = useCallback(() => {
        setBriefingInputs([]);
        setShowBriefingClearConfirm(false);
        setIsBriefingPointersVisible(false); // Also close the modal on confirm
    }, []);

    const handleClearProjects = useCallback(() => {
        setProjects([]);
        setCompletedProjects([]);
        setShowProjectsClearConfirm(false);
    }, []);

    const handleOpenAddTaskModal = useCallback(() => setIsAddTaskModalOpen(true), []);

    const handleAddDelegatedTask = useCallback(async ({ text, assigneeId, deadlineDate, deadlineTime }: { text: string; assigneeId: string; deadlineDate: string; deadlineTime: string; }) => {
        const assignee = userProfile.team.find(m => m.id === assigneeId);
        if (!assignee) {
            setNotificationModal({ isOpen: true, title: 'Error', message: 'Could not find the selected team member.' });
            throw new Error('Assignee not found'); 
        }
    
        let deadlineISO: string | undefined = undefined;
        let deadlineString: string;
    
        const time = deadlineTime || '17:00'; // Default to 5 PM if no time is provided
        const deadlineObj = new Date(`${deadlineDate}T${time}`);
        
        if (!isNaN(deadlineObj.getTime())) {
            deadlineISO = deadlineObj.toISOString();
            // Store deadline in YYYY-MM-DD format so the date input field can be pre-filled
            // If time is provided, store as "YYYY-MM-DD HH:MM" format
            if (deadlineTime) {
                deadlineString = `${deadlineDate} ${deadlineTime}`;
            } else {
                deadlineString = deadlineDate; // Just the date in YYYY-MM-DD format
            }
        } else {
            deadlineString = deadlineDate; // Fallback for invalid date
        }
    
        const localId = `delegated-${Date.now()}`;
        const loggedAt = getBriefingNowOverride() ?? Date.now();
        const newTask: DelegatedTaskItem = {
            id: localId, assigneeId, assigneeName: assignee.name,
            text, deadline: deadlineString, completed: false,
            loggedAt,
            status: 'not_started',
            remarks: '',
        };
    
        setDelegatedTasks(prev => dedupeDelegatedTasks([...prev, newTask]));
        setIsAddTaskModalOpen(false);
        
        const token = session?.provider_token;
        if (!token) {
            console.warn("No Google token, skipping task sync.");
            setNotificationModal({ isOpen: true, title: 'Connection Issue', message: 'Task added locally, but could not sync to Google Tasks. Please check your Google connection in settings.' });
            return;
        }
    
        try {
            if (!taskListIdRef.current) {
                const listId = await findOrCreateTaskList(token, `${userProfile.assistantName} Delegated Tasks`);
                taskListIdRef.current = listId;
            }
            const notes = `Assigned to: ${assignee.name}\nStatus: In Progress`;
            const googleTask = await createTask(token, taskListIdRef.current, text, notes, deadlineISO);
    
            setDelegatedTasks(prev => prev.map(task => 
                task.id === localId ? { ...task, googleTaskId: googleTask.id } : task
            ));
            console.log("Successfully synced delegated task to Google Tasks.");
            setNotificationModal({ isOpen: true, title: 'Task Delegated', message: `Task for ${assignee.name} was successfully synced to Google Tasks.` });
    
        } catch (error: any) {
            console.error('Failed to sync delegated task to Google Tasks:', error);
            setDelegatedTasks(prev => prev.filter(task => task.id !== localId));
            
            if (isTasksApiDisabled(error)) {
                setNotificationModal({
                    isOpen: true,
                    title: 'Google Tasks Disabled',
                    message: 'Google Tasks API is not enabled for this project. Task sync is paused until it is enabled in Google Cloud.',
                });
                return;
            }
            
            if (isGoogleAuthError(error)) {
                onGoogleAuthError();
            }
            
            setNotificationModal({
                isOpen: true,
                title: 'Sync Failed',
                message: `Could not add task to Google Tasks. The task was not saved. Reason: ${error.message}`
            });
            
            throw error;
        }
    }, [userProfile.team, userProfile.assistantName, session, onGoogleAuthError]);

    // Use a ref to store the previous result and prevent unnecessary re-renders
    const displayedScheduleItemsRef = useRef<ScheduleItem[]>([]);
    const displayedScheduleItemsDepsRef = useRef<string>('');
    
    const displayedScheduleItems = useMemo(() => {
        // DO NOT show drafted items in sidebar - they should only appear after finalization
        // Drafted items are only visible in the chat response until user clicks "Looks Good, Finalize"
        const scheduleToDisplay = scheduleItems;
        const prioritiesToDisplay = top3Items;
        
        const normalizeTime = (time: string) => {
            const normalized = time.toLowerCase().trim().replace(/\s+/g, ' ');
            const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
            if (!match) return normalized;
            const [, sh, sm, sap, eh, em, eap] = match;
            const pad = (val: string | number) => String(val).padStart(2, '0');
            const start = `${pad(sh)}:${pad(sm || '00')} ${sap.toUpperCase()}`;
            const end = `${pad(eh)}:${pad(em || '00')} ${eap.toUpperCase()}`;
            return `${start} - ${end}`;
        };
        const topPriorityTitles = new Set(prioritiesToDisplay.map(item => item.text.trim()));
        const scheduleByTime = new Map<string, ScheduleItem[]>();
        scheduleToDisplay.forEach(item => {
            const key = normalizeTime(item.time);
            const list = scheduleByTime.get(key) || [];
            list.push(item);
            scheduleByTime.set(key, list);
        });
        const dedupedScheduleItems: ScheduleItem[] = [];
        scheduleByTime.forEach((items) => {
            const preferred = items.find(item => topPriorityTitles.has(item.title)) || items[0];
            if (preferred) {
                // Preserve the original item to maintain stable IDs - don't create new objects
                dedupedScheduleItems.push(preferred);
            }
        });

        const calendarEvents: ScheduleItem[] = googleCalendarEvents.map((event: any, index: number) => {
            const isAllDay = !event.start?.dateTime;
            let timeString;
            if (isAllDay) {
                timeString = 'All Day';
            } else {
                const startTime = new Date(event.start.dateTime);
                const endTime = new Date(event.end.dateTime);
                const format = (date: Date) => date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/^0/, '');
                timeString = `${format(startTime)} - ${format(endTime)}`;
            }
            const eventId = `gcal-${event.id || index}`;
            return {
                id: eventId,
                time: timeString,
                title: event.summary,
                completed: completedGCalEventIds.has(eventId),
                isGoogleEvent: true,
            };
        });

        const scheduleTimeSet = new Set(dedupedScheduleItems.map(item => normalizeTime(item.time)));

        // Filter Google Calendar events that overlap with schedule time blocks.
        const filteredCalendarEvents = calendarEvents.filter(event => !scheduleTimeSet.has(normalizeTime(event.time)));

        // Create a Set of normalized Google Calendar event titles for additional de-duplication.
        const calendarEventTitles = new Set(
            filteredCalendarEvents.map(event => event.title.toLowerCase().trim())
        );

        // Filter the AI-generated schedule items to remove any that are duplicates of remaining Google Calendar events.
        const filteredScheduleItems = dedupedScheduleItems.filter(
            item => !calendarEventTitles.has(item.title.toLowerCase().trim())
        );

        const combined = [...filteredCalendarEvents, ...filteredScheduleItems];
        
        const parseStartTime = (item: ScheduleItem): number => {
            // All-day events should come first.
            if (item.time.toLowerCase() === 'all day') return 0;

            // For Google Calendar events, use the actual start time from the source for accurate sorting.
            if (item.isGoogleEvent) {
                // Find the original event to get the accurate start time.
                // The ID is 'gcal-' + (event.id or the original map index).
                const originalIdPart = item.id.substring(5); // remove 'gcal-'
                const event = googleCalendarEvents.find((e, i) => (e.id || i.toString()) === originalIdPart);
                if (event) {
                    // Use getTime() for a numeric value that can be sorted.
                    // Handles both date-time and all-day events (date property).
                    return new Date(event.start.dateTime || event.start.date).getTime();
                }
            }

            // For AI-generated items, parse the time string.
            // This is a fallback and assumes a consistent format like "9:00 AM".
            const firstTime = item.time.split(' - ')[0];
            const parsedTime = new Date(`1970/01/01 ${firstTime}`).getTime();
            // If parsing fails, return a large number to sort it to the end.
            return isNaN(parsedTime) ? Number.MAX_SAFE_INTEGER : parsedTime;
        };

        combined.sort((a, b) => parseStartTime(a) - parseStartTime(b));

        // Stabilize the array reference - only return new array if items actually changed
        // Compare IDs, titles, and completed status to detect changes
        const currentIds = combined.map(item => `${item.id}:${item.title}:${item.completed}`).join('|');
        
        // Check if items actually changed by comparing the signature string
        if (currentIds === displayedScheduleItemsDepsRef.current && displayedScheduleItemsRef.current.length > 0) {
            // Items haven't changed - return previous array reference to prevent re-renders
            return displayedScheduleItemsRef.current;
        }
        
        // Items changed - update refs and return new array
        displayedScheduleItemsDepsRef.current = currentIds;
        displayedScheduleItemsRef.current = combined;
        return combined;
    }, [googleCalendarEvents, scheduleItems, top3Items, completedGCalEventIds]);

    // Debounce this effect to prevent rapid re-renders during interactions
    const syncPrioritiesTimeoutRef = useRef<number | null>(null);
    
    useEffect(() => {
      // Clear any pending sync to prevent race conditions
      if (syncPrioritiesTimeoutRef.current) {
        clearTimeout(syncPrioritiesTimeoutRef.current);
      }
      
      // Debounce the sync to prevent rapid updates during checkbox clicks
      syncPrioritiesTimeoutRef.current = window.setTimeout(() => {
        if (top3Items.length === 0 || displayedScheduleItems.length === 0) return;

        const normalize = (str: string) =>
            str
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

        const stopWords = new Set(['the', 'and', 'for', 'with', 'to', 'in', 'on', 'of', 'a', 'an', 'is', 'are', 'be', 'my', 'your']);
        const stem = (token: string) => token.replace(/(ing|ed|ions|ion|al|ers|er|ment|s)$/i, '').trim();
        const tokenize = (str: string) =>
            normalize(str)
                .split(' ')
                .filter(token => token.length > 2 && !stopWords.has(token))
                .map(stem)
                .filter(token => token.length > 2);

      const findScheduleByPhrase = (priorityText: string) => {
          const priorityNorm = normalize(priorityText);
          if (!priorityNorm) return null;
          const exact = displayedScheduleItems.find(item => normalize(item.title) === priorityNorm);
          if (exact) return exact;

          const priorityTokens = new Set(tokenize(priorityText));
          if (priorityTokens.size === 0) return null;
          return displayedScheduleItems.find(item => {
              const scheduleTokens = new Set(tokenize(item.title));
              return [...priorityTokens].every(token => scheduleTokens.has(token));
          }) || null;
      };

      const nextPriorities = top3Items.map(priority => {
          const matched = findScheduleByPhrase(priority.text);
          if (!matched) return priority;
          const updatedText = matched.title;
          const completed = matched.completed;
          if (priority.text === updatedText && priority.completed === completed) return priority;
          return { ...priority, text: updatedText, completed };
      });

      const changed = nextPriorities.some((item, idx) =>
          item.text !== top3Items[idx]?.text || item.completed !== top3Items[idx]?.completed
      );
      if (changed) {
          // Use functional update to prevent unnecessary re-renders
          setTop3Items(prev => {
              // Only update if there's an actual change (deep comparison)
              const hasChange = nextPriorities.some((item, idx) =>
                  item.text !== prev[idx]?.text || item.completed !== prev[idx]?.completed
              );
              return hasChange ? nextPriorities : prev;
          });
      }
        }, 200); // Debounce by 200ms to prevent rapid updates during checkbox clicks
      
      return () => {
        if (syncPrioritiesTimeoutRef.current) {
          clearTimeout(syncPrioritiesTimeoutRef.current);
        }
      };
    }, [displayedScheduleItems, top3Items]);

    useEffect(() => {
      if (top3Items.length === 0 || scheduleItems.length === 0) return;

      const normalize = (str: string) =>
          str
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
      const stopWords = new Set(['the', 'and', 'for', 'with', 'to', 'in', 'on', 'of', 'a', 'an', 'is', 'are', 'be', 'my', 'your']);
      const stem = (token: string) => token.replace(/(ing|ed|ions|ion|al|ers|er|ment|s)$/i, '').trim();
      const tokenize = (str: string) =>
          normalize(str)
              .split(' ')
              .filter(token => token.length > 2 && !stopWords.has(token))
              .map(stem)
              .filter(token => token.length > 2);
      const baseLabel = (text: string) => {
          const colonSplit = text.split(':')[0];
          const parenSplit = colonSplit.split('(')[0];
          return parenSplit.trim();
      };
      const scoreMatch = (priorityText: string, scheduleTitle: string) => {
          const priorityTokens = tokenize(baseLabel(priorityText));
          const scheduleTokens = tokenize(scheduleTitle);
          if (priorityTokens.length === 0 || scheduleTokens.length === 0) return 0;
          return priorityTokens.filter(token => scheduleTokens.includes(token)).length;
      };

      type ScheduleMatchItem = { id: string; title: string; isGoogleEvent?: boolean };
      const scheduleMatchItems = scheduleItems as ScheduleMatchItem[];
      const claimedScheduleIds = new Set<string>();
      const bestMatches = top3Items.map((priority: Top3Item) => {
          let bestScore = 0;
          let bestScheduleId: string | null = null;
          scheduleMatchItems.forEach(item => {
              if (item.isGoogleEvent || claimedScheduleIds.has(item.id)) return;
              const score = scoreMatch(priority.text, item.title);
              if (score > bestScore) {
                  bestScore = score;
                  bestScheduleId = item.id;
              }
          });
          const minScore = 1;
          if (bestScheduleId && bestScore >= minScore) {
              claimedScheduleIds.add(bestScheduleId);
              return { priority, scheduleId: bestScheduleId, score: bestScore };
          }
          return { priority, scheduleId: null, score: 0 };
      });

      const nextSchedule = scheduleItems.map(item => {
          const match = bestMatches.find(m => m.scheduleId === item.id);
          if (!match) return item;
          if (item.title === match.priority.text) return item;
          return { ...item, title: match.priority.text };
      });

      const changed = nextSchedule.some((item, idx) => item.title !== scheduleItems[idx]?.title);
      if (changed) {
          // Use functional update to prevent unnecessary re-renders
          setScheduleItems(prev => {
              // Only update if there's an actual change
              const hasChange = nextSchedule.some((item, idx) => item.title !== prev[idx]?.title);
              return hasChange ? nextSchedule : prev;
          });
      }
    }, [scheduleItems, top3Items]);

    const dailyProgress = useMemo(() => {
      if (displayedScheduleItems.length > 0) {
          const completed = displayedScheduleItems.filter(item => item.completed).length;
          return Math.round((completed / displayedScheduleItems.length) * 100);
      }
      if (top3Items.length === 0) return 0;
      const completed = top3Items.filter(item => item.completed).length;
      return Math.round((completed / top3Items.length) * 100);
    }, [displayedScheduleItems, top3Items]);

    const cancelPendingDelegation = useCallback(() => {
      if (!pendingDelegation) return;
      setPendingDelegation(null);
      setChatMessages(prev => [
        ...prev,
        { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: 'Okay — canceled that pending delegation. What would you like to do instead?' }
      ]);
    }, [pendingDelegation]);

    const cancelPendingScheduleClarification = useCallback(() => {
      if (!pendingScheduleClarification) return;
      setPendingScheduleClarification(null);
      setChatMessages(prev => [
        ...prev,
        { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: 'Okay — I won’t block a schedule yet. Tell me what you want to prioritize today.' }
      ]);
    }, [pendingScheduleClarification]);

    const pendingSchedule = draftedSchedule;
    const finalizeSchedule = handleConfirmPlan;

    const value: DashboardContextType = {
        onLogout: props.onLogout,
        userProfile: props.userProfile,
        onProfileUpdate: props.onProfileUpdate,
        onNavigateToPrivacy: props.onNavigateToPrivacy,
        onNavigateToTerms: props.onNavigateToTerms,
        activeDashboard: props.activeDashboard,
        setActiveDashboard: props.setActiveDashboard,
        appVersion: props.appVersion,
        onGoogleAuthError: props.onGoogleAuthError,
        shouldShowPatchNotes: props.shouldShowPatchNotes,
        onPatchNotesViewed: props.onPatchNotesViewed,
        session: props.session,
        currentView, isMobileMenuOpen, mobileView, chatInput, isSending, currentTime, showResetConfirm,
        showKeepResetConfirm, isSyncing, quickActionModal, isPatchNotesVisible, isFeedbackVisible, isCommandPaletteOpen,
        attachedFile, isRecording, initialSettingsTab, isCloudLoading, cloudError, suppressCalendarFetch, chatMessages, chatHistory, scheduleItems,
        top3Items, reminders, projects, completedProjects, draftedProject, draftedProjectTasks, draftedSchedule, draftedPriorities, keepNotes, delegatedTasks, isScheduleConfirmed, briefingInputs, briefingState,
        collapsedCards, openSidebarSections, dailyProgress, selectedProject, isBriefingPointersVisible, showBriefingClearConfirm, contextMenu,
        weeklyLog, priorityForTomorrow, weeklyReport, isWeeklyReportModalOpen, emailVersion, isEmailVersionModalOpen, setIsEmailVersionModalOpen, notificationModal, briefingScript, isBriefingScriptVisible, showScheduleClearConfirm, showPrioritiesClearConfirm, showRemindersClearConfirm, showProjectsClearConfirm,
        projectToDelete, isAddTaskModalOpen, showDelegatedClearConfirm,
        displayedScheduleItems, isSidebarCollapsed,
        pendingSchedule,
        finalizeSchedule,
        currentMode, currentMood, recentContext, modeHistory, modeActivatedAt,
        pendingDelegation,
        pendingScheduleClarification,
        desktopTextareaRef, mobileTextareaRef, desktopFileInputRef, mobileFileInputRef,
        setCurrentView, setIsMobileMenuOpen, setMobileView, setChatInput, setShowResetConfirm,
        setShowKeepResetConfirm, setQuickActionModal, setIsPatchNotesVisible, setIsFeedbackVisible, setIsCommandPaletteOpen,
        setAttachedFile, setInitialSettingsTab, setSuppressCalendarFetch, setProjects, setCompletedProjects, setReminders, setDelegatedTasks, setOpenSidebarSections,
        setSelectedProject, setIsBriefingPointersVisible, setShowBriefingClearConfirm, setContextMenu, setWeeklyLog, setPriorityForTomorrow, setWeeklyReport, setIsWeeklyReportModalOpen,
        setNotificationModal, setBriefingScript, setIsBriefingScriptVisible, setShowScheduleClearConfirm, setShowPrioritiesClearConfirm, setShowRemindersClearConfirm, setShowProjectsClearConfirm, setProjectToDelete,
        setKeepNotes, setBriefingState, setIsAddTaskModalOpen, setShowDelegatedClearConfirm, setIsSidebarCollapsed,
        setPendingDelegation,
        setPendingScheduleClarification,
        handleSendMessage, handleManualReset, handleDailyKickoff, handleToggleCard, handleClosePatchNotes, handleClearErrors,
        handleToggleRecording, handleChatInput, handleChatKeyDown, handleFileChange, handleLinkedToggle, handleSimpleToggle,
        handleReminderBriefingPreferenceChange, handleDelegatedTaskToggle, handleDelegatedTaskStatusChange, handleDelegatedTaskRemarksChange, handleDelegatedTaskDeadlineChange,
        handleConfirmPlan, handleMakeChanges, handleConfirmProjectDraft, handleMakeProjectChanges, handleProjectUpdate, requestProjectDraft, saveProjectDraft, handleFinalizeBriefing, openQuickActionModal,
        handleModalConfirm, handleStopGeneration, handleClearBriefingPointers,
        confirmClearBriefingPointers, handleCreateReminderFromText, handleAddBriefingFromText, handleCreateWeeklyReport, handleGenerateEmailReport,
        handleClearSchedule, handleClearPriorities, handleClearReminders, handleClearKeepNotes, handleConfirmDeleteProject,
        handleOpenAddTaskModal, handleAddDelegatedTask, handleClearDelegatedTasks, handleClearProjects,
        handleActivateMode, handleDeactivateMode, cancelPendingDelegation, cancelPendingScheduleClarification,
        createScheduleItem, updateScheduleItem, deleteScheduleItem, syncScheduleToGoogleCalendar, refreshGoogleCalendarEvents, clearGoogleCalendarEvents,
        setTop3Items,
        onAllPrioritiesCompleted: props.onAllPrioritiesCompleted,
        onAllScheduleCompleted: props.onAllScheduleCompleted
    };

    return (
        <DashboardContext.Provider value={value}>
            {children}
        </DashboardContext.Provider>
    );
};

// FIX: The useDashboard hook was defined but not exported. This export makes it available to other components.
export const useDashboardContext = () => {
    const context = useContext(DashboardContext);
    if (!context) {
        throw new Error('useDashboardContext must be used within a DashboardProvider');
    }
    return context;
};
