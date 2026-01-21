
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// VAPID Keys (These should ideally be in env vars)
const publicVapidKey = 'BAa1oBrekD2JsqettsL4v0V92UBCkaNG2Eln3zDZNPRUi-NkM_dlmq-T12qinBUDA_jw1UxJY_MDNvWiYZ6sVFw';
const privateVapidKey = 'AdVqEZes0FxVh46iOFmH3u2MPYoQB4GUUdYTePGXGeA';

webpush.setVapidDetails(
  'mailto:support@gretel.ai',
  publicVapidKey,
  privateVapidKey
);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Needs Service Role Key to read all subs if RLS is strict

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function sendTestNotification() {
  console.log('Fetching subscriptions...');
  
  // Fetch all subscriptions (in a real app, you'd filter by user_id)
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('*');

  if (error) {
    console.error('Error fetching subscriptions:', error);
    return;
  }

  if (!subscriptions || subscriptions.length === 0) {
    console.log('No subscriptions found.');
    return;
  }

  console.log(`Found ${subscriptions.length} subscriptions.`);

  const notificationPayload = JSON.stringify({
    title: 'Test Notification',
    body: 'This is a test message from the G.R.E.T.E.L backend!',
    url: 'https://gretelai.vercel.app'
  });

  subscriptions.forEach(sub => {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        auth: sub.auth, // These are stored as base64 in DB, checking if decoding needed
        p256dh: sub.p256dh
      }
    };
    
    // Note: The DB stores them as base64 strings (from btoa). 
    // web-push expects them as strings (it handles base64url/base64).
    // If we stored them using btoa(), they are standard base64. 
    // web-push is usually smart enough.

    webpush.sendNotification(pushSubscription, notificationPayload)
      .then(response => console.log(`Sent to ${sub.id}:`, response.statusCode))
      .catch(err => {
        console.error(`Error sending to ${sub.id}:`, err);
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription has expired or is no longer valid
          console.log(`Deleting expired subscription ${sub.id}`);
          supabase.from('push_subscriptions').delete().match({ id: sub.id }).then();
        }
      });
  });
}

sendTestNotification();
