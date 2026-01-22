import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { InAppNotification } from './InAppNotification';
import { registerServiceWorker, subscribeUserToPush } from '../lib/pushManager';
import { AnimatePresence } from 'framer-motion';

interface Toast {
  id: string;
  title: string;
  message: string;
}

export const NotificationManager: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      const currentPermission = Notification.permission;
      setPermission(currentPermission);
      
      // Auto-subscribe if already granted to ensure keys are synced
      if (currentPermission === 'granted') {
        subscribeUserToPush();
      }
    }
    registerServiceWorker();
  }, []);

  const addToast = useCallback((title: string, message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, title, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      subscribeUserToPush();
    }
  };

  // Realtime Listener for In-App Messages
  useEffect(() => {
    const channel = supabase
      .channel('public:assistant_inbox_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'assistant_inbox_messages',
        },
        (payload) => {
          // Check if the message belongs to current user (RLS should handle this, but filter to be safe)
          // Also check if we are already displaying it?
          // For now, just show it.
          const { title, content } = payload.new;
          addToast(title || 'Assistant', content);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [addToast]);

  return (
    <>
      {/* Permission Request Banner (if default) */}
      {permission === 'default' && (
        <div className="fixed bottom-4 left-4 z-50 max-w-sm bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 animate-in slide-in-from-bottom-5">
          <p className="text-sm text-gray-800 dark:text-gray-200 mb-3">
            Enable notifications to get reminders from your Assistant?
          </p>
          <div className="flex gap-2">
            <button
              onClick={requestPermission}
              className="px-3 py-1.5 bg-[#DC143C] text-white text-xs font-bold rounded-md hover:bg-[#b81030]"
            >
              Enable
            </button>
            <button
              onClick={() => setPermission('denied')} // Temporarily hide
              className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-md hover:bg-gray-300"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <InAppNotification
              key={toast.id}
              id={toast.id}
              title={toast.title}
              message={toast.message}
              onDismiss={removeToast}
            />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};
