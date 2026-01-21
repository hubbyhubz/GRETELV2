import React, { useState, useEffect, useRef } from 'react';
// FIX: Update import path from '../App' to './types' to resolve module export errors.
import type { UserProfile } from './types';
import { supabase } from './supabaseClient';

interface LockScreenPageProps {
  userProfile: UserProfile;
  onUnlock: () => void;
  onLogout: () => void;
}

const LockScreenPage: React.FC<LockScreenPageProps> = ({ userProfile, onUnlock, onLogout }) => {
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
    setIsLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email: userProfile.email,
      password,
    });

    if (error) {
      // Provide user-friendly error messages
      if (error.message.includes('Invalid login credentials')) {
        setError('Incorrect password. Please try again.');
      } else {
        setError('An error occurred. Please try again.');
      }
      setIsLoading(false);
      // Clear the password field on a failed attempt for security
      setPassword('');
    } else {
      // Successful password verification
      onUnlock();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-90 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in">
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
              className="w-full p-2.5 sm:p-3 text-center bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC143C]"
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
            className="w-full flex justify-center items-center bg-[#DC143C] hover:bg-[#b81030] text-white font-bold py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-[#DC143C] disabled:bg-gray-400 disabled:transform-none disabled:cursor-not-allowed"
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
        <div className="mt-6">
          <button
            onClick={onLogout}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#DC143C] hover:underline transition duration-300"
          >
            Not you? Log Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default LockScreenPage;