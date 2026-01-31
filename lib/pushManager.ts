import { supabase } from '../components/supabaseClient';

let subscribeInFlight: Promise<PushSubscription | null> | null = null;

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

export const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('Service Worker registered:', registration);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }
  return null;
};

export const subscribeUserToPush = async () => {
  if (subscribeInFlight) return subscribeInFlight;

  subscribeInFlight = (async () => {
    if (typeof window === 'undefined') return null;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    if (window.isSecureContext !== true && window.location.hostname !== 'localhost') {
      console.warn('PushManager: Push requires a secure context (HTTPS).');
      return null;
    }

    const permission = 'Notification' in window ? Notification.permission : 'denied';
    if (permission !== 'granted') return null;

    const registration = await navigator.serviceWorker.ready;
    const vapidPublicKey = String(import.meta.env.VITE_VAPID_PUBLIC_KEY || '')
      .trim()
      .replace(/^\"|\"$/g, '')
      .replace(/^'|'$/g, '')
      .replace(/\s+/g, '');

    if (!vapidPublicKey) {
    console.error('VITE_VAPID_PUBLIC_KEY is missing');
    return null;
  }
  
  console.log('PushManager: Using VAPID Key:', vapidPublicKey.slice(0, 10) + '...');

  try {
    let subscription = await registration.pushManager.getSubscription();

    // If a subscription exists but might have the wrong key (or we want to force refresh), check or just try to subscribe
    // The browser throws if we try to subscribe with a NEW key while an OLD one exists.
    if (subscription) {
      // We can't easily check the key, so we try to subscribe. If it fails, we catch it below.
      // Or safer: Unsubscribe first if we suspect a mismatch. 
      // But let's rely on the error handling to be surgical.
    }

    const subscribeWithKey = async () => {
      return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    };

    try {
      subscription = await subscribeWithKey();
    } catch (err: any) {
      // Check for the specific error about different applicationServerKey
      if (err.message && (err.message.includes('applicationServerKey') || err.message.includes('gcm_sender_id'))) {
        console.warn('Existing subscription has different key. Unsubscribing and resubscribing...');
        
        // Unsubscribe the old one
        const existingSub = await registration.pushManager.getSubscription();
        if (existingSub) {
          await existingSub.unsubscribe();
        }

        // Try again with the new key
        subscription = await subscribeWithKey();
      } else if (String(err?.message || '').includes('Registration failed')) {
        console.warn('Push subscription failed with push service error. Retrying once...');
        const existingSub = await registration.pushManager.getSubscription();
        if (existingSub) {
          try {
            await existingSub.unsubscribe();
          } catch {
            // ignore
          }
        }
        await new Promise(resolve => setTimeout(resolve, 800));
        subscription = await subscribeWithKey();
      } else {
        throw err; // Re-throw other errors
      }
    }

    console.log('Push Subscription:', JSON.stringify(subscription));
    
    // Save to Supabase
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const p256dh = subscription.getKey('p256dh');
      const auth = subscription.getKey('auth');
      
      if (p256dh && auth) {
        // Convert ArrayBuffer to Base64 string properly
        const p256dhStr = btoa(String.fromCharCode(...new Uint8Array(p256dh)));
        const authStr = btoa(String.fromCharCode(...new Uint8Array(auth)));

        const { error } = await supabase
          .from('push_subscriptions')
          .upsert({
            user_id: user.id,
            endpoint: subscription.endpoint,
            p256dh: p256dhStr,
            auth: authStr,
            user_agent: navigator.userAgent
          }, { onConflict: 'user_id, endpoint' });

        if (error) {
            console.error('Error saving subscription to Supabase:', error);
            alert(`Error saving subscription: ${error.message}`);
        }
      }
    }

    return subscription;
  } catch (error: any) {
    console.error('Failed to subscribe the user: ', error);
    throw error;
  } finally {
    subscribeInFlight = null;
  }
  })();

  return subscribeInFlight;
};
