
import React, { useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSwipe } from '../hooks/useSwipe';
import { DashboardProvider, useDashboardContext } from './DashboardContext';
import { AccountSettingsPage } from './AccountSettingsPage';
import EventsOperationsPage from './EventsOperationsPage';
import { SettingsIcon } from './SettingsIcon';
import CommandPalette, { type Command } from './CommandPalette';
import { applyTabTitle, getTabKeyFromDashboardContextView } from '../lib/tabTitle';
import { dismissAssistantInboxMessage, markAssistantInboxRead } from './assistantInboxService';
import {
  LottieSendIcon,
  LucideMicIcon,
  CircleCheckIcon,
  CircleHelpIcon,
} from './AnimatedIcons/LucideIndex';
import {
  HomeIcon,
  CalendarIcon,
  BriefcaseIcon,
  PlayIcon,
  BriefingIcon,
  ReminderIcon,
  MoonIcon,
  StopIcon,
  GiftIcon,
  FeedbackIcon,
  LogoutIcon,
  TrashIcon,
  WarningIcon,
  AlertIcon,
  ProjectIcon,
  RadioIcon,
  UsersIcon,
  FilePenLineIcon,
  LucidePaperclipIcon,
  LucideCommandIcon,
  LucideClipboardListIcon,
  LucideTargetIcon,
  XIcon,
  DelegatedIcon,
  ImageIcon,
} from './AnimatedIcons';
import { XIcon as AnimatedXIcon } from './AnimatedIcons/XIcon';
import { PlusIcon } from './AnimatedIcons/PlusIcon';
import { GripHorizontalIcon } from './AnimatedIcons/GripHorizontalIcon';
import { MessageCircleMoreIcon } from './AnimatedIcons/MessageCircleMoreIcon';
import { CalendarDaysIcon } from './AnimatedIcons/CalendarDaysIcon';
import FeedbackModal from './FeedbackModal';
import PatchNotesModal from './PatchNotesModal';
import ConfirmationModal from './ConfirmationModal';
import SuccessNotification from './SuccessNotification';
import EmailVersionModal from './EmailVersionModal';
import ThemeToggleButton from './ThemeToggleButton';
import ProjectUpdateModal from './ProjectUpdateModal';
import ProjectPlanningModal from './ProjectPlanningModal';
import AddDelegatedTaskModal from './AddDelegatedTaskModal';
import WeeklyReportModal from './WeeklyReportModal';
import BriefingPointersModal from './BriefingPointersModal';
import ActionContextMenu from './ActionContextMenu';
import QuickActionModal from './QuickActionModal';
import Confetti from './Confetti';
// import { AppIcon } from './AppIcon';
// import { KawaiiProgressBar } from './KawaiiProgressBar';
import { UserProfile, DashboardView } from './types';
import type { Session } from '@supabase/supabase-js';
import { OnboardingTour } from './OnboardingTour';
import { AIMessage } from './ui/ai-message';

interface MainDashboardPageProps {
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
}

class SettingsErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
    state = { error: null };

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('SettingsErrorBoundary caught error:', error, info);
        this.setState({ error });
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex h-[100dvh] w-full items-center justify-center bg-white text-gray-800">
                    <div className="max-w-md text-center">
                        <h2 className="text-lg font-bold">Settings failed to load</h2>
                        <p className="mt-2 text-sm text-gray-600">We logged the error. Please refresh and try again.</p>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

