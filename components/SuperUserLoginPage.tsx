import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

type SuperUserLoginPageProps = {
  onBackToLogin: () => void;
  onLoginApproved: () => void;
};

export default function SuperUserLoginPage({ onBackToLogin, onLoginApproved }: SuperUserLoginPageProps) {
  const [hasExistingSession, setHasExistingSession] = useState(false);
  const [existingSessionEmail, setExistingSessionEmail] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        const session = data?.session;
        if (session) {
          setHasExistingSession(true);
          setExistingSessionEmail(session.user?.email ?? null);

          try {
            const ok = await checkIsSuperUser(session.user.id);
            if (ok) {
              onLoginApproved();
            }
          } catch {
          }
        } else {
          setHasExistingSession(false);
          setExistingSessionEmail(null);
        }
      } catch {
        if (!mounted) return;
        setHasExistingSession(false);
        setExistingSessionEmail(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length > 0 && !isLoading;
  }, [email, password, isLoading]);

  const checkIsSuperUser = async (userId: string) => {
    const { data, error } = await supabase
      .from('company_users')
      .select('is_super_user')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return Boolean((data as any)?.is_super_user);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setAccessDenied(false);
    setIsLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setIsLoading(false);
        return;
      }

      const userId = data?.user?.id || '';
      if (!userId) {
        setError('Login succeeded but no user ID was returned.');
        setIsLoading(false);
        return;
      }

      const ok = await checkIsSuperUser(userId);
      if (!ok) {
        setAccessDenied(true);
        setError('Access denied. This account is not a Super User.');
        setIsLoading(false);
        return;
      }

      onLoginApproved();
    } catch (err: any) {
      const msg = err?.message || 'Super User login failed.';
      setError(msg);
      setIsLoading(false);
    }
  };

  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault();
    onBackToLogin();
  };

  return (
    <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg sm:shadow-2xl p-4 max-[360px]:p-3 min-[414px]:p-5 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
      <div className="space-y-4 sm:space-y-5">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-black tracking-wider uppercase" style={{ color: 'var(--primary-600)' }}>
            G.R.E.T.E.L
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Super User Login</p>
        </div>

        {hasExistingSession && (
          <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700/40 dark:border-gray-600">
            You are already signed in{existingSessionEmail ? ` as ${existingSessionEmail}` : ''}.
          </div>
        )}

        <form className="space-y-4 sm:space-y-6" onSubmit={handleLogin}>
          <div>
            <label htmlFor="super-email" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Email</label>
            <input
              ref={emailRef}
              type="email"
              id="super-email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition duration-300"
              style={{ '--tw-ring-color': 'var(--primary-300)' } as React.CSSProperties}
              placeholder="Enter your email"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="super-password" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Password</label>
            <input
              type="password"
              id="super-password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition duration-300"
              style={{ '--tw-ring-color': 'var(--primary-300)' } as React.CSSProperties}
              placeholder="••••••••"
              required
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className={`text-sm ${accessDenied ? 'text-red-600 dark:text-red-400' : 'text-red-600 dark:text-red-400'}`} role="alert">
              {error}
              {error.toLowerCase().includes('relation') || error.toLowerCase().includes('company_users') ? (
                <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Apply `supabase/migrations/0001_super_user_departments.sql` to create the required tables.
                </div>
              ) : null}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full flex justify-center items-center bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-primary-600 disabled:bg-gray-400 disabled:transform-none disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in…' : 'Sign in as Super User'}
            </button>
          </div>
        </form>

        <div className="text-center">
          <a
            href="#"
            onClick={handleBack}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 hover:underline transition duration-300"
          >
            Back to Login
          </a>
        </div>
      </div>
    </div>
  );
}
