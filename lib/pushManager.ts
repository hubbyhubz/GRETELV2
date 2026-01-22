import { supabase } from '../components/supabaseClient';

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
      const registration = await navigator.serviceWorker.register('/sw.js');
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
  const registration = await navigator.serviceWorker.ready;
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

  if (!vapidPublicKey) {
    console.error('VITE_VAPID_PUBLIC_KEY is missing');
    alert('CRITICAL ERROR: VITE_VAPID_PUBLIC_KEY is missing in the build. Push notifications cannot work.');
    return null;
  }

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

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
    alert(`Failed to subscribe: ${error.message || error}`);
    return null;
  }
};
