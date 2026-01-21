import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || supabaseUrl.includes('YOUR_SUPABASE_URL')) {
  console.error('Supabase URL is not configured. Please add it to components/supabaseClient.ts');
}

if (!supabaseAnonKey || supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY')) {
  console.error('Supabase anon key is not configured. Please add it to components/supabaseClient.ts');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // storage: window.sessionStorage, // Using default localStorage for persistence by commenting this line out.
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});