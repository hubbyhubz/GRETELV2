import React, { useEffect, useRef, useState } from 'react';

interface PatchNotesModalProps {
  version: string;
  onClose: () => void;
}

const PatchNotesModal: React.FC<PatchNotesModalProps> = ({ version, onClose }) => {
  const patchNotes = [
    {
      version: "1.5.4",
      date: "January 29, 2026",
      title: "Daily Kick-off + End-of-Day Upgrade",
      features: [
        "Dynamic Daily Kick-off Questions: Kick-off prompts now generate from your Setup Wizard profile instead of hardcoded text.",
        "End-of-Day Review Revamp: New structured layout with intro summary, daily review, KPIs, delegated follow-up, and leadership journal.",
        "Morale Rating Rubric: Guided prompts now calculate team morale automatically for a consistent 1–5 score."
      ],
      fixes: [
        "Briefing Script Polish: Removed placeholder text from the script textbox while generating.",
        "Afternoon Briefing Finalize: Improved talking-point formatting and reliability for afternoon drafts.",
        "End-of-Day Modal: Smart check-in now preserves generated content when closing and reopening."
      ]
    },
    {
      version: "1.5.3",
      date: "January 21, 2026",
      title: "Swipe Navigation",
      features: [
        "Swipe Gestures: You can now swipe left or right on mobile to navigate between Chat, Today, and Work tabs.",
        "Smooth Animations: Added resistance and snap-back effects for a natural touch feel.",
        "Smart Detection: Swipes are intelligently ignored when interacting with scrollable content."
      ],
      fixes: [
        "Optimized touch event handling for better performance.",
        "Prevented accidental navigation while scrolling charts or code blocks."
      ]
    },
    {
      version: "1.5.2",
      date: "January 21, 2026",
      title: "UI Polish & History",
      features: [
        "Scrollable Patch Notes: You can now view the complete update history in a scrollable view.",
        "Visual Indicators: Added gradient fades to indicate more content when scrolling.",
        "Custom Scrollbars: Sleek, themed scrollbars for a better browsing experience."
      ],
      fixes: [
        "Improved modal layout responsiveness.",
        "Fixed accessibility tab order in the modal."
      ]
    },
    {
      version: "1.5.1",
      date: "January 21, 2026",
      title: "G.R.E.T.E.L Vision Upgrade",
      features: [
        "Vision Upgrade: You can now upload images to the chat! Click the new Image icon to analyze screenshots, notes, or equipment photos.",
        "Persistent Tour: The app now remembers if you've completed the onboarding tour.",
        "Enhanced Patch Notes: Release notes now only appear when there's actually a new update.",
        "UI Polish: Improved icon consistency and chat input layout."
      ],
      fixes: [
        "Fixed an issue where the tour might restart unexpectedly.",
        "Resolved reference errors in the chat input component."
      ]
    },
    {
      version: "1.4.8",
      date: "May 20, 2025",
      title: "Project Planning & UI Improvements",
      features: [
        "Smart Sync Milestone Generation: Paste milestones to auto-generate rows.",
        "Assignee Field: Assign team members directly to milestones.",
        "Improved Project Update Modal Layout."
      ],
      fixes: [
        "Fixed Milestone Duplication Bug.",
        "Fixed Assignee Badge Wrapping."
      ]
    },
    {
      version: "1.3.0",
      date: "April 15, 2025",
      title: "Core Performance Update",
      features: [
        "Faster load times for the dashboard.",
        "Optimized mobile layout for smaller screens.",
        "Introduced Dark Mode beta."
      ],
      fixes: [
        "Resolved memory leak in chat component.",
        "Fixed layout shifts on initial load."
      ]
    },
    {
      version: "1.2.0",
      date: "March 10, 2025",
      title: "Initial Release",
      features: [
        "Launch of G.R.E.T.E.L AI Assistant.",
        "Basic Project Management tools.",
        "Google Calendar Integration."
      ],
      fixes: []
    }
  ];

  const currentNote = patchNotes.find(note => note.version === version) || patchNotes[0];
  const historyNotes = patchNotes.filter(note => note.version !== currentNote.version);

  const [isClosing, setIsClosing] = useState(false);
  const [showBottomShadow, setShowBottomShadow] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const cleanupRef = React.useRef<(() => void) | null>(null);

  // Check for scroll overflow to show/hide shadow
  const checkScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    
    // Show shadow if we're not at the bottom
    const isAtBottom = Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 5;
    setShowBottomShadow(!isAtBottom && el.scrollHeight > el.clientHeight);
  };

  useEffect(() => {
    // Initial check
    checkScroll();
    // Re-check on window resize
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, []);
  
  // Use callback ref to attach listeners immediately when button mounts
  const buttonCallbackRef = React.useCallback((buttonElement: HTMLButtonElement | null) => {
    // Clean up previous listeners if any
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    
    if (!buttonElement) {
      buttonRef.current = null;
      return;
    }
    
    buttonRef.current = buttonElement;
    
    // Attach direct event listeners immediately (bypassing React)
    const handleDirectClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onClose();
    };
    buttonElement.addEventListener('click', handleDirectClick, true);
    
    // Store cleanup function
    cleanupRef.current = () => {
      buttonElement.removeEventListener('click', handleDirectClick, true);
    };
  }, [onClose]);
  
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleClose = () => {
    if (!onClose) {
      console.error('onClose is not defined!');
      return;
    }
    try {
      setIsClosing(true);
      setTimeout(() => {
        setIsClosing(false);
        onClose();
      }, 400);
    } catch (error) {
      console.error('Error closing patch notes:', error);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster" 
      onClick={handleBackdropClick}
      style={{ pointerEvents: 'auto', zIndex: 50 }}
      aria-modal="true"
      role="dialog"
    >
      <div 
        className={`w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700 animate__animated ${isClosing ? 'animate__bounceOut' : 'animate__bounceIn'} flex flex-col max-h-[85vh]`}
        onClick={(e) => e.stopPropagation()}
        style={{ pointerEvents: 'auto' }}
      >
        <div className="text-center mb-4 flex-shrink-0">
            <h2 className="text-2xl font-bold text-primary-600">{currentNote.title}</h2>
            <div className="flex items-center justify-center space-x-2 mt-1">
                <span className="text-sm font-semibold text-primary-600">v{currentNote.version}</span>
                <span className="text-gray-400">•</span>
                <span className="text-sm text-gray-500">{currentNote.date}</span>
            </div>
        </div>
        
        <div className="relative flex-1 min-h-0 overflow-hidden">
            <div 
                ref={scrollContainerRef}
                onScroll={checkScroll}
                className="prose prose-sm md:prose-base dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-4 overflow-y-auto h-full pr-3 custom-scrollbar"
            >
            
            {currentNote.features && currentNote.features.length > 0 && (
                <>
                    <h4 className="font-bold text-lg text-gray-800 dark:text-gray-200 mt-0">🚀 New Features</h4>
                    <ul className="mt-2 mb-4">
                        {currentNote.features.map((feature, idx) => (
                            <li key={idx}>{feature}</li>
                        ))}
                    </ul>
                </>
            )}

            {currentNote.fixes && currentNote.fixes.length > 0 && (
                <>
                    <h4 className="font-bold text-lg text-gray-800 dark:text-gray-200">🐛 Bug Fixes</h4>
                    <ul className="mt-2 mb-4">
                        {currentNote.fixes.map((fix, idx) => (
                            <li key={idx}>{fix}</li>
                        ))}
                    </ul>
                </>
            )}

            {historyNotes.length > 0 && (
                <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-gray-500 uppercase text-xs tracking-wider mb-6 sticky top-0 bg-white dark:bg-gray-800 py-2 z-10">Previous Updates</h3>
                    {historyNotes.map((note, idx) => (
                        <div key={idx} className="mb-8 opacity-85 hover:opacity-100 transition-opacity">
                            <div className="flex items-baseline justify-between mb-2">
                                <h5 className="font-bold text-gray-800 dark:text-gray-300 text-lg">{note.title}</h5>
                                <div className="flex flex-col items-end">
                                    <span className="text-sm font-semibold text-primary-600">v{note.version}</span>
                                    <span className="text-xs text-gray-500">{note.date}</span>
                                </div>
                            </div>
                            
                            {note.features.length > 0 && (
                                <div className="mb-3">
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Features</p>
                                    <ul className="list-disc pl-4 text-sm text-gray-600 dark:text-gray-400">
                                        {note.features.map((f, i) => (
                                            <li key={i}>{f}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            
                            {note.fixes && note.fixes.length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Fixes</p>
                                    <ul className="list-disc pl-4 text-sm text-gray-600 dark:text-gray-400">
                                        {note.fixes.map((f, i) => (
                                            <li key={i}>{f}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            </div>
            
            {/* Scroll Indicator Gradient */}
            <div 
                className={`absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-gray-800 to-transparent pointer-events-none transition-opacity duration-300 ${showBottomShadow ? 'opacity-100' : 'opacity-0'}`}
            />
        </div>
        
        <div className="text-center pt-6 flex-shrink-0" style={{ pointerEvents: 'auto', position: 'relative', zIndex: 101 }}>
          <button
            ref={buttonCallbackRef}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (handleClose) {
                handleClose();
              } else {
                console.error('handleClose is not defined!');
              }
            }}
            className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-100"
            style={{ pointerEvents: 'auto', zIndex: 100, position: 'relative' as const }}
            type="button"
          >
            Got It!
          </button>
        </div>
      </div>
    </div>
  );
};

export default PatchNotesModal;
