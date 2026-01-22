import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function sendTestMessage() {
  console.log('🔍 Looking for a target user...');

  // 1. Find a user who has enabled notifications (has a subscription)
  // We use the push_subscriptions table to ensure we target someone who can actually receive it.
  const { data: subs, error: subError } = await supabase
    .from('push_subscriptions')
    .select('user_id')
    .limit(1)
    .order('created_at', { ascending: false });

  if (subError) {
    console.error('❌ Error querying subscriptions:', subError.message);
    return;
  }

  if (!subs || subs.length === 0) {
    console.warn('⚠️ No push subscriptions found.');
    console.warn('👉 Please open the app in your browser and click "Enable" on the notification prompt first.');
    return;
  }

  const userId = subs[0].user_id;
  console.log(`✅ Found target user ID: ${userId}`);

  // 2. Insert a test message into the inbox
  const message = {
    user_id: userId,
    title: 'Test Notification 🚀',
    content: `This is a simulated AI response triggered at ${new Date().toLocaleTimeString()}.`,
    sent_at: new Date().toISOString(),
    sender: 'system_test'
  };

  const { data, error: insertError } = await supabase
    .from('assistant_inbox_messages')
    .insert(message)
    .select()
    .single();

  if (insertError) {
    console.error('❌ Failed to insert message:', insertError.message);
  } else {
    console.log('🎉 Message inserted successfully!');
    console.log('🆔 Message ID:', data.id);
    console.log('\n👉 Now run: "npm run notify:run" to push this notification to the device.');
  }
}

sendTestMessage().catch(err => console.error('Fatal error:', err));
