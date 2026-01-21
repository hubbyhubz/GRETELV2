import type { Content } from '@google/genai';

export type View = 'login' | 'createAccount' | 'forgotPassword' | 'setupWizard' | 'dashboard' | 'privacyPolicy' | 'termsOfService' | 'resetPassword' | 'twoFactor';
export type LegalPageSource = 'login' | 'dashboard' | 'createAccount';
export type DashboardView = 'main' | 'events';

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

export interface MemoryNode {
  id: string;
  type: 'person' | 'project' | 'topic' | 'event' | 'preference';
  name: string;
  attributes: Record<string, any>;
  created_at: number;
  last_accessed: number;
}

export interface MemoryEdge {
  sourceId: string;
  targetId: string;
  relationship: string; // e.g., "leads", "is_part_of", "prefers"
  context?: string;
  created_at: number;
}

export interface RelationalGraph {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

export interface TourState {
  completed: boolean;
  currentStep: number;
  dismissed: boolean;
  version: string;
  lastShown: string;
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
  last_seen_version?: string | null;
  tour_completed?: boolean;
  tour_state?: TourState | null;
  seen_features?: string[];
  passiveMemory?: string[]; // Array of unstructured personal facts/context
  relationalMemory?: RelationalGraph; // Structured graph memory
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
export type ChatMessage = {
  id: number;
  role: 'user' | 'model';
  text: string;
  imageUrl?: string;
  sources?: { uri: string; title: string }[];
  isPlanDraft?: boolean;
  isProjectDraft?: boolean;
  isWeeklyReport?: boolean;
  externalId?: string;
  createdAt?: number;
  senderLabel?: string;
  isAssistantNotification?: boolean;
  readAt?: number | null;
  dismissedAt?: number | null;
};
export type ChatHistoryItem = Content & { _ts?: number };
export type BriefingState = 'idle' | 'draft' | 'finalized';
export type WeeklyLogItem = { id: string; date: string; type: 'accomplishment' | 'challenge'; text: string; };
export type AssistantMode = 'crisis' | 'strategic' | 'red-day' | null;
export type UserMood = 'stressed' | 'excited' | 'tired' | 'neutral'; // New mood type
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

export type MealType = 'AM SNACKS' | 'PM SNACKS' | 'BREAKFAST' | 'LUNCH' | 'DINNER';

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO string
  end: string; // ISO string
  mealType?: MealType;
  pax?: number;
  requirements?: string;
  remarks?: string;
  color?: string;
  isAllDay?: boolean;
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
    currentMood?: UserMood; // Track user sentiment
    recentContext?: string[]; // Summaries of recent days
    modeHistory?: ModeHistoryEntry[];
    modeActivatedAt?: number;
    nudgedTaskIds?: string[];
    notifiedEventIds?: string[];
    nudgedDelegatedTaskIds?: string[];
    suppressCalendarFetch?: boolean;
    lastInteraction?: number; // Timestamp of last user interaction
    calendarEvents: CalendarEvent[]; // Events Operations
}
