import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import AppIcon from './AppIcon';

// Define the structure for a command
export interface Command {
  id: string;
  name: string;
  description?: string;
  icon?: React.ReactNode;
  action: () => void;
  section: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
  onExecuteQuery: (query: string) => void;
  assistantName: string;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, commands, onExecuteQuery, assistantName }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100); // Delay focus slightly for transition
    }
  }, [isOpen]);

  const filteredCommands = useMemo(() => {
    if (!query) return commands;
    const lowerCaseQuery = query.toLowerCase();
    return commands.filter(
      (command) =>
        command.name.toLowerCase().includes(lowerCaseQuery) ||
        command.description?.toLowerCase().includes(lowerCaseQuery)
    );
  }, [query, commands]);

  const groupedCommands = useMemo(() => {
      const groups: Record<string, Command[]> = {};
      for (const command of filteredCommands) {
          if (!groups[command.section]) {
              groups[command.section] = [];
          }
          groups[command.section].push(command);
      }
      return Object.entries(groups);
  }, [filteredCommands]);

  const flatCommandList = useMemo(() => groupedCommands.flatMap(([, items]) => items), [groupedCommands]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (flatCommandList.length + (filteredCommands.length === 0 ? 1 : 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + (flatCommandList.length + (filteredCommands.length === 0 ? 1 : 0))) % (flatCommandList.length + (filteredCommands.length === 0 ? 1 : 0)));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands.length === 0 && query) {
            onExecuteQuery(query);
        } else if (flatCommandList[selectedIndex]) {
            flatCommandList[selectedIndex].action();
            onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatCommandList, filteredCommands, selectedIndex, query, onClose, onExecuteQuery]);

  useEffect(() => {
    // Use querySelector for more reliable scrolling
    const selectedElement = resultsRef.current?.querySelector(`li[data-index='${selectedIndex}']`);
    selectedElement?.scrollIntoView({
        block: 'nearest',
    });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder={`Type a command or ask ${assistantName}...`}
            className="w-full p-4 pl-12 bg-transparent text-gray-800 dark:text-gray-200 focus:outline-none"
          />
           <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
               <AppIcon name="command" className="h-5 w-5" />
           </div>
        </div>

        <ul ref={resultsRef} className="max-h-[60vh] overflow-y-auto p-2">
            {groupedCommands.length > 0 ? (
                groupedCommands.map(([section, items], groupIndex) => (
                    <li key={section}>
                        <h3 className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{section}</h3>
                        <ul>
                            {items.map((command, itemIndex) => {
                                const overallIndex = groupedCommands.slice(0, groupIndex).reduce((acc, [, gItems]) => acc + gItems.length, 0) + itemIndex;
                                return (
                                    <li
                                        key={command.id}
                                        data-index={overallIndex}
                                        className={`command-item ${selectedIndex === overallIndex ? 'command-item-selected' : ''} group flex items-center p-3 rounded-lg cursor-pointer transition-all ${selectedIndex === overallIndex ? 'border-l-[3px]' : 'border-l-[3px] border-l-transparent'}`}
                                        style={selectedIndex === overallIndex ? { 
                                            backgroundColor: 'var(--primary-50)', 
                                            borderLeftColor: 'var(--primary-600)' 
                                        } : undefined}
                                        onMouseEnter={() => setSelectedIndex(overallIndex)}
                                        onClick={() => { command.action(); onClose(); }}
                                    >
                                        <div className={`mr-3 text-[var(--primary-600)]`}>
                                            {React.isValidElement(command.icon)
                                                ? React.cloneElement(command.icon as React.ReactElement, {
                                                    isHovered: selectedIndex === overallIndex
                                                })
                                                : command.icon}
                                        </div>
                                        <div className="flex-1">
                                            <p className={`font-semibold ${selectedIndex === overallIndex ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>{command.name}</p>
                                            {command.description && (
                                              <p 
                                                className={`text-xs ${selectedIndex === overallIndex ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400'}`}
                                              >
                                                {command.description}
                                              </p>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </li>
                ))
            ) : query ? (
                <li
                    data-index={0}
                    className={`flex items-center p-3 rounded-lg cursor-pointer ${selectedIndex === 0 ? 'border-l-[3px]' : 'border-l-[3px] border-l-transparent'}`}
                    style={selectedIndex === 0 ? { 
                        backgroundColor: 'var(--primary-50)', 
                        borderLeftColor: 'var(--primary-600)' 
                    } : undefined}
                    onClick={() => onExecuteQuery(query)}
                    onMouseEnter={() => setSelectedIndex(0)}
                >
                     <motion.div 
                        className={`mr-3 text-[var(--primary-600)]`}
                        animate={selectedIndex === 0 ? "hover" : "normal"}
                        variants={{
                            normal: { scale: 1, filter: "brightness(1)" },
                            hover: { 
                                scale: 1.05, 
                                filter: "brightness(1.1)", 
                                transition: { duration: 0.3, ease: "easeInOut" }
                            }
                        }}
                     >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                           <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                     </motion.div>
                    <div className="flex-1">
                        <p className={`font-semibold ${selectedIndex === 0 ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>Ask {assistantName}</p>
                        <p 
                          className={`text-xs truncate ${selectedIndex === 0 ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400'}`}
                        >
                          "{query}"
                        </p>
                    </div>
                </li>
            ) : (
                 <li className="text-center p-6 text-gray-500 dark:text-gray-400">No commands found.</li>
            )}
        </ul>

         <div className="p-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 flex justify-between">
            <span>Navigate with <kbd className="font-sans px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-md dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">↑</kbd> <kbd className="font-sans px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-md dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">↓</kbd></span>
            <span>Select with <kbd className="font-sans px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-md dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">Enter</kbd></span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;