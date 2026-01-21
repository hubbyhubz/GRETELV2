
import React, { useState } from 'react';
import SuccessNotification from './SuccessNotification';
import { supabase } from './supabaseClient';

interface ForgotPasswordPageProps {
  onBackToLogin: () => void;
  onNavigateToPrivacy: () => void;
  onNavigateToTerms: () => void;
}

const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onBackToLogin, onNavigateToPrivacy, onNavigateToTerms }) => {
  const [email, setEmail] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const validateEmail = (email: string) => {
    const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
  };

  const handlePasswordReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setIsLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // redirectTo is removed to default to Site URL in Supabase settings
    });

    setIsLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setShowSuccess(true);
    }
  };

  return (
    <>
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg sm:shadow-2xl p-4 max-[360px]:p-3 min-[414px]:p-5 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
        <div className="space-y-5 sm:space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-black text-[#DC143C] tracking-wider uppercase">
              G.R.E.T.E.L
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Reset Your Password</p>
          </div>
          <form className="space-y-4 sm:space-y-6" onSubmit={handlePasswordReset}>
            <div>
              <label
                htmlFor="email"
                className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2"
              >
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC143C] focus:border-transparent transition duration-300"
                placeholder="Enter your email"
                required
                aria-label="Email for password reset"
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
                disabled={isLoading}
                className="w-full flex justify-center items-center bg-[#DC143C] hover:bg-[#b81030] text-white font-bold py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-[#DC143C] disabled:bg-gray-400 disabled:transform-none disabled:cursor-not-allowed"
              >
                {isLoading && <div className="custom-loader-sm"></div>}
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </div>
          </form>
          <div className="text-center">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onBackToLogin();
              }}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#DC143C] hover:underline transition duration-300 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]"
            >
              Back to Login
            </a>
          </div>
        </div>
        <div className="pt-6 mt-6 sm:pt-8 sm:mt-8 border-t border-gray-200 dark:border-gray-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Copyright © 2025 | G.R.E.T.E.L by Hanzel
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2 sm:gap-4 text-xs text-gray-500 dark:text-gray-400">
              <a href="#" onClick={(e) => { e.preventDefault(); onNavigateToPrivacy(); }} className="hover:text-[#DC143C] hover:underline transition-colors duration-300 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]">Privacy Policy</a>
              <a href="#" onClick={(e) => { e.preventDefault(); onNavigateToTerms(); }} className="hover:text-[#DC143C] hover:underline transition-colors duration-300 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]">Terms of Service</a>
          </div>
        </div>
      </div>
      {showSuccess && (
        <SuccessNotification
            title="Request Sent!"
            message={`If an account with that email exists, a password reset link has been sent to ${email}. It may take a few minutes to arrive. Please also check your spam folder.`}
            onConfirm={onBackToLogin}
        />
      )}
    </>
  );
};

export default ForgotPasswordPage;
