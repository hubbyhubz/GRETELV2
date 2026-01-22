import type { Content } from '@google/genai';

export type View = 'login' | 'createAccount' | 'forgotPassword' | 'setupWizard' | 'dashboard' | 'privacyPolicy' | 'termsOfService' | 'resetPassword' | 'twoFactor';
export type LegalPageSource = 'login' | 'dashboard' | 'createAccount';
export type DashboardView = 'main' | 'analytics' | 'events';
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

export type ScheduleItem = { id: string; time: string; title: string; completed: boolean; isGoogleEvent?: boolean; };
export type Top3Item = { id:string; text: string; completed: boolean; };
export type ReminderBriefingPreference = 'none' | 'morning' | 'afternoon' | 'both';
export type ReminderItem = { id: string; text: string; completed: boolean; loggedAt?: number; includeInBriefing?: ReminderBriefingPreference; };
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
export interface WeeklyReport {
  summary: string;
  accomplishments: string[];
  challenges: string[];
  projects: Array<{ name: string; progress: number; status: string; nextMilestone?: string }>;
  nextSteps: string[];
  weekRange?: string;
  modeActivity?: string;
}

export interface DashboardState {
    chatMessages: ChatMessage[];
    chatHistory: ChatHistoryItem[];
    scheduleItems: ScheduleItem[];
    top3Items: Top3Item[];
    reminders: ReminderItem[];
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
    lastInteraction?: number;
}
