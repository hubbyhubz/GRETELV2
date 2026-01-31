// FIX: Imported the 'useMemo' hook from React to resolve a "Cannot find name 'useMemo'" error.
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode, useLayoutEffect, useMemo } from 'react';
// FIX: The sendMessageToGemini function was missing an export in geminiService.ts; it has been added, making this import correct.
import { sendMessageToGemini } from './geminiService';
import { getDashboardState, saveDashboardState, flushQueuedDashboardState } from './googleDriveService';
import { batchAddEventsToCalendar, getTodaysEvents } from './googleCalendarService';
import { createTask, findOrCreateTaskList, updateTask, deleteTask } from './googleTasksService';
import type { Session } from '@supabase/supabase-js';
import type { Content } from '@google/genai';
// FIX: All type imports were pointing to App.tsx which doesn't export them. Changed to import from the correct types.ts file.
import type { UserProfile, DashboardView, BriefingInputItem, DashboardState, ScheduleItem, Top3Item, ReminderItem, ReminderBriefingPreference, Project, Milestone, ChatMessage, ChatHistoryItem, BriefingState, DelegatedTaskItem, WeeklyLogItem, WeeklyReport, AssistantMode, ModeHistoryEntry, UserMood, EventOpsItem, DailyOpsMetricEntry, StaffPerformanceLogEntry, CarryOverTaskEntry } from './types';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { fetchOkrSnapshot, formatOkrSnapshotForPrompt } from './OKR/okrSnapshot';
import { applyPriorityOps as applyPriorityOpsUtil, applyProjectOps as applyProjectOpsUtil, applyReminderOps as applyReminderOpsUtil, applyScheduleOps as applyScheduleOpsUtil, buildEventOpsBlocksForToday, detectEventOpsScheduleClarification, normalizeNeedle as normalizeNeedleUtil, parseDeadlineFromText as parseDeadlineFromTextUtil, parseScheduleRangeToMinutes, cascadeReschedule } from './assistantActionUtils';
import { bestFuzzyMatch, inferFinalizePlan, inferFreeStyle } from './freeStyleNlu';
import { buildWeeklyDashboardSummary } from '../lib/weeklyDashboard';
import { fetchGoogleUserInfo, getGoogleEmailStorageKey } from '../lib/googleUserInfo';
import { mergeDashboardStateForCrossDeviceSync } from '../lib/dashboardStateMerge';

// Version for the dashboard state structure. Increment this to trigger migrations.
const DASHBOARD_STATE_VERSION = "1.1.0";

function localIsoDateKey(now = new Date()): string {
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

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
type BriefingContextSelection = {
  briefingReminders: ReminderItem[];
  briefingInputs: BriefingInputItem[];
  briefingDelegatedTasks: DelegatedTaskItem[];
  remainingReminders: ReminderItem[];
  remainingBriefingInputs: BriefingInputItem[];
  remainingDelegatedTasks: DelegatedTaskItem[];
};

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

  const nowMs = now.getTime();
  const morningEnd = nowMs > morningCutoff.getTime() ? nowMs : morningCutoff.getTime();
  const afternoonEnd = nowMs > afternoonCutoff.getTime() ? nowMs : afternoonCutoff.getTime();

  if (type === 'morning') {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(AFTERNOON_BRIEFING_HOUR, AFTERNOON_BRIEFING_MINUTE, 0, 0);
    return { type, start: start.getTime(), end: morningEnd };
  }

  return { type, start: morningCutoff.getTime(), end: afternoonEnd };
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

const isValidISOString = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  const date = new Date(str);
  return !isNaN(date.getTime()) && str.includes('T') && (str.endsWith('Z') || str.includes('+') || str.includes('-', 10));
};

const parseDeadlineDate = (deadline: string): Date | null => {
  if (!deadline || deadline === 'TBD') return null;
  
  // Try YYYY-MM-DD format (with or without time)
  const isoMatch = deadline.match(/^(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2})?$/);
  if (isoMatch) {
    const date = new Date(`${isoMatch[1]}T00:00:00`);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try parsing as Date (handles formats like "January 25, 2026")
  const parsed = new Date(deadline);
  if (!isNaN(parsed.getTime())) return parsed;
  
  return null;
};

const extractRemindersFromText = (text: string): string[] => {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const results: string[] = [];
  lines.forEach(line => {
    const match = line.match(/^(?:[-*]\s*)?reminders?\s*[:\-–—]\s*(.+)$/i);
    if (match?.[1]) {
      const value = match[1].trim();
      if (value) results.push(value);
    }
  });
  return results;
};

const parseAssistantKeyFacts = (memory: string | null | undefined): string[] => {
  const raw = String(memory || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(x => String(x ?? '').trim()).filter(Boolean);
    }
  } catch {
  }
  return raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
};

const mergeAssistantKeyFact = (memory: string | null | undefined, newFactRaw: string): string => {
  const newFact = String(newFactRaw || '').trim().replace(/^[-*•]\s*/, '').trim();
  if (!newFact) return JSON.stringify(parseAssistantKeyFacts(memory));
  const existing = parseAssistantKeyFacts(memory);
  const needle = newFact.toLowerCase();
  const has = existing.some(f => f.toLowerCase() === needle);
  const next = has ? existing : [...existing, newFact];
  return JSON.stringify(next);
};

const formatAssistantKeyFactsForDisplay = (memory: string | null | undefined): string => {
  const facts = parseAssistantKeyFacts(memory);
  if (facts.length === 0) return "No Key Facts are configured yet in Account Settings → Profile → Assistant Configuration.";
  return `Key Facts (from Account Settings):\n- ${facts.join('\n- ')}`;
};

