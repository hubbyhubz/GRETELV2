import React from 'react';

interface ActionContextMenuProps {
  x: number;
  y: number;
  selectedText: string;
  flipped?: boolean; // Whether menu should appear below selection
  onClose: () => void;
  onAddReminder: (text: string) => void;
  onAddBriefing: (text: string) => void;
  onExplain: (text: string) => void;
  onDelegate: (text: string) => void;
}

const ActionContextMenu: React.FC<ActionContextMenuProps> = ({
  x, y, selectedText, flipped = false, onClose, onAddReminder, onAddBriefing, onExplain, onDelegate
}) => {
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu if clicking outside or pressing Escape
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    
    // Use mousedown instead of click to close before selection is cleared
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const menuStyle: React.CSSProperties = {
    top: `${y}px`,
    left: `${x}px`,
    position: 'fixed',
    // Transform logic: flipped=true means ABOVE (pull up), flipped=false means BELOW (normal)
    transform: flipped ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
    zIndex: 9999,
  };
  
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const actions = [
      { 
          label: 'Explain This', 
          action: () => onExplain(selectedText), 
          shortcut: 'E',
          icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
          ),
          color: 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
      },
      { 
          label: 'Create Reminder', 
          action: () => onAddReminder(selectedText), 
          shortcut: 'R',
          icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
          ),
          color: 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30'
      },
      { 
          label: 'Add to Briefing', 
          action: () => onAddBriefing(selectedText), 
          shortcut: 'B',
          icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
          ),
          color: 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30'
      },
      { 
          label: 'Delegate Task', 
          action: () => onDelegate(selectedText), 
          shortcut: 'D',
          icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
          ),
          color: 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30'
      },
      { 
          label: copied ? 'Copied!' : 'Copy Text', 
          action: handleCopy, 
          shortcut: 'C',
          icon: copied ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
          ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
          ),
          color: copied ? 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
      },
  ];

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      const action = actions.find(a => a.shortcut?.toLowerCase() === event.key.toLowerCase());
      if (action && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        action.action();
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [selectedText, copied]);

  // Truncate long selected text for display
  const displayText = selectedText.length > 50 ? selectedText.substring(0, 50) + '...' : selectedText;

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden min-w-[300px]"
    >
      {/* Header showing selected text */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 italic truncate" title={selectedText}>
          "{displayText}"
        </p>
      </div>
      
      {/* Action buttons */}
      <div className="p-1.5 space-y-0.5">
        {actions.map(({ label, action, icon, color, shortcut }) => (
            <button
                key={label}
                onClick={() => { action(); if (label !== 'Copied!' && label !== 'Copy Text') onClose(); }}
                className={`flex items-center w-full text-sm font-medium px-3 py-2 rounded-lg transition-all duration-200 ${color} transform hover:scale-[1.02] active:scale-[0.98] group`}
                title={`${label} ${shortcut ? `(Press ${shortcut})` : ''}`}
            >
                <span className="mr-3 flex-shrink-0">{icon}</span>
                <span className="flex-1 text-left">{label}</span>
                {shortcut && (
                    <span className="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded group-hover:bg-gray-300 dark:group-hover:bg-gray-600 transition-colors">
                        {shortcut}
                    </span>
                )}
            </button>
        ))}
      </div>
      
      {/* Footer hint */}
      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
          Press ESC to close
        </p>
      </div>
    </div>
  );
};

export default ActionContextMenu;