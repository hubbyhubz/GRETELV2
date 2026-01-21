import React, { useState, useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { useDashboardContext } from './DashboardContext';
import { CalendarEvent, MealType } from './types';
import { Plus, X, Calendar as CalendarIcon, RefreshCw, AlertCircle } from 'lucide-react';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const EventsOperationsPage: React.FC = () => {
  const { 
    calendarEvents, 
    addCalendarEvent, 
    updateCalendarEvent, 
    deleteCalendarEvent,
    isCloudLoading,
    cloudError 
  } = useDashboardContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<CalendarEvent>>({
    title: '',
    start: '',
    end: '',
    mealType: 'LUNCH',
    pax: 0,
    requirements: '',
    remarks: '',
    color: '#3B82F6', // Default Blue
  });

  const handleSelectSlot = useCallback(({ start, end }: { start: Date; end: Date }) => {
    setFormData({
        title: '',
        start: start.toISOString(),
        end: end.toISOString(),
        mealType: 'LUNCH',
        pax: 0,
        requirements: '',
        remarks: '',
        color: '#3B82F6',
    });
    setEditingEvent(null);
    setIsModalOpen(true);
  }, []);

  const handleSelectEvent = useCallback((event: any) => {
    // event is the object returned by eventsForCalendar, so start/end are Date objects
    // We need to convert them back to ISO strings for the form
    const originalEvent = calendarEvents.find(e => e.id === event.id);
    if (!originalEvent) return;

    setEditingEvent(originalEvent);
    setFormData({
        title: originalEvent.title,
        start: originalEvent.start,
        end: originalEvent.end,
        mealType: originalEvent.mealType || 'LUNCH',
        pax: originalEvent.pax || 0,
        requirements: originalEvent.requirements || '',
        remarks: originalEvent.remarks || '',
        color: originalEvent.color || '#3B82F6',
    });
    setIsModalOpen(true);
  }, [calendarEvents]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.start || !formData.end) return;

    if (editingEvent) {
      updateCalendarEvent({
        ...editingEvent,
        ...formData as CalendarEvent,
      });
    } else {
      addCalendarEvent({
        title: formData.title!,
        start: formData.start!,
        end: formData.end!,
        mealType: formData.mealType,
        pax: Number(formData.pax),
        requirements: formData.requirements,
        remarks: formData.remarks,
        color: formData.color,
      });
    }
    setIsModalOpen(false);
  };

  const handleDelete = () => {
    if (editingEvent) {
        deleteCalendarEvent(editingEvent.id);
        setIsModalOpen(false);
    }
  };

  // Convert ISO strings to Date objects for the calendar
  const eventsForCalendar = useMemo(() => {
    return calendarEvents.map(evt => ({
        ...evt,
        start: new Date(evt.start),
        end: new Date(evt.end)
    }));
  }, [calendarEvents]);

  const eventStyleGetter = (event: any) => {
    const backgroundColor = event.color || '#3B82F6';
    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block',
      },
    };
  };

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <CalendarIcon className="w-8 h-8 text-[#DC143C]" />
                Event Ops
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Manage banquet events, orders, and operational schedules.</p>
            {isCloudLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                    <RefreshCw size={14} className="animate-spin" />
                    Syncing changes...
                </div>
            )}
            {cloudError && (
                <div className="flex items-center gap-2 text-sm text-red-500 mt-1">
                    <AlertCircle size={14} />
                    {cloudError}
                </div>
            )}
        </div>
        <button
            onClick={() => {
                const now = new Date();
                const end = new Date(now.getTime() + 60 * 60 * 1000);
                setFormData({
                    title: '',
                    start: now.toISOString(),
                    end: end.toISOString(),
                    mealType: 'LUNCH',
                    pax: 0,
                    requirements: '',
                    remarks: '',
                    color: '#3B82F6',
                });
                setEditingEvent(null);
                setIsModalOpen(true);
            }}
            className="bg-[#DC143C] hover:bg-[#B01030] text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
        >
            <Plus size={20} />
            New Event
        </button>
      </div>

      <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <Calendar
          localizer={localizer}
          events={eventsForCalendar}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%', minHeight: '600px' }}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventStyleGetter}
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          defaultView={Views.MONTH}
          className="text-gray-700 dark:text-gray-300 font-sans"
        />
      </div>

      {/* Event Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                {editingEvent ? 'Edit Event Order' : 'New Event Order'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
                {/* Event Name */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Event Name</label>
                    <input
                        type="text"
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#DC143C] focus:border-transparent outline-none transition-all"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        placeholder="e.g. Wedding Reception"
                    />
                </div>

                {/* Date & Time Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Time</label>
                        <input
                            type="datetime-local"
                            required
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#DC143C] outline-none"
                            value={formData.start ? new Date(formData.start).toISOString().slice(0, 16) : ''}
                            onChange={e => setFormData({ ...formData, start: new Date(e.target.value).toISOString() })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Time</label>
                        <input
                            type="datetime-local"
                            required
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#DC143C] outline-none"
                            value={formData.end ? new Date(formData.end).toISOString().slice(0, 16) : ''}
                            onChange={e => setFormData({ ...formData, end: new Date(e.target.value).toISOString() })}
                        />
                    </div>
                </div>

                {/* Meal Type & Pax Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meal Type</label>
                        <select
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#DC143C] outline-none"
                            value={formData.mealType}
                            onChange={e => setFormData({ ...formData, mealType: e.target.value as MealType })}
                        >
                            <option value="AM SNACKS">AM SNACKS</option>
                            <option value="PM SNACKS">PM SNACKS</option>
                            <option value="BREAKFAST">BREAKFAST</option>
                            <option value="LUNCH">LUNCH</option>
                            <option value="DINNER">DINNER</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Attendees (Pax)</label>
                        <input
                            type="number"
                            min="0"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#DC143C] outline-none"
                            value={formData.pax}
                            onChange={e => setFormData({ ...formData, pax: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                </div>

                {/* Color Category */}
                <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category Color</label>
                     <div className="flex gap-2">
                        {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'].map(color => (
                            <button
                                key={color}
                                type="button"
                                onClick={() => setFormData({ ...formData, color })}
                                className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${formData.color === color ? 'border-gray-900 dark:border-white ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800 ring-gray-400' : 'border-transparent'}`}
                                style={{ backgroundColor: color }}
                            />
                        ))}
                     </div>
                </div>

                {/* Special Requirements */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Special Requirements</label>
                    <textarea
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#DC143C] outline-none h-20 resize-none"
                        value={formData.requirements}
                        onChange={e => setFormData({ ...formData, requirements: e.target.value })}
                        placeholder="e.g. Vegetarian options needed, AV setup..."
                    />
                </div>

                {/* Remarks */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Remarks</label>
                    <textarea
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#DC143C] outline-none h-20 resize-none"
                        value={formData.remarks}
                        onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                        placeholder="Internal notes..."
                    />
                </div>

            </form>
            
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between bg-gray-50 dark:bg-gray-900/50">
                {editingEvent ? (
                    <button
                        type="button"
                        onClick={handleDelete}
                        className="px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-sm font-medium"
                    >
                        Delete Event
                    </button>
                ) : (
                    <div></div> // Spacer
                )}
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-sm font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-4 py-2 bg-[#DC143C] hover:bg-[#B01030] text-white rounded-lg shadow-sm transition-colors text-sm font-medium"
                    >
                        {editingEvent ? 'Update Event' : 'Create Event'}
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsOperationsPage;
