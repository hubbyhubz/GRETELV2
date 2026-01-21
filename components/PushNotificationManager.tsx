import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { BellOff } from 'lucide-react';
import { BellIcon, type BellIconHandle } from './AnimatedIcons/BellIcon';

const VAPID_PUBLIC_KEY = 'BAa1oBrekD2JsqettsL4v0V92UBCkaNG2Eln3zDZNPRUi-NkM_dlmq-T12qinBUDA_jw1UxJY_MDNvWiYZ6sVFw';

// Helper to convert VAPID key
const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const PushNotificationManager = ({ userId }: { userId: string }) => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bellRef = useRef<BellIconHandle | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      // Register Service Worker
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          console.log('Service Worker Registered!', reg);
          setRegistration(reg);
          
          // Check existing subscription
          reg.pushManager.getSubscription().then(sub => {
            if (sub) {
              setSubscription(sub);
              setIsSubscribed(true);
            }
            setLoading(false);
          });
        })
        .catch(err => {
          console.error('Service Worker Registration Failed', err);
          setError('Failed to register service worker.');
          setLoading(false);
        });
    } else {
      setError('Push notifications are not supported in this browser.');
      setLoading(false);
    }
  }, []);

  const subscribeUser = async () => {
    if (!registration) return;
    setLoading(true);

    try {
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      setSubscription(sub);
      setIsSubscribed(true);
      
      console.log('User Subscribed:', sub);

      // Send subscription to Supabase
      const { error: dbError } = await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: sub.endpoint,
        auth: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(sub.getKey('auth') as ArrayBuffer)))),
        p256dh: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(sub.getKey('p256dh') as ArrayBuffer)))),
        user_agent: navigator.userAgent
      }, { onConflict: 'user_id, endpoint' });

      if (dbError) {
        console.error('Failed to save subscription to DB:', dbError);
        setError('Subscribed locally but failed to sync with server.');
      } else {
        console.log('Subscription saved to DB!');
        // Show a test notification (optional)
        new Notification('Notifications Enabled', {
            body: 'You will now receive updates from G.R.E.T.E.L.',
            icon: '/icons/brain.svg'
        });
      }

    } catch (err: any) {
      console.error('Failed to subscribe user:', err);
      
      if (err.message && err.message.includes('push service not available')) {
          setError('Push service not available. This often happens in Incognito mode, constrained environments (like previews), or if the browser is offline.');
      } else {
          setError('Failed to subscribe. Please check permissions.');
      }
    } finally {
      setLoading(false);
    }
  };

  const unsubscribeUser = async () => {
    if (!subscription) return;
    setLoading(true);

    try {
      await subscription.unsubscribe();
      
      // Remove from Supabase
      await supabase.from('push_subscriptions').delete().match({ endpoint: subscription.endpoint });
      
      setSubscription(null);
      setIsSubscribed(false);
      console.log('User Unsubscribed');
    } catch (err) {
      console.error('Error unsubscribing', err);
      setError('Failed to unsubscribe.');
    } finally {
      setLoading(false);
    }
  };

  if (error && error !== 'Push notifications are not supported in this browser.') {
      // Render minimal error or nothing if just unsupported
      return <div className="text-red-500 text-xs">{error}</div>;
  }

  if (!registration) return null; // Don't render if SW not supported

  return (
    <div
      className={`flex items-center justify-between p-4 rounded-lg border ${isSubscribed ? 'bg-[var(--primary-50)] border-[var(--primary-200)] dark:bg-gray-900 dark:border-gray-700' : 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700'}`}
      onMouseEnter={() => {
        if (isSubscribed) bellRef.current?.startAnimation();
      }}
      onMouseLeave={() => {
        bellRef.current?.stopAnimation();
      }}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full ${isSubscribed ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
          {isSubscribed ? <BellIcon ref={bellRef} size={20} /> : <BellOff size={20} />}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Push Notifications</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {isSubscribed 
              ? 'You are receiving notifications on this device.' 
              : 'Enable notifications to stay updated.'}
          </p>
        </div>
      </div>
      
      <button
        onClick={isSubscribed ? unsubscribeUser : subscribeUser}
        disabled={loading}
        className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-60 ${
          isSubscribed
            ? 'bg-[var(--primary-700)] hover:bg-[var(--primary-800)] text-white'
            : 'bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white'
        }`}
      >
        {loading ? '...' : (isSubscribed ? 'Disable' : 'Enable')}
      </button>
    </div>
  );
};
