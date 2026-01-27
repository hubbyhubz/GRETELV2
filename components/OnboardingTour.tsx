import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import "../styles/tour.css";
import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import type { UserProfile } from "./types";

interface OnboardingTourProps {
  userProfile: UserProfile | null;
  onComplete?: () => void;
}

// Tour configuration
const TOUR_VERSION = "1.0.0";
const TOUR_STORAGE_KEY = "gretel_tour_state";

interface TourState {
  completed: boolean;
  currentStep: number;
  dismissed: boolean;
  version: string;
  lastShown: string;
}

// Full Desktop Tour Steps
const desktopSteps = [
  {
    element: "#welcome-screen",
    popover: {
      title: "Welcome to G.R.E.T.E.L! 👋",
      description: "Your AI Executive Assistant powered by JAMILA. Let's take a quick tour to help you get started.",
      side: "bottom" as const,
      align: "center" as const,
    },
  },
  {
    element: "#command-palette-trigger",
    popover: {
      title: "⚡ Command Palette",
      description: "Press F2 anytime for quick access to all actions. It's your shortcut to everything!",
      side: "bottom" as const,
      align: "start" as const,
    },
  },
  {
    element: "#chat-interface",
    popover: {
      title: "💬 Chat with JAMILA",
      description: "Your AI assistant is here 24/7. Ask questions, request briefings, or get help with your tasks.",
      side: "left" as const,
      align: "center" as const,
    },
  },
  {
    element: "#todays-schedule",
    popover: {
      title: "📅 Today's Schedule",
      description: "Your daily calendar synced from Google. Check and manage appointments here.",
      side: "right" as const,
      align: "start" as const,
    },
  },
  {
    element: "#top-priorities",
    popover: {
      title: "🎯 Top Priorities",
      description: "Focus on what matters most. Set your top 3 priorities for the day.",
      side: "right" as const,
      align: "start" as const,
    },
  },
  {
    element: "#reminders",
    popover: {
      title: "🔔 Reminders",
      description: "Quick reminders to keep you on track throughout the day.",
      side: "right" as const,
      align: "start" as const,
    },
  },
  {
    element: "#ongoing-projects",
    popover: {
      title: "💼 Ongoing Projects",
      description: "Track all your projects with milestones and deadlines in one place.",
      side: "left" as const,
      align: "start" as const,
    },
  },
  {
    element: "#delegated-tasks",
    popover: {
      title: "👥 Delegated Tasks",
      description: "Monitor tasks you've assigned to your team members and track their progress.",
      side: "left" as const,
      align: "start" as const,
    },
  },
  {
    element: "#briefing-notes",
    popover: {
      title: "📋 Briefing Notes",
      description: "AI-generated summaries and briefings. Edit, finalize, and share them easily.",
      side: "top" as const,
      align: "end" as const,
    },
  },
  {
    element: "#daily-kickoff",
    popover: {
      title: "🚀 Daily Kick-off",
      description: "Start your day right! Plan your schedule, set priorities, and get focused.",
      side: "right" as const,
      align: "center" as const,
    },
  },
  {
    element: "#end-of-day",
    popover: {
      title: "🌙 End of Day Review",
      description: "Reflect on your day, review what you accomplished, and prepare for tomorrow.",
      side: "right" as const,
      align: "center" as const,
    },
  },
  {
    element: "#sidebar-actions",
    popover: {
      title: "⚡ Quick Actions",
      description: "One-click access to briefings, reminders, reports, and more.",
      side: "right" as const,
      align: "center" as const,
    },
  },
  {
    element: "#settings-button",
    popover: {
      title: "⚙️ Settings & Profile",
      description: "Customize your experience, manage your profile, and configure preferences.",
      side: "bottom" as const,
      align: "end" as const,
    },
  },
  {
    element: "#theme-toggle",
    popover: {
      title: "🌓 Theme Toggle",
      description: "Switch between light and dark mode. Whatever suits your style!",
      side: "bottom" as const,
      align: "end" as const,
    },
  },
];

