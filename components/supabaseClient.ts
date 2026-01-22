import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const urlConfigured = !!supabaseUrl && !supabaseUrl.includes('YOUR_SUPABASE_URL');
const keyConfigured = !!supabaseAnonKey && !supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = urlConfigured && keyConfigured;

export const supabaseConfigError = !urlConfigured
  ? 'VITE_SUPABASE_URL is missing or not configured.'
  : !keyConfigured
    ? 'VITE_SUPABASE_ANON_KEY is missing or not configured.'
    : '';

if (!urlConfigured) {
  console.error('Supabase URL is not configured. Please set VITE_SUPABASE_URL.');
}

if (!keyConfigured) {
  console.error('Supabase anon key is not configured. Please set VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // storage: window.sessionStorage, // Using default localStorage for persistence by commenting this line out.
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
