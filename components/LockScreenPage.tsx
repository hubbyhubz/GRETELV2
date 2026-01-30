import React, { useState, useEffect, useRef } from 'react';
// FIX: Update import path from '../App' to './types' to resolve module export errors.
import type { UserProfile } from './types';
import { supabase } from './supabaseClient';
import ThemeToggleButton from './ThemeToggleButton';

interface LockScreenPageProps {
  userProfile: UserProfile;
  onUnlock: () => void;
  onSessionExpired: () => void;
}

const LockScreenPage: React.FC<LockScreenPageProps> = ({ userProfile, onUnlock, onSessionExpired }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Automatically focus the password input when the lock screen appears
    passwordInputRef.current?.focus();
  }, []);

  const handleUnlockAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Password is required.');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError("You're offline. Reconnect to verify and try again.");
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const refreshResult = await supabase.auth.refreshSession();
      if (refreshResult.error) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          setIsLoading(false);
          setPassword('');
          setError('Session expired. Please sign in again.');
          onSessionExpired();
          return;
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token || '';
      if (!accessToken) {
        setIsLoading(false);
        setPassword('');
        setError('Session expired. Please sign in again.');
        onSessionExpired();
        return;
      }

      const response = await fetch('/api/unlock', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        if (response.status === 440) {
          setError('Session expired. Please sign in again.');
          onSessionExpired();
        } else if (response.status === 401 || response.status === 403) {
          setError('Incorrect password. Please try again.');
        } else {
          setError('Unable to verify password right now. Please try again.');
        }
        setIsLoading(false);
        setPassword('');
        return;
      }

      setPassword('');
      onUnlock();
    } catch {
      setError('Unable to verify password right now. Please check your connection and try again.');
      setIsLoading(false);
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-90 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      <ThemeToggleButton />
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg sm:shadow-2xl p-4 max-[360px]:p-3 min-[414px]:p-5 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300 text-center animate-scale-in">
        <img
          src={userProfile.avatar}
          alt="User Avatar"
          className="h-20 w-20 sm:h-24 sm:w-24 rounded-full object-cover mx-auto mb-4 border-4 border-white dark:border-gray-600"
        />
        <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-200">
          Welcome back, {userProfile.name.split(' ')[0]}!
        </h2>
        <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mb-6">Your session is locked.</p>

        <form onSubmit={handleUnlockAttempt} className="space-y-4">
          <div>
            <label
              htmlFor="lock-password"
              className="sr-only"
            >
              Password
            </label>
            <input
              ref={passwordInputRef}
              type="password"
              id="lock-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2.5 sm:p-3 text-center bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600"
              placeholder="Enter your password"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center items-center bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-primary-600 disabled:bg-gray-400 disabled:transform-none disabled:cursor-not-allowed"
          >
            {isLoading && (
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {isLoading ? 'Unlocking...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LockScreenPage;