// Simplified Mobile Tour Steps
const mobileSteps = [
  {
    element: "#welcome-screen",
    popover: {
      title: "Welcome to G.R.E.T.E.L! 👋",
      description: "Your AI Executive Assistant. Let's show you around!",
      side: "bottom" as const,
      align: "center" as const,
    },
  },
  {
    element: "#chat-interface",
    popover: {
      title: "💬 Chat with JAMILA",
      description: "Your AI assistant. Ask anything, anytime!",
      side: "top" as const,
      align: "center" as const,
    },
  },
  {
    element: "#mobile-tabs",
    popover: {
      title: "📱 Navigation",
      description: "Switch between Today, Chat, and Projects using these tabs.",
      side: "top" as const,
      align: "center" as const,
    },
  },
  {
    element: "#todays-schedule",
    popover: {
      title: "📅 Today's Schedule",
      description: "Your daily calendar and priorities.",
      side: "bottom" as const,
      align: "center" as const,
    },
  },
  {
    element: "#ongoing-projects",
    popover: {
      title: "💼 Projects",
      description: "Track your projects and delegated tasks.",
      side: "bottom" as const,
      align: "center" as const,
    },
  },
  {
    element: "#mobile-menu",
    popover: {
      title: "☰ Menu",
      description: "Access settings, commands, and more from here.",
      side: "bottom" as const,
      align: "start" as const,
    },
  },
];

