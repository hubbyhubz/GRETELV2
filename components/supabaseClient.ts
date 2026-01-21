import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured =
  !!supabaseUrl &&
  !supabaseUrl.includes('YOUR_SUPABASE_URL') &&
  !!supabaseAnonKey &&
  !supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY');

export const supabaseConfigError = !isSupabaseConfigured
  ? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your hosting environment.'
  : null;

if (!isSupabaseConfigured) {
  console.error(supabaseConfigError);
}

const safeSupabaseUrl = isSupabaseConfigured ? supabaseUrl : 'https://example.supabase.co';
const safeSupabaseAnonKey = isSupabaseConfigured ? supabaseAnonKey : 'public-anon-key';

export const supabase = createClient(safeSupabaseUrl, safeSupabaseAnonKey, {
  auth: {
    // storage: window.sessionStorage, // Using default localStorage for persistence by commenting this line out.
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
