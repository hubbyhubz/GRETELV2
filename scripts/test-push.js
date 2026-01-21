
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// VAPID Keys (These should ideally be in env vars)
const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BAa1oBrekD2JsqettsL4v0V92UBCkaNG2Eln3zDZNPRUi-NkM_dlmq-T12qinBUDA_jw1UxJY_MDNvWiYZ6sVFw';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

if (!privateVapidKey) {
  console.error('Error: Please set VAPID_PRIVATE_KEY in .env.local (or .env).');
  process.exit(1);
}

webpush.setVapidDetails(
  'mailto:support@gretel.ai',
  publicVapidKey,
  privateVapidKey
);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Needs Service Role Key to read all subs if RLS is strict
const targetUserId = process.env.TEST_PUSH_USER_ID || null;
const assistantTitle = process.env.TEST_PUSH_TITLE || 'G.R.E.T.E.L';
const assistantMessage = process.env.TEST_PUSH_MESSAGE || 'This is a test assistant message.';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (preferred) or .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function sendTestNotification() {
  console.log('Fetching subscriptions...');
  
  // Fetch all subscriptions (in a real app, you'd filter by user_id)
  let query = supabase
    .from('push_subscriptions')
    .select('*');

  if (targetUserId) {
    query = query.eq('user_id', targetUserId);
  }

  const { data: subscriptions, error } = await query;

  if (error) {
    console.error('Error fetching subscriptions:', error);
    return;
  }

  if (!subscriptions || subscriptions.length === 0) {
    console.log('No subscriptions found.');
    return;
  }

  console.log(`Found ${subscriptions.length} subscriptions.`);

  let messageRow = null;
  if (targetUserId) {
    const { data, error: insertError } = await supabase
      .from('assistant_inbox_messages')
      .insert({
        user_id: targetUserId,
        sender: 'assistant',
        title: assistantTitle,
        content: assistantMessage,
        preview: assistantMessage.slice(0, 120),
        sent_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Error inserting assistant inbox message:', insertError);
    } else {
      messageRow = data;
    }
  }

  const sentAt = new Date().toISOString();
  const notificationPayload = JSON.stringify({
    kind: 'assistant_message',
    title: assistantTitle,
    body: assistantMessage,
    preview: assistantMessage.slice(0, 120),
    sentAt,
    messageId: messageRow?.id || null,
    userId: targetUserId,
    url: messageRow?.id ? `/#/?assistantMessageId=${encodeURIComponent(messageRow.id)}` : '/#/',
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

    webpush.sendNotification(pushSubscription, notificationPayload, { TTL: 60 * 60, urgency: 'high' })
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