export const OnboardingTour = ({ userProfile, onComplete }: OnboardingTourProps) => {
  const [tourState, setTourState] = useState<TourState | null>(null);
  const hasAttemptedAutoStartRef = useRef(false); // Track if we've already attempted to auto-start
  const userProfileIdRef = useRef<string | null>(null); // Track which userProfile we've loaded
  
  // Use sessionStorage to persist "has attempted auto-start" across page refreshes
  // Key includes userProfile.id to make it per-user
  const getAutoStartKey = () => `gretel_tour_auto_start_attempted_${userProfile?.id || 'anonymous'}`;
  const hasAttemptedAutoStart = () => {
    if (!userProfile?.id) return false;
    return sessionStorage.getItem(getAutoStartKey()) === 'true';
  };
  const setHasAttemptedAutoStart = (value: boolean) => {
    if (!userProfile?.id) return;
    if (value) {
      sessionStorage.setItem(getAutoStartKey(), 'true');
    } else {
      sessionStorage.removeItem(getAutoStartKey());
    }
  };
  

  // Load tour completion state from userProfile (Supabase) instead of localStorage
  // Only load once per userProfile.id to prevent re-loading when userProfile object changes
  useEffect(() => {
    // Only load tour state if userProfile exists AND we haven't loaded it for this user yet
    if (userProfile && userProfile.id !== userProfileIdRef.current) {
      // Mark that we've loaded for this user
      userProfileIdRef.current = userProfile.id;
      
      // Check tour_completed from profile (per-account tracking)
      const isCompleted = userProfile.tour_completed || false;
      // Still use localStorage for current step/progress (local state)
      const savedState = localStorage.getItem(TOUR_STORAGE_KEY);
      let currentStep = 0;
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          currentStep = parsed.currentStep || 0;
        } catch (e) {
          // Ignore parse errors
        }
      }
      const newTourState = {
        completed: isCompleted,
        currentStep: isCompleted ? 0 : currentStep,
        dismissed: isCompleted,
        version: TOUR_VERSION,
        lastShown: new Date().toISOString(),
      };
      setTourState(newTourState);
    } else if (!userProfile) {
      // Reset ref when userProfile is null (logged out)
      userProfileIdRef.current = null;
      setTourState(null);
    }
  }, [userProfile]);

  const saveTourState = async (state: TourState, saveToSupabase = false) => {
    // Always save local progress (step) to localStorage
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
    setTourState(state);
    
    // Save completion status to Supabase (per-account tracking)
    if (saveToSupabase && userProfile && state.completed) {
      const { error } = await supabase
        .from('profiles')
        .update({ tour_completed: true })
        .eq('id', userProfile.id);
      
      if (error) {
        console.error('Error updating tour_completed:', error);
      }
    }
  };

  const isMobile = () => window.innerWidth < 768;

  const startTour = (fromStep = 0) => {
    const steps = isMobile() ? mobileSteps : desktopSteps;
    const slicedSteps = steps.slice(fromStep);
    let previousPosition: { top: string; left: string; right: string; bottom: string } | null = null;
    
    const driverObj = driver({
      showProgress: true,
      steps: slicedSteps,
      popoverClass: "gretel-tour-popover",
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next →",
      prevBtnText: "← Back",
      doneBtnText: "Done 🎉",
      allowClose: false,
      animate: false,
      smoothScroll: true,
      
      
      onPopoverRender: (popover, { state }) => {
        // Add custom styling
        const popoverElement = popover.wrapper;
        popoverElement.style.setProperty("--driver-popover-accent", "var(--primary-600)");
        
        // Fix progress text to show correct numbers based on original steps, not sliced steps
        // Calculate actual current step (1-indexed): fromStep + activeIndex + 1
        const actualCurrentStep = fromStep + (state.activeIndex ?? 0) + 1;
        const totalSteps = steps.length;
        const progressText = `${actualCurrentStep} of ${totalSteps}`;
        
        // Find and update the progress text element
        const progressElement = popoverElement.querySelector('.driver-popover-progress-text');
        if (progressElement) {
          progressElement.textContent = progressText;
        }
        
        // Fix back button: Enable it IMMEDIATELY if we're resuming from a later step (fromStep > 0)
        // Driver.js disables the back button when activeIndex === 0, but we need it enabled
        // if we're resuming from step 4+ because we can still go back to earlier steps
        // Try multiple selectors as Driver.js might use different class names
        const prevButtonSelectors = [
          '.driver-popover-prev-btn',
          'button[data-step="prev"]',
          '.driver-popover-footer button:first-child',
          'button.driver-prev-btn',
          '.driver-popover .driver-popover-footer button:first-of-type'
        ];
        
        let prevButton: HTMLButtonElement | null = null;
        for (const selector of prevButtonSelectors) {
          prevButton = popoverElement.querySelector(selector) as HTMLButtonElement;
          if (prevButton) break;
        }
        
        // Also try finding by text content
        if (!prevButton) {
          const allButtons = popoverElement.querySelectorAll('button');
          for (const btn of Array.from(allButtons)) {
            if (btn.textContent?.includes('Back') || btn.textContent?.includes('←')) {
              prevButton = btn;
              break;
            }
          }
        }
        
        // CRITICAL: Enable the button IMMEDIATELY if we can go back, BEFORE Driver.js disables it
        if (prevButton && (fromStep > 0 || (state.activeIndex ?? 0) > 0)) {
          prevButton.disabled = false;
          prevButton.removeAttribute('disabled');
          prevButton.classList.remove('driver-disabled', 'disabled', 'driver-popover-btn-disabled');
          prevButton.style.setProperty('opacity', '1', 'important');
          prevButton.style.setProperty('cursor', 'pointer', 'important');
          prevButton.style.setProperty('pointer-events', 'auto', 'important');
          prevButton.setAttribute('data-force-enabled', 'true');
        }
        
        if (prevButton) {
          // Enable back button if we're not at the actual first step (fromStep > 0 means we can go back)
          // OR if activeIndex > 0 in the sliced steps (can go back within sliced steps)
          const canGoBack = fromStep > 0 || (state.activeIndex ?? 0) > 0;
          
          if (canGoBack) {
            // Function to aggressively enable the button
            const enableBackButton = () => {
              if (!prevButton) return;
              prevButton.disabled = false;
              prevButton.removeAttribute('disabled');
              // Remove ALL disabled-related classes
              prevButton.classList.remove('driver-disabled', 'disabled', 'driver-popover-btn-disabled');
              // Force enable visual state with !important via setProperty
              prevButton.style.setProperty('opacity', '1', 'important');
              prevButton.style.setProperty('cursor', 'pointer', 'important');
              prevButton.style.setProperty('pointer-events', 'auto', 'important');
              // Also set directly (fallback)
              prevButton.style.opacity = '1';
              prevButton.style.cursor = 'pointer';
              prevButton.style.pointerEvents = 'auto';
              // Add a data attribute to mark it as force-enabled
              prevButton.setAttribute('data-force-enabled', 'true');
            };
            
            // Also inject a style tag to override Driver.js's disabled styles globally
            if (!document.getElementById('driver-back-button-override')) {
              const style = document.createElement('style');
              style.id = 'driver-back-button-override';
              style.textContent = `
                .driver-popover-prev-btn[data-force-enabled="true"] {
                  opacity: 1 !important;
                  cursor: pointer !important;
                  pointer-events: auto !important;
                  background-color: transparent !important;
                }
                .driver-popover-prev-btn.driver-popover-btn-disabled[data-force-enabled="true"] {
                  opacity: 1 !important;
                  cursor: pointer !important;
                  pointer-events: auto !important;
                }
              `;
              document.head.appendChild(style);
            }
            
            // Enable immediately
            enableBackButton();
            
            // Use requestAnimationFrame to enable after Driver.js renders
            requestAnimationFrame(() => {
              enableBackButton();
            });
            
            // Also enable after multiple delays to catch Driver.js disabling it
            setTimeout(enableBackButton, 0);
            setTimeout(enableBackButton, 50);
            setTimeout(enableBackButton, 100);
            setTimeout(enableBackButton, 200);
            setTimeout(enableBackButton, 500);
            
            // Use MutationObserver to keep it enabled (Driver.js might re-disable it)
            const observer = new MutationObserver(() => {
              if (canGoBack && prevButton && (prevButton.disabled || prevButton.classList.contains('driver-popover-btn-disabled'))) {
                enableBackButton();
              }
            });
            
            observer.observe(prevButton, {
              attributes: true,
              attributeFilter: ['disabled', 'class'],
              childList: false,
              subtree: false
            });
            
            // Also set up a periodic check (every 100ms for 2 seconds) to ensure it stays enabled
            let checkCount = 0;
            const maxChecks = 20;
            const periodicCheck = setInterval(() => {
              if (checkCount >= maxChecks || !prevButton) {
                clearInterval(periodicCheck);
                return;
              }
              checkCount++;
              if (canGoBack && (prevButton.disabled || prevButton.classList.contains('driver-popover-btn-disabled'))) {
                enableBackButton();
              }
            }, 100);
            
            // Store observer and interval on button for cleanup
            (prevButton as any)._driverBackButtonObserver = observer;
            (prevButton as any)._driverBackButtonInterval = periodicCheck;
          } else {
            prevButton.disabled = true;
            prevButton.classList.add('driver-disabled');
            prevButton.style.opacity = '0.5';
            prevButton.style.cursor = 'not-allowed';
          }
        }
        
        // Wait for Driver.js to position the popover correctly first
        requestAnimationFrame(() => {
          // Re-enable back button after Driver.js positions the popover
          if (fromStep > 0 || (state.activeIndex ?? 0) > 0) {
            const prevButtonSelectors = [
              '.driver-popover-prev-btn',
              'button[data-step="prev"]',
              '.driver-popover-footer button:first-child',
              'button.driver-prev-btn',
              '.driver-popover .driver-popover-footer button:first-of-type'
            ];
            
            let prevButton: HTMLButtonElement | null = null;
            for (const selector of prevButtonSelectors) {
              prevButton = popoverElement.querySelector(selector) as HTMLButtonElement;
              if (prevButton) break;
            }
            
            if (!prevButton) {
              const allButtons = popoverElement.querySelectorAll('button');
              for (const btn of Array.from(allButtons)) {
                if (btn.textContent?.includes('Back') || btn.textContent?.includes('←')) {
                  prevButton = btn;
                  break;
                }
              }
            }
            
            if (prevButton) {
              prevButton.disabled = false;
              prevButton.removeAttribute('disabled');
              prevButton.classList.remove('driver-disabled', 'disabled', 'driver-popover-btn-disabled');
              prevButton.style.opacity = '1';
              prevButton.style.cursor = 'pointer';
              prevButton.style.pointerEvents = 'auto';
            }
          }
          
          // Get the final correct position from Driver.js
          const finalTop = popoverElement.style.top;
          const finalLeft = popoverElement.style.left;
          const finalRight = popoverElement.style.right;
          const finalBottom = popoverElement.style.bottom;
          
          // Animate from previous position if available
          if (previousPosition && state.activeIndex !== 0) {
            // Set to previous position first
            popoverElement.style.top = previousPosition.top;
            popoverElement.style.left = previousPosition.left;
            popoverElement.style.right = previousPosition.right;
            popoverElement.style.bottom = previousPosition.bottom;
            popoverElement.style.transition = 'none';
            
            // Force reflow
            void popoverElement.offsetHeight;
            
            // Enable transitions and move to correct final position
            requestAnimationFrame(() => {
              popoverElement.style.transition = 'top 1s ease-in-out, left 1s ease-in-out, right 1s ease-in-out, bottom 1s ease-in-out';
              popoverElement.style.top = finalTop;
              popoverElement.style.left = finalLeft;
              popoverElement.style.right = finalRight;
              popoverElement.style.bottom = finalBottom;
            });
          }
          
          // Store current position for next transition
          setTimeout(() => {
            previousPosition = {
              top: popoverElement.style.top,
              left: popoverElement.style.left,
              right: popoverElement.style.right,
              bottom: popoverElement.style.bottom
            };
          }, 100);
        });
        
        // Hide the close button (we use "Continue Later" instead), except on last step
        const closeBtn = popover.closeButton;
        // FIX: Use slicedSteps.length instead of steps.length
        if (closeBtn && state.activeIndex !== slicedSteps.length - 1) {
          closeBtn.style.display = "none";
        }
        
        // Add "Continue Later" button if not on last step
        // FIX: Use slicedSteps.length instead of steps.length
        if (state.activeIndex !== undefined && state.activeIndex < slicedSteps.length - 1) {
          const footer = popover.footerButtons;
          const continueLaterBtn = document.createElement("button");
          continueLaterBtn.textContent = "Continue Later";
          continueLaterBtn.className = "driver-continue-later-btn";
          continueLaterBtn.onclick = async () => {
            // Calculate currentStep the same way as onNextClick: fromStep + activeIndex + 1 (1-indexed)
            const savedCurrentStep = fromStep + (state.activeIndex ?? 0) + 1;
            await saveTourState({
              ...tourState!,
              currentStep: savedCurrentStep,
              dismissed: true, // Set dismissed to true to prevent auto-start
              completed: false, // Reset completed to false when continuing later (allows resuming)
              lastShown: new Date().toISOString(),
            }, false); // Don't save to Supabase on "Continue Later" - only on completion
            
            // Add exit animation
            const popoverEl = popover.wrapper;
            const overlayEl = document.querySelector('.driver-overlay');
            
            if (popoverEl) {
              popoverEl.classList.add('exiting');
            }
            if (overlayEl) {
              overlayEl.classList.add('exiting');
            }
            
            // Wait for animation to complete before destroying
            setTimeout(() => {
              driverObj.destroy();
            }, 300);
          };
          footer.insertBefore(continueLaterBtn, footer.firstChild);
        }
      },
      
      onDestroyStarted: () => {
        // Note: Completion is handled in onNextClick for last step
      },
      
      onNextClick: (_element, _step, options) => {
        // Update progress text after navigation
        const popoverElement = document.querySelector('.driver-popover') as HTMLElement;
        if (popoverElement) {
          const actualCurrentStep = fromStep + (options.state.activeIndex ?? 0) + 1;
          const totalSteps = steps.length;
          const progressText = `${actualCurrentStep} of ${totalSteps}`;
          const progressElement = popoverElement.querySelector('.driver-popover-progress-text');
          if (progressElement) {
            progressElement.textContent = progressText;
          }
          
          // Update back button state after navigation
          const prevButtonSelectors = [
            '.driver-popover-prev-btn',
            'button[data-step="prev"]',
            '.driver-popover-footer button:first-child',
            'button.driver-prev-btn',
            '.driver-popover .driver-popover-footer button:first-of-type'
          ];
          
          let prevButton: HTMLButtonElement | null = null;
          for (const selector of prevButtonSelectors) {
            prevButton = popoverElement.querySelector(selector) as HTMLButtonElement;
            if (prevButton) break;
          }
          
          if (!prevButton) {
            const allButtons = popoverElement.querySelectorAll('button');
            for (const btn of Array.from(allButtons)) {
              if (btn.textContent?.includes('Back') || btn.textContent?.includes('←')) {
                prevButton = btn;
                break;
              }
            }
          }
          
          if (prevButton) {
            const canGoBack = fromStep > 0 || (options.state.activeIndex ?? 0) > 0;
            if (canGoBack) {
              // Aggressively enable the button - remove ALL disabled-related classes including driver-popover-btn-disabled
              prevButton.disabled = false;
              prevButton.removeAttribute('disabled');
              prevButton.classList.remove('driver-disabled', 'disabled', 'driver-popover-btn-disabled');
              prevButton.style.opacity = '1';
              prevButton.style.cursor = 'pointer';
              prevButton.style.pointerEvents = 'auto';
            } else {
              prevButton.disabled = true;
              prevButton.classList.add('driver-disabled');
              prevButton.style.opacity = '0.5';
              prevButton.style.cursor = 'not-allowed';
            }
          }
        }
        
        // On the last step, handle completion with smooth exit animation
        // FIX: Use slicedSteps.length instead of steps.length
        if (options.state.activeIndex === slicedSteps.length - 1) {
          // Add smooth exit animation
          const popoverEl = document.querySelector('.driver-popover') as HTMLElement;
          const overlayEl = document.querySelector('.driver-overlay') as HTMLElement;
          
          if (popoverEl) popoverEl.classList.add('exiting');
          if (overlayEl) overlayEl.classList.add('exiting');
          
          // Complete the tour after animation
          setTimeout(async () => {
            await saveTourState({
              completed: true,
              currentStep: 0,
              dismissed: false,
              version: TOUR_VERSION,
              lastShown: new Date().toISOString(),
            }, true); // Save to Supabase when completed
            onComplete?.();
            driverObj.destroy();
          }, 300);
          
          return; // Don't call moveNext()
        }
        
        // Save progress on each next (only to localStorage, not Supabase)
        // IMPORTANT: Save the NEXT step (after moveNext), not the current step
        // currentStep should be fromStep + (activeIndex + 1) + 1 = fromStep + activeIndex + 2
        const nextStep = fromStep + (options.state.activeIndex || 0) + 2;
        saveTourState({
          ...tourState!,
          currentStep: nextStep,
          lastShown: new Date().toISOString(),
        }, false);
        driverObj.moveNext();
      },
      
      onPrevClick: () => {
        const currentActiveIndex = driverObj.getActiveIndex?.() ?? 0;
        
        // CRITICAL FIX: When resuming from a later step (fromStep > 0) and we're at the first step
        // of the sliced array (activeIndex === 0), movePrevious() doesn't work because Driver.js
        // thinks we're at the absolute first step. Instead, we need to restart the tour from
        // fromStep - 1 to go back to the previous step.
        if (fromStep > 0 && currentActiveIndex === 0) {
          // Save current progress before restarting
          const previousStep = fromStep; // Previous step (1-indexed, which is fromStep in 0-indexed)
          
          // Save progress to previous step
          saveTourState({
            ...tourState!,
            currentStep: previousStep,
            lastShown: new Date().toISOString(),
          }, false);
          
          // Destroy current tour and restart from previous step
          driverObj.destroy();
          
          // Restart tour from previous step (fromStep - 1)
          setTimeout(() => {
            startTour(fromStep - 1);
          }, 100);
          
          return; // Don't call movePrevious()
        }
        
        // Normal case: we can go back within the sliced array
        driverObj.movePrevious();
        
        // Update progress text and back button state after moving back
        setTimeout(() => {
          const popoverElement = document.querySelector('.driver-popover') as HTMLElement;
          if (popoverElement) {
            // Get current active index from Driver.js state
            const currentActiveIndex = driverObj.getActiveIndex?.() ?? 0;
            const actualCurrentStep = fromStep + currentActiveIndex + 1;
            const totalSteps = steps.length;
            const progressText = `${actualCurrentStep} of ${totalSteps}`;
            const progressElement = popoverElement.querySelector('.driver-popover-progress-text');
            if (progressElement) {
              progressElement.textContent = progressText;
            }
            
            // Update back button state
            const prevButtonSelectors = [
              '.driver-popover-prev-btn',
              'button[data-step="prev"]',
              '.driver-popover-footer button:first-child',
              'button.driver-prev-btn',
              '.driver-popover .driver-popover-footer button:first-of-type'
            ];
            
            let prevButton: HTMLButtonElement | null = null;
            for (const selector of prevButtonSelectors) {
              prevButton = popoverElement.querySelector(selector) as HTMLButtonElement;
              if (prevButton) break;
            }
            
            if (!prevButton) {
              const allButtons = popoverElement.querySelectorAll('button');
              for (const btn of Array.from(allButtons)) {
                if (btn.textContent?.includes('Back') || btn.textContent?.includes('←')) {
                  prevButton = btn;
                  break;
                }
              }
            }
            
            if (prevButton) {
              const canGoBack = fromStep > 0 || currentActiveIndex > 0;
              if (canGoBack) {
                // Aggressively enable the button - remove ALL disabled-related classes
                prevButton.disabled = false;
                prevButton.removeAttribute('disabled');
                prevButton.classList.remove('driver-disabled', 'disabled', 'driver-popover-btn-disabled');
                prevButton.style.opacity = '1';
                prevButton.style.cursor = 'pointer';
                prevButton.style.pointerEvents = 'auto';
              } else {
                prevButton.disabled = true;
                prevButton.classList.add('driver-disabled');
                prevButton.style.opacity = '0.5';
                prevButton.style.cursor = 'not-allowed';
              }
            }
          }
        }, 50);
      },
    });

    driverObj.drive();
  };

  // Auto-start tour for first-time users (only if not completed per account)
  // Auto-start tour only once when both tourState and userProfile are first available
  // Use sessionStorage to persist "has attempted auto-start" across page refreshes
  useEffect(() => {
    // Check if tour is already active
    const hasActiveDriver = !!document.querySelector('.driver-active');
    if (hasActiveDriver) {
      return;
    }
    
    // Only auto-start once per session (when tourState and userProfile are first loaded)
    // Check both ref (for current session) and sessionStorage (for page refreshes)
    if (hasAttemptedAutoStartRef.current || hasAttemptedAutoStart()) {
      return;
    }
    
    // Only proceed if both tourState and userProfile are available
    // AND tour is not completed/dismissed
    if (tourState && !tourState.completed && !tourState.dismissed && userProfile) {
      // Mark that we've attempted to start in both ref (current session) and sessionStorage (survives refresh)
      hasAttemptedAutoStartRef.current = true;
      setHasAttemptedAutoStart(true);
      
      // Only auto-start if tour has not been completed (checked from userProfile) AND not dismissed
      // Wait a bit for page to load
      // Convert currentStep (1-indexed) to fromStep (0-indexed)
      setTimeout(() => {
        // Double-check that tour is still not active before starting
        const stillHasActiveDriver = !!document.querySelector('.driver-active');
        if (!stillHasActiveDriver) {
          const fromStep = Math.max(0, (tourState.currentStep || 0) - 1);
          startTour(fromStep);
        }
      }, 1000);
    }
  }, [tourState, userProfile]);

  // Expose methods for manual trigger
  useEffect(() => {
    // Add to window for manual triggering
    (window as any).startGretelTour = () => startTour(0);
    (window as any).continueGretelTour = () => {
      // Load current step from localStorage to ensure we have the latest saved progress
      const savedState = localStorage.getItem(TOUR_STORAGE_KEY);
      let currentStep = tourState?.currentStep || 0;
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          currentStep = parsed.currentStep || 0;
        } catch (e) {
          // Ignore parse errors
        }
      }
      // Also clear dismissed flag so tour can run
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          if (parsed.dismissed) {
            // Clear dismissed flag to allow tour to run
            const updatedState = { ...parsed, dismissed: false };
            localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(updatedState));
            setTourState(updatedState);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      // Convert currentStep (1-indexed) to fromStep (0-indexed)
      // If currentStep is 5, we want to start from step 5 (1-indexed), which is index 4 (0-indexed)
      const fromStep = Math.max(0, currentStep - 1);
      startTour(fromStep);
    };
    (window as any).resetGretelTour = () => {
      // Reset tour state to allow starting from the beginning
      localStorage.removeItem('gretel_tour_state');
      // Stop any active tour first
      (window as any).stopGretelTour?.();
    };
    (window as any).stopGretelTour = () => {
      // Stop any active tour
      const activeDriver = document.querySelector('.driver-active');
      const closeBtn = document.querySelector('.driver-popover-close-btn') as HTMLElement;
      
      if (closeBtn) {
        // Normal stop - click close button
        closeBtn.click();
      } else if (activeDriver) {
        // Stuck state - force cleanup
        // Remove driver-active class from all elements
        document.querySelectorAll('.driver-active').forEach((el) => {
          el.classList.remove('driver-active');
        });
        // Remove any driver overlays
        document.querySelectorAll('.driver-overlay').forEach((el) => {
          el.remove();
        });
        // Remove any driver popovers
        document.querySelectorAll('.driver-popover').forEach((el) => {
          el.remove();
        });
      }
      
      // Aggressive cleanup: remove all Driver.js artifacts
      document.querySelectorAll('[class*="driver"], [id*="driver"], [data-driver-highlighted]').forEach((el) => {
        if (el.classList.contains('driver-overlay') || el.classList.contains('driver-popover')) {
          el.remove();
        } else {
          // Remove driver classes and attributes from elements
          Array.from(el.classList).forEach(cls => {
            if (cls.includes('driver')) {
              el.classList.remove(cls);
            }
          });
          Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith('data-driver')) {
              (el as HTMLElement).removeAttribute(attr.name);
            }
          });
          // Remove any inline styles that might be from Driver.js
          const htmlEl = el as HTMLElement;
          if (htmlEl.style) {
            htmlEl.style.outline = '';
            htmlEl.style.boxShadow = '';
            htmlEl.style.border = '';
          }
        }
      });
      
      // Inject global CSS override to prevent Driver.js highlighting
      const styleId = 'gretel-prevent-driver-highlight';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          /* Prevent Driver.js from highlighting elements */
          #chat-interface.driver-highlighted,
          #todays-schedule.driver-highlighted,
          #top-priorities.driver-highlighted,
          #chat-interface.driver-highlighted-element,
          #todays-schedule.driver-highlighted-element,
          #top-priorities.driver-highlighted-element,
          #chat-interface.driver-active-element,
          #todays-schedule.driver-active-element,
          #top-priorities.driver-active-element,
          #chat-interface[data-driver-highlighted],
          #todays-schedule[data-driver-highlighted],
          #top-priorities[data-driver-highlighted],
          #chat-interface.driver-active,
          #todays-schedule.driver-active,
          #top-priorities.driver-active {
            outline: none !important;
            box-shadow: none !important;
            border: none !important;
            position: static !important;
            z-index: auto !important;
            outline-offset: 0 !important;
            animation: none !important;
            will-change: auto !important;
            transform: none !important;
            backface-visibility: visible !important;
          }
        `;
        document.head.appendChild(style);
      }
    };
    
    return () => {
      delete (window as any).startGretelTour;
      delete (window as any).continueGretelTour;
      delete (window as any).stopGretelTour;
    };
  }, [tourState]);

  return null; // This component doesn't render anything
};

// Helper function to show feature announcement
export const showFeatureAnnouncement = (steps: typeof desktopSteps) => {
  const driverObj = driver({
    showProgress: false,
    steps,
    popoverClass: "gretel-feature-announcement",
    nextBtnText: "Next →",
    doneBtnText: "Got it! ✓",
    onDestroyStarted: () => {
      // Mark feature as seen
      const seenFeatures = JSON.parse(localStorage.getItem("gretel_seen_features") || "[]");
      seenFeatures.push(TOUR_VERSION);
      localStorage.setItem("gretel_seen_features", JSON.stringify(seenFeatures));
    },
  });
  
  driverObj.drive();
};

export default OnboardingTour;
