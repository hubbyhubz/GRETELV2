import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface CustomTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
}

export const CustomTimePicker: React.FC<CustomTimePickerProps> = ({ value, onChange, className, id }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Parse current value or default to current time rounded
  const parseTime = (timeStr: string) => {
    if (!timeStr) {
      const now = new Date();
      return { 
        hour: now.getHours() % 12 || 12, 
        minute: Math.floor(now.getMinutes() / 5) * 5, 
        ampm: now.getHours() >= 12 ? 'PM' : 'AM' 
      };
    }
    const [h, m] = timeStr.split(':').map(Number);
    return {
      hour: h % 12 || 12,
      minute: m,
      ampm: h >= 12 ? 'PM' : 'AM'
    };
  };

  const { hour, minute, ampm } = parseTime(value);

  const updateTime = (h: number, m: number, ap: string) => {
    let hour24 = h;
    if (ap === 'PM' && h !== 12) hour24 += 12;
    if (ap === 'AM' && h === 12) hour24 = 0;
    
    const timeString = `${hour24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    onChange(timeString);
  };

  const hours = Array.from({ length: 12 }, (_, i) => i + 1); // 01-12
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5); // 00-55

  // Scroll to selected element when opening
  useEffect(() => {
    if (isOpen) {
       // Ideally we'd scroll the lists to the selected item here
       // but for simplicity/speed we'll just let them render
    }
  }, [isOpen]);

  return (
    <div className="relative w-full" ref={containerRef} id={id}>
      <div 
        className={`flex items-center justify-between cursor-pointer ${className} pr-2`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={value ? 'text-gray-900 dark:text-white' : 'text-gray-500'}>
          {value ? (
             // Display formatted time 12h
             (() => {
                const { hour, minute, ampm } = parseTime(value);
                return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${ampm}`;
             })()
          ) : 'Select Time'}
        </span>
        <ChevronDown size={16} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4 flex gap-4 w-[300px]">
            
            {/* Hours Column */}
            <div className="flex-1 flex flex-col items-center">
              <span className="text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-wider">Hour</span>
              <div className="h-56 overflow-y-auto w-full flex flex-col items-center gap-2 scrollbar-hide py-1">
                {hours.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => updateTime(h, minute, ampm)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-base font-semibold transition-all duration-200 ${
                      hour === h 
                        ? 'bg-[#DC143C] text-white shadow-lg shadow-red-500/30 scale-100' 
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {h.toString().padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>

            {/* Separator Line */}
            <div className="w-[1px] bg-gray-100 dark:bg-gray-700 my-4 opacity-50"></div>

            {/* Minutes Column */}
            <div className="flex-1 flex flex-col items-center">
              <span className="text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-wider">Min</span>
              <div className="h-56 overflow-y-auto w-full flex flex-col items-center gap-2 scrollbar-hide py-1">
                {minutes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateTime(hour, m, ampm)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-base font-semibold transition-all duration-200 ${
                      minute === m 
                        ? 'bg-[#DC143C] text-white shadow-lg shadow-red-500/30 scale-100' 
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {m.toString().padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>

             {/* Separator Line */}
             <div className="w-[1px] bg-gray-100 dark:bg-gray-700 my-4 opacity-50"></div>

            {/* AM/PM Column */}
            <div className="flex-1 flex flex-col items-center">
              <span className="text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-wider">AM/PM</span>
              <div className="h-56 w-full flex flex-col items-center gap-3 pt-1">
                {['AM', 'PM'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => updateTime(hour, minute, p)}
                    className={`w-12 h-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-200 ${
                      ampm === p 
                        ? 'bg-[#DC143C] text-white shadow-lg shadow-red-500/30 scale-100' 
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}
      
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};
