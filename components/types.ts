import type { Content } from '@google/genai';

export type View = 'login' | 'createAccount' | 'forgotPassword' | 'setupWizard' | 'dashboard' | 'privacyPolicy' | 'termsOfService' | 'resetPassword' | 'twoFactor' | 'superLogin' | 'superConsole';
export type LegalPageSource = 'login' | 'dashboard' | 'createAccount';
export type DashboardView = 'main' | 'analytics' | 'events' | 'okr' | 'dutyRoster';
export type UserMood = 'neutral' | 'positive' | 'negative' | 'stressed' | 'excited' | 'tired';

export interface WizardData {
  assistantName: string;
  role: string;
  responsibilities: string;
  dailyTasks: string;
  deepFocusProjects: string;
  metrics: string;
  meetings: string;
  timeChallenge: string;
  commStyle: string;
  successDefinition: string;
  standardScheduleStart?: string;
  standardScheduleEnd?: string;
  standardScheduleDays?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
}

export interface UserProfile extends WizardData {
  id: string;
  name: string;
  nickname: string;
  email: string;
  companyId: string;
  mobileNumber: string;
  avatar: string;
  assistantAvatar: string;
  setup_complete: boolean;
  assistantMemory: string;
  team: TeamMember[];
  passiveMemory: unknown[];
  relationalMemory: { nodes: unknown[]; edges: unknown[] };
  last_seen_version?: string | null;
  tour_completed?: boolean;
  is_app_locked?: boolean;
}

export type BriefingInputItem = { id: string; type: string; text: string; loggedAt?: number; };

export interface CreateAccountFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreedToTerms: boolean;
}

export type ScheduleItemSource = 'user' | 'event_ops' | 'rule' | 'blocked';
export type ScheduleItem = { id: string; time: string; title: string; completed: boolean; isGoogleEvent?: boolean; source?: ScheduleItemSource; eventOpsId?: string; };
export type BlockedTimeSlotSource = 'rule';
export type BlockedTimeSlot = { id: string; start: number; end: number; timeLabel: string; title: string; source: BlockedTimeSlotSource; reason?: string; };
export type Top3Item = { id:string; text: string; completed: boolean; };
export type ReminderBriefingPreference = 'none' | 'morning' | 'afternoon' | 'both';
export type ReminderItem = { id: string; text: string; completed: boolean; loggedAt?: number; includeInBriefing?: ReminderBriefingPreference; linkedTaskId?: string; };

export type EventOpsKind = 'event' | 'meeting';

export type EventOpsItem = {
  id: string;
  user_id: string;
  kind: EventOpsKind;
  event_date: string;
  name: string;
  location: string | null;
  pax: number | null;
  serving_time: string | null;
  remarks: string | null;
  created_at?: string;
  updated_at?: string;
};
export interface DelegatedTaskItem {
  id: string;
  assigneeId: string;
  assigneeName: string;
  text: string;
  deadline: string;
  completed: boolean;
  googleTaskId?: string;
  loggedAt?: number;
  status?: 'not_started' | 'in_progress' | 'completed';
  remarks?: string;
}
export type Milestone = { id: string; text: string; progress: number; assigneeName?: string; linkedTaskIds?: string[]; };
export type Project = { id:string; name: string; deadline: string; milestones: Milestone[]; };
export type ChatMessage = { id: number; role: 'user' | 'model'; text: string; imageUrl?: string; sources?: { uri: string; title: string; }[]; isPlanDraft?: boolean; isProjectDraft?: boolean; isWeeklyReport?: boolean; };
export type ChatHistoryItem = Content & { _ts?: number };
export type BriefingState = 'idle' | 'draft' | 'finalized';
export type WeeklyLogItem = { id: string; date: string; type: 'accomplishment' | 'challenge'; text: string; };
export type AssistantMode = 'crisis' | 'strategic' | 'red-day' | null;
export type ModeHistoryEntry = { mode: 'crisis' | 'strategic' | 'red-day'; activatedAt: number; deactivatedAt?: number; };

export type DepartmentRole = 'director' | 'manager' | 'assistant_manager' | 'supervisor' | 'rank_and_file';

export type Department = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at?: string;
};

export type DepartmentMembership = {
  id: string;
  user_id: string;
  department_id: string;
  role: DepartmentRole;
  created_at?: string;
  updated_at?: string;
};

export type AuditEvent = {
  id: string;
  action_type: string;
  actor_user_id: string;
  target_user_id: string | null;
  source_department_id: string | null;
  destination_department_id: string | null;
  before_state: unknown;
  after_state: unknown;
  reason: string;
  created_at: string;
};
export type DailyOpsMetricEntry = {
  id: string;
  date: string;
  moraleScore: number | null;
  attendanceIssues: string;
  createdAt: number;
};
export type StaffPerformanceLogEntry = {
  id: string;
  date: string;
  text: string;
  createdAt: number;
};
export type CarryOverTaskEntry = {
  id: string;
  dateFlagged: string;
  title: string;
  time?: string;
  sourceScheduleItemId?: string;
  status: 'open' | 'added' | 'archived';
  resolvedAt?: number;
};
export interface WeeklyReport {
  summary: string;
  accomplishments: string[];
  challenges: string[];
  projects: Array<{ name: string; progress: number; status: string; nextMilestone?: string }>;
  nextSteps: string[];
  weekRange?: string;
  modeActivity?: string;
  averageWeeklyMorale?: number | null;
  attendanceIssues?: string[];
}

export interface DashboardState {
    chatMessages: ChatMessage[];
    chatHistory: ChatHistoryItem[];
    scheduleItems: ScheduleItem[];
    top3Items: Top3Item[];
    reminders: ReminderItem[];
    dismissedDelegatedReminderTaskIds?: string[];
    projects: Project[];
    completedProjects: Project[];
    keepNotes: string;
    delegatedTasks: DelegatedTaskItem[];
    hasGreeted: boolean;
    lastResetDate: string;
    isScheduleConfirmed: boolean;
    briefingInputs: BriefingInputItem[];
    briefingState: BriefingState;
    collapsedCards: Record<string, boolean>;
    team: TeamMember[];
    weeklyLog: WeeklyLogItem[];
    priorityForTomorrow: string;
    dailyOpsMetrics?: DailyOpsMetricEntry[];
    staffPerformanceLog?: StaffPerformanceLogEntry[];
    carryOverTasks?: CarryOverTaskEntry[];
    endOfDaySummary?: string;
    endOfDayCompletedDate?: string;
    stateVersion?: string;
    completedGCalEventIds?: string[];
    currentMode?: AssistantMode;
    modeHistory?: ModeHistoryEntry[];
    modeActivatedAt?: number;
    nudgedTaskIds?: string[];
    notifiedEventIds?: string[];
    nudgedDelegatedTaskIds?: string[];
    suppressCalendarFetch?: boolean;
    currentMood?: UserMood;
    recentContext?: string[];
    lastEventOpsNudgeDate?: string;
    pendingDelegation?: { personName: string; task: string; requestedAt: number };
    pendingScheduleClarification?: {
      reason: 'event_ops_conflict' | 'event_ops_missing_time';
      question: string;
      createdAt: number;
      eventOpsItems: Array<Pick<EventOpsItem, 'id' | 'kind' | 'event_date' | 'name' | 'location' | 'serving_time'>>;
    };
    lastInteraction?: number;
}
