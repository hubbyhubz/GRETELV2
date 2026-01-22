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

async function simulateAIMessage() {
  console.log('🤖 Simulating an AI Message insertion...');

  // 1. Find a target user
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('user_id')
    .limit(1)
    .order('created_at', { ascending: false });

  if (!subs || subs.length === 0) {
    console.error('⚠️ No active subscriptions found. Cannot test.');
    return;
  }

  const userId = subs[0].user_id;
  console.log(`✅ Target User: ${userId}`);

  // 2. Insert into assistant_inbox_messages (NOT push_notifications_queue)
  // This tests if the SQL TRIGGER works.
  const { data, error } = await supabase
    .from('assistant_inbox_messages')
    .insert({
      user_id: userId,
      sender: 'assistant',
      title: 'Automated AI Alert',
      content: 'This message was automatically detected by the SQL Trigger! 🧠✨',
      metadata: { type: 'test_trigger' }
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to insert message:', error.message);
  } else {
    console.log('🎉 AI Message inserted into Inbox!');
    console.log(`🆔 Message ID: ${data.id}`);
    console.log('👉 Now run "npm run notify:run". If the trigger works, it will pick this up automatically.');
  }
}

simulateAIMessage().catch(err => console.error(err));