// Memoized chat message component to prevent re-renders from clearing selection
const ChatMessage = React.memo<{
    msg: any;
    index: number;
    userProfile: any;
    formatChatText: (text: string) => string;
    handleMakeChanges: () => void;
    handleConfirmPlan: () => void;
    handleSendMessage: (e?: React.FormEvent, prompt?: string) => Promise<void>;
    handleCreateReminderFromText: (text: string) => void;
    handleMakeProjectChanges: () => void;
    handleConfirmProjectDraft: () => void;
    draftedProject: any;
    draftedProjectTasks: any;
    weeklyReport: any;
    lastWeeklyReportIndex: number;
    emailVersion: string;
    setIsWeeklyReportModalOpen: (open: boolean) => void;
    setIsEmailVersionModalOpen: (open: boolean) => void;
}>(({
    msg, index, userProfile, formatChatText, handleMakeChanges, handleConfirmPlan, 
    handleSendMessage, handleCreateReminderFromText, handleMakeProjectChanges, handleConfirmProjectDraft,
    draftedProject, draftedProjectTasks, weeklyReport, lastWeeklyReportIndex,
    emailVersion, setIsWeeklyReportModalOpen, setIsEmailVersionModalOpen
}) => {
    return (
        <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[88%] sm:max-w-[85%]`}>
                {msg.role === 'model' && (
                    <div className="flex items-center justify-between gap-2 mb-1 px-1 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                            <img src={userProfile.assistantAvatar} alt={userProfile.assistantName} className="w-6 h-6 rounded-full" />
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 truncate">
                                {userProfile.assistantName}
                            </span>
                            {msg.isAssistantNotification && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-[#DC143C] dark:bg-red-900/20 dark:text-red-200">
                                    {msg.senderLabel || '[Assistant]'}
                                </span>
                            )}
                        </div>
                        {typeof msg.createdAt === 'number' && (
                            <span className="text-[11px] text-gray-500 dark:text-gray-500 whitespace-nowrap">
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                    </div>
                )}
                {msg.role === 'user' ? (
                    <div className="rounded-lg sm:rounded-2xl px-3 py-2.5 sm:p-4 shadow-none sm:shadow-sm bg-[#DC143C] text-white sm:rounded-tr-none sm:ml-auto">
                        <div className="prose prose-sm max-[360px]:prose-xs dark:prose-invert max-w-none whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: formatChatText(msg.text) }}></div>
                        {msg.imageUrl && <img src={msg.imageUrl} alt="Uploaded" className="mt-2 rounded-lg max-w-full h-auto border border-gray-200 dark:border-gray-700" />}
                    </div>
                ) : (
                    <AIMessage 
                        className={`sm:rounded-tl-none sm:mr-auto max-w-full ${msg.isAssistantNotification ? 'border-red-200 bg-red-50/40 dark:bg-red-900/10 dark:border-red-900/30' : ''}`}
                        actions={
                            <>
                                {msg.isAssistantNotification && msg.externalId && !msg.dismissedAt && (
                                    <div className="flex justify-end gap-2">
                                        {!msg.readAt && (
                                            <button
                                                onClick={() => void markAssistantInboxRead(msg.externalId)}
                                                className="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-semibold active-press"
                                            >
                                                Mark Read
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleCreateReminderFromText(msg.text)}
                                            className="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-semibold active-press"
                                        >
                                            Add Reminder
                                        </button>
                                        <button
                                            onClick={() => void dismissAssistantInboxMessage(msg.externalId)}
                                            className="px-3 py-1.5 rounded-lg bg-[#DC143C] hover:bg-[#b81030] text-white text-sm font-semibold active-press"
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                )}
                                {msg.isPlanDraft && (
                                    <div className="flex justify-end space-x-2">
                                        <button onClick={handleMakeChanges} className="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-semibold active-press">
                                            I'll Make Changes
                                        </button>
                                        <button onClick={async () => { await handleConfirmPlan(); handleSendMessage(undefined, 'Looks good, finalize the plan.'); }} className="px-3 py-1.5 rounded-lg bg-[#DC143C] hover:bg-[#b81030] text-white text-sm font-semibold active-press">
                                            Looks Good, Finalize
                                        </button>
                                    </div>
                                )}
                                {msg.isProjectDraft && draftedProject && (
                                    <div className="space-y-3">
                                        {draftedProject && (
                                            <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 p-3 text-sm text-gray-700 dark:text-gray-200">
                                                <div className="font-semibold text-gray-800 dark:text-gray-100">{draftedProject.name}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Deadline: {draftedProject.deadline || 'TBD'}</div>
                                                <div className="mt-2 space-y-1">
                                                    {draftedProject.milestones.map((milestone: any) => (
                                                        <div key={milestone.id} className="text-xs">
                                                            <span className="font-semibold">• {milestone.text}</span>
                                                            {milestone.assigneeName ? <span className="ml-1 text-gray-500">({milestone.assigneeName})</span> : null}
                                                            {milestone.linkedTaskIds?.length ? (
                                                                <div className="ml-4 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                                                                    {draftedProjectTasks
                                                                        .filter((task: any) => milestone.linkedTaskIds?.includes(task.id))
                                                                        .map((task: any) => (
                                                                            <div key={task.id}>- {task.text} {task.assigneeName ? `(${task.assigneeName})` : ''}</div>
                                                                        ))}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={handleMakeProjectChanges} className="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-semibold active-press">
                                                I'll Make Changes
                                            </button>
                                            <button onClick={handleConfirmProjectDraft} className="px-3 py-1.5 rounded-lg bg-[#DC143C] hover:bg-[#b81030] text-white text-sm font-semibold active-press">
                                                Create Project
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {msg.isWeeklyReport && weeklyReport && index === lastWeeklyReportIndex && (
                                    <div className="flex justify-end">
                                        <button 
                                            onClick={() => emailVersion ? setIsEmailVersionModalOpen(true) : setIsWeeklyReportModalOpen(true)} 
                                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-800 dark:text-gray-200 text-sm font-semibold border border-gray-200 dark:border-gray-700 transition-colors active-press"
                                        >
                                            <img
                                                src={emailVersion ? "/icons/view-email-version.svg" : "/icons/view-weekly-report.svg"}
                                                alt=""
                                                className="w-5 h-5"
                                            />
                                            {emailVersion ? 'View Email Version' : 'View Weekly Report'}
                                        </button>
                                    </div>
                                )}
                            </>
                        }
                    >
                        {msg.text.replace(/\\n/g, '\n')}
                    </AIMessage>
                )}
            </div>
        </div>
    );
});

ChatMessage.displayName = 'ChatMessage';

// Memoize comparison - only re-render if message content actually changes
const areMessagesEqual = (prevProps: any, nextProps: any) => {
    return prevProps.msg.id === nextProps.msg.id && 
           prevProps.msg.text === nextProps.msg.text &&
           prevProps.msg.readAt === nextProps.msg.readAt &&
           prevProps.msg.dismissedAt === nextProps.msg.dismissedAt &&
           prevProps.index === nextProps.index &&
           prevProps.lastWeeklyReportIndex === nextProps.lastWeeklyReportIndex &&
           prevProps.emailVersion === nextProps.emailVersion &&
           prevProps.draftedProject?.name === nextProps.draftedProject?.name;
};

// Re-create with custom comparison
const MemoizedChatMessage = React.memo(ChatMessage, areMessagesEqual) as typeof ChatMessage;

// Memoized Sidebar Nav to prevent re-renders from currentTime updates
const SidebarNav = React.memo<{
    sections: any[];
    isSidebarCollapsed: boolean;
    activeDashboard?: string;
    onItemClick: (item: any) => void;
}>(({ sections, isSidebarCollapsed, activeDashboard, onItemClick }) => {
    // State to track which item is currently hovered
    const [hoveredItemId, setHoveredItemId] = React.useState<string | null>(null);
    
    return (
        <>
            {sections.map(section => (
                <div key={section.title} className="w-full">
                    <h3 
                        className={`px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                        style={{
                            transition: 'opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                    >
                        {section.title}
                    </h3>
                    <ul className="mt-1 space-y-1">
                        {section.items.map((item: any) => {
                            const isHovered = hoveredItemId === item.id;
                            
                            // Clone the icon element and pass isHovered prop
                            // We don't need refs anymore as animation is controlled via props
                            const iconWithProps = item.icon && React.isValidElement(item.icon) 
                                ? React.cloneElement(item.icon as React.ReactElement, { 
                                    isHovered: isHovered,
                                    key: item.id,
                                  })
                                : item.icon;
                            
                            return (
                                <li key={item.id}>
                                    <a
                                        id={item.id}
                                        href="#"
                                        onClick={(e) => { 
                                          e.preventDefault(); 
                                          onItemClick(item); 
                                        }}
                                        onMouseEnter={() => setHoveredItemId(item.id)}
                                        onMouseLeave={() => setHoveredItemId(null)}
                                        className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'px-3'} h-[48px] w-full text-sm font-medium rounded-lg group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#DC143C] ${activeDashboard === item.view ? 'bg-red-50 dark:bg-red-900/30 text-[#DC143C]' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                        style={{
                                            transition: 'background-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
                                        }}
                                        title={item.description || item.name}
                                    >
                                        <div className="shrink-0 w-5 h-5 flex items-center justify-center">{iconWithProps}</div>
                                        <span 
                                            className={`ml-3 whitespace-nowrap ${isSidebarCollapsed ? 'hidden' : 'opacity-100'}`}
                                            style={{
                                                transition: 'opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                                            }}
                                        >
                                            {item.name}
                                        </span>
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </>
    );
});

SidebarNav.displayName = 'SidebarNav';

// Mobile Sidebar Item Component to handle hover animation
const MobileSidebarItem = ({ item, activeDashboard, handleSendMessage, setIsMobileMenuOpen }: { item: any, activeDashboard: any, handleSendMessage: any, setIsMobileMenuOpen: any }) => {
    const iconRef = React.useRef<any>(null);
    const [isHovered, setIsHovered] = React.useState(false);

    const handleMouseEnter = () => {
        setIsHovered(true);
        if (iconRef.current?.startAnimation) {
            iconRef.current.startAnimation();
        }
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        if (iconRef.current?.stopAnimation) {
            iconRef.current.stopAnimation();
        }
    };

    // Touch handlers for mobile
    const handleTouchStart = () => {
        setIsHovered(true);
        if (iconRef.current?.startAnimation) {
            iconRef.current.startAnimation();
        }
    };

    const handleTouchEnd = () => {
        setIsHovered(false);
        if (iconRef.current?.stopAnimation) {
            setTimeout(() => iconRef.current.stopAnimation(), 200);
        }
    };

    return (
        <button
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onClick={() => { item.action ? item.action() : handleSendMessage(undefined, `Action: ${item.name}`); setIsMobileMenuOpen(false); }}
            className={`group flex items-center w-full p-2 text-sm font-medium rounded-lg transition-colors duration-200 ease-in-out ${item.view && activeDashboard === item.view ? 'bg-red-50 dark:bg-red-900/30 text-[#DC143C]' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
        >
            <span className="shrink-0 w-8 flex justify-center mr-3 transition-transform duration-200 ease-in-out group-hover:scale-110 group-active:scale-95">
                {React.isValidElement(item.icon) ? React.cloneElement(item.icon, { ref: iconRef, isHovered } as any) : item.icon}
            </span>
            <span className="truncate">{item.name}</span>
        </button>
    );
};

const DashboardContent: React.FC<{ 
    setShowConfettiRef: React.MutableRefObject<((value: boolean) => void) | null>;
    setShowScheduleAnimationRef: React.MutableRefObject<((value: boolean) => void) | null>;
}> = ({ setShowConfettiRef, setShowScheduleAnimationRef }) => {
    const {
        userProfile, onLogout, activeDashboard, setActiveDashboard, appVersion,
        currentView, setCurrentView, isMobileMenuOpen, setIsMobileMenuOpen, mobileView, setMobileView,
        chatInput, handleChatInput, handleSendMessage, isSending,
        chatMessages, desktopTextareaRef, mobileTextareaRef, desktopFileInputRef, mobileFileInputRef,
         handleFileChange, attachedFile, setAttachedFile, isRecording, handleToggleRecording, handleStopGeneration,
        currentTime,
        displayedScheduleItems, top3Items, reminders, projects, delegatedTasks, keepNotes, dailyProgress, briefingInputs,
        isSidebarCollapsed, setIsSidebarCollapsed,
        setIsCommandPaletteOpen, setIsPatchNotesVisible, setIsFeedbackVisible, setInitialSettingsTab,
        // ... other state values
        isPatchNotesVisible, isFeedbackVisible, isCommandPaletteOpen,
        quickActionModal, handleModalConfirm, setQuickActionModal, openQuickActionModal,
        notificationModal, setNotificationModal,
        setReminders,
        briefingScript, isBriefingScriptVisible, setIsBriefingScriptVisible,
        showResetConfirm, setShowResetConfirm, handleManualReset,
        showKeepResetConfirm, setShowKeepResetConfirm, handleClearKeepNotes,
        showScheduleClearConfirm, setShowScheduleClearConfirm, handleClearSchedule,
        showPrioritiesClearConfirm, setShowPrioritiesClearConfirm, handleClearPriorities,
        showRemindersClearConfirm, setShowRemindersClearConfirm, handleClearReminders,
        showProjectsClearConfirm, setShowProjectsClearConfirm, handleClearProjects,
        showBriefingClearConfirm, setShowBriefingClearConfirm, confirmClearBriefingPointers,
        isAddTaskModalOpen, setIsAddTaskModalOpen,
        showDelegatedClearConfirm, setShowDelegatedClearConfirm, handleClearDelegatedTasks,
        handleDailyKickoff, handleCreateWeeklyReport, handleClosePatchNotes,
        // Modals props
        handleClearBriefingPointers, isBriefingPointersVisible, setIsBriefingPointersVisible,
        selectedProject, setSelectedProject,
        projectToDelete, setProjectToDelete, handleConfirmDeleteProject,
        handleAddDelegatedTask,
        contextMenu, setContextMenu, handleCreateReminderFromText, handleAddBriefingFromText,
        onProfileUpdate, // Extracted from context
        initialSettingsTab, // Extracted from context
        handleClearErrors, handleDelegatedTaskToggle, handleOpenAddTaskModal,
        handleReminderBriefingPreferenceChange, handleDelegatedTaskStatusChange, handleDelegatedTaskRemarksChange, handleDelegatedTaskDeadlineChange,
        handleSimpleToggle,
        handleConfirmPlan, handleMakeChanges, handleConfirmProjectDraft, handleMakeProjectChanges, handleProjectUpdate, handleLinkedToggle,
        handleFinalizeBriefing, setKeepNotes, requestProjectDraft, saveProjectDraft,
        draftedProject, draftedProjectTasks, weeklyReport, isWeeklyReportModalOpen, setIsWeeklyReportModalOpen, emailVersion, isEmailVersionModalOpen, setIsEmailVersionModalOpen, handleGenerateEmailReport,
        currentMode, handleActivateMode, handleDeactivateMode, currentMood,
    } = useDashboardContext();

    React.useLayoutEffect(() => {
        applyTabTitle(getTabKeyFromDashboardContextView(currentView));
    }, [currentView]);

    // ============================================================================
    // CRITICAL: ALL HOOKS MUST BE DECLARED HERE - BEFORE ANY CONDITIONAL RETURNS
    // ============================================================================
    
    // Effect for Mood-based Visual Empathy
    React.useEffect(() => {
        const root = document.documentElement;
        if (currentMood === 'stressed') {
            root.style.setProperty('--primary-color', '#B91C1C'); // Maroon
            // We could also dim the background or add a subtle overlay here if we had global CSS classes for it
        } else if (currentMood === 'excited') {
            root.style.setProperty('--primary-color', '#FF4500'); // Orange-Red
        } else if (currentMood === 'tired') {
            root.style.setProperty('--primary-color', '#6B7280'); // Gray
        } else {
            root.style.setProperty('--primary-color', '#DC143C'); // Default Crimson
        }
    }, [currentMood]);

    // State for tracking focused input to manage resizing
    const [focusedInput, setFocusedInput] = React.useState<'desktop' | 'mobile' | null>(null);

    // Effect to handle dynamic resizing of chat input
    React.useEffect(() => {
        const handleResize = (textarea: HTMLTextAreaElement | null, isFocused: boolean) => {
            if (!textarea) return;
            
            // If input is empty, reset to default size immediately
            if (!chatInput) {
                textarea.style.height = '40px';
                return;
            }

            // If focused, expand to content
            if (isFocused) {
                textarea.style.height = 'auto';
                const newHeight = Math.min(textarea.scrollHeight, 200);
                textarea.style.height = `${Math.max(40, newHeight)}px`;
            } else {
                // If not focused (blurred), collapse to default size even if there is text
                textarea.style.height = '40px';
            }
        };

        handleResize(desktopTextareaRef.current, focusedInput === 'desktop');
        handleResize(mobileTextareaRef.current, focusedInput === 'mobile');
    }, [chatInput, focusedInput, desktopTextareaRef, mobileTextareaRef]);

    // Refs
    const chatEndRef = React.useRef<HTMLDivElement>(null);
    const pullStartY = React.useRef(0);
    
    // State hooks
    const [showConfetti, setShowConfetti] = React.useState(false);
    const [showScheduleAnimation, setShowScheduleAnimation] = React.useState(false);
    // Store setters in refs so DashboardProvider can trigger animations
    React.useEffect(() => {
        setShowConfettiRef.current = setShowConfetti;
    }, [setShowConfettiRef]);
    
    // Check for Driver.js overlay blocking clicks
    React.useEffect(() => {
      if (typeof document === 'undefined') return;
      
      // Track stuck state detection count to avoid false positives during tour startup
      let stuckDetectionCount = 0;
      const STUCK_THRESHOLD = 5; // Must detect stuck state 5 times (5 seconds) before cleanup - Driver.js needs time to render
      
      const checkDriverOverlay = () => {
        const driverOverlay = document.querySelector('.driver-overlay');
        const driverActive = document.querySelector('.driver-active');
        const driverPopover = document.querySelector('.driver-popover');
        
        // If there's a driver overlay blocking clicks, remove it
        if (driverOverlay && !driverActive && !driverPopover) {
          // Stuck overlay - remove it
          (driverOverlay as HTMLElement).remove();
          stuckDetectionCount = 0; // Reset counter
        }
        
        // If Driver.js is stuck in active state without popover/overlay, count it
        // Only cleanup after detecting stuck state multiple times to avoid interrupting tour startup
        if (driverActive && !driverPopover && !driverOverlay) {
          stuckDetectionCount++;
          
          // Only cleanup if stuck state persists for multiple checks (avoid interrupting tour startup)
          if (stuckDetectionCount >= STUCK_THRESHOLD) {
            // Driver.js is truly stuck - force stop the tour
            (window as any).stopGretelTour?.();
            // Also remove driver-active class from all elements
            document.querySelectorAll('.driver-active').forEach((el) => {
              el.classList.remove('driver-active');
            });
            stuckDetectionCount = 0; // Reset counter
          }
        } else {
          // Not stuck - reset counter
          stuckDetectionCount = 0;
        }
      };
      
      // Check immediately and periodically (every 1 second)
      checkDriverOverlay();
      const driverCheckInterval = setInterval(checkDriverOverlay, 1000);
      
      return () => {
        clearInterval(driverCheckInterval);
      };
    }, []);
    React.useEffect(() => {
        setShowScheduleAnimationRef.current = setShowScheduleAnimation;
    }, [setShowScheduleAnimationRef]);
    const [pullDistance, setPullDistance] = React.useState(0);
    const [isPulling, setIsPulling] = React.useState(false);
    const [isEditingBriefingNotes, setIsEditingBriefingNotes] = React.useState(false);
    const [briefingNotesDraft, setBriefingNotesDraft] = React.useState(keepNotes);
    const [isProjectPlanningOpen, setIsProjectPlanningOpen] = React.useState(false);
    
    // Callbacks
    const handleSidebarItemClick = React.useCallback((item: any) => {
        item.action ? item.action() : handleSendMessage(undefined, `Action: ${item.name}`);
    }, [handleSendMessage]);
    
    // Memos
    const sidebarSections = React.useMemo(() => [
        {
            title: 'Overview',
            items: [
                { id: 'dash', name: 'Dashboard', description: 'Go to your main dashboard', icon: <HomeIcon size={20} />, view: 'main' as DashboardView, action: () => setActiveDashboard('main') },
                { id: 'events', name: 'Event Ops', description: 'Manage events and schedules', icon: <CalendarIcon size={20} />, view: 'events' as DashboardView, action: () => setActiveDashboard('events') },
            ]
        },
        {
            title: 'Daily Flow',
            items: [
                { id: 'daily-kickoff', name: 'Daily Kick-off', description: 'Start your daily kickoff flow', icon: <PlayIcon size={20} />, action: handleDailyKickoff },
                { id: 'morning-briefing', name: 'Morning Briefing', description: 'Collect inputs and draft AM briefing', icon: <BriefingIcon size={20} />, action: () => handleSendMessage(undefined, 'Prepare the morning briefing.') },
                { id: 'afternoon-briefing', name: 'Afternoon Briefing', description: 'Collect inputs and draft PM briefing', icon: <BriefingIcon size={20} />, action: () => handleSendMessage(undefined, 'Prepare the afternoon briefing.') },
                { id: 'end-of-day', name: 'End-of-Day Review', description: 'Run your end-of-day review', icon: <MoonIcon size={20} />, action: () => handleSendMessage(undefined, 'Time for my end-of-day review.') },
                { id: 'reset-daily', name: 'Reset Daily State', description: 'Clear schedule and priorities', icon: <StopIcon size={20} />, action: () => { (window as any).stopGretelTour?.(); setShowResetConfirm(true); } },
            ]
        },
        {
            title: 'Quick Actions',
            items: [
                { id: 'new-reminder', name: 'Create New Reminder', description: 'Add a reminder to your list', icon: <ReminderIcon size={20} />, action: () => openQuickActionModal('Create New Reminder') },
                { id: 'briefing-pointer', name: 'Briefing Pointer', description: 'Capture a briefing pointer', icon: <BriefingIcon size={20} />, action: () => openQuickActionModal('Briefing Pointer') },
                { id: 'coaching-note', name: 'Coaching Note', description: 'Log a coaching note', icon: <UsersIcon size={20} />, action: () => openQuickActionModal('Coaching Note') },
                { id: 'log-information', name: 'Log Information', description: 'Store a quick note', icon: <FilePenLineIcon size={20} />, action: () => openQuickActionModal('Log Information') },
                { id: 'clear-errors', name: 'Clear Cached AI Errors', description: 'Reset cached AI error state', icon: <TrashIcon size={20} />, action: handleClearErrors },
            ]
        },
        {
            title: 'Content Creation',
            items: [
                { id: 'draft-communication', name: 'Draft a communication.', description: 'Start a draft with assistant', icon: <RadioIcon size={20} />, action: () => openQuickActionModal('Draft a communication') },
            ]
        },
        {
            title: 'Project Management',
            items: [
                { id: 'create-project', name: 'Create a new project.', description: 'Set up a new project', icon: <ProjectIcon size={20} />, action: () => setIsProjectPlanningOpen(true) },
            ]
        },
        {
            title: 'Reporting',
            items: [
                { id: 'weekly-report', name: 'Create my Weekly Report', description: 'Generate weekly status report', icon: <LucideClipboardListIcon size={20} />, action: handleCreateWeeklyReport },
            ]
        },
        {
            title: 'Mode Switching',
            items: [
                { id: 'crisis-mode', name: 'Crisis Mode', description: 'For urgent issues requiring immediate action', icon: <AlertIcon size={20} />, action: () => handleActivateMode('crisis') },
                { id: 'strategic-mode', name: 'Strategic Mode', description: 'For planning and long-term decision making', icon: <LucideTargetIcon size={20} />, action: () => handleActivateMode('strategic') },
                { id: 'red-day', name: 'Red Day', description: 'When overwhelmed and need to prioritize', icon: <WarningIcon size={20} />, action: () => handleActivateMode('red-day') },
            ]
        }
    ] as Array<{
        title: string;
        items: Array<{ id: string; name: string; description?: string; icon: React.ReactNode; action: () => void; view?: DashboardView }>;
    }>, [handleDailyKickoff, handleSendMessage, openQuickActionModal, handleClearErrors, handleCreateWeeklyReport, handleActivateMode, setIsProjectPlanningOpen]);
    
    // Effects
    React.useEffect(() => {
        // Only auto-scroll if user doesn't have text selected
        const selection = window.getSelection();
        const hasSelection = selection && selection.toString().length > 0;
        
        if (!hasSelection && chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [chatMessages.length, isSending]);

    // Confetti trigger is now handled directly in the checkbox click handler
    // No need for useEffect - it triggers immediately when last checkbox is clicked

    React.useEffect(() => {
        // Sync briefing notes draft with keepNotes
        if (!isEditingBriefingNotes) {
            setBriefingNotesDraft(keepNotes);
        }
    }, [keepNotes, isEditingBriefingNotes]);

    React.useEffect(() => {
        // Handle text selection for context menu - Stable and Passive
        const handleMouseUp = () => {
            // Wait a brief moment for selection to complete
            setTimeout(() => {
                const selection = window.getSelection();
                const selectedText = selection?.toString().trim();
                
                // Hide menu if selection is empty
                if (!selectedText || selectedText.length === 0) {
                    if (contextMenu.visible) {
                        setContextMenu({ visible: false, x: 0, y: 0, text: '', flipped: false });
                    }
                    return;
                }
                
                // Show menu only after mouse is released
                const range = selection?.getRangeAt(0);
                const rect = range?.getBoundingClientRect();
                
                if (rect && rect.width > 0 && rect.height > 0) {
                    const safetyGap = 12; // Gap between menu and selection
                    const bottomThreshold = 400; // Minimum space needed below for menu
                    
                    // Calculate horizontal center position (transform will handle centering)
                    const x = rect.left + (rect.width / 2);
                    
                    // Calculate vertical position and determine flip state
                    let y: number;
                    let shouldFlip = false;
                    
                    // Check if too close to bottom of viewport
                    const spaceBelow = window.innerHeight - rect.bottom;
                    if (spaceBelow < bottomThreshold) {
                        // Flip: Position above selection (when near bottom)
                        y = rect.top + window.scrollY - safetyGap;
                        shouldFlip = true;
                    } else {
                        // Default: Position below selection
                        y = rect.bottom + window.scrollY + safetyGap;
                        shouldFlip = false;
                    }
                    
                    setContextMenu({
                        visible: true,
                        x: x,
                        y: y,
                        text: selectedText,
                        flipped: shouldFlip // Pass flip state to menu (true = above, false = below)
                    });
                }
            }, 10);
        };
        
        // Hide menu on scroll
        const handleScroll = () => {
            if (contextMenu.visible) {
                setContextMenu({ visible: false, x: 0, y: 0, text: '', flipped: false });
            }
        };
        
        // Hide menu if selection becomes empty
        const handleSelectionChange = () => {
            const selection = window.getSelection();
            const selectedText = selection?.toString().trim();
            
            if (contextMenu.visible && (!selectedText || selectedText.length === 0)) {
                setContextMenu({ visible: false, x: 0, y: 0, text: '', flipped: false });
            }
        };
        
        // Use mouseup instead of selectionchange for stability
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('scroll', handleScroll, true); // Capture phase for all scrollable elements
        document.addEventListener('selectionchange', handleSelectionChange); // Only for hiding
        
        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('scroll', handleScroll, true);
            document.removeEventListener('selectionchange', handleSelectionChange);
        };
    }, [contextMenu.visible, setContextMenu]);

    // Swipe Navigation - MOVED HERE TO AVOID CONDITIONAL HOOK ERROR
    const mainContentRef = React.useRef<HTMLDivElement>(null);

    const swipeHandlers = useSwipe({
        onSwipeMove: (dx, _dy) => {
            if (window.innerWidth >= 768) return;
            if (!mainContentRef.current) return;
            
            // Only allow swipe right (positive dx) for back navigation
            let canSwipe = false;
            
            if (dx > 0) { // Swipe Right (Back)
                if (mobileView === 'work' || mobileView === 'today') canSwipe = true;
            } else { // Swipe Left (Forward)
                if (mobileView === 'chat' || mobileView === 'today') canSwipe = true;
            }
            
            if (canSwipe) {
                 // Apply resistance
                 const translate = dx * 0.4;
                 if (Math.abs(translate) < 100) {
                    mainContentRef.current.style.transform = `translateX(${translate}px)`;
                 }
            }
        },
        onSwipeEnd: () => {
             if (mainContentRef.current) {
                 mainContentRef.current.style.transform = '';
                 mainContentRef.current.style.transition = 'transform 0.3s ease-out';
                 setTimeout(() => {
                    if (mainContentRef.current) mainContentRef.current.style.transition = '';
                 }, 300);
             }
        },
        onSwipeRight: () => {
            if (window.innerWidth >= 768) return;
            if (mobileView === 'work') setMobileView('today');
            else if (mobileView === 'today') setMobileView('chat');
        },
        onSwipeLeft: () => {
             if (window.innerWidth >= 768) return;
             if (mobileView === 'chat') setMobileView('today');
             else if (mobileView === 'today') setMobileView('work');
        }
    });

    const onTouchStartCombined = (e: React.TouchEvent) => {
        handleTouchStart(e);
        swipeHandlers.onTouchStart(e);
    };
    
    const onTouchMoveCombined = (e: React.TouchEvent) => {
        handleTouchMove(e);
        swipeHandlers.onTouchMove(e);
    };
    
    const onTouchEndCombined = () => {
        handleTouchEnd();
        swipeHandlers.onTouchEnd();
    };

    // ============================================================================
    // END OF HOOKS - All hooks must be declared above this line
    // ============================================================================

    // Helper functions (non-hooks)
    const handleTouchStart = (e: React.TouchEvent) => {
        if (window.scrollY === 0) {
            pullStartY.current = e.touches[0].clientY;
            setIsPulling(true);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isPulling) return;
        const currentY = e.touches[0].clientY;
        const distance = Math.max(0, Math.min(currentY - pullStartY.current, 100));
        setPullDistance(distance);
    };

    const handleTouchEnd = () => {
        if (pullDistance > 60) {
            // Trigger refresh
            window.location.reload();
        }
        setIsPulling(false);
        setPullDistance(0);
    };

    const mobileTabs = [
        { id: 'chat', label: 'Chat', icon: <MessageCircleMoreIcon size={20} className="text-[#DC143C]" /> },
        { id: 'today', label: 'Today', icon: <CalendarDaysIcon size={20} className="text-[#DC143C]" /> },
        { id: 'work', label: 'Work', icon: <BriefcaseIcon size={20} className="text-[#DC143C]" /> },
    ];

    const commandPaletteCommands: Command[] = sidebarSections.flatMap((section) =>
        section.items.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description || section.title,
            icon: item.icon,
            action: item.action,
            section: section.title,
        }))
    );

    const welcomeName = userProfile.nickname || userProfile.name.split(' ')[0];
    
    const formatChatText = (text: string) => {
        // Handle literal \n from AI (fix for jumbled text issue)
        const fixedEscapes = text.replace(/\\n/g, '\n');
        
        const normalized = fixedEscapes.replace(/\r\n/g, '\n');
        const withBullets = normalized.replace(/^\s*[-*]\s+/gm, '• ');
        const withLineBreaks = withBullets.replace(/\n/g, '<br />');
        const withBold = withLineBreaks.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        return withBold.replace(/\*(\S[^*]*\S)\*/g, '<i>$1</i>');
    };

    // Debounced menu toggle
    const handleMobileMenuToggle = useCallback(() => {
        setIsMobileMenuOpen(prev => !prev);
    }, []);

    // State for image upload
    const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSelectedImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const clearSelectedImage = () => {
        setSelectedImage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // --- Render Helpers ---
    const renderMobileSidebar = () => (
        <>
            {/* Mobile Header */}
            <header className="md:hidden flex items-center justify-between h-14 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 relative">
                <button
                    id="mobile-menu"
                    onClick={handleMobileMenuToggle}
                    className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none z-10"
                    aria-label="Toggle menu"
                >
                    {isMobileMenuOpen ? <XIcon size={24} /> : <GripHorizontalIcon size={24} className="text-[#DC143C]" />}
                </button>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="font-black text-[#DC143C] tracking-wider pointer-events-auto">
                        {userProfile.assistantName || 'G.R.E.T.E.L'}
                    </span>
                    {currentMode && (
                        <button
                            onClick={handleDeactivateMode}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded mt-0.5 mode-transition pointer-events-auto ${
                                currentMode === 'crisis' 
                                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' 
                                    : currentMode === 'strategic'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                    : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                            }`}
                        >
                            {currentMode === 'crisis' ? '🚨 CRISIS' : currentMode === 'strategic' ? '🧠 STRATEGIC' : '⚠️ RED DAY'} • TAP TO EXIT
                        </button>
                    )}
                </div>
                <div className="flex items-center space-x-2 z-10">
                    <div className="hidden md:block">
                        <button 
                          onClick={() => {
                            // Check if there's saved progress to resume from
                            const savedState = localStorage.getItem('gretel_tour_state');
                            let shouldResume = false;
                            if (savedState) {
                              try {
                                const parsed = JSON.parse(savedState);
                                // Resume if there's progress (currentStep > 0) and tour was dismissed (not completed)
                                shouldResume = parsed.currentStep > 0 && parsed.dismissed && !parsed.completed;
                              } catch (e) {
                                // Ignore parse errors
                              }
                            }
                            
                            if (shouldResume) {
                              // Resume from saved step
                              (window as any).continueGretelTour?.();
                            } else {
                              // Start fresh tour
                              if (typeof (window as any).resetGretelTour === 'function') {
                                (window as any).resetGretelTour?.();
                              }
                              (window as any).startGretelTour?.();
                            }
                          }} 
                          className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none transition-colors"
                          aria-label="App Tour"
                        >
                          <CircleHelpIcon size={20} />
                        </button>
                    </div>
                    <ThemeToggleButton position="static" />
                </div>
            </header>

            {/* Mobile Menu Overlay */}
            <div 
                className={`md:hidden fixed inset-0 z-40 bg-gray-800 bg-opacity-75 sidebar-overlay ${isMobileMenuOpen ? 'overlay-open' : ''}`} 
                onClick={() => setIsMobileMenuOpen(false)}
            ></div>

            {/* Mobile Drawer */}
            <div className={`md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-xl sidebar-animated ${isMobileMenuOpen ? 'sidebar-open' : ''}`}>
                <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
                        <span className="font-bold text-lg text-gray-800 dark:text-gray-200">Menu</span>
                        <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 rounded-full bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center h-8 w-8"><AnimatedXIcon size={20} className="text-[#DC143C]" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        <div className="flex items-center mb-6">
                            <img src={userProfile.avatar} alt="User" className="h-10 w-10 rounded-full mr-3 object-cover" />
                            <div>
                                <p className="font-bold text-gray-800 dark:text-gray-200 truncate">{userProfile.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{userProfile.email}</p>
                            </div>
                        </div>
                         {sidebarSections.map(section => (
                            <div key={section.title}>
                                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{section.title}</h3>
                                <ul className="space-y-1">
                                    {section.items.map(item => (
                                        <li key={item.id}>
                                            <MobileSidebarItem 
                                                item={item} 
                                                activeDashboard={activeDashboard} 
                                                handleSendMessage={handleSendMessage} 
                                                setIsMobileMenuOpen={setIsMobileMenuOpen} 
                                            />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button onClick={() => { setCurrentView('settings'); setInitialSettingsTab('profile'); setIsMobileMenuOpen(false); }} className="group flex items-center w-full p-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200 ease-in-out">
                                <span className="shrink-0 w-8 flex justify-center mr-3 transition-transform duration-200 ease-in-out group-hover:scale-110 group-active:scale-95"><SettingsIcon size={20} /></span> Settings
                            </button>
                            <button
                              onClick={onLogout}
                              className="group flex items-center w-full p-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg mt-1 transition-colors duration-200 ease-in-out"
                            >
                                 <span className="shrink-0 w-8 flex justify-center mr-3 transition-transform duration-200 ease-in-out group-hover:scale-110 group-active:scale-95"><LogoutIcon size={20} /></span> Log Out
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );

    const renderChatInput = (className = '', inputType: 'desktop' | 'mobile' = 'desktop') => (
        <div 
            className={`px-4 pt-4 pb-2 sm:p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 w-full ${className}`.trim()}
            style={{ 
                flexShrink: 0, 
                position: 'relative', 
                zIndex: 1,
                marginBottom: 0,
                pointerEvents: 'none',
                maxWidth: '100%',
                boxSizing: 'border-box'
            }}
        >
                {/* Image Preview */}
                <AnimatePresence>
                    {selectedImage && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-full left-4 mb-2 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
                            style={{ pointerEvents: 'auto' }}
                        >
                            <div className="relative group">
                                <img src={selectedImage} alt="Preview" className="h-24 w-auto rounded object-cover" />
                                <button 
                                    onClick={clearSelectedImage}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <XIcon size={12} />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {attachedFile && (
                    <div className="flex items-center mb-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm" style={{ pointerEvents: 'auto' }}>
                        <span className="truncate flex-1">{attachedFile.name}</span>
                        <button onClick={() => setAttachedFile(null)} className="ml-2 text-red-500 hover:text-red-700" style={{ pointerEvents: 'auto' }}><XIcon size={20} /></button>
                    </div>
                )}
            <div 
                className="flex items-end space-x-2 bg-gray-100 dark:bg-gray-700 rounded-xl p-2 border border-transparent focus-within:border-gray-300 dark:focus-within:border-gray-600 focus-within:ring-0 transition-all w-full" 
                style={{ pointerEvents: 'auto', maxWidth: '100%', boxSizing: 'border-box' }}
            >
                     <button onClick={() => (inputType === 'desktop' ? desktopFileInputRef : mobileFileInputRef).current?.click()} className="p-2 text-gray-500 hover:text-[#DC143C] transition-colors rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600" title="Attach File"><LucidePaperclipIcon size={20} /></button>
                     <input type="file" ref={inputType === 'desktop' ? desktopFileInputRef : mobileFileInputRef} className="hidden" onChange={handleFileChange} />
                     
                     <textarea
                        ref={inputType === 'desktop' ? desktopTextareaRef : mobileTextareaRef}
                        value={chatInput}
                        onFocus={() => setFocusedInput(inputType)}
                        onBlur={() => setFocusedInput(null)}
                        onChange={(e) => {
                            handleChatInput(e);
                            const textarea = e.target;
                            textarea.style.height = 'auto'; 
                            const newHeight = Math.min(textarea.scrollHeight, 200); 
                            textarea.style.height = `${Math.max(40, newHeight)}px`; 
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage(e, undefined, selectedImage || undefined);
                                clearSelectedImage();
                            }
                        }}
                        placeholder={`Message ${userProfile.assistantName}...`}
                        rows={1}
                        className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 resize-none overflow-y-hidden p-[10px] m-[5px] max-h-[200px] text-gray-800 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 transition-[height] duration-200 ease-in-out"
                        style={{ minHeight: '40px', height: '40px' }}
                     />
                     
                     {/* Image Upload Button */}
                     <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                    />
                     <button 
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-2 transition-colors rounded-lg ${selectedImage ? 'text-[#DC143C] bg-red-50' : 'text-[#DC143C] hover:text-[#DC143C] hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                        title="Upload Image"
                     >
                        <ImageIcon size={20} className="text-[#DC143C]" />
                     </button>

                     {isSending ? (
                         <button onClick={handleStopGeneration} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg animate-pulse" title="Stop"><StopIcon size={20} /></button>
                     ) : (
                         <>
                            <button onClick={handleToggleRecording} className={`p-2 transition-colors rounded-lg ${isRecording ? 'text-red-600 bg-red-100 animate-pulse' : 'text-gray-500 hover:text-[#DC143C] hover:bg-gray-200 dark:hover:bg-gray-600'}`} title="Voice Input"><LucideMicIcon size={20} isRecording={isRecording} /></button>
                        <button 
                            onClick={() => {
                                handleSendMessage(undefined, undefined, selectedImage || undefined);
                                clearSelectedImage();
                            }} 
                            disabled={!chatInput.trim() && !attachedFile && !selectedImage} 
                            className="disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center" 
                            title="Send"
                        >
                            <LottieSendIcon size={56} />
                        </button>
                         </>
                     )}
                </div>
            </div>
    );
    

    const renderChatInterface = () => {
        // Filter out system messages first
        const visibleMessages = chatMessages.filter(msg => !msg.text.startsWith('SYSTEM:'));
        
        // Find the index of the last weekly report message in visible messages
        const lastWeeklyReportIndex = visibleMessages.map((msg, idx) => msg.isWeeklyReport ? idx : -1).filter(idx => idx >= 0).pop() ?? -1;

        return (
         <div 
            className="flex flex-col h-full min-h-0 bg-white dark:bg-gray-800 rounded-none sm:rounded-2xl shadow-none sm:shadow-sm border-0 sm:border border-gray-200 dark:border-gray-700 overflow-hidden" 
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
            <div 
                className="flex-1 overflow-y-auto px-2 py-3 max-[360px]:px-2 max-[360px]:py-2 sm:p-4 space-y-3 bg-white dark:bg-gray-900/50 sm:bg-gray-50/50 sm:dark:bg-gray-900/50 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
                style={{ flex: 1, overflowY: 'auto', paddingBottom: '3rem' }}
            >
                {visibleMessages.map((msg, index) => (
                    <MemoizedChatMessage
                        key={`${msg.id}-${index}`}
                        msg={msg}
                        index={index}
                        userProfile={userProfile}
                        formatChatText={formatChatText}
                        handleMakeChanges={handleMakeChanges}
                        handleConfirmPlan={handleConfirmPlan}
                        handleSendMessage={handleSendMessage}
                        handleCreateReminderFromText={handleCreateReminderFromText}
                        handleMakeProjectChanges={handleMakeProjectChanges}
                        handleConfirmProjectDraft={handleConfirmProjectDraft}
                        draftedProject={draftedProject}
                        draftedProjectTasks={draftedProjectTasks}
                        weeklyReport={weeklyReport}
                        lastWeeklyReportIndex={lastWeeklyReportIndex}
                        emailVersion={emailVersion}
                        setIsWeeklyReportModalOpen={setIsWeeklyReportModalOpen}
                        setIsEmailVersionModalOpen={setIsEmailVersionModalOpen}
                    />
                ))}
                
                {/* Typing Indicator */}
                {isSending && (
                    <div className="flex justify-start">
                        <div className="flex flex-col items-start max-w-[88%] sm:max-w-[85%]">
                            <div className="flex items-center gap-2 mb-1 px-1">
                                <img src={userProfile.assistantAvatar} alt={userProfile.assistantName} className="w-6 h-6 rounded-full" />
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{userProfile.assistantName}</span>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg sm:rounded-2xl sm:rounded-tl-none px-5 py-3 border border-gray-100 dark:border-gray-700 shadow-none sm:shadow-sm">
                                <div className="flex items-center space-x-2">
                                    <div className="flex space-x-1">
                                        <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}></div>
                                        <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }}></div>
                                        <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }}></div>
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 italic">typing...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                <div ref={chatEndRef} />
            </div>

            <div style={{ flexShrink: 0, marginBottom: 0 }}>
                {renderChatInput('hidden md:block', 'desktop')}
            </div>
         </div>
    );
    };

    // Main Render
    if (currentView === 'settings') {
        let AccountSettingsPageComponent;
        try {
            AccountSettingsPageComponent = (
            <AccountSettingsPage 
                onBackToDashboard={() => setCurrentView('dashboard')} 
                userProfile={userProfile} 
                onProfileUpdate={onProfileUpdate} 
                initialTab={initialSettingsTab || 'profile'}
            />
        );
        } catch (error: any) {
            console.error('Error creating AccountSettingsPage JSX:', error);
            return (
                <div className="flex h-[100dvh] w-full items-center justify-center bg-white text-gray-800">
                    <div className="max-w-md text-center">
                        <h2 className="text-lg font-bold">Settings failed to load</h2>
                        <p className="mt-2 text-sm text-gray-600">Error creating component: {error?.message || 'Unknown error'}</p>
                        <button onClick={() => setCurrentView('dashboard')} className="mt-4 px-4 py-2 bg-[#DC143C] text-white rounded-lg">Back to Dashboard</button>
                    </div>
                </div>
        );
    }

    return (
            <SettingsErrorBoundary>
                <motion.div
                    key="settings"
                    initial={{ x: '100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '-50%', opacity: 0 }}
                    transition={{ 
                        type: 'spring', 
                        stiffness: 300, 
                        damping: 30,
                        opacity: { duration: 0.2 }
                    }}
                    style={{ width: '100%', height: '100%' }}
                >
                    {AccountSettingsPageComponent}
                </motion.div>
            </SettingsErrorBoundary>
        );
    }

    return (
        <div 
            ref={mainContentRef}
            onTouchStart={onTouchStartCombined}
            onTouchMove={onTouchMoveCombined}
            onTouchEnd={onTouchEndCombined}
            className="flex h-[100dvh] w-full flex-col md:flex-row md:h-screen bg-white dark:bg-gray-900 sm:bg-gray-100 sm:dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans overflow-hidden overflow-x-hidden selection:bg-red-100 selection:text-red-900" style={{ maxWidth: '100vw' }}>
             {/* Desktop Sidebar */}
            <aside
                onMouseEnter={() => setIsSidebarCollapsed(false)}
                onMouseLeave={() => setIsSidebarCollapsed(true)}
                className={`hidden md:flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}
                style={{
                    transition: 'width 200ms cubic-bezier(0.4, 0, 0.6, 1)',
                }}
            >
                <div className="relative border-b border-gray-200 dark:border-gray-700 shrink-0 flex items-center justify-center" style={{ height: '70px', minHeight: '70px', maxHeight: '70px' }}>
                    <div 
                        className={`absolute inset-0 flex items-center justify-center transform-gpu ${isSidebarCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'}`}
                        style={{
                            transition: 'opacity 150ms cubic-bezier(0.25, 0.1, 0.25, 1), transform 150ms cubic-bezier(0.25, 0.1, 0.25, 1)',
                        }}
                    >
                        <span className="flex items-center justify-center h-10 w-10 bg-[#DC143C] rounded-lg text-white font-black text-2xl leading-none shadow-md">G</span>
                    </div>
                    <div 
                        className={`absolute inset-0 flex items-center justify-center transform-gpu ${isSidebarCollapsed ? 'opacity-0 scale-75 pointer-events-none' : 'opacity-100 scale-100'}`}
                        style={{
                            transition: 'opacity 150ms cubic-bezier(0.25, 0.1, 0.25, 1), transform 150ms cubic-bezier(0.25, 0.1, 0.25, 1)',
                        }}
                    >
                        <div className="text-center whitespace-nowrap">
                            <h1 className="text-xl font-black text-[#DC143C] tracking-wider uppercase">G.R.E.T.E.L</h1>
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-widest uppercase">BY HANZEL</p>
                        </div>
                    </div>
                </div>

                <nav id="sidebar-actions" className="flex-1 overflow-y-auto p-2 space-y-2 transform-gpu">
                    <SidebarNav 
                        sections={sidebarSections}
                        isSidebarCollapsed={isSidebarCollapsed}
                        activeDashboard={activeDashboard}
                        onItemClick={handleSidebarItemClick}
                    />
                </nav>
            </aside>
          
          {/* Mobile Sidebar */}
          {renderMobileSidebar()}

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Desktop Header */}
            <header id="welcome-screen" className="hidden md:flex justify-between items-center px-6 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-all duration-300" style={{ height: '70px', minHeight: '70px', maxHeight: '70px' }}>
                <div className="flex items-center flex-1 mr-8">
                    <div className="relative mr-4 shrink-0">
                        <img 
                            src={userProfile.avatar} 
                            alt="User Avatar" 
                            className={`h-10 w-10 rounded-full ring-2 object-cover transition-all duration-300 ${
                                currentMood === 'stressed' ? 'ring-red-600 grayscale-[0.3]' :
                                currentMood === 'excited' ? 'ring-orange-500 scale-105' :
                                currentMood === 'tired' ? 'ring-gray-400 opacity-90' :
                                'ring-gray-100 dark:ring-gray-700'
                            }`} 
                        />
                        {currentMood && currentMood !== 'neutral' && (
                            <div className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm text-xs">
                                {currentMood === 'stressed' ? '😤' : currentMood === 'excited' ? '🤩' : '😴'}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col justify-center">
                        <h2 className="text-lg font-bold text-[#DC143C] leading-tight m-0 p-0" style={{ color: 'var(--primary-color, #DC143C)' }}>Welcome back, {welcomeName}</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight mt-0.5 m-0 p-0">
                           {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} - {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </div>
                {/* Mode Indicator Badge */}
                {currentMode && (
                    <div 
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 mr-4 mode-transition ${
                            currentMode === 'crisis' 
                                ? 'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-700 dark:text-red-400' 
                                : currentMode === 'strategic'
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-700 dark:text-blue-400'
                                : 'bg-orange-50 dark:bg-orange-900/20 border-orange-500 text-orange-700 dark:text-orange-400'
                        }`}
                        title={
                            currentMode === 'crisis' 
                                ? '🚨 Crisis Mode: For urgent issues requiring immediate action (equipment failures, staff emergencies, critical incidents)' 
                                : currentMode === 'strategic'
                                ? '🧠 Strategic Mode: For long-term planning, process analysis, and important decision-making'
                                : '⚠️ Red Day Mode: When overwhelmed - helps prioritize and lighten your workload'
                        }
                    >
                        <span className="text-xl">
                            {currentMode === 'crisis' ? '🚨' : currentMode === 'strategic' ? '🧠' : '⚠️'}
                        </span>
                        <div className="flex flex-col">
                            <span className="text-xs font-bold uppercase leading-tight">
                                {currentMode === 'crisis' ? 'Crisis Mode' : currentMode === 'strategic' ? 'Strategic Mode' : 'Red Day Mode'}
                            </span>
                            <span className="text-xs opacity-75 leading-tight">
                                {currentMode === 'crisis' ? 'Urgent Response' : currentMode === 'strategic' ? 'Deep Analysis' : 'Stress Support'}
                            </span>
                        </div>
                        <button 
                            onClick={handleDeactivateMode}
                            className="ml-2 text-xs px-2 py-1 rounded hover:bg-white/50 dark:hover:bg-black/20 transition-colors font-semibold"
                            title="Exit mode and return to normal operation"
                        >
                            Exit
                        </button>
                    </div>
                )}
                <div className="flex items-center space-x-2">
                    <button id="command-palette-trigger" onClick={() => setIsCommandPaletteOpen(true)} className="flex items-center text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 h-9 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-transform">
                        <LucideCommandIcon size={20} />
                        <span className="ml-2 hidden lg:inline">Command Palette</span>
                        <kbd className="ml-4 font-sans px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-md dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500 hidden lg:inline">F2</kbd>
                    </button>
                    <button 
                      onClick={() => {
                        // Check if there's saved progress to resume from
                        const savedState = localStorage.getItem('gretel_tour_state');
                        let shouldResume = false;
                        if (savedState) {
                          try {
                            const parsed = JSON.parse(savedState);
                            // Resume if there's progress (currentStep > 0) and tour was dismissed (not completed)
                            shouldResume = parsed.currentStep > 0 && parsed.dismissed && !parsed.completed;
                          } catch (e) {
                            // Ignore parse errors
                          }
                        }
                        
                        if (shouldResume) {
                          // Resume from saved step
                          (window as any).continueGretelTour?.();
                        } else {
                          // Start fresh tour
                          if (typeof (window as any).resetGretelTour === 'function') {
                            (window as any).resetGretelTour?.();
                          }
                          (window as any).startGretelTour?.();
                        }
                      }} 
                      className="h-9 w-9 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#DC143C] dark:focus-visible:ring-offset-gray-800" 
                      title="App Tour"
                    >
                      <CircleHelpIcon size={20} />
                    </button>
                    <button onClick={() => setIsPatchNotesVisible(true)} className="h-9 w-9 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#DC143C] dark:focus-visible:ring-offset-gray-800" title="What's New"><GiftIcon size={20} /></button>
                    <button onClick={() => setIsFeedbackVisible(true)} className="h-9 w-9 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#DC143C] dark:focus-visible:ring-offset-gray-800" title="Submit Feedback"><FeedbackIcon size={20} /></button>
                    <button id="settings-button" onClick={() => { setCurrentView('settings'); setInitialSettingsTab('profile'); }} className="h-9 w-9 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#DC143C] dark:focus-visible:ring-offset-gray-800" title="Settings"><SettingsIcon size={20} /></button>
                    <button 
                      onClick={onLogout} 
                      className="h-9 w-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-500 transition-colors hover:bg-red-100 dark:hover:bg-red-500/10 active:bg-red-200 dark:active:bg-red-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500 dark:focus-visible:ring-offset-gray-800" 
                      title="Log Out"
                    >
                      <LogoutIcon size={20} />
                    </button>
                    <div id="theme-toggle"><ThemeToggleButton position="static" /></div>
                </div>
            </header>

            {/* Main Content Area */}
            <AnimatePresence mode="wait" initial={false}>
            {activeDashboard === 'events' ? (
                <motion.div
                    key="events"
                    initial={{ x: '100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '-50%', opacity: 0 }}
                    transition={{ 
                        type: 'spring', 
                        stiffness: 300, 
                        damping: 30,
                        opacity: { duration: 0.2 }
                    }}
                    style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
                >
                <EventsOperationsPage />
                </motion.div>
            ) : (
                <motion.div
                    key="main"
                    initial={{ x: '-50%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '-50%', opacity: 0 }}
                    transition={{ 
                        type: 'spring', 
                        stiffness: 300, 
                        damping: 30,
                        opacity: { duration: 0.2 }
                    }}
                    style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
                >
                <>
                <main className="flex-1 min-h-0 overflow-hidden flex flex-col bg-gray-100 dark:bg-gray-900" style={{ height: 'calc(100dvh - 70px)', maxHeight: 'calc(100dvh - 70px)', display: 'flex', flexDirection: 'column' }}>
                    <div className="flex flex-1 min-h-0 flex-col px-3 pt-3 pb-20 md:pb-0 md:flex-row md:p-0" style={{ flex: 1, overflow: 'hidden', maxHeight: '100%' }}>
                        {/* Left Pane: Today's Overview */}
                        <div 
                            className={`relative flex min-h-0 flex-col p-0 sm:p-4 pb-0 md:pb-32 min-w-0 overflow-y-auto space-y-5 md:space-y-4 ${mobileView === 'today' ? 'flex' : 'hidden md:flex'} md:w-[24%]`}
                            style={{ userSelect: 'none', position: 'relative', zIndex: 5 }}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                        >
                            {/* Pull to Refresh Indicator */}
                            {isPulling && pullDistance > 0 && (
                                <div 
                                    className="absolute top-0 left-0 right-0 flex justify-center items-center transition-all duration-200"
                                    style={{ 
                                        height: `${pullDistance}px`,
                                        opacity: pullDistance / 60
                                    }}
                                >
                                    <div className={`${pullDistance > 60 ? 'refresh-spinner' : ''}`}>
                                        <svg className="w-6 h-6 text-[#DC143C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </div>
                                </div>
                            )}
                       <div id="todays-schedule" className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-none sm:shadow-sm border border-gray-200 dark:border-gray-700 card-hover-animation">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-[#DC143C] flex items-center"><CalendarIcon size={16} /><span className="ml-2">Today's Schedule</span></h2>
                                <button onClick={() => { (window as any).stopGretelTour?.(); setShowScheduleClearConfirm(true); }} className="h-7 w-7 rounded-full inline-flex items-center justify-center text-gray-500 hover:text-red-500 dark:hover:text-red-500 transition-colors hover:bg-red-100 dark:hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500" title="Clear Schedule">
                                    <TrashIcon size={16} />
                            </button>
                            </div>
                            <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 space-y-2">
                                {displayedScheduleItems.length === 0 ? (
                                    <p className="text-gray-500">No schedule items for today.</p>
                                ) : (
                                    displayedScheduleItems.map(item => {
                                        // Create stable onChange handler to prevent re-renders
                                        const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
                                            e.stopPropagation();
                                            handleLinkedToggle(item.id, !!item.isGoogleEvent, item.title, item.completed);
                                        };
                                        return (
                                            <div key={item.id} className="grid grid-cols-[auto,1fr] items-start gap-3 interactive-row">
                                                <div className="flex items-start shrink-0">
                                                    <div className="checkbox-wrapper-12 mr-2">
                                                        <div className="cbx">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={item.completed}
                                                                onChange={handleToggle}
                                                                aria-label={`Toggle completion for ${item.title}`}
                                                            />
                                                            <label></label>
                                                            <svg width="15" height="14" viewBox="0 0 15 14" fill="none">
                                                                <path d="M3 8.36364L6.23077 11L12 3"></path>
                                                            </svg>
                                                        </div>
                                                    </div>
                                                    <span className={`min-w-[120px] font-semibold ${item.completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>{item.time}</span>
                                                </div>
                                                <span className={`leading-snug ${item.completed ? 'line-through text-gray-400' : ''}`}>{item.title}</span>
                                            </div>
                                        );
                                    })
                                )}
                    </div>

                    </div>

                       <div id="top-priorities" className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-none sm:shadow-sm border border-gray-200 dark:border-gray-700 card-hover-animation">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-[#DC143C] flex items-center"><CircleCheckIcon size={16} /><span className="ml-2">Top Priorities</span></h2>
                                <button onClick={() => { (window as any).stopGretelTour?.(); setShowPrioritiesClearConfirm(true); }} className="h-7 w-7 rounded-full inline-flex items-center justify-center text-gray-500 hover:text-red-500 dark:hover:text-red-500 transition-colors hover:bg-red-100 dark:hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500" title="Clear Priorities">
                                    <TrashIcon size={16} />
                                </button>
                       </div>
                            <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 space-y-2">
                                {top3Items.length === 0 ? (
                                    <p className="text-gray-500">No priorities set for today.</p>
                                ) : (
                                    top3Items.map((item, index) => (
                                        <div key={item.id} className={`flex items-start justify-between animate__animated animate__bounceIn interactive-row`} style={{ animationDelay: `${index * 0.1}s` }}>
                                            <span className={`flex-1 ${item.completed ? 'line-through text-gray-400' : ''}`}>{item.text}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                    </div>

                       <div id="reminders" className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-none sm:shadow-sm border border-gray-200 dark:border-gray-700 card-lift card-hover-animation">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-[#DC143C] flex items-center"><ReminderIcon size={16} /><span className="ml-2">Reminders</span></h2>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => { (window as any).stopGretelTour?.(); setShowRemindersClearConfirm(true); }} className="h-7 w-7 rounded-full inline-flex items-center justify-center text-gray-500 hover:text-red-500 dark:hover:text-red-500 transition-colors hover:bg-red-100 dark:hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500" title="Clear Reminders">
                                        <TrashIcon size={16} />
                                    </button>
                                    <PlusIcon 
                                        onClick={() => openQuickActionModal('Create New Reminder')} 
                                        className="h-7 w-7 rounded-full inline-flex items-center justify-center text-[#DC143C] hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]" 
                                        title="Add Reminder"
                                        size={16}
                                        tabIndex={0}
                                        role="button"
                                    />
                                </div>
                            </div>
                            <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 space-y-2">
                                {reminders.length === 0 ? (
                                    <p className="text-gray-500">No reminders.</p>
                                ) : (
                                    reminders.map((item, index) => (
                                        <div key={item.id} className={`flex items-start gap-3 animate__animated animate__bounceIn interactive-row`} style={{ animationDelay: `${index * 0.1}s` }}>
                                            <div className="checkbox-wrapper-12 mt-1">
                                                <div className="cbx">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={item.completed}
                                                        onChange={() => handleSimpleToggle(item.id, reminders, setReminders)}
                                                        aria-label={`Toggle completion for ${item.text}`}
                                                    />
                                                    <label></label>
                                                    <svg width="15" height="14" viewBox="0 0 15 14" fill="none">
                                                        <path d="M3 8.36364L6.23077 11L12 3"></path>
                                                    </svg>
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <span className={`block ${item.completed ? 'line-through text-gray-400' : ''}`}>{item.text}</span>
                                                <div className="mt-1">
                                                    <select
                                                        value={item.includeInBriefing ?? 'none'}
                                                        onChange={(e) => handleReminderBriefingPreferenceChange(item.id, e.target.value as any)}
                                                        className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-gray-600 dark:text-gray-300"
                                                        title="Briefing inclusion"
                                                    >
                                                        <option value="none">Personal (no briefing)</option>
                                                        <option value="morning">Include in Morning</option>
                                                        <option value="afternoon">Include in Afternoon</option>
                                                        <option value="both">Include in Both</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                       </div>
                    </div>

                        {/* Center Pane: Chat */}
                        <div 
                            id="chat-interface" 
                            className={`flex-1 min-h-0 flex flex-col p-0 sm:p-4 md:p-0 min-w-0 ${mobileView === 'chat' ? 'flex' : 'hidden md:flex'} md:w-[52%]`}
                            style={{ maxHeight: '100%' }}
                        >
                           {renderChatInterface()}
                    </div>

                    {/* Right Pane: Work Items */}
                        <div className={`flex min-h-0 flex-col p-0 sm:p-4 pb-0 md:pb-32 min-w-0 overflow-y-auto space-y-5 md:space-y-4 ${mobileView === 'work' ? 'flex' : 'hidden md:flex'} md:w-[24%]`} style={{ userSelect: 'none', position: 'relative', zIndex: 5 }}>
                        <div id="daily-progress" className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-none sm:shadow-sm border border-gray-200 dark:border-gray-700 card-lift card-hover-animation">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-[#DC143C] flex items-center gap-2">
                                    Daily Progress 
                                </h2>
                                <span className="text-sm font-semibold text-[#DC143C]">{dailyProgress}%</span>
                            </div>
                            <div className="mt-3 w-full">
                                <div className="crimson-loader-bar">
                                    <div className="crimson-loader-bar-fill" style={{ width: `${dailyProgress}%` }}></div>
                                </div>
                            </div>
                        </div>

                        <div id="ongoing-projects" className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-none sm:shadow-sm border border-gray-200 dark:border-gray-700 card-lift card-hover-animation">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-[#DC143C] flex items-center"><BriefcaseIcon size={16} /><span className="ml-2">Ongoing Projects</span></h2>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => { (window as any).stopGretelTour?.(); setShowProjectsClearConfirm(true); }}
                                        className="h-7 w-7 rounded-full inline-flex items-center justify-center text-gray-500 hover:text-red-500 transition-colors hover:bg-red-100"
                                        title="Clear Projects"
                                    >
                                        <TrashIcon size={16} />
                                    </button>
                                    <button
                                        onClick={() => setIsProjectPlanningOpen(true)}
                                        className="text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-md"
                                        title="Create a new project"
                                    >
                                        Create
                                    </button>
                                </div>
                            </div>
                            <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 space-y-2">
                                {projects.length === 0 ? (
                                    <p className="text-gray-500">No ongoing projects.</p>
                                ) : (
                                    projects.map((item, index) => (
                                        <div key={item.id} className={`relative project-card-hover animate__animated animate__bounceIn`} style={{ animationDelay: `${index * 0.1}s` }}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedProject(item)}
                                                className="w-full text-left border border-gray-200 dark:border-gray-700 rounded-lg p-3 interactive-row"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1">
                                                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">{item.name}</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                            Deadline: {item.deadline || 'TBD'} · {item.milestones.length} milestones
                                                        </div>
                                                    </div>
                                                    <div className="text-xs font-semibold text-[#DC143C]">
                                                        {item.milestones.length
                                                            ? Math.round(item.milestones.reduce((sum, m) => sum + (Number(m.progress) || 0), 0) / item.milestones.length)
                                                            : 0}%
                                                    </div>
                                                </div>
                                                <div className="mt-2 w-full">
                                                    <div className="crimson-loader-bar">
                                                        <div 
                                                            className="crimson-loader-bar-fill" 
                                                            style={{ 
                                                                width: `${item.milestones.length
                                                                    ? Math.round(item.milestones.reduce((sum, m) => sum + (Number(m.progress) || 0), 0) / item.milestones.length)
                                                                    : 0}%` 
                                                            }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            </button>
                                            
                                            {/* TEMPORARILY DISABLED - Hover Preview Card was causing display issues */}
                                            {/* 
                                            <div className="project-hover-preview">
                                                <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-[#DC143C] shadow-2xl p-4 hover-card-preview">
                                                    <h4 className="font-bold text-[#DC143C] mb-2 text-sm">{item.name}</h4>
                                                    <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1 mb-3">
                                                        <div><strong>Deadline:</strong> {item.deadline || 'TBD'}</div>
                                                        <div><strong>Progress:</strong> {item.milestones.length ? Math.round(item.milestones.reduce((sum, m) => sum + (Number(m.progress) || 0), 0) / item.milestones.length) : 0}%</div>
                                                    </div>
                                                    {item.milestones.length > 0 && (
                                                        <div>
                                                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Milestones:</div>
                                                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                                                {item.milestones.slice(0, 3).map(milestone => (
                                                                    <div key={milestone.id} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                                                        <span className={milestone.progress === 100 ? 'line-through' : ''}>{milestone.text}</span>
                                                                        <span className="text-[#DC143C] font-semibold ml-auto">{milestone.progress}%</span>
                                                                    </div>
                                                                ))}
                                                                {item.milestones.length > 3 && (
                                                                    <div className="text-xs text-gray-400 italic">+{item.milestones.length - 3} more</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            */}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div id="delegated-tasks" className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-none sm:shadow-sm border border-gray-200 dark:border-gray-700 card-hover-animation">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-[#DC143C] flex items-center"><DelegatedIcon size={16} /><span className="ml-2">Delegated Tasks</span></h2>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => { (window as any).stopGretelTour?.(); setShowDelegatedClearConfirm(true); }} className="h-7 w-7 rounded-full inline-flex items-center justify-center text-gray-500 hover:text-red-500 dark:hover:text-red-500 transition-colors hover:bg-red-100 dark:hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500" title="Clear Tasks">
                                        <TrashIcon size={16} />
                                    </button>
                                    <PlusIcon onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        (window as any).stopGretelTour?.();
                                        
                                        // Force remove all Driver.js elements and any highlighting styles
                                        const allElements = [
                                          document.querySelector('#chat-interface'),
                                          document.querySelector('#todays-schedule'),
                                          document.querySelector('#top-priorities')
                                        ].filter(Boolean);
                                        
                                        document.querySelectorAll('.driver-overlay, .driver-popover, .driver-highlighted, [class*="driver"], [id*="driver"]').forEach(el => {
                                          if (el.id !== 'gretel-prevent-driver-highlight' && el.id !== 'driver-back-button-override') {
                                            el.remove();
                                          }
                                        });
                                        document.querySelectorAll('.driver-active, .driver-highlighted-element, .driver-active-element, [data-driver-highlighted]').forEach(el => {
                                          el.classList.remove('driver-active', 'driver-highlighted-element', 'driver-active-element', 'driver-highlighted');
                                          (el as HTMLElement).removeAttribute('data-driver-highlighted');
                                          // Force remove inline styles that Driver.js might have applied
                                          const htmlEl = el as HTMLElement;
                                          htmlEl.style.outline = 'none !important';
                                          htmlEl.style.boxShadow = 'none !important';
                                          htmlEl.style.border = 'none !important';
                                          htmlEl.style.position = '';
                                          htmlEl.style.zIndex = '';
                                          htmlEl.style.outlineOffset = '0 !important';
                                        });
                                        // Remove any inline styles that might cause highlighting and force remove driver-related styles
                                        allElements.forEach(el => {
                                          if (el) {
                                            const htmlEl = el as HTMLElement;
                                            // Remove Driver.js classes
                                            htmlEl.classList.remove('driver-highlighted-element', 'driver-active-element', 'driver-highlighted', 'driver-active');
                                            // Force remove all highlighting styles
                                            htmlEl.style.outline = 'none !important';
                                            htmlEl.style.boxShadow = 'none !important';
                                            htmlEl.style.border = '';
                                            htmlEl.style.position = '';
                                            htmlEl.style.zIndex = '';
                                            htmlEl.style.outlineOffset = '0 !important';
                                            // Remove pseudo-elements if they exist
                                            htmlEl.style.setProperty('--before-content', 'none', 'important');
                                            htmlEl.style.setProperty('--after-content', 'none', 'important');
                                            // Remove any driver-related data attributes
                                            Array.from(htmlEl.attributes).forEach(attr => {
                                              if (attr.name.startsWith('data-driver')) {
                                                htmlEl.removeAttribute(attr.name);
                                              }
                                            });
                                          }
                                        });
                                        // Simplified cleanup - no MutationObserver to avoid performance issues
                                        // Just run cleanup a few times to catch any delayed Driver.js actions
                                        
                                        handleOpenAddTaskModal();
                                        
                                        // Simple cleanup - remove Driver.js elements and classes
                                        const cleanup = () => {
                                          // Remove Driver.js elements (but keep our CSS override style tags)
                                          document.querySelectorAll('.driver-overlay, .driver-popover, [class*="driver"], [id*="driver"]').forEach(el => {
                                            if (el.id !== 'gretel-prevent-driver-highlight' && el.id !== 'driver-back-button-override') {
                                              el.remove();
                                            }
                                          });
                                          
                                          // Remove classes from target elements AND their parents
                                          ['#chat-interface', '#todays-schedule', '#top-priorities'].forEach(selector => {
                                            const el = document.querySelector(selector) as HTMLElement;
                                            if (el) {
                                              // Remove from element itself
                                              el.classList.remove('driver-highlighted-element', 'driver-active-element', 'driver-highlighted', 'driver-active');
                                              // Force remove ALL inline styles that might cause highlighting
                                              el.style.removeProperty('outline');
                                              el.style.removeProperty('box-shadow');
                                              el.style.removeProperty('position');
                                              el.style.removeProperty('z-index');
                                              el.style.removeProperty('animation');
                                              el.style.removeProperty('outline-offset');
                                              el.style.removeProperty('will-change');
                                              el.style.removeProperty('transform');
                                              el.style.removeProperty('backface-visibility');
                                              // Set important overrides
                                              el.style.setProperty('outline', 'none', 'important');
                                              el.style.setProperty('box-shadow', 'none', 'important');
                                              
                                              // Remove from parent elements (Driver.js might add classes to parents)
                                              let parent = el.parentElement;
                                              let depth = 0;
                                              while (parent && parent !== document.body && depth < 5) {
                                                parent.classList.remove('driver-highlighted-element', 'driver-active-element', 'driver-highlighted', 'driver-active', 'driver-active');
                                                parent.style.removeProperty('overflow');
                                                parent.style.removeProperty('box-shadow');
                                                parent.style.removeProperty('outline');
                                                parent.style.setProperty('overflow', '', 'important');
                                                parent = parent.parentElement;
                                                depth++;
                                              }
                                            }
                                          });
                                          
                                          // Also remove any elements with driver classes that might be wrapping our targets
                                          document.querySelectorAll('.driver-highlighted-element, .driver-active-element').forEach(el => {
                                            const htmlEl = el as HTMLElement;
                                            if (htmlEl.id === 'chat-interface' || htmlEl.id === 'todays-schedule' || htmlEl.id === 'top-priorities') {
                                              // Already handled above
                                              return;
                                            }
                                            // Check if this element contains our target elements
                                            const containsTarget = htmlEl.querySelector('#chat-interface, #todays-schedule, #top-priorities');
                                            if (containsTarget) {
                                              htmlEl.classList.remove('driver-highlighted-element', 'driver-active-element', 'driver-highlighted', 'driver-active');
                                              htmlEl.style.setProperty('outline', 'none', 'important');
                                              htmlEl.style.setProperty('box-shadow', 'none', 'important');
                                            }
                                          });
                                        };
                                        
                                        // Run cleanup once
                                        cleanup();
                                        
                                        // Check again after modal opens and force cleanup again
                                        setTimeout(() => {
                                          // Force cleanup again
                                          const allAfter = [
                                            document.querySelector('#chat-interface'),
                                            document.querySelector('#todays-schedule'),
                                            document.querySelector('#top-priorities')
                                          ].filter(Boolean);
                                          
                                          allAfter.forEach(el => {
                                            if (el) {
                                              const htmlEl = el as HTMLElement;
                                              htmlEl.classList.remove('driver-highlighted-element', 'driver-active-element', 'driver-highlighted', 'driver-active');
                                              htmlEl.style.outline = 'none !important';
                                              htmlEl.style.boxShadow = 'none !important';
                                              htmlEl.style.animation = 'none !important';
                                              htmlEl.style.outlineOffset = '0 !important';
                                            }
                                          });
                                          
                                          // Run cleanup one more time after modal opens
                                          setTimeout(cleanup, 200);
                                        }, 200);
                                    }} className="h-7 w-7 rounded-full inline-flex items-center justify-center text-[#DC143C] hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]" title="Add Task" size={16} tabIndex={0} role="button" />
                                </div>
                            </div>
                            <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 space-y-2">
                                {delegatedTasks.length === 0 ? (
                                    <p className="text-gray-500">No tasks delegated.</p>
                                ) : (
                                    delegatedTasks.map(item => (
                                        <div key={item.id} className="flex flex-col gap-2 border border-gray-200 dark:border-gray-700 rounded-lg p-3 interactive-row">
                                            <div className="flex items-start gap-3">
                                                <div className="checkbox-wrapper-12 mt-1">
                                                    <div className="cbx">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={item.completed}
                                                            onChange={() => handleDelegatedTaskToggle(item.id)}
                                                            aria-label={`Toggle completion for ${item.text}`}
                                                        />
                                                        <label></label>
                                                        <svg width="15" height="14" viewBox="0 0 15 14" fill="none">
                                                            <path d="M3 8.36364L6.23077 11L12 3"></path>
                                                        </svg>
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-sm ${item.completed ? 'line-through text-gray-400' : ''}`}>
                                                        {item.text}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {item.assigneeName}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="date"
                                                    value={item.deadline && item.deadline !== 'TBD' ? (item.deadline.match(/^(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2})?$/) ? item.deadline.split(' ')[0] : item.deadline.match(/^\d{4}-\d{2}-\d{2}$/) ? item.deadline : '') : ''}
                                                    onChange={(e) => handleDelegatedTaskDeadlineChange(item.id, e.target.value)}
                                                    placeholder="Set deadline"
                                                    className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-gray-600 dark:text-gray-300"
                                                    title="Task deadline"
                                                />
                                                {item.deadline && item.deadline !== 'TBD' && !item.deadline.match(/^\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?$/) && (
                                                    <span className="text-xs text-gray-500">{item.deadline}</span>
                                                )}
                                                <select
                                                    value={item.status ?? 'not_started'}
                                                    onChange={(e) => handleDelegatedTaskStatusChange(item.id, e.target.value as any)}
                                                    className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-gray-600 dark:text-gray-300"
                                                    title="Task status"
                                                >
                                                    <option value="not_started">Not Started</option>
                                                    <option value="in_progress">In Progress</option>
                                                    <option value="completed">Completed</option>
                                                </select>
                                            </div>
                                            <textarea
                                                value={item.remarks ?? ''}
                                                onChange={(e) => handleDelegatedTaskRemarksChange(item.id, e.target.value)}
                                                className="w-full text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-gray-600 dark:text-gray-300"
                                                placeholder="Remarks / status update"
                                                rows={2}
                                            />
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div id="briefing-notes" className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-none sm:shadow-sm border border-gray-200 dark:border-gray-700 card-hover-animation">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-[#DC143C] flex items-center"><BriefingIcon size={16} /><span className="ml-2">Briefing Notes</span></h2>
                                <div className="flex items-center gap-2">
                                    {isEditingBriefingNotes ? (
                                        <>
                                            <button
                                                onClick={() => {
                                                    setKeepNotes(briefingNotesDraft);
                                                    setIsEditingBriefingNotes(false);
                                                }}
                                                className="text-xs font-semibold text-white bg-[#DC143C] hover:bg-[#b81030] px-2.5 py-1 rounded-md"
                                                title="Save Notes"
                                            >
                                                Save
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setBriefingNotesDraft(keepNotes);
                                                    setIsEditingBriefingNotes(false);
                                                }}
                                                className="text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-md"
                                                title="Cancel Edit"
                                            >
                                                Cancel
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={() => setIsEditingBriefingNotes(true)}
                                            disabled={!keepNotes.trim()}
                                            className="text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-100"
                                            title="Edit Notes"
                                        >
                                            Edit
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setIsBriefingScriptVisible(true)}
                                        disabled={!briefingScript}
                                        className="text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Open Briefing Script"
                                    >
                                        Script
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (isEditingBriefingNotes) {
                                                setKeepNotes(briefingNotesDraft);
                                                setIsEditingBriefingNotes(false);
                                            }
                                            handleFinalizeBriefing();
                                        }}
                                        disabled={isSending || !keepNotes.trim()}
                                        className="text-xs font-semibold text-white bg-[#DC143C] hover:bg-[#b81030] px-2.5 py-1 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Finalize Briefing Notes"
                                    >
                                        Finalize
                                    </button>
                                    <button onClick={() => { (window as any).stopGretelTour?.(); setShowKeepResetConfirm(true); }} className="h-7 w-7 rounded-full inline-flex items-center justify-center text-gray-500 hover:text-[#DC143C] hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]" title="Clear Briefing Notes">
                                        <TrashIcon size={16} />
                                    </button>
                                </div>
                            </div>
                            <button onClick={() => setIsBriefingPointersVisible(true)} className="mt-3 w-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                View Pointers ({briefingInputs.length})
                            </button>
                            <textarea
                                className="mt-3 w-full h-28 p-2 text-sm bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300"
                                value={isEditingBriefingNotes ? briefingNotesDraft : keepNotes}
                                onChange={(e) => setBriefingNotesDraft(e.target.value)}
                                placeholder="Your compiled briefing notes will appear here after preparation..."
                                readOnly={!isEditingBriefingNotes}
                            />
                        </div>
                        </div>
                    </div>

                </main>

                {/* Mobile footer - only render on mobile, not just hide */}
                <footer 
                    className="md:hidden fixed inset-x-0 bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 w-full" 
                    style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)', zIndex: 1, pointerEvents: 'none', minHeight: 'fit-content', maxWidth: '100vw', left: 0, right: 0 }}
                >
                    <div style={{ pointerEvents: 'auto' }}>
                        {renderChatInput('', 'mobile')}
                    </div>
                    <div 
                        id="mobile-tabs" 
                        className="flex items-center h-16 border-t border-gray-200 dark:border-gray-700 w-full" 
                        style={{ pointerEvents: 'auto', maxWidth: '100vw' }}
                    >
                        {mobileTabs.map((tab) => {
                            const isActive = mobileView === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setMobileView(tab.id as any)}
                                    className={`flex-1 h-full flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors ${isActive ? 'text-[#DC143C]' : 'text-gray-500 dark:text-gray-400'}`}
                                >
                                    <div className={`${isActive ? 'opacity-100' : 'opacity-70'}`}>
                                        {React.cloneElement(tab.icon as React.ReactElement, { isHovered: isActive })}
                                    </div>
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </footer>
                </>
                </motion.div>
            )}
            </AnimatePresence>
          </div>

          {/* Modals */}
          <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} commands={commandPaletteCommands} onExecuteQuery={(q) => handleSendMessage(undefined, q)} assistantName={userProfile.assistantName} />
          {isPatchNotesVisible ? (
            <PatchNotesModal version={appVersion} onClose={handleClosePatchNotes} />
          ) : null}
          {isFeedbackVisible && <FeedbackModal onClose={() => setIsFeedbackVisible(false)} />}
          {isAddTaskModalOpen && <AddDelegatedTaskModal isOpen={isAddTaskModalOpen} onClose={() => setIsAddTaskModalOpen(false)} teamMembers={userProfile.team} onAddTask={handleAddDelegatedTask} />}
          <ProjectPlanningModal
            isOpen={isProjectPlanningOpen}
            teamMembers={userProfile.team}
            onClose={() => setIsProjectPlanningOpen(false)}
            onGenerateDraft={requestProjectDraft}
            onSaveDraft={saveProjectDraft}
          />
          <BriefingPointersModal isOpen={isBriefingPointersVisible} onClose={() => setIsBriefingPointersVisible(false)} pointers={briefingInputs} onClear={handleClearBriefingPointers} />
          {quickActionModal.isOpen && (
            <QuickActionModal
              isOpen={quickActionModal.isOpen}
              title={quickActionModal.title}
              prefill={quickActionModal.prefill}
              onConfirm={(value) => {
                if (!value) return;
                handleModalConfirm(value);
              }}
              onCancel={() => setQuickActionModal({ isOpen: false, title: '', prefill: '' })}
            />
          )}
          {selectedProject && <ProjectUpdateModal project={selectedProject} onClose={() => setSelectedProject(null)} onUpdate={handleProjectUpdate} />}
          <WeeklyReportModal 
            isOpen={isWeeklyReportModalOpen} 
            report={weeklyReport} 
            onClose={() => setIsWeeklyReportModalOpen(false)}
            onGenerateEmailVersion={async (report) => {
              try {
                const generated = await handleGenerateEmailReport(report);
                if (generated) {
                  // Close the weekly report modal
                  setIsWeeklyReportModalOpen(false);
                  // Show success notification
                  setNotificationModal({
                    isOpen: true,
                    title: 'Success',
                    message: 'Email version generated successfully!'
                  });
                  // Open email version modal after a brief delay
                  setTimeout(() => {
                    setIsEmailVersionModalOpen(true);
                  }, 500);
                }
                return null; // Don't update the report, we show email in separate modal
              } catch (error) {
                return null;
              }
            }}
          />
          <EmailVersionModal 
            isOpen={isEmailVersionModalOpen}
            emailContent={emailVersion}
            onClose={() => setIsEmailVersionModalOpen(false)}
          />
          {contextMenu.visible && <ActionContextMenu x={contextMenu.x} y={contextMenu.y} selectedText={contextMenu.text} flipped={contextMenu.flipped} onClose={() => setContextMenu({ ...contextMenu, visible: false })} onAddReminder={handleCreateReminderFromText} onAddBriefing={handleAddBriefingFromText} onExplain={(t) => handleSendMessage(undefined, `Explain this: "${t}"`)} onDelegate={(t) => { setQuickActionModal({ isOpen: true, title: 'Delegate Task', prefill: t }); }} />}
          
          {/* Confirmation Modals */}
          {showResetConfirm && <ConfirmationModal title="Reset Day?" message="This will clear your schedule and priorities. Are you sure?" onConfirm={handleManualReset} onCancel={() => setShowResetConfirm(false)} isDestructive />}
          {showKeepResetConfirm && <ConfirmationModal title="Clear Notes?" message="This will delete your current notes. Are you sure?" onConfirm={handleClearKeepNotes} onCancel={() => setShowKeepResetConfirm(false)} isDestructive />}
          {showScheduleClearConfirm && <ConfirmationModal title="Clear Schedule?" message="Are you sure you want to clear all schedule items?" onConfirm={handleClearSchedule} onCancel={() => setShowScheduleClearConfirm(false)} isDestructive />}
          {showPrioritiesClearConfirm && <ConfirmationModal title="Clear Priorities?" message="Are you sure you want to clear your top priorities?" onConfirm={handleClearPriorities} onCancel={() => setShowPrioritiesClearConfirm(false)} isDestructive />}
          {showRemindersClearConfirm && <ConfirmationModal title="Clear Reminders?" message="Are you sure you want to clear all reminders?" onConfirm={handleClearReminders} onCancel={() => setShowRemindersClearConfirm(false)} isDestructive />}
          {showProjectsClearConfirm && <ConfirmationModal title="Clear Projects?" message="This will remove all ongoing and completed projects. Are you sure?" onConfirm={handleClearProjects} onCancel={() => setShowProjectsClearConfirm(false)} isDestructive />}
          {showBriefingClearConfirm && <ConfirmationModal title="Clear Pointers?" message="Are you sure you want to delete all briefing pointers?" onConfirm={confirmClearBriefingPointers} onCancel={() => setShowBriefingClearConfirm(false)} isDestructive />}
          {projectToDelete && <ConfirmationModal title={`Delete Project?`} message={`Are you sure you want to delete "${projectToDelete.name}"?`} onConfirm={handleConfirmDeleteProject} onCancel={() => setProjectToDelete(null)} isDestructive />}
          {showDelegatedClearConfirm && <ConfirmationModal title="Clear Tasks?" message="This will remove all delegated tasks. Completed tasks will also be archived." onConfirm={handleClearDelegatedTasks} onCancel={() => setShowDelegatedClearConfirm(false)} isDestructive />}
          
          {/* Notification Modal */}
          {notificationModal.isOpen && <SuccessNotification title={notificationModal.title} message={notificationModal.message} onConfirm={() => setNotificationModal({ ...notificationModal, isOpen: false })} />}

          {isBriefingScriptVisible && (
            <div className="fixed inset-0 bg-gray-900/80 z-50 flex items-center justify-center p-4" onClick={() => setIsBriefingScriptVisible(false)}>
              <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-[#DC143C]">Briefing Script</h3>
                  <button onClick={() => setIsBriefingScriptVisible(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <XIcon size={20} />
                  </button>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
                  {briefingScript || 'No script generated yet.'}
                </div>
              </div>
            </div>
          )}

          {/* Confetti Effect for Top Priorities */}
          <Confetti 
            trigger={showConfetti} 
            onComplete={() => setShowConfetti(false)}
            numberOfPieces={window.innerWidth < 768 ? 100 : 300} // More particles on desktop
          />
          
          {/* Schedule Completion Animation */}
          <Confetti 
            trigger={showScheduleAnimation} 
            onComplete={() => setShowScheduleAnimation(false)}
            numberOfPieces={window.innerWidth < 768 ? 80 : 200}
          />

          {/* Onboarding Tour */}
          <OnboardingTour 
            userProfile={userProfile} 
            onComplete={() => console.log('Tour completed!')}
          />

        </div>
    );
};

export const MainDashboardPage: React.FC<MainDashboardPageProps> = (props) => {
    // Create refs to store setShowConfetti and setShowScheduleAnimation so we can use them in callbacks
    const setShowConfettiRef = React.useRef<((value: boolean) => void) | null>(null);
    const setShowScheduleAnimationRef = React.useRef<((value: boolean) => void) | null>(null);
    
    return (
        <DashboardProvider 
            {...props}
            onAllPrioritiesCompleted={() => {
                // Trigger confetti immediately when all priorities are completed
                if (setShowConfettiRef.current) {
                    setShowConfettiRef.current(true);
                }
            }}
            onAllScheduleCompleted={() => {
                // Trigger schedule completion animation immediately when all schedule items are completed
                if (setShowScheduleAnimationRef.current) {
                    setShowScheduleAnimationRef.current(true);
                }
            }}
        >
            <DashboardContent 
                setShowConfettiRef={setShowConfettiRef}
                setShowScheduleAnimationRef={setShowScheduleAnimationRef}
            />
        </DashboardProvider>
    );
};
