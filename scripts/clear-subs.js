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

async function clearSubscriptions() {
  console.log('🧹 Clearing all push subscriptions...');

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

  if (error) {
    console.error('❌ Failed to clear subscriptions:', error.message);
  } else {
    console.log('✅ All subscriptions cleared.');
    console.log('👉 Users must refresh the app and re-enable notifications to sync the new VAPID key.');
  }
}

clearSubscriptions().catch(err => console.error('Fatal error:', err));