const checkTaskDeadlines = (
  tasks: DelegatedTaskItem[],
  reminders: ReminderItem[],
  dismissedTaskIds: Set<string>,
  nearDeadlineHours: number = 24
): { remindersToAdd: ReminderItem[], remindersToRemove: string[] } => {
  const now = new Date();
  const nearDeadlineMs = nearDeadlineHours * 60 * 60 * 1000;
  const remindersToAdd: ReminderItem[] = [];
  const remindersToRemove = new Set<string>();
  const taskIds = new Set(tasks.map(task => task.id));
  
  // Get existing reminder task IDs to prevent duplicates
  const existingTaskIds = new Set(
    reminders
      .filter(r => r.linkedTaskId)
      .map(r => r.linkedTaskId!)
  );

  reminders.forEach(reminder => {
    if (reminder.linkedTaskId && !taskIds.has(reminder.linkedTaskId)) {
      remindersToRemove.add(reminder.id);
    }
  });
  
  tasks.forEach(task => {
    // Remove reminder if task is completed
    if (task.completed) {
      const linkedReminder = reminders.find(r => r.linkedTaskId === task.id);
      if (linkedReminder) {
        remindersToRemove.add(linkedReminder.id);
      }
      return;
    }
    
    if (!task.deadline || task.deadline === 'TBD') return;
    
    // Parse deadline
    const deadlineDate = parseDeadlineDate(task.deadline);
    if (!deadlineDate) return;
    
    const timeUntilDeadline = deadlineDate.getTime() - now.getTime();
    const isPastDeadline = timeUntilDeadline < 0;
    const isNearDeadline = timeUntilDeadline > 0 && timeUntilDeadline <= nearDeadlineMs;
    
    // Create reminder if near or past deadline and doesn't exist
    if ((isPastDeadline || isNearDeadline) && !existingTaskIds.has(task.id) && !dismissedTaskIds.has(task.id)) {
      const deadlineText = task.deadline.match(/^\d{4}-\d{2}-\d{2}/) 
        ? new Date(`${task.deadline.split(' ')[0]}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : task.deadline;
      
      const reminderText = `Follow up with ${task.assigneeName}: ${task.text}${task.deadline ? ` (Due: ${deadlineText})` : ''}`;
      remindersToAdd.push({
        id: `task-reminder-${task.id}`,
        text: reminderText,
        completed: false,
        loggedAt: Date.now(),
        includeInBriefing: 'both',
        linkedTaskId: task.id,
      });
    }
  });
  
  return { remindersToAdd, remindersToRemove: Array.from(remindersToRemove) };
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

const dedupeBriefingInputs = (items: BriefingInputItem[]): BriefingInputItem[] => {
  const normalize = (value: unknown) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const seen = new Set<string>();
  const deduped: BriefingInputItem[] = [];

  items.forEach(item => {
    const text = normalize(item?.text);
    if (!text) return;
    const type = normalize(item?.type);
    const key = `${type}|${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(item);
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
      briefingInputs: dedupeBriefingInputs(briefingInputs),
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
  const briefingInputsFiltered = dedupeBriefingInputs(briefingInputs.filter(item => isWithinWindow(resolveLoggedAt(item.loggedAt))));
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
}, options?: { includeViewPointers?: boolean }): string => {
  const lines: string[] = [];
  const includeViewPointers = options?.includeViewPointers !== false;

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

  if (includeViewPointers && context.briefingInputs.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('VIEW POINTERS:');
    context.briefingInputs.forEach(item => lines.push(`- ${item.type}: ${item.text}`));
  }

  return lines.join('\n').trim();
};

const mergeBriefingNotes = (baseNotes: string, context: {
  briefingReminders: ReminderItem[];
  briefingInputs: BriefingInputItem[];
  briefingDelegatedTasks: DelegatedTaskItem[];
}): string => {
  const normalize = (value: unknown) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

  const buildDelegatedBriefingLine = (task: DelegatedTaskItem): string => {
    const deadline = task.deadline ? ` (Due: ${task.deadline})` : '';
    const status = task.status ? ` [${task.status.replace('_', ' ')}]` : '';
    const remarks = task.remarks?.trim();
    if (remarks) {
      return `- ${task.assigneeName}, I instructed you to ${task.text}. Last update: ${remarks}. Where is the report now?${deadline}${status}`;
    }
    return `- ${task.assigneeName}: ${task.text}${deadline}${status}`;
  };

  const ensureSection = (text: string, header: 'REMINDERS:' | 'DELEGATED TASKS:' | 'VIEW POINTERS:', bullets: string[]) => {
    const uniqueBullets = bullets.map((b) => String(b ?? '').trim()).filter(Boolean);
    if (uniqueBullets.length === 0) return text;

    const lines = String(text ?? '').split('\n');
    const normalizedHeader = normalize(header);
    const headerIndex = lines.findIndex(line => normalize(line) === normalizedHeader);

    const contextHeaders = new Set([normalize('REMINDERS:'), normalize('DELEGATED TASKS:'), normalize('VIEW POINTERS:')]);

    if (headerIndex === -1) {
      const nextBase = lines.join('\n').trim();
      const addition = [header, ...uniqueBullets].join('\n');
      return nextBase ? `${nextBase}\n\n${addition}` : addition;
    }

    let endIndex = lines.length;
    for (let i = headerIndex + 1; i < lines.length; i++) {
      if (contextHeaders.has(normalize(lines[i]))) {
        endIndex = i;
        break;
      }
    }

    const sectionLines = lines.slice(headerIndex + 1, endIndex);
    const sectionNormalized = normalize(sectionLines.join('\n'));
    const toAdd: string[] = [];

    uniqueBullets.forEach((bullet) => {
      const core = normalize(bullet.replace(/^\-\s*/, ''));
      if (!core) return;
      if (!sectionNormalized.includes(core)) toAdd.push(bullet);
    });

    if (toAdd.length === 0) return lines.join('\n');
    const nextLines = [
      ...lines.slice(0, endIndex),
      ...toAdd,
      ...lines.slice(endIndex),
    ];
    return nextLines.join('\n');
  };

  const formattedContext = formatBriefingContext(context, { includeViewPointers: true });
  if (!formattedContext) return baseNotes;
  if (!baseNotes.trim()) return formattedContext;

  const reminderBullets = context.briefingReminders.map(item => `- ${item.text}`);
  const delegatedBullets = context.briefingDelegatedTasks.map(task => buildDelegatedBriefingLine(task));
  const viewPointerBullets = context.briefingInputs.map(item => `- ${item.type}: ${item.text}`);

  let next = baseNotes.trim();
  next = ensureSection(next, 'REMINDERS:', reminderBullets);
  next = ensureSection(next, 'DELEGATED TASKS:', delegatedBullets);
  next = ensureSection(next, 'VIEW POINTERS:', viewPointerBullets);
  return next.trim();
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
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : resolveLoggedAt(item.loggedAt),
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

const stripMarkdownForModal = (input: string): string => {
  const raw = String(input ?? '');
  if (!raw) return '';
  return raw
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
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
  onLock: () => void;
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
    isScheduleEditorOpen: boolean;
    setIsScheduleEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
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
    isBriefingNotesModalOpen: boolean;
    showBriefingClearConfirm: boolean;
    contextMenu: ContextMenuState;
    weeklyLog: WeeklyLogItem[];
    priorityForTomorrow: string;
    dailyOpsMetrics: DailyOpsMetricEntry[];
    staffPerformanceLog: StaffPerformanceLogEntry[];
    carryOverTasks: CarryOverTaskEntry[];
    endOfDaySummary: string;
    endOfDayCompletedDate: string;
    endOfDayIntro: string;
    smartEodQuestions: Array<{ id: string; sourceType: 'delegated' | 'reminder' | 'focus' | 'briefing' | 'project'; sourceId: string; title: string; question: string; answer: string }>;
    isSmartEodLoading: boolean;
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
    setScheduleItems: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
    setDelegatedTasks: React.Dispatch<React.SetStateAction<DelegatedTaskItem[]>>;
    setOpenSidebarSections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    setSelectedProject: React.Dispatch<React.SetStateAction<Project | null>>;
    setIsBriefingPointersVisible: React.Dispatch<React.SetStateAction<boolean>>;
    setIsBriefingNotesModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setShowBriefingClearConfirm: React.Dispatch<React.SetStateAction<boolean>>;
    setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
    setWeeklyLog: React.Dispatch<React.SetStateAction<WeeklyLogItem[]>>;
    setPriorityForTomorrow: React.Dispatch<React.SetStateAction<string>>;
    setDailyOpsMetrics: React.Dispatch<React.SetStateAction<DailyOpsMetricEntry[]>>;
    setStaffPerformanceLog: React.Dispatch<React.SetStateAction<StaffPerformanceLogEntry[]>>;
    setCarryOverTasks: React.Dispatch<React.SetStateAction<CarryOverTaskEntry[]>>;
    setEndOfDaySummary: React.Dispatch<React.SetStateAction<string>>;
    setEndOfDayCompletedDate: React.Dispatch<React.SetStateAction<string>>;
    setSmartEodAnswer: (questionId: string, value: string) => void;
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


    handleSendMessage: (e?: React.FormEvent, prompt?: string, imageUrl?: string, options?: { hideUserMessage?: boolean; suppressChat?: boolean }) => Promise<void>;
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
    handleFinalizeBriefing: (notesOverride?: string) => void;
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
    syncScheduleToGoogleCalendar: (scheduleOverride?: ScheduleItem[]) => Promise<boolean>;
    refreshGoogleCalendarEvents: () => Promise<void>;
    clearGoogleCalendarEvents: () => void;

    pendingSchedule: ScheduleItem[] | null;
    finalizeSchedule: () => Promise<void>;

    setDraftedSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[] | null>>;
    setDraftedPriorities: React.Dispatch<React.SetStateAction<Top3Item[] | null>>;
    handleProactiveAIMessage: (text: string) => Promise<void>;
    setIsScheduleConfirmed: React.Dispatch<React.SetStateAction<boolean>>;

    isInterviewModalOpen: boolean;
    interviewModalMode: 'kickoff' | 'morning-briefing' | 'afternoon-briefing' | 'end-of-day' | null;
    interviewDrafts: Record<string, { answers: string[]; otherNotes: string }>;
    endOfDayDraft: { attendance: string; morale: number | null; moraleFactors: { energy: number | null; teamwork: number | null; load: number | null; stability: number | null }; coachingNotes: string; otherNotes: string; accomplishments: string; challenges: string; goalTomorrow: string; leadershipJournal: string; delegatedFollowUp: string };
    setEndOfDayDraft: React.Dispatch<React.SetStateAction<{ attendance: string; morale: number | null; moraleFactors: { energy: number | null; teamwork: number | null; load: number | null; stability: number | null }; coachingNotes: string; otherNotes: string; accomplishments: string; challenges: string; goalTomorrow: string; leadershipJournal: string; delegatedFollowUp: string }>>;
    carryOverDecision: (taskId: string, decision: 'yes' | 'no') => void;
    openInterviewModal: (mode: 'kickoff' | 'morning-briefing' | 'afternoon-briefing' | 'end-of-day') => void;
    closeInterviewModal: () => void;
    setInterviewAnswer: (mode: 'kickoff' | 'morning-briefing' | 'afternoon-briefing', index: number, value: string) => void;
    setInterviewOtherNotes: (mode: 'kickoff' | 'morning-briefing' | 'afternoon-briefing', value: string) => void;
    submitEndOfDayReview: () => Promise<void>;
    handleGenerateInterview: () => Promise<void>;
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
    const [dismissedDelegatedReminderTaskIds, setDismissedDelegatedReminderTaskIds] = useState<string[]>([]);
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
    const [dailyOpsMetrics, setDailyOpsMetrics] = useState<DailyOpsMetricEntry[]>([]);
    const [staffPerformanceLog, setStaffPerformanceLog] = useState<StaffPerformanceLogEntry[]>([]);
    const [carryOverTasks, setCarryOverTasks] = useState<CarryOverTaskEntry[]>([]);
    const [endOfDaySummary, setEndOfDaySummary] = useState<string>('');
    const [endOfDayCompletedDate, setEndOfDayCompletedDate] = useState<string>('');
    const [smartEodQuestions, setSmartEodQuestions] = useState<Array<{ id: string; sourceType: 'delegated' | 'reminder' | 'focus' | 'briefing' | 'project'; sourceId: string; title: string; question: string; answer: string }>>([]);
    const [smartEodQuestionsDate, setSmartEodQuestionsDate] = useState<string>('');
    const [endOfDayIntro, setEndOfDayIntro] = useState<string>('');
    const [isSmartEodLoading, setIsSmartEodLoading] = useState(false);
    const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
    const [isWeeklyReportModalOpen, setIsWeeklyReportModalOpen] = useState(false);
    const [emailVersion, setEmailVersion] = useState<string>('');
    const [isEmailVersionModalOpen, setIsEmailVersionModalOpen] = useState(false);
    const messageIdRef = useRef(0);
    const weeklyReportMetricsRef = useRef<{ startYmd: string; endYmd: string } | null>(null);
    
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
    const okrSnapshotFetchCacheRef = useRef<{ at: number; text: string; error: string | null }>({
      at: 0,
      text: '',
      error: null,
    });
    
    const [openSidebarSections, setOpenSidebarSections] = useState<Record<string, boolean>>({});
    const [isBriefingPointersVisible, setIsBriefingPointersVisible] = useState(false);
    const [isBriefingNotesModalOpen, setIsBriefingNotesModalOpen] = useState(false);
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
    const [pendingBriefingContextSnapshot, setPendingBriefingContextSnapshot] = useState<BriefingContextSelection | null>(null);
    const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
    const [showDelegatedClearConfirm, setShowDelegatedClearConfirm] = useState(false);

    // New State for holding drafted schedule and priorities
    const [draftedSchedule, setDraftedSchedule] = useState<ScheduleItem[] | null>(null);
    const [draftedPriorities, setDraftedPriorities] = useState<Top3Item[] | null>(null);
    const [_lastPlanDraftText, setLastPlanDraftText] = useState<string>('');
    const [isScheduleEditorOpen, setIsScheduleEditorOpen] = useState(false);

    const [isInterviewModalOpen, setIsInterviewModalOpen] = useState(false);
    const [interviewModalMode, setInterviewModalMode] = useState<'kickoff' | 'morning-briefing' | 'afternoon-briefing' | 'end-of-day' | null>(null);
    const [interviewDrafts, setInterviewDrafts] = useState<Record<string, { answers: string[]; otherNotes: string }>>({});
    const [endOfDayDraft, setEndOfDayDraft] = useState<{ attendance: string; morale: number | null; moraleFactors: { energy: number | null; teamwork: number | null; load: number | null; stability: number | null }; coachingNotes: string; otherNotes: string; accomplishments: string; challenges: string; goalTomorrow: string; leadershipJournal: string; delegatedFollowUp: string }>({
      attendance: '',
      morale: null,
      moraleFactors: { energy: null, teamwork: null, load: null, stability: null },
      coachingNotes: '',
      otherNotes: '',
      accomplishments: '',
      challenges: '',
      goalTomorrow: '',
      leadershipJournal: '',
      delegatedFollowUp: '',
    });
    
    // Debug: Log when state changes
    useEffect(() => {
        console.log('[DashboardContext] isScheduleEditorOpen changed to:', isScheduleEditorOpen);
    }, [isScheduleEditorOpen]);
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

    const lastGoogleTokenRef = useRef<string | null>(null);
    const lastGoogleUserIdRef = useRef<string | null>(null);

    useEffect(() => {
      const userId = session?.user?.id || null;
      const token = (session as any)?.provider_token ? String((session as any).provider_token) : null;
      const tokenChanged = token !== lastGoogleTokenRef.current;
      const userChanged = userId !== lastGoogleUserIdRef.current;

      if (!tokenChanged && !userChanged) return;

      lastGoogleTokenRef.current = token;
      lastGoogleUserIdRef.current = userId;
      setGoogleCalendarEvents([]);
      setCompletedGCalEventIds(new Set());
    }, [session?.user?.id, (session as any)?.provider_token]);

    const verifyGoogleAccount = useCallback(async (accessToken: string) => {
      const userId = session?.user?.id;
      if (!userId) return true;

      const info = await fetchGoogleUserInfo(accessToken);
      if (!info.email) return true;

      const key = getGoogleEmailStorageKey(userId);
      const expected = window.localStorage.getItem(key);
      if (expected && expected.toLowerCase() !== info.email.toLowerCase()) {
        setNotificationModal({
          isOpen: true,
          title: 'Google Account Mismatch',
          message: `You're connected to ${info.email}, but this account previously used ${expected}. Please reconnect Google and select the correct account.`,
        });
        setGoogleCalendarEvents([]);
        setCompletedGCalEventIds(new Set());
        onGoogleAuthError();
        return false;
      }

      if (!expected) {
        window.localStorage.setItem(key, info.email);
      }

      return true;
    }, [session?.user?.id, onGoogleAuthError]);


    const desktopTextareaRef = useRef<HTMLTextAreaElement>(null);
    const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);
    const saveTimeoutRef = useRef<number | null>(null);
    const forceSaveRef = useRef<boolean>(false);
    const isApplyingRemoteStateRef = useRef<boolean>(false);
    const lastRemoteApplyAtRef = useRef<number>(0);
    const dashboardSyncChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const dashboardSyncBroadcastTimeoutRef = useRef<number | null>(null);
    const latestCrossDeviceSlicesRef = useRef<{
      scheduleItems: ScheduleItem[];
      reminders: ReminderItem[];
      briefingInputs: BriefingInputItem[];
      delegatedTasks: DelegatedTaskItem[];
      staffPerformanceLog: StaffPerformanceLogEntry[] | undefined;
      dismissedDelegatedReminderTaskIds: string[] | undefined;
    }>({
      scheduleItems: [],
      reminders: [],
      briefingInputs: [],
      delegatedTasks: [],
      staffPerformanceLog: undefined,
      dismissedDelegatedReminderTaskIds: undefined,
    });
    const assistantMemoryRef = useRef<string>(String(userProfile.assistantMemory || ''));
    const desktopFileInputRef = useRef<HTMLInputElement>(null);
    const mobileFileInputRef = useRef<HTMLInputElement>(null);
    const generationRequestRef = useRef<symbol | null>(null);
    const openScheduleEditorOnNextKickoffDraftRef = useRef<boolean>(false);
    const autoFinalizeKickoffPlanRef = useRef<boolean>(false);
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
            setDismissedDelegatedReminderTaskIds(
              Array.isArray((state as any).dismissedDelegatedReminderTaskIds) ? (state as any).dismissedDelegatedReminderTaskIds : []
            );
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
            setDailyOpsMetrics(Array.isArray((state as any).dailyOpsMetrics) ? (state as any).dailyOpsMetrics : []);
            setStaffPerformanceLog(Array.isArray((state as any).staffPerformanceLog) ? (state as any).staffPerformanceLog : []);
            setCarryOverTasks(Array.isArray((state as any).carryOverTasks) ? (state as any).carryOverTasks : []);
            setEndOfDaySummary(typeof (state as any).endOfDaySummary === 'string' ? (state as any).endOfDaySummary : '');
            setEndOfDayCompletedDate(typeof (state as any).endOfDayCompletedDate === 'string' ? (state as any).endOfDayCompletedDate : '');
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
            setDismissedDelegatedReminderTaskIds(
              Array.isArray((state as any).dismissedDelegatedReminderTaskIds) ? (state as any).dismissedDelegatedReminderTaskIds : []
            );
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
            setDailyOpsMetrics(Array.isArray((state as any).dailyOpsMetrics) ? (state as any).dailyOpsMetrics : []);
            setStaffPerformanceLog(Array.isArray((state as any).staffPerformanceLog) ? (state as any).staffPerformanceLog : []);
            setCarryOverTasks(Array.isArray((state as any).carryOverTasks) ? (state as any).carryOverTasks : []);
            setEndOfDaySummary(typeof (state as any).endOfDaySummary === 'string' ? (state as any).endOfDaySummary : '');
            setEndOfDayCompletedDate(typeof (state as any).endOfDayCompletedDate === 'string' ? (state as any).endOfDayCompletedDate : '');
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

    useEffect(() => {
      if (!userProfile?.id) return;
      flushQueuedDashboardState(userProfile.id).catch(() => {});

      const handleOnline = () => {
        flushQueuedDashboardState(userProfile.id).catch(() => {});
      };

      const handleVisible = () => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        flushQueuedDashboardState(userProfile.id).catch(() => {});
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('focus', handleVisible);
      document.addEventListener('visibilitychange', handleVisible);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('focus', handleVisible);
        document.removeEventListener('visibilitychange', handleVisible);
      };
    }, [userProfile?.id]);

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
        const today = localIsoDateKey();
        if (lastResetDate === today) return;
        setScheduleItems([]);
        setTop3Items([]);
        setDraftedSchedule(null); // Clear drafted schedule on daily reset
        setDraftedPriorities(null); // Clear drafted priorities on daily reset
        setKeepNotes('');
        setBriefingInputs([]);
        setBriefingState('idle');
        setReminders(prev => prev.filter(item => !item.completed));
        setDelegatedTasks(prev => prev.filter(task => !task.completed));
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
      setDelegatedTasks(prev => prev.filter(task => !task.completed));
      const today = localIsoDateKey();
      setLastResetDate(today);
      setNotifiedEventIds(new Set()); 
      setNudgedTaskIds(new Set()); 
      setNudgedDelegatedTaskIds(new Set());
      setCompletedGCalEventIds(new Set());
    }, []);
    
    useEffect(() => {
      if (!isCloudLoading) {
        const today = localIsoDateKey();
        if (lastResetDate !== today) {
          console.log("New day detected. Resetting daily dashboard state.");
          resetDailyState();
        }
      }
    }, [isCloudLoading, lastResetDate, resetDailyState]);
  
    useEffect(() => {
      if (isApplyingRemoteStateRef.current) return;
      if (Date.now() - lastRemoteApplyAtRef.current < 1500) return;
      if (isCloudLoading || cloudError) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      // Use shorter delay if force save is requested (e.g., after finalization)
      const saveDelay = forceSaveRef.current ? 100 : 1500;
      forceSaveRef.current = false; // Reset flag after use
      
      saveTimeoutRef.current = window.setTimeout(() => {
          const currentState: DashboardState = {
              chatMessages, chatHistory, scheduleItems, top3Items, reminders, projects, completedProjects, keepNotes, delegatedTasks,
              dismissedDelegatedReminderTaskIds,
              team: userProfile.team, hasGreeted, lastResetDate, isScheduleConfirmed, briefingInputs, briefingState,
              collapsedCards, weeklyLog, priorityForTomorrow, stateVersion: DASHBOARD_STATE_VERSION,
              dailyOpsMetrics,
              staffPerformanceLog,
              carryOverTasks,
              endOfDaySummary,
              endOfDayCompletedDate,
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
          (async () => {
            try {
              await saveDashboardState(userProfile.id, currentState);
            } finally {
              if (dashboardSyncBroadcastTimeoutRef.current) window.clearTimeout(dashboardSyncBroadcastTimeoutRef.current);
              dashboardSyncBroadcastTimeoutRef.current = window.setTimeout(() => {
                dashboardSyncChannelRef.current?.send({
                  type: 'broadcast',
                  event: 'dashboard_state_updated',
                  payload: { userId: userProfile.id, ts: Date.now() },
                });
              }, 150);
            }
          })().catch((err: any) => console.error("Failed to save state to Supabase:", err));
      }, saveDelay);
      return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
    }, [chatMessages, chatHistory, scheduleItems, top3Items, reminders, projects, completedProjects, keepNotes, delegatedTasks, dismissedDelegatedReminderTaskIds, userProfile.team, hasGreeted, lastResetDate, isScheduleConfirmed, briefingInputs, briefingState, collapsedCards, weeklyLog, priorityForTomorrow, dailyOpsMetrics, staffPerformanceLog, carryOverTasks, endOfDaySummary, endOfDayCompletedDate, userProfile.id, isCloudLoading, cloudError, completedGCalEventIds, currentMode, modeHistory, modeActivatedAt, suppressCalendarFetch, lastEventOpsNudgeDate, pendingDelegation, pendingScheduleClarification]);

    useEffect(() => {
      if (isCloudLoading || cloudError) return;
      if (isApplyingRemoteStateRef.current) return;
      if (Date.now() - lastRemoteApplyAtRef.current < 1500) return;
      forceSaveRef.current = true;
    }, [scheduleItems, reminders, briefingInputs, delegatedTasks, staffPerformanceLog, isCloudLoading, cloudError]);

    useEffect(() => {
      latestCrossDeviceSlicesRef.current = {
        scheduleItems,
        reminders,
        briefingInputs,
        delegatedTasks,
        staffPerformanceLog,
        dismissedDelegatedReminderTaskIds,
      };
    }, [scheduleItems, reminders, briefingInputs, delegatedTasks, staffPerformanceLog, dismissedDelegatedReminderTaskIds]);

    useEffect(() => {
      if (!userProfile?.id) return;
      if (isCloudLoading) return;

      dashboardSyncChannelRef.current?.unsubscribe();
      const syncChannel = supabase
        .channel(`dashboard_sync:${userProfile.id}`)
        .on('broadcast', { event: 'dashboard_state_updated' }, async (payload) => {
          const incomingUserId = String((payload as any)?.payload?.userId || '');
          if (!incomingUserId || incomingUserId !== userProfile.id) return;
          try {
            const remote = await getDashboardState(userProfile.id);
            if (!remote) return;
            isApplyingRemoteStateRef.current = true;
            lastRemoteApplyAtRef.current = Date.now();
            const localSlices = latestCrossDeviceSlicesRef.current;
            const merged = mergeDashboardStateForCrossDeviceSync(
              {
                scheduleItems: localSlices.scheduleItems,
                reminders: localSlices.reminders,
                briefingInputs: localSlices.briefingInputs,
                delegatedTasks: localSlices.delegatedTasks,
                staffPerformanceLog: localSlices.staffPerformanceLog,
                dismissedDelegatedReminderTaskIds: localSlices.dismissedDelegatedReminderTaskIds,
              },
              {
                scheduleItems: remote.scheduleItems,
                reminders: remote.reminders,
                briefingInputs: remote.briefingInputs,
                delegatedTasks: remote.delegatedTasks,
                staffPerformanceLog: remote.staffPerformanceLog,
                dismissedDelegatedReminderTaskIds: remote.dismissedDelegatedReminderTaskIds,
              },
            );

            setScheduleItems(merged.scheduleItems);
            setReminders(merged.reminders);
            setBriefingInputs(merged.briefingInputs);
            setDelegatedTasks(merged.delegatedTasks);
            setStaffPerformanceLog(merged.staffPerformanceLog);
            setDismissedDelegatedReminderTaskIds(merged.dismissedDelegatedReminderTaskIds);
          } finally {
            isApplyingRemoteStateRef.current = false;
          }
        })
        .subscribe();

      dashboardSyncChannelRef.current = syncChannel;

      const channel = supabase
        .channel(`dashboard_states:${userProfile.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'dashboard_states', filter: `user_id=eq.${userProfile.id}` },
          async () => {
            try {
              const remote = await getDashboardState(userProfile.id);
              if (!remote) return;
              isApplyingRemoteStateRef.current = true;
              lastRemoteApplyAtRef.current = Date.now();
              const localSlices = latestCrossDeviceSlicesRef.current;
              const merged = mergeDashboardStateForCrossDeviceSync(
                {
                  scheduleItems: localSlices.scheduleItems,
                  reminders: localSlices.reminders,
                  briefingInputs: localSlices.briefingInputs,
                  delegatedTasks: localSlices.delegatedTasks,
                  staffPerformanceLog: localSlices.staffPerformanceLog,
                  dismissedDelegatedReminderTaskIds: localSlices.dismissedDelegatedReminderTaskIds,
                },
                {
                  scheduleItems: remote.scheduleItems,
                  reminders: remote.reminders,
                  briefingInputs: remote.briefingInputs,
                  delegatedTasks: remote.delegatedTasks,
                  staffPerformanceLog: remote.staffPerformanceLog,
                  dismissedDelegatedReminderTaskIds: remote.dismissedDelegatedReminderTaskIds,
                },
              );

              setScheduleItems(merged.scheduleItems);
              setReminders(merged.reminders);
              setBriefingInputs(merged.briefingInputs);
              setDelegatedTasks(merged.delegatedTasks);
              setStaffPerformanceLog(merged.staffPerformanceLog);
              setDismissedDelegatedReminderTaskIds(merged.dismissedDelegatedReminderTaskIds);
            } finally {
              isApplyingRemoteStateRef.current = false;
            }
          },
        )
        .subscribe();

      const pollTimer = window.setInterval(async () => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        try {
          const remote = await getDashboardState(userProfile.id);
          if (!remote) return;
          const remoteHash = JSON.stringify({
            scheduleItems: remote.scheduleItems,
            reminders: remote.reminders,
            briefingInputs: remote.briefingInputs,
            delegatedTasks: remote.delegatedTasks,
            staffPerformanceLog: remote.staffPerformanceLog,
            dismissedDelegatedReminderTaskIds: remote.dismissedDelegatedReminderTaskIds,
          });
          const localSlices = latestCrossDeviceSlicesRef.current;
          const localHash = JSON.stringify({
            scheduleItems: localSlices.scheduleItems,
            reminders: localSlices.reminders,
            briefingInputs: localSlices.briefingInputs,
            delegatedTasks: localSlices.delegatedTasks,
            staffPerformanceLog: localSlices.staffPerformanceLog,
            dismissedDelegatedReminderTaskIds: localSlices.dismissedDelegatedReminderTaskIds,
          });
          if (remoteHash === localHash) return;
          isApplyingRemoteStateRef.current = true;
          lastRemoteApplyAtRef.current = Date.now();
          const merged = mergeDashboardStateForCrossDeviceSync(
            {
              scheduleItems: localSlices.scheduleItems,
              reminders: localSlices.reminders,
              briefingInputs: localSlices.briefingInputs,
              delegatedTasks: localSlices.delegatedTasks,
              staffPerformanceLog: localSlices.staffPerformanceLog,
              dismissedDelegatedReminderTaskIds: localSlices.dismissedDelegatedReminderTaskIds,
            },
            {
              scheduleItems: remote.scheduleItems,
              reminders: remote.reminders,
              briefingInputs: remote.briefingInputs,
              delegatedTasks: remote.delegatedTasks,
              staffPerformanceLog: remote.staffPerformanceLog,
              dismissedDelegatedReminderTaskIds: remote.dismissedDelegatedReminderTaskIds,
            },
          );
          setScheduleItems(merged.scheduleItems);
          setReminders(merged.reminders);
          setBriefingInputs(merged.briefingInputs);
          setDelegatedTasks(merged.delegatedTasks);
          setStaffPerformanceLog(merged.staffPerformanceLog);
          setDismissedDelegatedReminderTaskIds(merged.dismissedDelegatedReminderTaskIds);
        } finally {
          isApplyingRemoteStateRef.current = false;
        }
      }, 5000);

      return () => {
        if (dashboardSyncBroadcastTimeoutRef.current) window.clearTimeout(dashboardSyncBroadcastTimeoutRef.current);
        dashboardSyncBroadcastTimeoutRef.current = null;
        if (dashboardSyncChannelRef.current) {
          dashboardSyncChannelRef.current.unsubscribe();
          dashboardSyncChannelRef.current = null;
        }
        window.clearInterval(pollTimer);
        supabase.removeChannel(channel);
      };
    }, [userProfile?.id, isCloudLoading]);

    const toYmdLocal = useCallback((date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }, []);

    const scanImportantItemsForEod = useCallback((now = new Date()) => {
      const todayYmd = toYmdLocal(now);

      const normalize = (str: string) =>
        String(str || '')
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const isRoutineScheduleTitle = (titleRaw: string) => {
        const title = String(titleRaw || '').trim();
        if (!title) return true;
        if (/^(lunch|break)\b/i.test(title)) return true;
        if (/^(admin|email|inbox)\b/i.test(title)) return true;
        return false;
      };

      const hasUserSpecificDetail = (titleRaw: string) => {
        const title = String(titleRaw || '').trim();
        if (!title) return false;
        if (/[—–:\-]/.test(title)) return true;
        if (/\(.+\)/.test(title)) return true;
        if (title.split(/\s+/).length >= 3) return true;
        return false;
      };

      const topPriorityTokens = top3Items
        .map(it => normalize(it.text))
        .filter(Boolean)
        .flatMap(text => text.split(' ').filter(t => t.length > 2));
      const topTokenSet = new Set(topPriorityTokens);

      const isFocusOrTopPriority = (titleRaw: string) => {
        const title = String(titleRaw || '');
        if (/focus\s*block/i.test(title) || /top\s*priority/i.test(title)) return true;
        const tokens = normalize(title).split(' ').filter(t => t.length > 2);
        const overlap = tokens.filter(t => topTokenSet.has(t)).length;
        return overlap >= 2;
      };

      const focusScheduleItems = scheduleItems
        .filter(it => !it.isGoogleEvent)
        .filter(it => String(it.title || '').trim().length > 0)
        .filter(it => {
          const title = String(it.title || '').trim();
          if (isFocusOrTopPriority(title)) return true;
          if (isRoutineScheduleTitle(title)) return hasUserSpecificDetail(title);
          return false;
        });

      const dueReminders = reminders
        .filter(r => !r.completed)
        .filter(r => {
          const loggedAt = typeof r.loggedAt === 'number' ? r.loggedAt : null;
          if (loggedAt) return toYmdLocal(new Date(loggedAt)) === todayYmd;
          return /\btoday\b/i.test(String(r.text || ''));
        });

      const dueDelegatedTasks = delegatedTasks
        .filter(t => !t.completed)
        .filter(t => {
          const deadlineDate = parseDeadlineDate(t.deadline);
          if (!deadlineDate) return false;
          return toYmdLocal(deadlineDate) === todayYmd;
        });

      const hasMorningBriefing = /MORNING\s+BRIEFING\s+DRAFT/i.test(String(keepNotes || ''));
      const briefingContextLines = String(keepNotes || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => /^-\s+/.test(line))
        .slice(0, 5)
        .map(line => line.replace(/^-+\s*/, '').trim())
        .filter(Boolean);

      const dueProjects = projects
        .filter(p => {
          const avgProgress = p.milestones.length > 0
            ? p.milestones.reduce((sum, m) => sum + (Number(m.progress) || 0), 0) / p.milestones.length
            : 0;
          return avgProgress < 100;
        })
        .filter(p => {
          const deadlineDate = parseDeadlineDate(p.deadline);
          if (!deadlineDate) return false;
          return toYmdLocal(deadlineDate) === todayYmd;
        });

      return {
        todayYmd,
        focusScheduleItems,
        dueReminders,
        dueDelegatedTasks,
        hasMorningBriefing,
        briefingContextLines,
        dueProjects,
      };
    }, [toYmdLocal, scheduleItems, top3Items, reminders, delegatedTasks, keepNotes, projects]);

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

    const fetchOkrSnapshotForAI = useCallback(async (force = false): Promise<string> => {
      const nowMs = Date.now();
      const cached = okrSnapshotFetchCacheRef.current;
      const ttlMs = 60_000;
      if (!force && cached.at > 0 && nowMs - cached.at < ttlMs) return cached.text;
      if (!isSupabaseConfigured || isCloudLoading || cloudError || !userProfile.id) return cached.text;

      try {
        const res = await fetchOkrSnapshot({ userId: userProfile.id, now: new Date(), maxDueItems: 6 });
        if (!res.ok) {
          okrSnapshotFetchCacheRef.current = { at: nowMs, text: '', error: res.error };
          return '';
        }
        const text = formatOkrSnapshotForPrompt(res.snapshot);
        okrSnapshotFetchCacheRef.current = { at: nowMs, text, error: null };
        return text;
      } catch (err: any) {
        okrSnapshotFetchCacheRef.current = { at: nowMs, text: '', error: 'fetch_failed' };
        return '';
      }
    }, [isCloudLoading, cloudError, userProfile.id]);

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
      assistantMemoryRef.current = String(userProfile.assistantMemory || '');
    }, [userProfile.assistantMemory]);
    
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
                        updatedAt: baseTs,
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

    const parseDelegationFromText = useCallback((input: string) => {
      const raw = String(input || '').trim();
      if (!raw) return null;
      const lowered = raw.toLowerCase();
      const hasTrigger = /\b(delegate|assign|create\s+(a\s+)?task|task\s+for|assign\s+to|delegate\s+to)\b/i.test(raw);
      if (!hasTrigger) return null;
      const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const normalizeName = (value: string) =>
        String(value || '')
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const candidates = userProfile.team.flatMap(member => {
        const normalized = normalizeName(member.name);
        if (!normalized) return [];
        const tokens = normalized.split(' ').filter(t => t.length >= 3);
        const aliases = Array.from(new Set([normalized, ...tokens]));
        return aliases.map(alias => ({ member, alias }));
      });

      const matched = candidates
        .map(({ member, alias }) => {
          const re = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i');
          const m = lowered.match(re);
          if (!m || m.index == null) return null;
          return { member, alias, index: m.index };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.alias.length - a.alias.length)[0] as { member: any; alias: string; index: number } | undefined;

      const picked = matched?.member;
      let personName: string | null = picked?.name ?? null;
      let nameIndex = matched?.index ?? -1;
      let nameLen = matched?.alias?.length ?? 0;

      if (!personName || nameIndex < 0 || nameLen <= 0) {
        const fallback = raw.match(/\b(?:task\s+for|for|assign(?:ed)?\s+to|delegate\s+to)\s+([a-z][a-z0-9_-]{1,})\b/i);
        const fallbackName = fallback?.[1]?.trim() || '';
        const startFrom = fallback?.index ?? 0;
        const fallbackIndex = fallbackName ? raw.toLowerCase().indexOf(fallbackName.toLowerCase(), startFrom) : -1;
        if (fallbackName && fallbackIndex >= 0) {
          personName = fallbackName;
          nameIndex = fallbackIndex;
          nameLen = fallbackName.length;
        }
      }

      if (!personName || nameIndex < 0 || nameLen <= 0) return null;

      const afterName = raw.slice(nameIndex + nameLen).trim();
      const beforeName = raw.slice(0, nameIndex).trim();
      const deadlineMatch = afterName.match(/\b(deadline|due|by)\b\s*(is\s*)?(.*)$/i) || raw.match(/\b(deadline|due|by)\b\s*(is\s*)?(.*)$/i);
      const deadlineText = (deadlineMatch?.[3]?.trim() || '').replace(/[.,;!]+$/g, '').trim();
      let taskText = afterName;
      if (deadlineMatch && deadlineMatch.index != null) {
        taskText = afterName.slice(0, deadlineMatch.index).trim();
      }
      taskText = taskText.replace(/^(to|for|that|please|pls)\b[:\s-]*/i, '').trim();
      if (!taskText) {
        taskText = beforeName
          .replace(/\b(create|add|delegate|assign|make|set)\b/gi, '')
          .replace(/\b(a|an|the)\b/gi, '')
          .replace(/\b(task|tasks)\b/gi, '')
          .replace(/\bfor\b/gi, '')
          .trim();
      }
      if (!taskText) return null;
      return { personName, task: taskText, deadline: deadlineText };
    }, [userProfile.team]);

    const finalizeDelegation = useCallback(async (payload: { personName: string; task: string }, deadlineText: string) => {
      const parsed = parseDeadlineFromText(deadlineText);
      if (!parsed) {
        return { ok: false, message: 'What deadline should I use? Try “tomorrow”, “2026-02-15”, or “2026-02-15 15:00”.' };
      }

      const assignee = userProfile.team.find(m => m.name.toLowerCase() === payload.personName.toLowerCase());
      const assigneeName = assignee?.name ?? payload.personName;
      const assigneeId = assignee?.id ?? `ext-${assigneeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;

      const token = session?.provider_token;
      const localId = `delegated-${Date.now()}`;
      const loggedAt = getBriefingNowOverride() ?? Date.now();
      const newTask: DelegatedTaskItem = {
        id: localId,
        assigneeId,
        assigneeName,
        text: payload.task,
        deadline: parsed.deadline,
        completed: false,
        loggedAt,
        updatedAt: loggedAt,
        status: 'not_started',
        remarks: '',
      };
      setDelegatedTasks(prev => dedupeDelegatedTasks([...prev, newTask]));

      if (!token) {
        return { ok: true, message: `Got it — delegated to ${assigneeName} (deadline: ${parsed.deadline}). Google sync is not connected, so I saved it locally.` };
      }

      try {
        if (!taskListIdRef.current) {
          const listId = await findOrCreateTaskList(token, `${userProfile.assistantName} Delegated Tasks`);
          taskListIdRef.current = listId;
        }
        const notes = `Assigned to: ${assigneeName}\nStatus: In Progress`;
        const googleTask = await createTask(token, taskListIdRef.current, payload.task, notes, parsed.deadlineISO);
        // Update local task with Google Task ID
        setDelegatedTasks(prev => prev.map(t => (t.id === localId ? { ...t, googleTaskId: googleTask.id } : t)));
        return { ok: true, message: `Done — delegated to ${assigneeName} with deadline **${parsed.deadline}**.` };
      } catch (error: any) {
        // Task is already in local state, just log the sync error (don't remove it)
        if (isTasksApiDisabled(error)) {
          return { ok: true, message: `Done — delegated to ${assigneeName} with deadline **${parsed.deadline}**. Google Tasks sync failed, but task is saved locally.` };
        }
        if (isGoogleAuthError(error)) {
          onGoogleAuthError();
          return { ok: true, message: `Done — delegated to ${assigneeName} with deadline **${parsed.deadline}**. Google connection expired, but task is saved locally. Please reconnect to sync.` };
        }
        return { ok: true, message: `Done — delegated to ${assigneeName} with deadline **${parsed.deadline}**. Google Tasks sync failed: ${error.message}, but task is saved locally.` };
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

    const handleSendMessage = useCallback(async (e?: React.FormEvent, prompt?: string, imageUrl?: string, options?: { hideUserMessage?: boolean; suppressChat?: boolean }): Promise<void> => {
      if (e) e.preventDefault();
      setLastInteraction(Date.now()); // Update interaction timestamp
      const normalizedOptions =
        options ?? (((imageUrl as any) && typeof (imageUrl as any) === 'object') ? (imageUrl as any) : undefined);
      const normalizedImageUrl =
        options ? imageUrl : (((imageUrl as any) && typeof (imageUrl as any) === 'object') ? undefined : imageUrl);
      const rawText = (prompt || chatInput).trim();
      const projectRequestPrefix = 'PROJECT_DRAFT_REQUEST::';
      const isProjectDraftRequest = rawText.startsWith(projectRequestPrefix);
      const messageText = isProjectDraftRequest ? rawText.replace(projectRequestPrefix, '').trim() : rawText;
      if (!messageText && !attachedFile && !normalizedImageUrl) return;
      if (aiCooldownUntil && Date.now() < aiCooldownUntil) {
        if (normalizedOptions?.suppressChat) {
          setNotificationModal({ isOpen: true, title: 'Rate Limited', message: "The AI service is rate-limited right now. Please wait about a minute and try again." });
          return;
        }
        setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: "The AI service is rate-limited right now. Please wait about a minute and try again." }]);
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (normalizedOptions?.suppressChat) {
          setNotificationModal({ isOpen: true, title: 'Offline', message: "You're offline. Please reconnect to the internet and try again." });
          return;
        }
        setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: "You're offline. Please reconnect to the internet and try again." }]);
        return;
      }
      if (isMobileMenuOpen) setIsMobileMenuOpen(false);
      if (isCommandPaletteOpen) setIsCommandPaletteOpen(false);

      const isSystemPromptPreview = messageText.startsWith('SYSTEM:');
      const shouldBypassLocalShortcuts = Boolean(normalizedOptions?.suppressChat) || Boolean(normalizedOptions?.hideUserMessage) || Boolean(isSystemPromptPreview);

      const shouldAutoCancelPendingDelegation = Boolean(
        pendingDelegation &&
        (String(pendingDelegation.task || '').length > 180 ||
          /\bInterview Answers\b/i.test(String(pendingDelegation.task || '')) ||
          /\bReturn a single valid JSON\b/i.test(String(pendingDelegation.task || '')) ||
          /\bQ\d+:/i.test(String(pendingDelegation.task || '')))
      );
      if (shouldAutoCancelPendingDelegation) {
        setPendingDelegation(null);
      }

      if (pendingDelegation && !shouldBypassLocalShortcuts && !isProjectDraftRequest && !attachedFile && !normalizedImageUrl) {
        const userMessageId = Date.now() * 1000 + (messageIdRef.current++ % 1000);
        setChatMessages(prev => [...prev, { id: userMessageId, role: 'user', text: messageText }]);
        setChatInput('');
        setAttachedFile(null);

        const reminderText = (() => {
          const raw = String(messageText || '').trim();
          if (!raw) return null;
          const createMatch = raw.match(/^create\s+(?:a\s+)?reminder\b(?:\s*[:,-]?\s*(?:to\s+)?)?(.+)$/i);
          if (createMatch?.[1]?.trim()) return createMatch[1].trim();
          const remindMatch = raw.match(/^remind\s+me\b(?:\s*[:,-]?\s*(?:to\s+)?)?(.+)$/i);
          if (remindMatch?.[1]?.trim()) return remindMatch[1].trim();
          return null;
        })();
        if (reminderText) {
          handleCreateReminderFromText(reminderText);
          const modelText = `Personal reminder noted: ${reminderText}\nStill need a deadline for "${pendingDelegation.task}" (assigned to ${pendingDelegation.personName}).`;
          setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
          const nowTs = Date.now();
          setChatHistory(prev => [
            ...prev,
            { role: 'user', parts: [{ text: messageText }], _ts: nowTs },
            { role: 'model', parts: [{ text: JSON.stringify({ text: modelText }) }], _ts: nowTs }
          ]);
          return;
        }

        const newDelegation = parseDelegationFromText(messageText);
        if (newDelegation) {
          const nowTs = Date.now();
          if (newDelegation.deadline) {
            const created = await finalizeDelegation({ personName: newDelegation.personName, task: newDelegation.task }, newDelegation.deadline);
            if (created.ok) {
              setNotificationModal({ isOpen: true, title: 'Delegated Task Created', message: stripMarkdownForModal(created.message) });
            }
            const modelText = `${created.message}\nStill need a deadline for "${pendingDelegation.task}" (assigned to ${pendingDelegation.personName}).`;
            setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
            setChatHistory(prev => [
              ...prev,
              { role: 'user', parts: [{ text: messageText }], _ts: nowTs },
              { role: 'model', parts: [{ text: JSON.stringify({ text: modelText }) }], _ts: nowTs }
            ]);
            return;
          }
          setPendingDelegation({ personName: newDelegation.personName, task: newDelegation.task, requestedAt: nowTs });
          const modelText = `What deadline should I set for "${newDelegation.task}" (assigned to ${newDelegation.personName})? Try "tomorrow", "2026-02-15", or "2026-02-15 15:00".`;
          setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
          setChatHistory(prev => [
            ...prev,
            { role: 'user', parts: [{ text: messageText }], _ts: nowTs },
            { role: 'model', parts: [{ text: JSON.stringify({ text: modelText }) }], _ts: nowTs }
          ]);
          return;
        }

        const result = await finalizeDelegation({ personName: pendingDelegation.personName, task: pendingDelegation.task }, messageText);
        if (result.ok) {
          setPendingDelegation(null);
          setNotificationModal({ isOpen: true, title: 'Delegated Task Created', message: stripMarkdownForModal(result.message) });
        }
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

      const normalizedMessage = messageText.trim().toLowerCase();
      const isKeyFactsQuery =
        !isProjectDraftRequest &&
        !attachedFile &&
        !normalizedImageUrl &&
        !isSystemPromptPreview &&
        (normalizedMessage.includes('key facts') ||
          normalizedMessage.includes('assistant memory') ||
          normalizedMessage.includes('assistant configuration')) &&
        (normalizedMessage.startsWith('what') ||
          normalizedMessage.startsWith('show') ||
          normalizedMessage.startsWith('list') ||
          normalizedMessage.startsWith('tell') ||
          normalizedMessage.includes('remind me'));
      if (isKeyFactsQuery) {
        const userMessageId = Date.now() * 1000 + (messageIdRef.current++ % 1000);
        setChatMessages(prev => [...prev, { id: userMessageId, role: 'user', text: messageText }]);
        setChatInput('');
        setAttachedFile(null);
        const modelText = formatAssistantKeyFactsForDisplay(assistantMemoryRef.current || userProfile.assistantMemory);
        setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
        const nowTs = Date.now();
        setChatHistory(prev => [
          ...prev,
          { role: 'user', parts: [{ text: messageText }], _ts: nowTs },
          { role: 'model', parts: [{ text: JSON.stringify({ text: modelText }) }], _ts: nowTs }
        ]);
        return;
      }

      const directDelegation = parseDelegationFromText(messageText);
      if (directDelegation && !shouldBypassLocalShortcuts && !isProjectDraftRequest && !attachedFile && !normalizedImageUrl) {
        const userMessageId = Date.now() * 1000 + (messageIdRef.current++ % 1000);
        setChatMessages(prev => [...prev, { id: userMessageId, role: 'user', text: messageText }]);
        setChatInput('');
        setAttachedFile(null);
        const nowTs = Date.now();
        if (!directDelegation.deadline) {
          setPendingDelegation({ personName: directDelegation.personName, task: directDelegation.task, requestedAt: nowTs });
          const modelText = `What deadline should I set for "${directDelegation.task}" (assigned to ${directDelegation.personName})? Try "tomorrow", "2026-02-15", or "2026-02-15 15:00".`;
          setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
          setChatHistory(prev => [
            ...prev,
            { role: 'user', parts: [{ text: messageText }], _ts: nowTs },
            { role: 'model', parts: [{ text: JSON.stringify({ text: modelText }) }], _ts: nowTs }
          ]);
          return;
        }
        const result = await finalizeDelegation({ personName: directDelegation.personName, task: directDelegation.task }, directDelegation.deadline);
        if (result.ok) {
          setPendingDelegation(null);
          setNotificationModal({ isOpen: true, title: 'Delegated Task Created', message: stripMarkdownForModal(result.message) });
        } else {
          setPendingDelegation({ personName: directDelegation.personName, task: directDelegation.task, requestedAt: nowTs });
        }
        const modelText = result.message;
        setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
        setChatHistory(prev => [
          ...prev,
          { role: 'user', parts: [{ text: messageText }], _ts: nowTs },
          { role: 'model', parts: [{ text: JSON.stringify({ text: modelText }) }], _ts: nowTs }
        ]);
        return;
      }

      const directReminderText = (() => {
        const raw = String(messageText || '').trim();
        if (!raw) return null;
        const createMatch = raw.match(/^create\s+(?:a\s+)?reminder\b(?:\s*[:,-]?\s*(?:to\s+)?)?(.+)$/i);
        if (createMatch?.[1]?.trim()) return createMatch[1].trim();
        const remindMatch = raw.match(/^remind\s+me\b(?:\s*[:,-]?\s*(?:to\s+)?)?(.+)$/i);
        if (remindMatch?.[1]?.trim()) return remindMatch[1].trim();
        return null;
      })();
      if (directReminderText && !shouldBypassLocalShortcuts && !isProjectDraftRequest && !attachedFile && !normalizedImageUrl) {
        const userMessageId = Date.now() * 1000 + (messageIdRef.current++ % 1000);
        setChatMessages(prev => [...prev, { id: userMessageId, role: 'user', text: messageText }]);
        setChatInput('');
        setAttachedFile(null);
        handleCreateReminderFromText(directReminderText);
        const modelText = `Personal reminder noted: ${directReminderText}`;
        const nowTs = Date.now();
        setChatHistory(prev => [
          ...prev,
          { role: 'user', parts: [{ text: messageText }], _ts: nowTs },
          { role: 'model', parts: [{ text: JSON.stringify({ text: modelText }) }], _ts: nowTs }
        ]);
        return;
      }

      const directTaskText = (() => {
        const raw = String(messageText || '').trim();
        if (!raw) return null;
        const taskMatch = raw.match(/^create\s+(?:a\s+)?task\b(?:\s*[:,-]?\s*(?:to\s+)?)?(.+)$/i);
        if (taskMatch?.[1]?.trim()) return taskMatch[1].trim();
        return null;
      })();
      if (directTaskText && !shouldBypassLocalShortcuts && !isProjectDraftRequest && !attachedFile && !normalizedImageUrl) {
        const userMessageId = Date.now() * 1000 + (messageIdRef.current++ % 1000);
        setChatMessages(prev => [...prev, { id: userMessageId, role: 'user', text: messageText }]);
        setChatInput('');
        setAttachedFile(null);

        const newPriority: Top3Item = { id: `priority-${Date.now()}`, text: directTaskText, completed: false };
        setTop3Items(prev => [...(Array.isArray(prev) ? prev : []), newPriority]);

        const modelText = `Added to Top Priorities: ${directTaskText}`;
        const nowTs = Date.now();
        setChatHistory(prev => [
          ...prev,
          { role: 'user', parts: [{ text: messageText }], _ts: nowTs },
          { role: 'model', parts: [{ text: JSON.stringify({ text: modelText }) }], _ts: nowTs }
        ]);
        setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
        return;
      }

      const hasDraftPlan = Boolean(
        (draftedSchedule && draftedSchedule.length > 0) ||
        (draftedPriorities && draftedPriorities.length > 0)
      );

      const freeStyle = inferFreeStyle({
        messageText,
        pendingScheduleClarification: !!pendingScheduleClarification,
        eventOpsItems: pendingScheduleClarification?.eventOpsItems?.map((it) => ({ id: it.id, name: it.name })) ?? [],
        scheduleItems: scheduleItems.map((it) => ({ id: it.id, title: it.title })),
        reminders: reminders.map((it) => ({ id: it.id, text: it.text })),
      });

      const shouldBypassFreeStyleHeuristics =
        Boolean(normalizedOptions?.suppressChat) ||
        Boolean(normalizedOptions?.hideUserMessage) ||
        Boolean(isSystemPromptPreview);

      if (!shouldBypassFreeStyleHeuristics) {
        const freeStyleFinalize = hasDraftPlan && inferFinalizePlan(messageText);
        if (freeStyleFinalize && !isProjectDraftRequest && !attachedFile && !normalizedImageUrl) {
          const userMessageId = Date.now() * 1000 + (messageIdRef.current++ % 1000);
          setChatMessages(prev => [...prev, { id: userMessageId, role: 'user', text: messageText }]);
          setChatInput('');
          setAttachedFile(null);
          setIsSending(true);
          try {
            await handleConfirmPlan();
            const modelText = "Got it — I moved your draft into Today’s Schedule as pending. Review it, then click Finalize to sync it to Google Calendar.";
            setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: modelText }]);
            const nowTs = Date.now();
            setChatHistory(prev => [
              ...prev,
              { role: 'user', parts: [{ text: messageText }], _ts: nowTs },
              { role: 'model', parts: [{ text: JSON.stringify({ text: modelText }) }], _ts: nowTs }
            ]);
          } finally {
            setIsSending(false);
          }
          return;
        }

        if (freeStyle.intent === 'cancel_pending' && pendingScheduleClarification && !isProjectDraftRequest && !attachedFile && !normalizedImageUrl) {
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

        if ((freeStyle.intent === 'exclude_item' || freeStyle.intent === 'mark_done') && freeStyle.entities[0]?.confidence >= 0.7 && !isProjectDraftRequest && !attachedFile && !normalizedImageUrl) {
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
              const removedReminder = reminders.find((it) => it.id === target.id);
              if (removedReminder?.linkedTaskId) {
                setDismissedDelegatedReminderTaskIds(prev =>
                  prev.includes(removedReminder.linkedTaskId!) ? prev : [...prev, removedReminder.linkedTaskId!]
                );
              }
              forceSaveRef.current = true;
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
      }

      const requestId = Symbol('generation-request');
      generationRequestRef.current = requestId;

        // Check if this is a SYSTEM prompt
        const isSystemPrompt = messageText.startsWith('SYSTEM:');
        
        // For mode activation SYSTEM prompts, don't show in chat at all
        const shouldHideMessage = Boolean(normalizedOptions?.hideUserMessage) || Boolean(normalizedOptions?.suppressChat) || (isSystemPrompt && (
            messageText.includes('CRISIS MODE') || 
            messageText.includes('STRATEGIC MODE') || 
            messageText.includes('RED DAY MODE')
        ));
        
        const userMessageForUI = isSystemPrompt && !shouldHideMessage
            ? (messageText.includes('weekly report') ? 'Create my Weekly Report' : messageText.replace('SYSTEM: ', ''))
            : (attachedFile ? `${messageText}\n[Attached: ${attachedFile.name}]` : messageText);
            
      const userMessageId = Date.now() * 1000 + (messageIdRef.current++ % 1000);
      const newUserMessage: ChatMessage = { id: userMessageId, role: 'user', text: userMessageForUI };
      
      if (normalizedImageUrl) {
          newUserMessage.imageUrl = normalizedImageUrl;
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
      const isStartingBriefing = Boolean(briefingWindowForRequest) && (isMorningBriefingTrigger || isAfternoonBriefingTrigger);
      if (isStartingBriefing) {
        setPendingBriefingWindow(briefingWindowForRequest);
        setPendingBriefingContextSnapshot(briefingContext);
      }
      const effectiveBriefingContext =
        !isStartingBriefing && pendingBriefingContextSnapshot && briefingWindowForRequest
          ? pendingBriefingContextSnapshot
          : briefingContext;
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
              if (normalizedOptions?.suppressChat) {
                setNotificationModal({ isOpen: true, title: 'File Error', message: `Sorry, I was unable to read the file "${fileToProcess.name}".` });
              } else {
                setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: `Sorry, I was unable to read the file "${fileToProcess.name}".` }]);
              }
              if (generationRequestRef.current === requestId) {
                setIsSending(false);
              }
              return;
          }
      }

      if (pendingScheduleClarification && !isProjectDraftRequest && !fileToProcess && !normalizedImageUrl && !isSystemPrompt && !isFinalization) {
          const keyFactsForPrompt = (() => {
            const raw = String(userProfile.assistantMemory || '').trim();
            if (!raw) return '';
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((x) => `- ${String(x)}`).join('\n');
              if (typeof parsed === 'string') return parsed.trim();
              return raw;
            } catch {
              return raw;
            }
          })();
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
              keyFactsForPrompt ? `Key Facts (must respect):\n${keyFactsForPrompt}` : '',
              `User’s plan/context (most recent message):`,
              messageText,
              `Return a JSON response with text, schedule (array of objects with time/title), priorities, and isPlanDraft: true.`,
          ].filter(Boolean).join('\n');
      }
      
      const historyForGemini: Content[] = chatHistory.map(({ role, parts }) => ({ role, parts }));
      const trimmedHistory = isBriefingFinalizeRequest ? [] : historyForGemini;
      
      const newMessagePart: Content = { 
          role: 'user', 
          parts: normalizedImageUrl 
            ? [{ text: fullPrompt }, { inlineData: { mimeType: "image/jpeg", data: normalizedImageUrl.split(',')[1] } }] 
            : [{ text: fullPrompt }] 
      };

      const newHistory: Content[] = [...trimmedHistory, newMessagePart];
      const currentDashboardState: DashboardState = isBriefingFinalizeRequest
        ? {
            chatMessages: shouldHideMessage ? chatMessages : [...chatMessages, newUserMessage],
            chatHistory: chatHistory.slice(-10),
            scheduleItems: [],
            top3Items: [],
            reminders: effectiveBriefingContext.briefingReminders,
            projects: [],
            completedProjects: [],
            keepNotes,
            delegatedTasks: effectiveBriefingContext.briefingDelegatedTasks,
            team: userProfile.team,
            hasGreeted,
            lastResetDate,
            isScheduleConfirmed,
            briefingInputs: effectiveBriefingContext.briefingInputs,
            briefingState,
            collapsedCards,
            weeklyLog: [],
            priorityForTomorrow,
            dailyOpsMetrics,
            staffPerformanceLog,
            carryOverTasks,
            endOfDaySummary,
            endOfDayCompletedDate,
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
            reminders: effectiveBriefingContext.briefingReminders,
            projects,
            completedProjects,
            keepNotes,
            delegatedTasks: effectiveBriefingContext.briefingDelegatedTasks,
            team: userProfile.team,
            hasGreeted,
            lastResetDate,
            isScheduleConfirmed,
            briefingInputs: effectiveBriefingContext.briefingInputs,
            briefingState,
            collapsedCards,
            weeklyLog,
            priorityForTomorrow,
            dailyOpsMetrics,
            staffPerformanceLog,
            carryOverTasks,
            endOfDaySummary,
            endOfDayCompletedDate,
            stateVersion: DASHBOARD_STATE_VERSION,
            completedGCalEventIds: Array.from(completedGCalEventIds),
            currentMode,
            modeHistory,
            modeActivatedAt
          };
      try {
          const currentAccessToken = session?.provider_token || null;
          const freshEventOpsItems = isBriefingFinalizeRequest ? [] : await fetchEventOpsItemsForAI(14, true);
          if (freshEventOpsItems.length > 0) setEventOpsItems(freshEventOpsItems);
          const okrSnapshotText = isBriefingFinalizeRequest ? '' : await fetchOkrSnapshotForAI(true);
          const response = await sendMessageToGemini(
            newHistory,
            { ...userProfile, team: userProfile.team },
            currentDashboardState,
            googleCalendarEvents,
            new Date(),
            currentAccessToken,
            freshEventOpsItems,
            isBriefingFinalizeRequest ? { mode: 'briefing_finalize' } : { okrSnapshot: okrSnapshotText || undefined }
          );
          let overrideChatText: string | null = null;
          let overrideIsPlanDraft: boolean | null = null;
          let shouldClearPendingScheduleClarification = false;

          if (generationRequestRef.current !== requestId) {
            console.log("Generation stopped by user. Ignoring response.");
            return;
          }
          const isBriefingFinalizeResponse = briefingFinalizeRequestRef.current === requestId;
          
          if (!response?.isError && response.newMemoryToSave) {
            const updatedMemory = mergeAssistantKeyFact(assistantMemoryRef.current || userProfile.assistantMemory, response.newMemoryToSave);
            assistantMemoryRef.current = updatedMemory;
            forceSaveRef.current = true;
            await onProfileUpdate({ ...userProfile, assistantMemory: updatedMemory });
          }
          if (response.weeklyLogUpdates) {
            const todayStr = localIsoDateKey();
            const newLogs = response.weeklyLogUpdates.map((log: WeeklyLogUpdatePayload, index: number) => ({
                ...log,
                id: `log-${Date.now()}-${index}`,
                date: todayStr
            }));
            setWeeklyLog(prev => [...prev, ...newLogs]);
          }
          if (response.weeklyReport) {
            const range = weeklyReportMetricsRef.current;
            const relevant = range
              ? dailyOpsMetrics.filter(it => it.date >= range.startYmd && it.date <= range.endYmd)
              : dailyOpsMetrics;
            const moraleScores = relevant
              .map(it => it.moraleScore)
              .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
            const averageWeeklyMorale =
              moraleScores.length > 0
                ? Math.round((moraleScores.reduce((sum, v) => sum + v, 0) / moraleScores.length) * 10) / 10
                : null;
            const attendanceIssues = relevant
              .map(it => ({ date: it.date, text: String(it.attendanceIssues || '').trim() }))
              .filter(it => it.text.length > 0 && !/^(none|no|n\/a)\b/i.test(it.text))
              .map(it => `${it.date}: ${it.text}`);
            weeklyReportMetricsRef.current = null;
            setWeeklyReport({
              ...response.weeklyReport,
              averageWeeklyMorale,
              attendanceIssues,
            });
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
              const { personName, task, deadline, deadlineISO: providedDeadlineISO } = response.delegationUpdate;
              if (!personName || !task) {
                  setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: "To delegate a task, tell me who it's for and what the task is." }]);
              } else if (!deadline) {
                  setPendingDelegation({ personName, task, requestedAt: Date.now() });
                  setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: `What deadline should I set for "${task}" (assigned to ${personName})? Try "tomorrow", "2026-02-15", or "2026-02-15 15:00".` }]);
              } else {
                  // Parse deadline and generate deadlineISO if not provided or invalid
                  const parsed = parseDeadlineFromText(deadline);
                  const deadlineISO = providedDeadlineISO && isValidISOString(providedDeadlineISO) 
                      ? providedDeadlineISO 
                      : parsed?.deadlineISO || null;
                  
                  if (!deadlineISO) {
                      setPendingDelegation({ personName, task, requestedAt: Date.now() });
                      setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: `I couldn't parse the deadline "${deadline}". Please try "tomorrow", "2026-02-15", or "2026-02-15 15:00".` }]);
                      return;
                  }
              const assignee = userProfile.team.find(m => m.name.toLowerCase() === personName.toLowerCase());
              
              if (assignee) {
                  const loggedAt = getBriefingNowOverride() ?? Date.now();
                  const localTaskId = `delegated-${Date.now()}`;
                  
                  // Create task locally first (so user sees it even if Google sync fails)
                  const newTask: DelegatedTaskItem = {
                    id: localTaskId,
                    assigneeId: assignee.id,
                    assigneeName: assignee.name,
                    text: task,
                    deadline: deadline,
                    completed: false,
                    loggedAt,
                    updatedAt: loggedAt,
                    status: 'not_started',
                    remarks: '',
                  };
                  setDelegatedTasks(prev => dedupeDelegatedTasks([...prev, newTask]));
                  
                  // Try to sync to Google Tasks (but don't fail if it doesn't work)
                  const token = session?.provider_token;
                  if (token) {
                      try {
                          if (!taskListIdRef.current) {
                              const listId = await findOrCreateTaskList(token, `${userProfile.assistantName} Delegated Tasks`);
                              taskListIdRef.current = listId;
                          }
                          const notes = `Assigned to: ${assignee.name}\nStatus: In Progress`;
                          const googleTask = await createTask(token, taskListIdRef.current, task, notes, deadlineISO);
                          
                          // Update local task with Google Task ID
                          setDelegatedTasks(prev => prev.map(t => 
                            t.id === localTaskId 
                              ? { ...t, googleTaskId: googleTask.id }
                              : t
                          ));
                      } catch (error: any) {
                          console.error('Failed to sync delegated task to Google Tasks:', error);
                          // Task is already in local state, just log the sync error
                          if (isTasksApiDisabled(error)) {
                              setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: `Task created for ${assignee.name}, but Google Tasks sync failed. The task is saved locally.` }]);
                          } else if (isGoogleAuthError(error)) {
                              onGoogleAuthError();
                              setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: `Task created for ${assignee.name}, but Google connection expired. The task is saved locally. Please reconnect to sync.` }]);
                          } else {
                              setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: `Task created for ${assignee.name}, but Google Tasks sync failed: ${error.message}. The task is saved locally.` }]);
                          }
                      }
                  } else {
                      // No Google token - task is still created locally
                      setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: `Task created for ${assignee.name}. Connect Google to sync tasks.` }]);
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

          const hasDraftishSchedule =
              Boolean(response.schedule) &&
              (Array.isArray(response.schedule) ? response.schedule.length > 0 : typeof response.schedule === 'string' && response.schedule.trim().length > 0);
          const hasDraftishPriorities =
              Boolean(response.priorities) &&
              (Array.isArray(response.priorities) ? response.priorities.length > 0 : typeof response.priorities === 'string' && response.priorities.trim().length > 0);
          const shouldTreatAsPlanDraft =
              response.isPlanDraft === true ||
              response.isPlanDraft === "true" ||
              hasDraftishSchedule ||
              hasDraftishPriorities;

          if (shouldTreatAsPlanDraft) {
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

              const minutesToAmPm = (minutes: number) => {
                const h24 = Math.floor(minutes / 60) % 24;
                const m = minutes % 60;
                const meridiem = h24 >= 12 ? 'PM' : 'AM';
                const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
                return `${h12}:${String(m).padStart(2, '0')} ${meridiem}`;
              };

              if (scheduleCandidate.length === 0 && prioritiesCandidate.length > 0) {
                const busy: Array<{ start: number; end: number }> = [];
                (Array.isArray(googleCalendarEvents) ? googleCalendarEvents : []).forEach((event: any) => {
                  const startIso = event?.start?.dateTime;
                  const endIso = event?.end?.dateTime;
                  if (!startIso || !endIso) return;
                  const start = new Date(startIso);
                  const end = new Date(endIso);
                  const startMin = start.getHours() * 60 + start.getMinutes();
                  const endMin = end.getHours() * 60 + end.getMinutes();
                  if (Number.isFinite(startMin) && Number.isFinite(endMin) && endMin > startMin) {
                    busy.push({ start: startMin, end: endMin });
                  }
                });
                busy.sort((a, b) => a.start - b.start);

                const findSlot = (startAfter: number, duration: number, dayEnd: number) => {
                  let cursor = startAfter;
                  for (const block of busy) {
                    if (cursor + duration <= block.start) return cursor;
                    if (cursor < block.end && cursor + duration > block.start) cursor = block.end;
                  }
                  return cursor + duration <= dayEnd ? cursor : null;
                };

                const dayStart = 9 * 60;
                const dayEnd = 20 * 60;
                let cursor = dayStart;
                const duration = 60;
                const focusBlocks: ScheduleItem[] = [];
                prioritiesCandidate.forEach((priority) => {
                  const start = findSlot(cursor, duration, dayEnd);
                  if (start == null) return;
                  const end = start + duration;
                  focusBlocks.push({
                    id: `focus-${priority.id}`,
                    time: `${minutesToAmPm(start)} - ${minutesToAmPm(end)}`,
                    title: priority.text,
                    completed: Boolean(priority.completed),
                  });
                  busy.push({ start, end });
                  busy.sort((a, b) => a.start - b.start);
                  cursor = end;
                });

                scheduleCandidate = focusBlocks;
              }

              if (scheduleCandidate.length === 0 && prioritiesCandidate.length > 0) {
                scheduleCandidate = prioritiesCandidate.map((priority) => ({
                  id: `allday-${priority.id}`,
                  time: 'All Day',
                  title: priority.text,
                  completed: Boolean(priority.completed),
                }));
              }

              const todayYmd = toYmdLocal(new Date());
              const eventOpsCompact = freshEventOpsItems.map(item => ({
                id: item.id,
                kind: item.kind,
                event_date: item.event_date,
                name: item.name,
                location: item.location,
                serving_time: item.serving_time,
              }));

              const existingTitles = new Set(scheduleCandidate.map(s => normalizeNeedle(s.title)));
              const { blocks: eventOpsBlocks } = buildEventOpsBlocksForToday(eventOpsCompact, todayYmd);
              const eventOpsAdditions: ScheduleItem[] = [];
              eventOpsBlocks.forEach(({ start, end, item }: any) => {
                const needle = normalizeNeedle(item?.name);
                if (!needle) return;
                const alreadyIncluded = Array.from(existingTitles).some(t => t.includes(needle)) || existingTitles.has(`event ops — ${needle}`);
                if (alreadyIncluded) return;
                const time = `${minutesToAmPm(start)} - ${minutesToAmPm(end)}`;
                const id = `eventops-${String(item.id)}`;
                const title = `Event Ops — ${String(item.name)}`;
                eventOpsAdditions.push({ id, time, title, completed: false });
              });
              if (eventOpsAdditions.length > 0) {
                scheduleCandidate = [...scheduleCandidate, ...eventOpsAdditions].filter((s, idx, arr) => arr.findIndex(x => x.id === s.id) === idx);
                scheduleCandidate.sort((a, b) => {
                  const pa = parseScheduleRangeToMinutes(String(a.time || ''));
                  const pb = parseScheduleRangeToMinutes(String(b.time || ''));
                  if (!pa && !pb) return 0;
                  if (!pa) return 1;
                  if (!pb) return -1;
                  return pa.start - pb.start;
                });
              }

              const validation = detectEventOpsScheduleClarification({
                todayYmd,
                eventOpsItems: eventOpsCompact,
                proposedSchedule: scheduleCandidate.map(s => ({ time: s.time, title: s.title })),
              });

              const shouldAutoFinalizeKickoffPlan = Boolean(autoFinalizeKickoffPlanRef.current);
              if ('needsClarification' in validation && validation.needsClarification) {
                  // NOTE: User requested to REMOVE the red banner blocking logic.
                  // Instead of blocking, we will just let the AI's question pass through as text.
                  // We do NOT set pendingScheduleClarification.
                  
                  // setDraftedSchedule(null);
                  // setDraftedPriorities(null);
                  // setPendingScheduleClarification({ ... });
                  
                  // overrideChatText = validation.question;
                  // overrideIsPlanDraft = false;

                  // We still want to show the draft if possible, or just the text.
                  // If the AI generated a schedule, we show it. 
                  // If the validation failed, it means there is a conflict. 
                  // But the user wants the "Question" to be part of the flow, NOT a blocker.
                  // Since we are in the "Drafting" phase (Step 2), if the AI produced a schedule,
                  // we should show it. The AI system prompt should have handled the "Question" in Step 1.
                  
                  // If we are here, it means we are in Step 2 (Drafting) and the client-side check thinks it's bad.
                  // But the user says "REMOVE the incorrect UI/behavior".
                  // So we ignore this client-side check and proceed to show the draft.
                  
                  if (shouldAutoFinalizeKickoffPlan) {
                    if (scheduleCandidate.length > 0) setScheduleItems(scheduleCandidate);
                    if (prioritiesCandidate.length > 0) setTop3Items(prioritiesCandidate);
                    setDraftedSchedule(null);
                    setDraftedPriorities(null);
                    setIsScheduleConfirmed(false);
                    forceSaveRef.current = true;
                  } else {
                    if (scheduleCandidate.length > 0) setDraftedSchedule(scheduleCandidate);
                    if (prioritiesCandidate.length > 0) setDraftedPriorities(prioritiesCandidate);
                  }
                  if (pendingScheduleClarification) shouldClearPendingScheduleClarification = true;
              } else {
                  if (shouldAutoFinalizeKickoffPlan) {
                    if (scheduleCandidate.length > 0) setScheduleItems(scheduleCandidate);
                    if (prioritiesCandidate.length > 0) setTop3Items(prioritiesCandidate);
                    setDraftedSchedule(null);
                    setDraftedPriorities(null);
                    setIsScheduleConfirmed(false);
                    forceSaveRef.current = true;
                  } else {
                    if (scheduleCandidate.length > 0) setDraftedSchedule(scheduleCandidate);
                    if (prioritiesCandidate.length > 0) setDraftedPriorities(prioritiesCandidate);
                  }
                  if (pendingScheduleClarification) shouldClearPendingScheduleClarification = true;
              }

              if (openScheduleEditorOnNextKickoffDraftRef.current) {
                openScheduleEditorOnNextKickoffDraftRef.current = false;
                autoFinalizeKickoffPlanRef.current = false;
                setTimeout(() => {
                  setIsScheduleEditorOpen(true);
                }, 0);
              }
          } else {
              // Handle normal, non-draft updates
              if (response.currentMood) {
              setCurrentMood(response.currentMood as UserMood);
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
              // If there's a draft schedule, apply operations to the draft instead of confirmed schedule
              const targetSchedule = (draftedSchedule && draftedSchedule.length > 0) ? draftedSchedule : scheduleItems;
              const result = applyScheduleOps(targetSchedule, response.scheduleOps);
              
              if (draftedSchedule && draftedSchedule.length > 0) {
                  // Update the draft schedule
                  setDraftedSchedule(result.next);
              } else {
                  // Update the confirmed schedule
                  setScheduleItems(result.next);
                  setIsScheduleConfirmed(false);
              }
              opMessages.push(...result.messages);
          } else if (response.schedule) {
              // Full schedule overwrite - apply cascade logic to preserve existing items
              const scheduleArray = Array.isArray(response.schedule) 
                  ? response.schedule 
                  : typeof response.schedule === 'string' ? response.schedule.split('\n') : [];
              
              // Parse the new schedule
              let newScheduleItems: ScheduleItem[] = [];
              if (scheduleArray.length > 0 && typeof scheduleArray[0] === 'object' && scheduleArray[0].time) {
                  // Already in object format
                  newScheduleItems = scheduleArray.map((item: any, index: number) => {
                      const time = item.time || 'All Day';
                      const title = item.title || item.name || '';
                      const timeHash = time.replace(/[:\s-]/g, '').toLowerCase();
                      const titleHash = title.substring(0, 30).replace(/[^\w\s]/g, '').replace(/\s+/g, '-').toLowerCase();
                      const stableId = item.id || `sched-${timeHash}-${titleHash}-${index}`;
                      return { id: stableId, time, title, completed: Boolean(item.completed), isGoogleEvent: Boolean(item.isGoogleEvent) };
                  }).filter((item: ScheduleItem) => item.title);
              } else {
                  // Parse from string array
                  newScheduleItems = parseScheduleArray(scheduleArray);
              }
              
              // Use draft schedule if it exists, otherwise use confirmed schedule
              const existingSchedule = (draftedSchedule && draftedSchedule.length > 0) ? draftedSchedule : scheduleItems;
              
              // If the new schedule has significantly fewer items than existing, it's likely an update in disguise
              // Convert to scheduleOps to preserve all existing items
              if (existingSchedule.length > 0 && newScheduleItems.length < existingSchedule.length * 0.7) {
                  // This looks like an update, not a full replacement
                  // Try to match new items to existing items and create update operations
                  const updateOps: any[] = [];
                  newScheduleItems.forEach((newItem) => {
                      // Try to find matching existing item by title (fuzzy match)
                      const existingItem = existingSchedule.find(item => {
                          const itemTitle = normalizeNeedleUtil(item.title);
                          const newTitle = normalizeNeedleUtil(newItem.title);
                          return itemTitle.includes(newTitle) || newTitle.includes(itemTitle) || 
                                 itemTitle.split(/\s+/).some(w => w.length > 2 && newTitle.includes(w));
                      });
                      
                      if (existingItem) {
                          // This is an update
                          updateOps.push({
                              op: 'update',
                              match: { titleContains: existingItem.title },
                              item: { time: newItem.time, title: newItem.title }
                          });
                      } else {
                          // This is a new item
                          updateOps.push({
                              op: 'add',
                              item: { time: newItem.time, title: newItem.title }
                          });
                      }
                  });
                  
                  // Apply as scheduleOps instead
                  const targetSchedule = (draftedSchedule && draftedSchedule.length > 0) ? draftedSchedule : scheduleItems;
                  const result = applyScheduleOps(targetSchedule, updateOps);
                  
                  if (draftedSchedule && draftedSchedule.length > 0) {
                      setDraftedSchedule(result.next);
                  } else {
                      setScheduleItems(result.next);
                      setIsScheduleConfirmed(false);
                  }
                  opMessages.push(...result.messages);
              } else {
                  // Full schedule replacement - MERGE with existing items, don't replace
                  // Always start with ALL existing items to ensure nothing is lost
                  let finalSchedule = [...existingSchedule]; // Start with ALL existing items
                  
                  // Process each new item from AI's response
                  newScheduleItems.forEach((newItem) => {
                      // First, apply cascade to push down ANY conflicting items
                      finalSchedule = cascadeReschedule(finalSchedule, { time: newItem.time, title: newItem.title });
                      
                      // Check if this item already exists by title (fuzzy match) - don't check time since it might be updated
                      const existingIndex = finalSchedule.findIndex(item => {
                          const itemTitle = normalizeNeedleUtil(item.title);
                          const newTitle = normalizeNeedleUtil(newItem.title);
                          // Check if titles match (either contains the other, or has common keywords)
                          const itemWords = itemTitle.split(/\s+/).filter(w => w.length > 2);
                          const newWords = newTitle.split(/\s+/).filter(w => w.length > 2);
                          const hasCommonWords = newWords.length > 0 && newWords.some(nw => 
                              itemWords.some(iw => iw.includes(nw) || nw.includes(iw))
                          );
                          return itemTitle === newTitle || itemTitle.includes(newTitle) || newTitle.includes(itemTitle) || hasCommonWords;
                      });
                      
                      if (existingIndex >= 0) {
                          // Update existing item with new time
                          finalSchedule[existingIndex] = { ...finalSchedule[existingIndex], time: newItem.time, title: newItem.title };
                      } else {
                          // Add new item (only if it doesn't exist)
                          finalSchedule.push(newItem);
                      }
                  });
                  
                  // CRITICAL: Ensure ALL original items are still present
                  // If any items from existingSchedule are missing, add them back (they should have been pushed down by cascade)
                  const finalItemIds = new Set(finalSchedule.map(item => item.id));
                  existingSchedule.forEach(existingItem => {
                      if (!finalItemIds.has(existingItem.id)) {
                          // Item was lost - this shouldn't happen with cascade, but add it back as safety
                          console.warn(`Schedule item "${existingItem.title}" was lost during merge, adding back`);
                          finalSchedule.push(existingItem);
                      }
                  });
                  
                  // Sort by time
                  finalSchedule.sort((a, b) => {
                      const aRange = parseScheduleRangeToMinutes(a.time);
                      const bRange = parseScheduleRangeToMinutes(b.time);
                      if (!aRange) return 1;
                      if (!bRange) return -1;
                      return aRange.start - bRange.start;
                  });
                  
                  // Update the appropriate schedule (draft or confirmed)
                  if (draftedSchedule && draftedSchedule.length > 0) {
                      setDraftedSchedule(finalSchedule);
                  } else {
                      setScheduleItems(finalSchedule);
                      setIsScheduleConfirmed(false);
                  }
              }
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
          } else if (response.text) {
              const fallbackReminders = extractRemindersFromText(response.text);
              if (fallbackReminders.length > 0) {
                  const includeInBriefing = /both your morning and afternoon briefings|morning and afternoon briefings|both briefings/i.test(response.text)
                      ? 'both'
                      : /morning briefing/i.test(response.text) && /afternoon briefing/i.test(response.text)
                          ? 'both'
                          : /morning briefing/i.test(response.text)
                              ? 'morning'
                              : /afternoon briefing/i.test(response.text)
                                  ? 'afternoon'
                                  : DEFAULT_REMINDER_BRIEFING_PREF;
                  const baseTs = getBriefingNowOverride() ?? Date.now();
                  setReminders(prev => {
                      const existing = new Set(prev.map(item => normalizeTaskText(item.text)));
                      const additions = fallbackReminders
                          .map((text, index) => {
                              const trimmed = text.trim();
                              if (!trimmed) return null;
                              if (existing.has(normalizeTaskText(trimmed))) return null;
                              return {
                                  id: `rem-${baseTs}-${index}`,
                                  text: trimmed,
                                  completed: false,
                                  loggedAt: baseTs,
                                  includeInBriefing
                              };
                          })
                          .filter(Boolean) as ReminderItem[];
                      return normalizeReminders([...prev, ...additions]);
                  });
              }
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
          const normalizeEscapedNewlinesForDisplay = (value: string) => {
              if (value.includes('\\n') && !value.includes('\n')) {
                  return value.replace(/\\n/g, '\n');
              }
              return value;
          };

          const normalizeBriefingDraftForDisplay = (value: string) => {
              const normalized = value
                  .replace(/^\s*\*\s+/gm, '- ')
                  .replace(/^\s*•\s+/gm, '- ')
                  .replace(/\r\n/g, '\n')
                  .trim();

              return normalized
                  .replace(/([^\n])\n(\d+\.\s)/g, '$1\n\n$2')
                  .trim();
          };

          const normalizeBriefingScriptForDisplay = (value: string) => {
              const normalized = value
                  .replace(/^\s*[-*]\s+/gm, '• ')
                  .replace(/\r\n/g, '\n')
                  .trim();

              return normalized
                  .replace(/([^\n])\n(\d+\.\s)/g, '$1\n\n$2')
                  .trim();
          };

          const unescapeJsonString = (value: string) => {
              return value
                  .replace(/\\n/g, '\n')
                  .replace(/\\r/g, '\r')
                  .replace(/\\t/g, '\t')
                  .replace(/\\"/g, '"')
                  .replace(/\\\\/g, '\\');
          };

          const extractJsonStringFieldBestEffort = (raw: string, field: 'keep' | 'keep_draft' | 'text') => {
              const re = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i');
              const match = raw.match(re);
              if (!match?.[1]) return null;
              return unescapeJsonString(match[1]);
          };

          const stripAnyCodeFence = (raw: string) => {
              const trimmed = raw.trim();
              const match = trimmed.match(/`{3,}[a-z]*\s*([\s\S]*?)\s*`{3,}/i);
              if (match?.[1]) return match[1].trim();
              if (trimmed.startsWith('```') || trimmed.startsWith('``')) {
                  const lines = trimmed.split(/\r?\n/);
                  if (lines[0]?.trim().startsWith('```') || lines[0]?.trim().startsWith('``')) lines.shift();
                  if (lines.length > 0 && (lines[lines.length - 1]?.trim().startsWith('```') || lines[lines.length - 1]?.trim().startsWith('``'))) lines.pop();
                  return lines.join('\n').trim();
              }
              return trimmed;
          };

          const cleanBriefingScriptPlainText = (raw: string) => {
              let noFence = stripAnyCodeFence(raw);
              if (/^`{1,}\s*json\b/i.test(noFence)) {
                  noFence = noFence.replace(/^`{1,}\s*json\b/i, '').trimStart();
              }
              if (/^json\b/i.test(noFence)) {
                  const lines = noFence.split(/\r?\n/);
                  if (lines[0]?.trim().toLowerCase() === 'json') {
                      lines.shift();
                      noFence = lines.join('\n').trim();
                  }
              }
              const payload = extractPayloadFromText(noFence);
              const extracted =
                  typeof payload?.keep === 'string'
                      ? payload.keep
                      : typeof payload?.text === 'string'
                          ? payload.text
                          : extractJsonStringFieldBestEffort(noFence, 'keep') ??
                            extractJsonStringFieldBestEffort(noFence, 'text') ??
                            noFence;
              return normalizeBriefingScriptForDisplay(normalizeEscapedNewlinesForDisplay(String(extracted).trim()));
          };

          const extractPayloadFromText = (raw?: string): any | null => {
              if (!raw) return null;
              const trimmed = raw.trim();
              if (!trimmed) return null;

              const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
              let candidate = (fenceMatch?.[1] ?? trimmed).trim();
              if (!fenceMatch && candidate.startsWith("```")) {
                  const lines = candidate.split(/\r?\n/);
                  if (lines[0]?.trim().startsWith("```")) lines.shift();
                  if (lines.length > 0 && lines[lines.length - 1]?.trim().startsWith("```")) lines.pop();
                  candidate = lines.join("\n").trim();
              }

              const escapeNewlinesInJsonStrings = (input: string) => {
                  let out = '';
                  let inString = false;
                  let escaped = false;
                  for (let i = 0; i < input.length; i++) {
                      const ch = input[i];
                      if (!inString) {
                          if (ch === '"') inString = true;
                          out += ch;
                          continue;
                      }
                      if (escaped) {
                          out += ch;
                          escaped = false;
                          continue;
                      }
                      if (ch === '\\') {
                          out += ch;
                          escaped = true;
                          continue;
                      }
                      if (ch === '"') {
                          inString = false;
                          out += ch;
                          continue;
                      }
                      if (ch === '\n') {
                          out += '\\n';
                          continue;
                      }
                      if (ch === '\r') {
                          continue;
                      }
                      out += ch;
                  }
                  return out;
              };

              const tryParse = (input: string) => {
                  try {
                      return JSON.parse(input);
                  } catch {
                      try {
                          return JSON.parse(escapeNewlinesInJsonStrings(input));
                      } catch {
                          return null;
                      }
                  }
              };

              const direct = tryParse(candidate);
              if (direct && typeof direct === 'object') return direct;

              const start = candidate.indexOf('{');
              const end = candidate.lastIndexOf('}');
              if (start >= 0 && end > start) {
                  const sliced = tryParse(candidate.slice(start, end + 1));
                  if (sliced && typeof sliced === 'object') return sliced;
              }

              return null;
          };

          const derivedKeepDraftFromText =
              !response.keep_draft && typeof response.text === 'string'
                  ? extractJsonStringFieldBestEffort(response.text, 'keep_draft')
                  : null;
          const derivedKeepFromText =
              !response.keep && typeof response.text === 'string'
                  ? extractJsonStringFieldBestEffort(response.text, 'keep')
                  : null;

          const effectiveKeepDraft = response.keep_draft ?? derivedKeepDraftFromText;
          const effectiveKeep = response.keep ?? derivedKeepFromText;
          const effectiveKeepForFinalize = isBriefingFinalizeResponse ? (effectiveKeep ?? effectiveKeepDraft) : effectiveKeep;

          const actionDraftText =
              response?.action === 'UPDATE_BRIEFING_MODAL' && typeof response?.draftText === 'string'
                  ? response.draftText
                  : null;
          const looksLikeBriefingDraftText =
              typeof response.text === 'string' &&
              /BRIEFING\s+DRAFT/i.test(response.text) &&
              /(^|\n)\s*1\.\s+/i.test(response.text);
          const briefingDraftText =
              (typeof effectiveKeepDraft === 'string' && effectiveKeepDraft.trim()) ? effectiveKeepDraft
              : (typeof actionDraftText === 'string' && actionDraftText.trim()) ? actionDraftText
              : looksLikeBriefingDraftText ? String(response.text) : null;

          if (briefingDraftText) {
              const payload = extractPayloadFromText(briefingDraftText);
              const extracted =
                  typeof payload?.keep_draft === 'string'
                      ? payload.keep_draft
                      : typeof payload?.keep === 'string'
                          ? payload.keep
                          : typeof payload?.text === 'string'
                              ? payload.text
                              : extractJsonStringFieldBestEffort(String(briefingDraftText), 'keep_draft') ??
                                extractJsonStringFieldBestEffort(String(briefingDraftText), 'keep') ??
                                extractJsonStringFieldBestEffort(String(briefingDraftText), 'text') ??
                                briefingDraftText;
              const normalizedDraft = normalizeBriefingDraftForDisplay(normalizeEscapedNewlinesForDisplay(String(extracted).trim()));
              nextKeepNotes = normalizedDraft;
              nextBriefingState = 'draft';
          }

          if (effectiveKeepForFinalize) {
              if (isBriefingFinalizeResponse) {
                  setBriefingScript(cleanBriefingScriptPlainText(String(effectiveKeepForFinalize)));
                  if (briefingFinalizeTimeoutRef.current) {
                      clearTimeout(briefingFinalizeTimeoutRef.current);
                  }
                  briefingFinalizeRequestRef.current = null;
                  setBriefingState('finalized');
              } else {
                  const payload = extractPayloadFromText(effectiveKeepForFinalize);
                  const extracted =
                      typeof payload?.keep === 'string'
                          ? payload.keep
                          : typeof payload?.text === 'string'
                              ? payload.text
                              : extractJsonStringFieldBestEffort(String(effectiveKeepForFinalize), 'keep') ??
                                extractJsonStringFieldBestEffort(String(effectiveKeepForFinalize), 'text') ??
                                effectiveKeepForFinalize;
                  nextKeepNotes = normalizeBriefingDraftForDisplay(normalizeEscapedNewlinesForDisplay(String(extracted).trim()));
                  nextBriefingState = 'finalized';
              }
          } else if (isBriefingFinalizeResponse) {
              const rawFallback = response.text?.trim() || "";
              const fallbackScript = cleanBriefingScriptPlainText(rawFallback) || "No script generated.";
              setBriefingScript(fallbackScript);
              if (briefingFinalizeTimeoutRef.current) {
                  clearTimeout(briefingFinalizeTimeoutRef.current);
              }
              briefingFinalizeRequestRef.current = null;
          }
          const shouldMergeBriefingContext = Boolean((briefingDraftText || response.keep_draft || response.keep) && !isBriefingFinalizeResponse);
          const shouldConsumeBriefingContext = Boolean(pendingBriefingWindow) && shouldMergeBriefingContext;
          if (nextKeepNotes !== null) {
            const mergedNotes = shouldMergeBriefingContext
              ? mergeBriefingNotes(nextKeepNotes, effectiveBriefingContext)
              : nextKeepNotes;
            setKeepNotes(mergedNotes);
          }
          if (nextBriefingState) {
            setBriefingState(nextBriefingState);
          }
          if (shouldConsumeBriefingContext) {
            setReminders(effectiveBriefingContext.remainingReminders);
            setBriefingInputs(effectiveBriefingContext.remainingBriefingInputs);
            setDelegatedTasks(effectiveBriefingContext.remainingDelegatedTasks);
            setPendingBriefingWindow(null);
            setPendingBriefingContextSnapshot(null);
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

          const sanitizeChatText = (text?: string) => {
              if (!text) return text;
              const codeBlockIndex = text.lastIndexOf('```json');
              if (codeBlockIndex !== -1) {
                  const clipped = text.slice(0, codeBlockIndex).trimEnd();
                  return clipped || text;
              }
              const keepDraftInlineIndex = text.lastIndexOf('","keep_draft"');
              if (keepDraftInlineIndex !== -1) {
                  const clipped = text.slice(0, keepDraftInlineIndex).trimEnd();
                  return clipped || text;
              }
              const keepInlineIndex = text.lastIndexOf('","keep"');
              if (keepInlineIndex !== -1) {
                  const clipped = text.slice(0, keepInlineIndex).trimEnd();
                  return clipped || text;
              }
              const jsonTextIndex = text.lastIndexOf('{"text"');
              if (jsonTextIndex !== -1) {
                  const candidate = text.slice(jsonTextIndex).trim();
                  try {
                      const parsed = JSON.parse(candidate);
                      if (parsed && typeof parsed === 'object') {
                          return text.slice(0, jsonTextIndex).trimEnd();
                      }
                  } catch {
                  }
              }
              const braceIndex = text.lastIndexOf('{');
              if (braceIndex !== -1) {
                  const candidate = text.slice(braceIndex).trim();
                  if (
                      candidate.startsWith('{') &&
                      candidate.endsWith('}') &&
                      candidate.includes('"text"') &&
                      (candidate.includes('"schedule"') || candidate.includes('"priorities"') || candidate.includes('"isPlanDraft"'))
                  ) {
                      try {
                          const parsed = JSON.parse(candidate);
                          if (parsed && typeof parsed === 'object') {
                              return text.slice(0, braceIndex).trimEnd();
                          }
                      } catch {
                      }
                  }
              }
              return text;
          };

          const chatTextRaw = sanitizeChatText(overrideChatText ?? response.text);
          const chatText = chatTextRaw ?? '';
          const isBriefingRelatedResponse = Boolean(
              briefingWindowForRequest ||
              pendingBriefingWindow ||
              isMorningBriefingTrigger ||
              isAfternoonBriefingTrigger ||
              isBriefingFinalizeRequest ||
              isBriefingFinalizeResponse
          );
          const shouldSuppressAssistantChat =
              isBriefingRelatedResponse && (Boolean(briefingDraftText || effectiveKeep) || isBriefingFinalizeResponse);

          if (!normalizedOptions?.suppressChat && !shouldSuppressAssistantChat && (chatTextRaw || response.imageUrl || response.sources)) {
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
          } else if (!normalizedOptions?.suppressChat && response.weeklyReport) {
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
          if (!normalizedOptions?.suppressChat) {
            setChatHistory(prev => [
              ...prev,
              { role: 'user', parts: [{ text: fullPrompt }], _ts: nowTs },
              { role: 'model', parts: [{ text: JSON.stringify(response) }], _ts: nowTs }
            ]);
          }
      } catch (error) {
          console.error(error);
          const fallbackMessage =
            error instanceof Error && error.message
              ? error.message
              : "Sorry, I'm having trouble connecting. Please try again.";
          if (fallbackMessage.toLowerCase().includes('rate-limited')) {
            setAiCooldownUntil(Date.now() + 60_000);
          }
          if (normalizedOptions?.suppressChat) {
            setNotificationModal({ isOpen: true, title: 'AI Error', message: fallbackMessage });
          } else {
            setChatMessages(prev => [...prev, { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: fallbackMessage }]);
          }
          const isBriefingFinalizeResponse = briefingFinalizeRequestRef.current === requestId;
          if (isBriefingFinalizeResponse) {
              setBriefingScript(fallbackMessage);
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
    }, [chatInput, attachedFile, isMobileMenuOpen, isCommandPaletteOpen, chatHistory, chatMessages, scheduleItems, top3Items, reminders, projects, completedProjects, keepNotes, delegatedTasks, userProfile, hasGreeted, lastResetDate, isScheduleConfirmed, briefingInputs, briefingState, collapsedCards, weeklyLog, priorityForTomorrow, dailyOpsMetrics, staffPerformanceLog, carryOverTasks, endOfDaySummary, endOfDayCompletedDate, session, onProfileUpdate, onGoogleAuthError, googleCalendarEvents, draftedSchedule, draftedPriorities, completedGCalEventIds, pendingBriefingWindow, pendingBriefingContextSnapshot, buildProjectDraft, fetchEventOpsItemsForAI, pendingDelegation, finalizeDelegation, applyScheduleOps, applyPriorityOps, applyReminderOps, applyProjectOps, normalizeNeedle, handleCreateReminderFromText]);
    
    const handleProactiveAIMessage = useCallback(async (prompt: string) => {
        if (isSending) return;
        setIsSending(true);
        const currentAccessToken = session?.provider_token || null;
        const currentDashboardState: DashboardState = { chatMessages, chatHistory, scheduleItems, top3Items, reminders, projects, completedProjects, keepNotes, delegatedTasks, team: userProfile.team, hasGreeted, lastResetDate, isScheduleConfirmed, briefingInputs, briefingState, collapsedCards, weeklyLog, priorityForTomorrow, dailyOpsMetrics, staffPerformanceLog, carryOverTasks, endOfDaySummary, endOfDayCompletedDate, stateVersion: DASHBOARD_STATE_VERSION, completedGCalEventIds: Array.from(completedGCalEventIds) };
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
      }, [isSending, chatMessages, chatHistory, scheduleItems, top3Items, reminders, projects, completedProjects, keepNotes, delegatedTasks, userProfile, hasGreeted, lastResetDate, isScheduleConfirmed, briefingInputs, briefingState, collapsedCards, weeklyLog, priorityForTomorrow, dailyOpsMetrics, staffPerformanceLog, carryOverTasks, endOfDaySummary, endOfDayCompletedDate, session, googleCalendarEvents, completedGCalEventIds, fetchEventOpsItemsForAI]);

    const handleLinkedToggle = useCallback((itemId: string, isGCal: boolean, itemTitle: string, isCompleted: boolean) => {
      const newStatus = !isCompleted;
      const nowTs = Date.now();

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
                  (item.id === itemId && !isGCal) ? { ...item, completed: newStatus, updatedAt: nowTs } : item
              );
          } else {
              const bestIds = matchingIds(prev.map(item => ({ id: item.id, title: item.title })));
              if (bestIds.length === 0) return prev;
              updated = prev.map(item => bestIds.includes(item.id) ? { ...item, completed: newStatus, updatedAt: nowTs } : item);
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
    
    // Auto-create reminders for delegated tasks near/past deadline
    useEffect(() => {
        const { remindersToAdd, remindersToRemove } = checkTaskDeadlines(
            delegatedTasks,
            reminders,
            new Set(dismissedDelegatedReminderTaskIds),
            24
        );
        
        if (remindersToAdd.length > 0 || remindersToRemove.length > 0) {
            setReminders(prev => {
                let next = [...prev];
                
                // Remove completed task reminders
                next = next.filter(r => !remindersToRemove.includes(r.id));
                
                // Add new reminders (avoid duplicates by checking ID)
                remindersToAdd.forEach(newReminder => {
                    if (!next.find(r => r.id === newReminder.id)) {
                        next.push(newReminder);
                    }
                });
                
                return next;
            });
        }
    }, [delegatedTasks, reminders, dismissedDelegatedReminderTaskIds]);

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
      const nowTs = Date.now();
      const nextTasks = delegatedTasks.map(task => task.id === taskId ? { ...task, status, completed, updatedAt: nowTs } : task);
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
      const nowTs = Date.now();
      setDelegatedTasks(prev => prev.map(task => task.id === taskId ? { ...task, remarks, updatedAt: nowTs } : task));
    }, []);

    const handleDelegatedTaskDeadlineChange = useCallback((taskId: string, deadline: string) => {
      const nowTs = Date.now();
      setDelegatedTasks(prev => prev.map(task => task.id === taskId ? { ...task, deadline: deadline.trim() || 'TBD', updatedAt: nowTs } : task));
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

      setIsScheduleConfirmed(false);
      
      // Force immediate save to cloud state after finalization - save directly with finalized data
      // Save immediately with the finalized data to ensure persistence on refresh
      const stateToSave: DashboardState = {
        chatMessages, chatHistory, 
        scheduleItems: scheduleToFinalize || scheduleItems, 
        top3Items: prioritiesToFinalize || top3Items, 
        reminders, projects, completedProjects, keepNotes, delegatedTasks,
        dismissedDelegatedReminderTaskIds,
        team: userProfile.team, hasGreeted, lastResetDate, isScheduleConfirmed: false, briefingInputs, briefingState,
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
      setNotificationModal({
        isOpen: true,
        title: 'Schedule Ready',
        message: 'Your draft schedule is now in Today’s Schedule as pending. Review it, then click Finalize to sync to Google Calendar.',
      });
    }, [session, scheduleItems, draftedSchedule, draftedPriorities, onGoogleAuthError]);
    
    useEffect(() => {
      if (cloudError || isCloudLoading) return;
      const nowForEventOps = new Date();
      const todayYmd = toYmdLocal(nowForEventOps);
      if (eventOpsItems.length > 0 && lastEventOpsNudgeDate !== todayYmd) {
        const todayItems = eventOpsItems.filter(it => String(it.event_date) === todayYmd);
        if (todayItems.length > 0) {
          const scheduleLike = (draftedSchedule && draftedSchedule.length > 0) ? draftedSchedule : scheduleItems;
          const scheduleTitles = scheduleLike.map(s => normalizeNeedleUtil(s.title));
          const unscheduledToday = todayItems.filter(it => {
            const needle = normalizeNeedleUtil(it.name);
            if (!needle) return true;
            return !scheduleTitles.some(t => t.includes(needle));
          });

          const conflictCheck = detectEventOpsScheduleClarification({
            todayYmd,
            eventOpsItems: todayItems.map(it => ({
              id: it.id,
              kind: it.kind,
              event_date: it.event_date,
              name: it.name,
              location: it.location,
              serving_time: it.serving_time,
            })),
            proposedSchedule: scheduleLike.map(s => ({ time: s.time, title: s.title })),
          });

          if ('needsClarification' in conflictCheck && conflictCheck.needsClarification) {
            const messageText = `Heads up — your **Today’s Schedule** looks like it may conflict with an **Event Ops** item.\n\n${conflictCheck.question}\n\nWant me to adjust your schedule draft to fit it?`;
            setChatMessages(prev => [
              ...prev,
              { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: messageText }
            ]);
            setLastEventOpsNudgeDate(todayYmd);
          } else if (unscheduledToday.length > 0) {
            const upcomingSummary = unscheduledToday
              .slice(0, 6)
              .map(item => {
                const label = item.kind === 'event' ? 'Event' : 'Meeting';
                const timePart = item.kind === 'event' && item.serving_time ? ` • Serving ${String(item.serving_time).slice(0, 5)}` : '';
                const locationPart = item.location ? ` • ${item.location}` : '';
                return `- ${item.event_date}: ${label} — ${item.name}${timePart}${locationPart}`;
              })
              .join('\n');
            const messageText = `Heads up — you have **Event Ops** items today that aren’t in your schedule yet:\n\n${upcomingSummary}\n\nWant me to block time for them in **Today’s Schedule**?`;
            setChatMessages(prev => [
              ...prev,
              { id: Date.now() * 1000 + (messageIdRef.current++ % 1000), role: 'model', text: messageText }
            ]);
            setLastEventOpsNudgeDate(todayYmd);
          }
        }
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
        setTop3Items([]);
        setDraftedPriorities(null);
        setGoogleCalendarEvents([]);
        setCompletedGCalEventIds(new Set());
        setIsScheduleConfirmed(false);
        setSuppressCalendarFetch(true);
        setShowScheduleClearConfirm(false);
        setShowPrioritiesClearConfirm(false);
    }, []);

    const createScheduleItem = useCallback((item: { time: string; title: string }) => {
        const title = item.title.trim();
        if (!title) return;
        const time = item.time.trim() || 'All Day';
        const id = `sched-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        setScheduleItems(prev => [...prev, { id, time, title, completed: false }]);
        setIsScheduleConfirmed(false);
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
        setIsScheduleConfirmed(false);
    }, []);

    const deleteScheduleItem = useCallback((id: string) => {
        setScheduleItems(prev => prev.filter(item => item.id !== id));
        setIsScheduleConfirmed(false);
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

        const ok = await verifyGoogleAccount(token);
        if (!ok) return;

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
    }, [session, onGoogleAuthError, verifyGoogleAccount]);

    const syncScheduleToGoogleCalendar = useCallback(async (scheduleOverride?: ScheduleItem[]) => {
        const token = session?.provider_token;
        if (!token) {
            setNotificationModal({
                isOpen: true,
                title: 'Google Not Connected',
                message: 'Connect Google to sync your schedule.'
            });
            return false;
        }

        const ok = await verifyGoogleAccount(token);
        if (!ok) return false;

        const scheduleToSync = (scheduleOverride ?? scheduleItems).filter(item => !item.isGoogleEvent);
        if (scheduleToSync.length === 0) {
            setNotificationModal({
                isOpen: true,
                title: 'Nothing To Sync',
                message: 'There are no local schedule items to sync.'
            });
            return false;
        }

        try {
            setIsSyncing(true);
            await batchAddEventsToCalendar(token, scheduleToSync);
            setNotificationModal({
                isOpen: true,
                title: 'Sync Successful',
                message: 'Your schedule has been successfully synced with your Google Calendar.'
            });
            return true;
        } catch (error: any) {
            console.error('Error during calendar sync:', error);
            if (error?.status === 401 || error?.status === 403) {
                setCloudError("Your Google connection has expired. Please reconnect.");
                onGoogleAuthError();
                return false;
            }
            setCloudError(`Failed to sync schedule: ${error?.message || error}. Please try reconnecting your Google account.`);
            return false;
        } finally {
            setIsSyncing(false);
        }
    }, [session, scheduleItems, onGoogleAuthError, verifyGoogleAccount]);

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
        setBriefingScript('');
        setIsBriefingScriptVisible(false);
        setShowKeepResetConfirm(false);

        const stateToSave: DashboardState = {
          chatMessages,
          chatHistory,
          scheduleItems,
          top3Items,
          reminders,
          projects,
          completedProjects,
          keepNotes: '',
          delegatedTasks,
          dismissedDelegatedReminderTaskIds,
          team: userProfile.team,
          hasGreeted,
          lastResetDate,
          isScheduleConfirmed,
          briefingInputs,
          briefingState: 'idle',
          collapsedCards,
          weeklyLog,
          priorityForTomorrow,
          stateVersion: DASHBOARD_STATE_VERSION,
          completedGCalEventIds: Array.from(completedGCalEventIds),
          currentMode,
          currentMood,
          recentContext,
          lastInteraction,
          modeHistory,
          modeActivatedAt,
          nudgedTaskIds: Array.from(nudgedTaskIds),
          notifiedEventIds: Array.from(notifiedEventIds),
          nudgedDelegatedTaskIds: Array.from(nudgedDelegatedTaskIds),
          suppressCalendarFetch,
          lastEventOpsNudgeDate,
          pendingDelegation: pendingDelegation ?? undefined,
          pendingScheduleClarification: pendingScheduleClarification ?? undefined,
        };

        saveDashboardState(userProfile.id, stateToSave).catch((err: any) =>
          console.error("Failed to save state after clearing briefing notes:", err)
        );
        forceSaveRef.current = true;
    }, [chatMessages, chatHistory, scheduleItems, top3Items, reminders, projects, completedProjects, delegatedTasks, dismissedDelegatedReminderTaskIds, userProfile.team, userProfile.id, hasGreeted, lastResetDate, isScheduleConfirmed, briefingInputs, collapsedCards, weeklyLog, priorityForTomorrow, completedGCalEventIds, currentMode, currentMood, recentContext, lastInteraction, modeHistory, modeActivatedAt, nudgedTaskIds, notifiedEventIds, nudgedDelegatedTaskIds, suppressCalendarFetch, lastEventOpsNudgeDate, pendingDelegation, pendingScheduleClarification]);
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
    
    const handleMakeChanges = useCallback(() => {
        // Open schedule editor modal instead of sending message to AI
        console.log('[ScheduleEditor] Opening modal via handleMakeChanges');
        console.log('[ScheduleEditor] Current draftedSchedule:', draftedSchedule, 'length:', draftedSchedule?.length || 0);
        console.log('[ScheduleEditor] Current scheduleItems:', scheduleItems, 'length:', scheduleItems?.length || 0);
        console.log('[ScheduleEditor] Total chat messages:', chatMessages.length);
        console.log('[ScheduleEditor] Total chat history items:', chatHistory.length);
        
        // If draftedSchedule is null/empty, try multiple sources
        if (!draftedSchedule || draftedSchedule.length === 0) {
            console.log('[ScheduleEditor] No draftedSchedule, searching for schedule...');
            
            let foundSchedule: ScheduleItem[] | null = null;
            
            // First, check if scheduleItems has content (might be a draft that was moved)
            if (scheduleItems && scheduleItems.length > 0) {
                console.log('[ScheduleEditor] Found scheduleItems with', scheduleItems.length, 'items, using as draft');
                foundSchedule = scheduleItems;
            } else {
                // Try to extract from chatHistory first (contains full JSON response)
                console.log('[ScheduleEditor] Checking chatHistory for full response...');
                for (let i = chatHistory.length - 1; i >= 0; i--) {
                    const historyItem = chatHistory[i];
                    if (historyItem.role === 'model' && historyItem.parts && historyItem.parts.length > 0) {
                        try {
                            const responseText = historyItem.parts[0].text;
                            if (responseText) {
                                const parsedResponse = JSON.parse(responseText);
                                console.log('[ScheduleEditor] Parsed response from chatHistory:', {
                                    hasSchedule: !!parsedResponse.schedule,
                                    scheduleLength: parsedResponse.schedule?.length,
                                    isPlanDraft: parsedResponse.isPlanDraft
                                });
                                
                                if (parsedResponse.schedule && Array.isArray(parsedResponse.schedule) && parsedResponse.schedule.length > 0) {
                                    // Parse the schedule from the response object
                                    const scheduleArray = parsedResponse.schedule;
                                    if (scheduleArray.length > 0 && typeof scheduleArray[0] === 'object' && scheduleArray[0].time) {
                                        // Already in object format
                                        foundSchedule = scheduleArray.map((item: any, index: number) => {
                                            const time = item.time || 'All Day';
                                            const title = item.title || item.name || '';
                                            const timeHash = time.replace(/[:\s-]/g, '').toLowerCase();
                                            const titleHash = title.substring(0, 30).replace(/[^\w\s]/g, '').replace(/\s+/g, '-').toLowerCase();
                                            const stableId = item.id || `sched-${timeHash}-${titleHash}-${index}`;
                                            return { id: stableId, time, title, completed: Boolean(item.completed), isGoogleEvent: Boolean(item.isGoogleEvent) };
                                        }).filter((item: ScheduleItem) => item.title);
                                        
                                        if (foundSchedule && foundSchedule.length > 0) {
                                            console.log('[ScheduleEditor] Found schedule in chatHistory response:', foundSchedule.length, 'items');
                                            break;
                                        }
                                    } else {
                                        // Parse from string array
                                        foundSchedule = parseScheduleArray(scheduleArray);
                                        if (foundSchedule && foundSchedule.length > 0) {
                                            console.log('[ScheduleEditor] Parsed schedule from chatHistory string array:', foundSchedule.length, 'items');
                                            break;
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            // Not JSON, skip
                            console.log('[ScheduleEditor] ChatHistory item is not JSON, skipping');
                        }
                    }
                }
                
                // If still not found, try extracting from chat message text
                if (!foundSchedule || foundSchedule.length === 0) {
                    console.log('[ScheduleEditor] Not found in chatHistory, trying chat message text extraction...');
                    for (let i = chatMessages.length - 1; i >= 0; i--) {
                        const msg = chatMessages[i];
                        console.log(`[ScheduleEditor] Checking message ${i}:`, { 
                            role: msg.role, 
                            hasText: !!msg.text, 
                            textLength: msg.text?.length || 0,
                            isPlanDraft: (msg as any).isPlanDraft 
                        });
                        
                        if (msg.role === 'model' && ((msg as any).isPlanDraft || msg.text?.includes('Today\'s Schedule:'))) {
                            console.log('[ScheduleEditor] Found potential plan draft message, extracting schedule...');
                            console.log('[ScheduleEditor] Message text preview:', msg.text?.substring(0, 500));
                            
                            const extracted = extractDraftScheduleFromText(msg.text || '');
                            console.log('[ScheduleEditor] Extracted schedule items:', extracted);
                            
                            if (extracted && extracted.length > 0) {
                                console.log('[ScheduleEditor] Successfully extracted', extracted.length, 'schedule items from message');
                                foundSchedule = extracted;
                                break; // Found it, stop searching
                            } else {
                                console.warn('[ScheduleEditor] Extraction returned empty array, trying alternative parsing...');
                                // Try a more aggressive extraction
                                const lines = msg.text?.split('\n') || [];
                                const scheduleLines = lines.filter(line => {
                                    const trimmed = line.trim();
                                    return /^\d{1,2}:\d{2}\s*(AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(AM|PM)/i.test(trimmed);
                                });
                                console.log('[ScheduleEditor] Found', scheduleLines.length, 'schedule-like lines:', scheduleLines);
                                if (scheduleLines.length > 0) {
                                    const altExtracted = parseScheduleArray(scheduleLines);
                                    if (altExtracted.length > 0) {
                                        console.log('[ScheduleEditor] Alternative extraction found', altExtracted.length, 'items');
                                        foundSchedule = altExtracted;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // If we found a schedule, set it as draftedSchedule
            if (foundSchedule && foundSchedule.length > 0) {
                console.log('[ScheduleEditor] Setting draftedSchedule with', foundSchedule.length, 'items');
                setDraftedSchedule(foundSchedule);
                // Use setTimeout to ensure state update completes before opening modal
                setTimeout(() => {
                    setIsScheduleEditorOpen(true);
                }, 0);
                return; // Exit early, modal will open in setTimeout
            } else {
                console.warn('[ScheduleEditor] No schedule found in any source');
            }
        } else {
            console.log('[ScheduleEditor] Using existing draftedSchedule with', draftedSchedule.length, 'items');
        }
        
        setIsScheduleEditorOpen(true);
    }, [setIsScheduleEditorOpen, isScheduleEditorOpen, draftedSchedule, scheduleItems, chatMessages, chatHistory, extractDraftScheduleFromText, setDraftedSchedule, parseScheduleArray]);
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

    const handleFinalizeBriefing = useCallback((notesOverride?: string) => {
        const context = filterBriefingContext(null, reminders, briefingInputs, delegatedTasks);
        const baseNotes = (typeof notesOverride === 'string' ? notesOverride : keepNotes)?.trim() || '';
        const briefingTypeHint =
          /AFTERNOON\s+BRIEFING/i.test(baseNotes)
            ? 'AFTERNOON'
            : /MORNING\s+BRIEFING/i.test(baseNotes)
              ? 'MORNING'
              : '';
        const hasEmbeddedContext = /(^|\n)(REMINDERS:|DELEGATED TASKS:|VIEW POINTERS:)/i.test(baseNotes);
        const merged = hasEmbeddedContext ? baseNotes : mergeBriefingNotes(baseNotes, {
          briefingReminders: context.briefingReminders,
          briefingInputs: context.briefingInputs,
          briefingDelegatedTasks: context.briefingDelegatedTasks,
        });
        const limitedNotes = merged.length > 2500 ? `${merged.slice(0, 2500).trimEnd()}…` : merged;
        const notesBlock = limitedNotes ? `\n\n--- BRIEFING NOTES TO CONVERT ---\n${limitedNotes}` : '';
        const typeBlock = briefingTypeHint ? `\n\nBRIEFING TYPE: ${briefingTypeHint}` : '';
        setIsBriefingScriptVisible(true);
        setBriefingScript('Generating briefing script...');
        if (briefingFinalizeTimeoutRef.current) {
            clearTimeout(briefingFinalizeTimeoutRef.current);
        }
        briefingFinalizeTimeoutRef.current = window.setTimeout(() => {
            setBriefingScript("This is taking longer than expected. Please try Finalize again.");
            setIsSending(false);
        }, 60000);
        const afternoonFormatBlock =
          briefingTypeHint === 'AFTERNOON'
            ? `\n\nFORMAT REQUIREMENTS:\n- Output plain text only (no JSON).\n- Convert into TALKING POINTS (no paragraphs).\n- Use numbered sections with trailing colons (e.g., "1. OPERATIONAL FOCUS & EVENTS:").\n- Under each section, use hyphen bullets "- " with 3–6 bullets.\n- Each bullet must be one sentence and start with an action/keyword.\n- Do not include greetings/openers or narrative filler.\n- Do not include REMINDERS/DELEGATED TASKS raw dumps; integrate them into bullets.\n`
            : '';
        handleSendMessage(
            undefined,
            `Finalize the briefing as talking points.${typeBlock}${afternoonFormatBlock}${notesBlock}`,
            undefined,
            { hideUserMessage: true }
        );
    }, [handleSendMessage, keepNotes, reminders, briefingInputs, delegatedTasks]);
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

      const prompt = `Time for my daily kick-off.`;
      await handleSendMessage(undefined, prompt);
    }, [handleSendMessage]);

    const generateSmartEodQuestions = useCallback((now = new Date()) => {
      const scan = scanImportantItemsForEod(now);

      type Candidate = { sourceType: 'delegated' | 'reminder' | 'focus' | 'briefing' | 'project'; sourceId: string; title: string; time?: string; context?: string };
      const candidates: Candidate[] = [];

      const fullDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const primaryFocusParts: string[] = [];
      const topFocus = top3Items.map(it => String(it.text || '').trim()).filter(Boolean).slice(0, 2);
      if (topFocus.length > 0) {
        primaryFocusParts.push(...topFocus);
      } else {
        const scheduleFocus = scan.focusScheduleItems.map(it => String(it.title || '').trim()).filter(Boolean).slice(0, 2);
        if (scheduleFocus.length > 0) primaryFocusParts.push(...scheduleFocus);
      }
      setEndOfDayIntro(
        `Let's wrap up your day. Based on your previous inputs, today was ${fullDate}` +
        (primaryFocusParts.length > 0 ? `, and your primary focus was on ${primaryFocusParts.join(' and ')}.` : '.')
      );

      scan.dueDelegatedTasks.forEach(task => {
        candidates.push({
          sourceType: 'delegated',
          sourceId: task.id,
          title: `${task.assigneeName}: ${task.text}`,
          context: `Deadline: ${task.deadline}`,
        });
      });

      const todayYmd = scan.todayYmd;
      delegatedTasks
        .filter(t => !t.completed)
        .filter(t => {
          const loggedAt = typeof t.loggedAt === 'number' ? t.loggedAt : null;
          if (!loggedAt) return false;
          return toYmdLocal(new Date(loggedAt)) === todayYmd;
        })
        .forEach(task => {
          if (candidates.some(c => c.sourceType === 'delegated' && c.sourceId === task.id)) return;
          candidates.push({
            sourceType: 'delegated',
            sourceId: task.id,
            title: `${task.assigneeName}: ${task.text}`,
            context: task.deadline ? `Deadline: ${task.deadline}` : '',
          });
        });

      scan.dueReminders.forEach(reminder => {
        candidates.push({
          sourceType: 'reminder',
          sourceId: reminder.id,
          title: reminder.text,
        });
      });

      scan.focusScheduleItems.forEach(item => {
        candidates.push({
          sourceType: 'focus',
          sourceId: item.id,
          title: item.title,
          time: item.time,
        });
      });

      if (scan.hasMorningBriefing) {
        candidates.push({
          sourceType: 'briefing',
          sourceId: 'keepNotes',
          title: 'Morning Briefing',
          context: scan.briefingContextLines.slice(0, 3).join(' | '),
        });
      }

      scan.dueProjects.forEach(project => {
        candidates.push({
          sourceType: 'project',
          sourceId: project.id,
          title: project.name,
          context: `Deadline: ${project.deadline}`,
        });
      });

      const weight = (c: Candidate) => {
        if (c.sourceType === 'delegated') return 100;
        if (c.sourceType === 'reminder') return 90;
        if (c.sourceType === 'focus') return 80;
        if (c.sourceType === 'briefing') return 70;
        return 60;
      };

      const selected = candidates
        .sort((a, b) => weight(b) - weight(a))
        .slice(0, 6);

      const fallbackQuestions = () => {
        const result: Array<{ id: string; sourceType: Candidate['sourceType']; sourceId: string; title: string; question: string; answer: string }> = [];
        selected.forEach((c) => {
          if (result.length >= 3) return;
          if (c.sourceType === 'delegated') {
            result.push({ id: `q-${c.sourceId}`, sourceType: c.sourceType, sourceId: c.sourceId, title: c.title, question: `Status update: ${c.title}. Completed, blocked, or carry-over?`, answer: '' });
          } else if (c.sourceType === 'reminder') {
            result.push({ id: `q-${c.sourceId}`, sourceType: c.sourceType, sourceId: c.sourceId, title: c.title, question: `Were you able to follow up on "${c.title}" today?`, answer: '' });
          } else if (c.sourceType === 'focus') {
            result.push({ id: `q-${c.sourceId}`, sourceType: c.sourceType, sourceId: c.sourceId, title: c.title, question: `What was the outcome of "${c.title}"${c.time ? ` (${c.time})` : ''}? Completed, blocked, or needs carry-over?`, answer: '' });
          } else if (c.sourceType === 'briefing') {
            const ctx = c.context ? ` (Key topics: ${c.context})` : '';
            result.push({ id: `q-${c.sourceId}`, sourceType: c.sourceType, sourceId: c.sourceId, title: c.title, question: `Did the morning briefing issues get resolved${ctx}? What still needs follow-up?`, answer: '' });
          } else if (c.sourceType === 'project') {
            result.push({ id: `q-${c.sourceId}`, sourceType: c.sourceType, sourceId: c.sourceId, title: c.title, question: `Project "${c.title}" was due today. What progress happened, and what remains?`, answer: '' });
          }
        });
        return result;
      };

      if (selected.length === 0) {
        setSmartEodQuestions([]);
        setSmartEodQuestionsDate(todayYmd);
        return;
      }
      setSmartEodQuestions(fallbackQuestions());
      setSmartEodQuestionsDate(todayYmd);
    }, [scanImportantItemsForEod, delegatedTasks, top3Items, toYmdLocal]);

    const setSmartEodAnswer = useCallback((questionId: string, value: string) => {
      setSmartEodQuestions(prev => prev.map(q => q.id === questionId ? { ...q, answer: value } : q));
    }, []);

    const openInterviewModal = useCallback((mode: 'kickoff' | 'morning-briefing' | 'afternoon-briefing' | 'end-of-day') => {
      setInterviewModalMode(mode);
      if (mode === 'end-of-day') {
        const todayYmd = toYmdLocal(new Date());
        if (smartEodQuestions.length === 0 || smartEodQuestionsDate !== todayYmd) {
          setIsSmartEodLoading(false);
          generateSmartEodQuestions(new Date());
        }
      }
      setIsInterviewModalOpen(true);
    }, [generateSmartEodQuestions, smartEodQuestions.length, smartEodQuestionsDate, toYmdLocal]);

    const closeInterviewModal = useCallback(() => {
      setIsInterviewModalOpen(false);
    }, []);

    const setInterviewAnswer = useCallback((mode: 'kickoff' | 'morning-briefing' | 'afternoon-briefing', index: number, value: string) => {
      setInterviewDrafts(prev => {
        const current = prev[mode] ?? { answers: [], otherNotes: '' };
        const nextAnswers = [...(current.answers || [])];
        while (nextAnswers.length <= index) nextAnswers.push('');
        nextAnswers[index] = value;
        return { ...prev, [mode]: { ...current, answers: nextAnswers } };
      });
    }, []);

    const setInterviewOtherNotes = useCallback((mode: 'kickoff' | 'morning-briefing' | 'afternoon-briefing', value: string) => {
      setInterviewDrafts(prev => {
        const current = prev[mode] ?? { answers: [], otherNotes: '' };
        return { ...prev, [mode]: { ...current, otherNotes: value } };
      });
    }, []);

    const carryOverDecision = useCallback((taskId: string, decision: 'yes' | 'no') => {
      setCarryOverTasks(prev => {
        const task = prev.find(t => t.id === taskId);
        if (!task || task.status !== 'open') return prev;
        if (decision === 'yes') {
          const carryTitle = `[Carry-Over] ${task.title}`;
          setScheduleItems(items => {
            const focusIndex = items.findIndex(it => !it.isGoogleEvent && /\bfocus\s*block\b/i.test(String(it.title || '')));
            if (focusIndex >= 0) {
              const focusItem = items[focusIndex];
              const suffix = ` — Carry-Over: ${task.title}`;
              if (String(focusItem.title || '').includes(suffix)) return items;
              const next = [...items];
              next[focusIndex] = { ...focusItem, title: `${String(focusItem.title || '').trim()}${suffix}` };
              return next;
            }
            if (items.some(it => it.title === carryTitle)) return items;
            return [...items, { id: `carry-${Date.now()}`, time: task.time || 'All Day', title: carryTitle, completed: false }];
          });
          setTop3Items(items => {
            const normalized = String(task.title || '').trim().toLowerCase();
            if (!normalized) return items;
            if (items.some(it => String(it.text || '').trim().toLowerCase() === normalized)) return items;
            if (items.length >= 3) return items;
            return [...items, { id: `pri-${Date.now()}`, text: task.title, completed: false }];
          });
        }
        return prev.map(t => t.id === taskId ? { ...t, status: decision === 'yes' ? 'added' : 'archived', resolvedAt: Date.now() } : t);
      });
    }, []);

    const submitEndOfDayReview = useCallback(async () => {
      const todayStr = localIsoDateKey();
      const morale = typeof endOfDayDraft.morale === 'number' ? Math.min(5, Math.max(1, endOfDayDraft.morale)) : null;
      const attendanceIssues = String(endOfDayDraft.attendance || '').trim();
      const coachingNotes = String(endOfDayDraft.coachingNotes || '').trim();
      const otherNotes = String(endOfDayDraft.otherNotes || '').trim();
      const accomplishmentsRaw = String(endOfDayDraft.accomplishments || '').trim();
      const challengesRaw = String(endOfDayDraft.challenges || '').trim();
      const goalTomorrow = String(endOfDayDraft.goalTomorrow || '').trim();
      const leadershipJournal = String(endOfDayDraft.leadershipJournal || '').trim();
      const delegatedFollowUp = String(endOfDayDraft.delegatedFollowUp || '').trim();

      const normalizeTitle = (text: string) =>
        text
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      const isCarryOverAnswer = (text: string) =>
        /(didn'?t\s+finish|not\s+finished|unfinished|not\s+done|pending|carry[-\s]?over|continue\s+tomorrow|tomorrow|roll\s+over|still\s+need|ran\s+out\s+of\s+time|couldn'?t\s+complete)/i.test(text);
      const carryOverCandidates = smartEodQuestions
        .map(q => ({
          id: q.id,
          sourceType: q.sourceType,
          sourceId: q.sourceId,
          title: String(q.title || '').trim(),
          answer: String(q.answer || '').trim(),
        }))
        .filter(q => q.title.length > 0 && q.answer.length > 0 && isCarryOverAnswer(q.answer));
      if (carryOverCandidates.length > 0) {
        setCarryOverTasks(prev => {
          const openKey = new Set(prev.filter(t => t.status === 'open').map(t => normalizeTitle(t.title)));
          const additions: CarryOverTaskEntry[] = [];
          carryOverCandidates.forEach((c) => {
            const derivedTitle =
              c.sourceType === 'project'
                ? `Project: ${c.title}`
                : c.sourceType === 'briefing'
                  ? `Briefing Follow-up: ${c.title}`
                  : c.title;
            const key = normalizeTitle(derivedTitle);
            if (openKey.has(key)) return;
            openKey.add(key);
            additions.push({
              id: `carry-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              dateFlagged: todayStr,
              title: derivedTitle,
              time: undefined,
              sourceScheduleItemId: c.sourceType === 'focus' ? c.sourceId : undefined,
              status: 'open',
            });
          });
          return additions.length > 0 ? [...prev, ...additions] : prev;
        });
      }

      const entry: DailyOpsMetricEntry = {
        id: `ops-${Date.now()}`,
        date: todayStr,
        moraleScore: morale,
        attendanceIssues,
        createdAt: Date.now(),
      };

      setDailyOpsMetrics(prev => {
        const withoutToday = prev.filter(it => it.date !== todayStr);
        return [...withoutToday, entry];
      });

      if (coachingNotes) {
        const perfEntry: StaffPerformanceLogEntry = {
          id: `perf-${Date.now()}`,
          date: todayStr,
          text: coachingNotes,
          createdAt: Date.now(),
        };
        setStaffPerformanceLog(prev => [...prev, perfEntry]);
      }

      const splitLines = (raw: string) =>
        raw
          .split(/\r?\n/)
          .map(line => line.trim().replace(/^[-•*]\s+/, ''))
          .filter(Boolean);
      const accomplishments = splitLines(accomplishmentsRaw);
      const challenges = splitLines(challengesRaw);

      if (accomplishments.length > 0 || challenges.length > 0) {
        setWeeklyLog(prev => {
          const keep = prev.filter(it => it.date !== todayStr || (it.type !== 'accomplishment' && it.type !== 'challenge'));
          const baseTs = Date.now();
          const next: WeeklyLogItem[] = [];
          accomplishments.forEach((text, idx) => {
            next.push({ id: `wl-${baseTs}-a-${idx}`, date: todayStr, type: 'accomplishment', text });
          });
          challenges.forEach((text, idx) => {
            next.push({ id: `wl-${baseTs}-c-${idx}`, date: todayStr, type: 'challenge', text });
          });
          return [...keep, ...next];
        });
      }

      if (goalTomorrow) {
        setPriorityForTomorrow(goalTomorrow);
      }

      const summaryParts: string[] = [];
      summaryParts.push(`Morale: ${morale ? `${morale}/5` : 'N/A'}`);
      summaryParts.push(`Attendance: ${attendanceIssues ? 'Logged' : 'None reported'}`);
      if (accomplishments.length > 0) summaryParts.push(`${accomplishments.length} accomplishment${accomplishments.length === 1 ? '' : 's'} logged`);
      if (challenges.length > 0) summaryParts.push(`${challenges.length} challenge${challenges.length === 1 ? '' : 's'} logged`);
      if (coachingNotes) summaryParts.push('Coaching notes saved');
      if (otherNotes) summaryParts.push('Other notes saved');
      if (goalTomorrow) summaryParts.push('Goal for tomorrow saved');
      if (leadershipJournal) summaryParts.push('Leadership journal saved');
      if (delegatedFollowUp) summaryParts.push('Delegated follow-up saved');
      if (carryOverCandidates.length > 0) summaryParts.push(`${carryOverCandidates.length} carry-over item${carryOverCandidates.length === 1 ? '' : 's'} flagged`);

      setEndOfDaySummary(summaryParts.join(' · '));
      setEndOfDayCompletedDate(todayStr);
      setNotificationModal({ isOpen: true, title: 'End-of-Day Saved', message: 'Your end-of-day review has been saved.' });
      setIsInterviewModalOpen(false);
    }, [endOfDayDraft, smartEodQuestions]);

    const handleGenerateInterview = useCallback(async () => {
      if (!interviewModalMode) return;
      if (interviewModalMode === 'end-of-day') return;
      const fullDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const draft = interviewDrafts[interviewModalMode] ?? { answers: [], otherNotes: '' };

      const kickOffQuestions = [
        'What are your top 3 priorities for today?',
        'What are the 1–2 highest-risk issues that could derail your day?',
        'What must be done before lunch?',
        'What can be delegated today (and to whom)?',
        'What is your single deep-focus block today and what outcome defines success?',
      ];
      const morningBriefingQuestions = [
        'What is the single most important operational focus for this morning?',
        'Any staffing or coverage changes the team must know?',
        'Any incidents, risks, or guest-impacting issues to highlight?',
        'What coaching point or standard do you want emphasized today?',
      ];
      const afternoonBriefingQuestions = [
        'What progress was made against today’s plan?',
        'Any incidents, constraints, or blockers the next shift must know?',
        'What handoff items must be completed before end of shift?',
        'What should be prioritized first tomorrow morning?',
      ];

      const questions =
        interviewModalMode === 'kickoff'
          ? kickOffQuestions
          : interviewModalMode === 'morning-briefing'
            ? morningBriefingQuestions
            : afternoonBriefingQuestions;

      const qas = questions
        .map((q, idx) => {
          const a = String(draft.answers?.[idx] ?? '').trim();
          return `Q${idx + 1}: ${q}\nA${idx + 1}: ${a || '(no answer provided)'}`;
        })
        .join('\n\n');

      const otherNotes = String(draft.otherNotes || '').trim();
      if (otherNotes) {
        const chunks = otherNotes
          .split(/\r?\n|;/)
          .map((line) => String(line || '').trim())
          .filter(Boolean);
        const messages: string[] = [];
        for (const chunk of chunks) {
          const reminderMatch =
            chunk.match(/^create\s+(?:a\s+)?reminder\b(?:\s*[:,-]?\s*(?:to\s+)?)?(.+)$/i) ||
            chunk.match(/^remind\s+me\b(?:\s*[:,-]?\s*(?:to\s+)?)?(.+)$/i);
          const reminderText = reminderMatch?.[1]?.trim();
          if (reminderText) {
            handleCreateReminderFromText(reminderText);
            messages.push(`Reminder created: ${reminderText}`);
            continue;
          }

          const delegation = parseDelegationFromText(chunk);
          if (delegation) {
            const deadline = delegation.deadline?.trim() || 'today';
            const result = await finalizeDelegation({ personName: delegation.personName, task: delegation.task }, deadline);
            messages.push(result.message);
            continue;
          }
        }

        if (messages.length > 0) {
          setNotificationModal({
            isOpen: true,
            title: 'Created from Other Notes',
            message: messages.map(stripMarkdownForModal).join('\n'),
          });
        }
      }

      let prompt = '';
      if (interviewModalMode === 'kickoff') {
        prompt = [
          'Generate a Daily Kick-off plan from the interview answers.',
          'Return a single valid JSON object with EXACTLY these top-level fields: text, schedule, priorities, isPlanDraft.',
          'Set isPlanDraft to true (boolean).',
          'Do not ask follow-up questions. Do not include any extra fields.',
          'Interview Answers:',
          qas,
          otherNotes ? `Other Updates / Notes:\n${otherNotes}` : 'Other Updates / Notes: (none)',
        ].join('\n\n');
      } else {
        const briefingNow = getBriefingNow();
        const briefingWindowForRequest = buildBriefingWindow(interviewModalMode === 'morning-briefing' ? 'morning' : 'afternoon', briefingNow);
        const briefingContext = filterBriefingContext(briefingWindowForRequest, reminders, briefingInputs, delegatedTasks);

        const remindersBlock = briefingContext.briefingReminders.map((r) => `- ${r.text}`).join('\n') || '- (none)';
        const pointersBlock = briefingContext.briefingInputs.map((p) => `- ${p.text}`).join('\n') || '- (none)';
        const delegatedBlock = briefingContext.briefingDelegatedTasks.map((t) => `- ${t.text} (Assignee: ${t.assigneeName}, Deadline: ${t.deadline})`).join('\n') || '- (none)';

        const titlePrefix = interviewModalMode === 'morning-briefing' ? 'MORNING BRIEFING DRAFT' : 'AFTERNOON BRIEFING DRAFT';
        prompt = [
          `Create ${interviewModalMode === 'morning-briefing' ? 'morning' : 'afternoon'} briefing notes from the interview answers and the provided dashboard context.`,
          'Return a single valid JSON object with these top-level fields: text, keep_draft.',
          `keep_draft MUST be plain text only and MUST start with: \"${titlePrefix} - ${fullDate}\"`,
          'Use numbered sections with trailing colons (e.g., \"1. OPERATIONAL FOCUS & EVENTS:\") and hyphen bullets \"- \".',
          'Do not ask questions. Do not include keep. Do not include any *Ops fields.',
          'Interview Answers:',
          qas,
          otherNotes ? `Other Updates / Notes:\n${otherNotes}` : 'Other Updates / Notes: (none)',
          'Dashboard Context (include items verbatim):',
          `REMINDERS:\n${remindersBlock}`,
          `BRIEFING POINTERS / LOGS:\n${pointersBlock}`,
          `DELEGATED TASKS:\n${delegatedBlock}`,
        ].join('\n\n');
      }

      if (interviewModalMode === 'kickoff') {
        openScheduleEditorOnNextKickoffDraftRef.current = true;
        autoFinalizeKickoffPlanRef.current = true;
        await handleSendMessage(undefined, prompt, undefined, { hideUserMessage: true });
      } else {
        await handleSendMessage(undefined, prompt, undefined, { suppressChat: true, hideUserMessage: true });
      }
      setIsInterviewModalOpen(false);
    }, [interviewModalMode, interviewDrafts, handleSendMessage, reminders, briefingInputs, delegatedTasks, handleCreateReminderFromText, parseDelegationFromText, finalizeDelegation]);
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

        const today = new Date();
        const summary = buildWeeklyDashboardSummary({
          today,
          weeklyLog,
          dailyOpsMetrics,
        });

        const weekStartYmd = (() => {
          const t = new Date(today);
          t.setHours(0, 0, 0, 0);
          const day = t.getDay();
          const diff = (day + 6) % 7;
          t.setDate(t.getDate() - diff);
          return toYmdLocal(t);
        })();
        const weekEndYmd = toYmdLocal(today);
        const weeklyOpsEntries = dailyOpsMetrics.filter(it => it.date >= weekStartYmd && it.date <= weekEndYmd);
        const computedAttendanceIssues = weeklyOpsEntries
          .map(it => ({ date: it.date, text: String(it.attendanceIssues || '').trim() }))
          .filter(it => it.text.length > 0 && !/^(none|no|n\/a)\b/i.test(it.text))
          .map(it => `${it.date}: ${it.text}`);
        
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
            text: `Perfect timing! Let me pull together your weekly dashboard summary for ${summary.week_of}.`
        };
        setChatMessages(prev => [...prev, assistantAck]);
        
        // Auto-populate project snapshots from dashboard
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
        
        const accomplishments = summary.highlights;
        const challenges = summary.lowlights;

        weeklyReportMetricsRef.current = null;

        const report: WeeklyReport = {
          weekRange: summary.week_of,
          summary: [
            `Week of ${summary.week_of}.`,
            `Total breakage: ${summary.financials.total_breakage}.`,
            summary.metrics.avg_morale == null ? 'Average morale: N/A.' : `Average morale: ${summary.metrics.avg_morale}.`,
          ].join('\n'),
          averageWeeklyMorale: summary.metrics.avg_morale,
          attendanceIssues: computedAttendanceIssues,
          accomplishments,
          challenges,
          projects: projectUpdates,
          nextSteps: [],
        };

        setWeeklyReport(report);
        setIsWeeklyReportModalOpen(true);
    }, [handleSendMessage, delegatedTasks, projects, weeklyLog, modeHistory, chatMessages, dailyOpsMetrics, toYmdLocal]);

    const handleGenerateEmailReport = useCallback(async (report: WeeklyReport): Promise<string | null> => {
        setEmailVersion(''); // Clear previous email version
        const reportJson = JSON.stringify(report, null, 2);
        
        const prompt = `Transform the following weekly report into a professional plain-text email suitable for sending to management or stakeholders.

CRITICAL INSTRUCTIONS:
- Format it as a complete email with Subject line, greeting, body, and signature
- The email should look like a real professional email, not a report document
- Include placeholders [Recipient Name], [Your Name], and [Your Job Title] for personalization
- Use proper email formatting with clear sections
- If the modeActivity field is present: this is critical context showing crisis situations, strategic planning, or high-workload periods. Integrate this prominently as a dedicated section or weave it naturally into the narrative
- Output MUST be plain text only: do not use markdown formatting characters like *, **, _, backticks, or code fences
- For bullet points, use "- " or "• " (do not use "* " as a bullet)

REQUIRED EMAIL STRUCTURE:
Subject: Weekly Report: [Week Range]

Dear [Recipient Name],

[Opening paragraph introducing the report and setting context - if modeActivity exists, mention it here: e.g., "This week presented several challenges requiring elevated operational response..." or "This was a particularly intensive week..."]

[Executive Summary section - transform the summary into a natural paragraph]

${report.modeActivity ? `
Operational Context & Challenge Resolution
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
            updatedAt: loggedAt,
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
                message: `Could not add task to Google Tasks. The task is saved locally. Reason: ${error.message}`
            });
            return;
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

    const pendingSchedule = (!isScheduleConfirmed && scheduleItems.some(it => !it.isGoogleEvent))
      ? scheduleItems.filter(it => !it.isGoogleEvent)
      : null;

    const finalizeSchedule = useCallback(async () => {
      const ok = await syncScheduleToGoogleCalendar();
      if (!ok) return;
      setIsScheduleConfirmed(true);
      forceSaveRef.current = true;
    }, [syncScheduleToGoogleCalendar]);

    const value: DashboardContextType = {
        onLogout: props.onLogout,
        onLock: props.onLock,
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
        isBriefingNotesModalOpen,
        weeklyLog, priorityForTomorrow, dailyOpsMetrics, staffPerformanceLog, carryOverTasks, endOfDaySummary, endOfDayCompletedDate, endOfDayIntro, smartEodQuestions, isSmartEodLoading, weeklyReport, isWeeklyReportModalOpen, emailVersion, isEmailVersionModalOpen, setIsEmailVersionModalOpen, notificationModal, briefingScript, isBriefingScriptVisible, showScheduleClearConfirm, showPrioritiesClearConfirm, showRemindersClearConfirm, showProjectsClearConfirm,
        projectToDelete, isAddTaskModalOpen, showDelegatedClearConfirm,
        displayedScheduleItems, isSidebarCollapsed,
        pendingSchedule,
        finalizeSchedule,
        currentMode, currentMood, recentContext, modeHistory, modeActivatedAt,
        pendingDelegation,
        pendingScheduleClarification,
        isInterviewModalOpen,
        interviewModalMode,
        interviewDrafts,
        endOfDayDraft,
        setEndOfDayDraft,
        desktopTextareaRef, mobileTextareaRef, desktopFileInputRef, mobileFileInputRef,
        setCurrentView, setIsMobileMenuOpen, setMobileView, setChatInput, setShowResetConfirm,
        setShowKeepResetConfirm, setQuickActionModal, setIsPatchNotesVisible, setIsFeedbackVisible, setIsCommandPaletteOpen,
        setAttachedFile, setInitialSettingsTab, setSuppressCalendarFetch, setProjects, setCompletedProjects, setReminders, setScheduleItems, setDelegatedTasks, setOpenSidebarSections,
        setSelectedProject, setIsBriefingPointersVisible, setShowBriefingClearConfirm, setContextMenu, setWeeklyLog, setPriorityForTomorrow, setDailyOpsMetrics, setStaffPerformanceLog, setCarryOverTasks, setEndOfDaySummary, setEndOfDayCompletedDate, setSmartEodAnswer, setWeeklyReport, setIsWeeklyReportModalOpen,
        setIsBriefingNotesModalOpen,
        setNotificationModal, setBriefingScript, setIsBriefingScriptVisible, setShowScheduleClearConfirm, setShowPrioritiesClearConfirm, setShowRemindersClearConfirm, setShowProjectsClearConfirm, setProjectToDelete,
        setKeepNotes, setBriefingState, setIsAddTaskModalOpen, setShowDelegatedClearConfirm, setIsSidebarCollapsed,
        setPendingDelegation,
        setPendingScheduleClarification,
        handleSendMessage, handleManualReset, handleDailyKickoff, handleToggleCard, handleClosePatchNotes, handleClearErrors,
        handleToggleRecording, handleChatInput, handleChatKeyDown, handleFileChange, handleLinkedToggle, handleSimpleToggle,
        handleReminderBriefingPreferenceChange, handleDelegatedTaskToggle, handleDelegatedTaskStatusChange, handleDelegatedTaskRemarksChange, handleDelegatedTaskDeadlineChange,
        handleConfirmPlan, handleMakeChanges, handleConfirmProjectDraft, handleMakeProjectChanges, handleProjectUpdate, requestProjectDraft, saveProjectDraft, handleFinalizeBriefing, openQuickActionModal,
        handleModalConfirm, handleStopGeneration, handleClearBriefingPointers,
        isScheduleEditorOpen, setIsScheduleEditorOpen, handleProactiveAIMessage, setIsScheduleConfirmed, setDraftedSchedule, setDraftedPriorities,
        confirmClearBriefingPointers, handleCreateReminderFromText, handleAddBriefingFromText, handleCreateWeeklyReport, handleGenerateEmailReport,
        handleClearSchedule, handleClearPriorities, handleClearReminders, handleClearKeepNotes, handleConfirmDeleteProject,
        handleOpenAddTaskModal, handleAddDelegatedTask, handleClearDelegatedTasks, handleClearProjects,
        handleActivateMode, handleDeactivateMode, cancelPendingDelegation, cancelPendingScheduleClarification,
        openInterviewModal, closeInterviewModal, setInterviewAnswer, setInterviewOtherNotes, carryOverDecision, submitEndOfDayReview, handleGenerateInterview,
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
