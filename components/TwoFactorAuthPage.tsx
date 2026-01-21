import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import type { Factor } from '@supabase/supabase-js';

interface TwoFactorAuthPageProps {
  onBackToLogin: () => void;
}

const TwoFactorAuthPage: React.FC<TwoFactorAuthPageProps> = ({ onBackToLogin }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [factor, setFactor] = useState<Factor | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    codeInputRef.current?.focus();

    const getMfaFactors = async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setError('Could not retrieve authentication factors. Please try logging in again.');
        return;
      }
      if (data && data.totp.length > 0) {
        setFactor(data.totp[0]);
      } else {
        setError('No 2FA method found. Please try logging in again.');
      }
    };
    getMfaFactors();
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !factor) {
      setError('Please enter your authentication code.');
      return;
    }
    setIsLoading(true);
    setError('');

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });

    if (error) {
      setError(error.message === 'Invalid TOTP code.' ? 'Invalid code. Please try again.' : `Error: ${error.message}`);
      setIsLoading(false);
      setCode('');
    }
    // On success, the onAuthStateChange listener in App.tsx will handle navigation
    // so we don't need to do anything here.
  };

  return (
    <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg sm:shadow-2xl p-4 max-[360px]:p-3 min-[414px]:p-5 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
      <div className="space-y-4 sm:space-y-5">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-black text-[#DC143C] tracking-wider uppercase">G.R.E.T.E.L</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Two-Factor Authentication</p>
        </div>
        
        <form className="space-y-4 sm:space-y-6" onSubmit={handleVerify}>
          <div>
            <label htmlFor="code" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2 text-center">
              Enter the 6-digit code from your authenticator app.
            </label>
            <input
              ref={codeInputRef}
              type="text"
              id="code"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC143C] focus:border-transparent transition duration-300 text-center text-xl sm:text-2xl tracking-[.35em] sm:tracking-[.5em]"
              placeholder="123456"
              required
              maxLength={6}
              autoComplete="one-time-code"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 text-center" role="alert">
              {error}
            </p>
          )}
          <div>
            <button
              type="submit"
              disabled={isLoading || !factor || code.length !== 6}
              className="w-full flex justify-center items-center bg-[#DC143C] hover:bg-[#b81030] text-white font-bold py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-[#DC143C] disabled:bg-gray-400 disabled:transform-none disabled:cursor-not-allowed"
            >
              {isLoading && <div className="custom-loader-sm"></div>}
              {isLoading ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </form>
        <div className="text-center">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); onBackToLogin(); }}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#DC143C] hover:underline transition duration-300"
          >
            Back to Login
          </a>
        </div>
      </div>
    </div>
  );
};

export default TwoFactorAuthPage;
