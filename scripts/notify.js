import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local if it exists, otherwise fall back to .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config(); // Load .env as fallback

// Configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // Must be Service Role for admin access
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('Error: Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)');
  process.exit(1);
}

// Initialize Supabase (Admin Client)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Configure Web Push
webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

async function run() {
  console.log('Starting Notification Runner...');

  // 1. Fetch unread/undelivered messages
  // We look for messages sent in the last 24h that haven't been delivered via push yet
  // We assume 'delivered_at' tracks PUSH delivery for this script's purpose
  const { data: messages, error: msgError } = await supabase
    .from('assistant_inbox_messages')
    .select('*')
    .is('delivered_at', null)
    .gt('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24h

  if (msgError) {
    console.error('Error fetching messages:', msgError);
    return;
  }

  if (!messages || messages.length === 0) {
    console.log('No pending notifications.');
    return;
  }

  console.log(`Found ${messages.length} pending messages.`);

  for (const msg of messages) {
    // 2. Fetch user subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', msg.user_id);

    if (subError) {
      console.error(`Error fetching subscriptions for user ${msg.user_id}:`, subError);
      continue;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`No subscriptions found for user ${msg.user_id}. Skipping.`);
      continue;
    }

    // 3. Send Push to all devices
    const payload = JSON.stringify({
      title: msg.title || 'Assistant Notification',
      body: msg.content,
      icon: '/icons/brain.svg',
      url: '/'
    });

    const promises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        }, payload);
        return { success: true, subId: sub.id };
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired/invalid
          console.log(`Subscription ${sub.id} expired. Deleting...`);
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error(`Error sending to sub ${sub.id}:`, err);
        }
        return { success: false, subId: sub.id };
      }
    });

    await Promise.all(promises);

    // 4. Mark message as delivered
    const { error: updateError } = await supabase
      .from('assistant_inbox_messages')
      .update({ delivered_at: new Date().toISOString() })
      .eq('id', msg.id);

    if (updateError) {
      console.error(`Failed to mark message ${msg.id} as delivered:`, updateError);
    } else {
      console.log(`Message ${msg.id} processed.`);
    }
  }

  console.log('Run complete.');
}

run().catch(err => console.error('Fatal error:', err));
