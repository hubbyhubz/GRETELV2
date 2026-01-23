import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Get environment variables - try multiple possible names for compatibility
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 
  import.meta.env.SUPABASE_URL || 
  (typeof window !== 'undefined' && (window as any).__SUPABASE_URL__) ||
  '';

export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 
  import.meta.env.SUPABASE_ANON_KEY || 
  (typeof window !== 'undefined' && (window as any).__SUPABASE_ANON_KEY__) ||
  '';

// Diagnostic logging (only in development or if values are missing)
if (typeof window !== 'undefined') {
  const isDev = import.meta.env.DEV || window.location.hostname === 'localhost';
  if (isDev || !supabaseUrl || !supabaseAnonKey) {
    console.log('[Supabase Config] URL configured:', !!supabaseUrl && !supabaseUrl.includes('YOUR_SUPABASE_URL'));
    console.log('[Supabase Config] Key configured:', !!supabaseAnonKey && !supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY'));
    if (!supabaseUrl || supabaseUrl.includes('YOUR_SUPABASE_URL')) {
      console.warn('[Supabase Config] VITE_SUPABASE_URL is missing or not set correctly');
    }
    if (!supabaseAnonKey || supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY')) {
      console.warn('[Supabase Config] VITE_SUPABASE_ANON_KEY is missing or not set correctly');
    }
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableStatus = (status: number) =>
  status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;

const getUrlString = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

const fetchWithTimeoutAndRetry: typeof fetch = async (input, init) => {
  const url = getUrlString(input);
  const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') || 'GET').toUpperCase();
  const isAuth = url.includes('/auth/v1/');
  const isAuthToken = isAuth && url.includes('/auth/v1/token');
  const isFunctions = url.includes('/functions/v1/');
  const timeoutMs = isAuth ? 12000 : isFunctions ? 120000 : 20000;
  const maxAttempts = isAuthToken && method === 'POST' ? 3 : isFunctions ? 2 : 1;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: init?.signal
          ? (() => {
              const outer = init.signal;
              outer.addEventListener('abort', () => controller.abort(), { once: true });
              return controller.signal;
            })()
          : controller.signal,
      });

      window.clearTimeout(timeout);

      if (attempt < maxAttempts - 1 && isRetryableStatus(response.status)) {
        const base = 400 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 250);
        await sleep(Math.min(2500, base + jitter));
        continue;
      }

      return response;
    } catch (error) {
      window.clearTimeout(timeout);
      lastError = error;

      const name = (error as any)?.name;
      const message = (error as any)?.message || '';
      const retryable =
        name === 'AbortError' ||
        message.includes('Failed to fetch') ||
        message.includes('NetworkError') ||
        message.includes('Load failed');

      if (attempt < maxAttempts - 1 && retryable) {
        const base = 400 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 250);
        await sleep(Math.min(2500, base + jitter));
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed');
};

const urlConfigured = !!supabaseUrl && !supabaseUrl.includes('YOUR_SUPABASE_URL');
const keyConfigured = !!supabaseAnonKey && !supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = urlConfigured && keyConfigured;

export const supabaseConfigError = !urlConfigured
  ? 'VITE_SUPABASE_URL is missing or not configured.'
  : !keyConfigured
    ? 'VITE_SUPABASE_ANON_KEY is missing or not configured.'
    : '';

if (!urlConfigured) {
  console.error('❌ Supabase URL is not configured. Please set VITE_SUPABASE_URL in your hosting provider environment variables (Vercel Project → Settings → Environment Variables).');
  console.error('   Make sure the variable name is exactly: VITE_SUPABASE_URL');
}

if (!keyConfigured) {
  console.error('❌ Supabase anon key is not configured. Please set VITE_SUPABASE_ANON_KEY in your hosting provider environment variables (Vercel Project → Settings → Environment Variables).');
  console.error('   Make sure the variable name is exactly: VITE_SUPABASE_ANON_KEY');
}

// Only create client if both values are properly configured
// This prevents 403 errors from invalid requests
let supabase: SupabaseClient<any, 'public', any>;

if (urlConfigured && keyConfigured) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // storage: window.sessionStorage, // Using default localStorage for persistence by commenting this line out.
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: fetchWithTimeoutAndRetry,
      },
    });
    console.log('✅ Supabase client initialized successfully');
  } catch (error) {
    console.error('❌ Failed to create Supabase client:', error);
    // Create a dummy client to prevent crashes, but it won't work
    supabase = createClient('https://placeholder.supabase.co', 'placeholder-key', {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  }
} else {
  console.error('❌ Cannot create Supabase client: configuration is missing');
  // Create a dummy client to prevent crashes, but it won't work
  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key', {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export { supabase };
