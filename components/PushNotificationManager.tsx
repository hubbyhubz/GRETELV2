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

const isIosDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
};

const isStandaloneDisplayMode = () => {
  if (typeof window === 'undefined') return false;
  const mediaStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  const navigatorStandalone = (window.navigator as any)?.standalone === true;
  return mediaStandalone || navigatorStandalone;
};

const isAndroidDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
};

const isInAppBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Line|Twitter|wv|; wv\)/i.test(ua);
};

const ensureNotificationPermission = async (): Promise<{ ok: boolean; error?: string }> => {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return { ok: false, error: 'Notifications are not supported in this environment.' };
  }

  if (Notification.permission === 'granted') return { ok: true };
  if (Notification.permission === 'denied') {
    return { ok: false, error: 'Notifications are blocked for this site. Enable them in your browser settings and try again.' };
  }

  if (isIosDevice() && !isStandaloneDisplayMode()) {
    return { ok: false, error: 'On iPhone/iPad: add this site to your Home Screen, open it from the Home Screen, then enable notifications.' };
  }

  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') return { ok: true };
    return { ok: false, error: 'Notification permission was not granted. Please allow notifications and try again.' };
  } catch {
    return { ok: false, error: 'Could not request notification permission. Please check your browser settings.' };
  }
};

export const PushNotificationManager = ({ userId }: { userId: string }) => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supportError, setSupportError] = useState<string | null>(null);
  const bellRef = useRef<BellIconHandle | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isSecure =
      window.isSecureContext ||
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (!isSecure) {
      setSupportError('Push notifications require HTTPS. Open the Cloudflare URL (not an insecure link) and try again.');
      setLoading(false);
      return;
    }

    if (isAndroidDevice() && isInAppBrowser()) {
      setSupportError('Push notifications are not supported inside in-app browsers. Please open this site in Chrome and try again.');
      setLoading(false);
      return;
    }

    if (!('serviceWorker' in navigator)) {
      setSupportError('Service workers are not supported in this browser, so push notifications cannot be enabled.');
      setLoading(false);
      return;
    }

    if (typeof Notification === 'undefined') {
      setSupportError('Notifications are not supported in this browser/device.');
      setLoading(false);
      return;
    }

    if (!('PushManager' in window)) {
      if (isIosDevice()) {
        setSupportError('On iPhone/iPad: web push requires iOS 16.4+ and you must add the site to your Home Screen, open it from the Home Screen, then enable notifications.');
      } else {
        setSupportError('Push notifications are not supported in this browser/device.');
      }
      setLoading(false);
      return;
    }

    setSupportError(null);

    if ('serviceWorker' in navigator && 'PushManager' in window) {
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
              setError(null);
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
    if (supportError) {
      setError(supportError);
      return;
    }
    if (!registration) return;
    setLoading(true);
    setError(null);

    try {
      const permission = await ensureNotificationPermission();
      if (!permission.ok) {
        setError(permission.error || 'Notification permission is required.');
        return;
      }

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
        try {
          if (registration?.showNotification) {
            void registration.showNotification('Notifications Enabled', {
              body: 'You will now receive updates from G.R.E.T.E.L.',
              icon: '/icons/brain.svg',
              badge: '/icons/brain.svg',
            });
          } else {
            new Notification('Notifications Enabled', {
              body: 'You will now receive updates from G.R.E.T.E.L.',
              icon: '/icons/brain.svg',
            });
          }
        } catch {
        }
      }

    } catch (err: any) {
      console.error('Failed to subscribe user:', err);
      
      if (err.message && err.message.includes('push service not available')) {
          setError('Push service not available. This often happens in Incognito mode, constrained environments (like previews), or if the browser is offline.');
      } else if (err?.name === 'NotAllowedError') {
          if (isIosDevice() && !isStandaloneDisplayMode()) {
            setError('On iPhone/iPad: add this site to your Home Screen, open it from the Home Screen, then enable notifications.');
          } else {
            setError('Notifications were blocked. Allow notifications for this site and try again.');
          }
      } else if (err?.name === 'NotSupportedError') {
          setError('Push notifications are not supported on this browser/device.');
      } else if (err?.name === 'InvalidStateError') {
          setError('Push subscription is not available yet. Please refresh the page and try again.');
      } else if (err?.name === 'AbortError') {
          setError('Push subscription was interrupted. Please try again.');
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

  if (supportError) {
    return <div className="text-red-500 text-xs">{supportError}</div>;
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
            {error
              ? error
              : isSubscribed 
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
