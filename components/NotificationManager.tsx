import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { InAppNotification } from './InAppNotification';
import { registerServiceWorker, subscribeUserToPush } from '../lib/pushManager';
import { AnimatePresence } from 'framer-motion';
import { getDefaultAssistantNotificationPreferences } from '../lib/notificationRules';

interface Toast {
  id: string;
  messageId?: string;
  title: string;
  message: string;
  metadata?: any;
}

export const NotificationManager: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if ('Notification' in window) {
      const currentPermission = Notification.permission;
      setPermission(currentPermission);
      console.log('NotificationManager: Permission state:', currentPermission);
      
      // Auto-subscribe if already granted to ensure keys are synced
      if (currentPermission === 'granted') {
        subscribeUserToPush();
      }
    } else {
      console.warn('NotificationManager: Notifications not supported in this browser.');
    }
    registerServiceWorker();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error) return;
      const id = data?.user?.id;
      if (id) setUserId(id);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('assistant_notification_preferences')
        .select('preferences')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) return;
      if (cancelled) return;
      const existing = (data as any)?.preferences ?? null;
      const defaults = getDefaultAssistantNotificationPreferences(tz);
      const merged = {
        ...defaults,
        ...(existing && typeof existing === 'object' ? existing : {}),
        timezone: typeof existing?.timezone === 'string' && existing.timezone.trim() ? existing.timezone.trim() : defaults.timezone,
        quietHours: existing?.quietHours ?? defaults.quietHours,
        strictMode: existing?.strictMode !== false,
        snoozes: existing?.snoozes ?? {},
      };
      await supabase.from('assistant_notification_preferences').upsert({ user_id: userId, preferences: merged });
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts(prev => [...prev, { id, ...toast }]);
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
          const { id, title, content, metadata } = payload.new as any;
          addToast({ messageId: id, title: title || 'Assistant', message: content, metadata });
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
              className="px-3 py-1.5 bg-primary-600 text-white text-xs font-bold rounded-md hover:bg-primary-700"
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
              duration={toast.metadata?.priority === 'critical' ? 15000 : 5000}
              actions={[
                ...(toast.metadata?.url
                  ? [
                      {
                        label: 'Open',
                        onClick: () => {
                          window.location.href = String(toast.metadata.url);
                        },
                      },
                    ]
                  : []),
                ...(toast.metadata?.dedupe_key && userId
                  ? [
                      {
                        label: 'Snooze 15m',
                        onClick: async () => {
                          const snoozeUntil = Date.now() + 15 * 60 * 1000;
                          const { data } = await supabase
                            .from('assistant_notification_preferences')
                            .select('preferences')
                            .eq('user_id', userId)
                            .maybeSingle();
                          const existing = (data as any)?.preferences ?? {};
                          const snoozes = { ...(existing.snoozes ?? {}) };
                          snoozes[String(toast.metadata.dedupe_key)] = snoozeUntil;
                          await supabase
                            .from('assistant_notification_preferences')
                            .upsert({ user_id: userId, preferences: { ...existing, snoozes } });
                          removeToast(toast.id);
                        },
                      },
                      {
                        label: 'Done',
                        onClick: async () => {
                          const messageId = toast.messageId;
                          if (messageId) {
                            await supabase
                              .from('assistant_inbox_messages')
                              .update({ dismissed_at: new Date().toISOString() })
                              .eq('id', messageId);
                          }
                          removeToast(toast.id);
                        },
                      },
                    ]
                  : []),
              ]}
            />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};
