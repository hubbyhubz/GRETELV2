


import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import type { Session } from '@supabase/supabase-js';
import AppIcon from './AppIcon';
import { EyeIcon } from './AnimatedIcons/EyeIcon';
import { EyeOffIcon } from './AnimatedIcons/EyeOffIcon';

interface LoginPageProps {
  onCreateAccountClick: () => void;
  onForgotPasswordClick: () => void;
  onLoginSuccess: (session: Session | null) => void;
  onNavigateToPrivacy: () => void;
  onNavigateToTerms: () => void;
  // onNavigateToTest?: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ 
  onCreateAccountClick, 
  onForgotPasswordClick, 
  onLoginSuccess, 
  onNavigateToPrivacy, 
  onNavigateToTerms
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('gretelRememberMe') === 'true');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // FIXED: Added cleanup for potential async operations
  useEffect(() => {
    let mounted = true;
    
    if (rememberMe && mounted) {
      const rememberedEmail = localStorage.getItem('gretelRememberedEmail');
      if (rememberedEmail) {
        setEmail(rememberedEmail);
      }
    }
    
    return () => {
      mounted = false;
    };
  }, [rememberMe]);

  useEffect(() => {
    localStorage.setItem('gretelRememberMe', String(rememberMe));
    if (!rememberMe) {
      localStorage.removeItem('gretelRememberedEmail');
    }
  }, [rememberMe]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // FIX: Pass session object to onLoginSuccess to make login flow more robust.
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        setError(error.message);
      } else {
        if (rememberMe) {
          localStorage.setItem('gretelRememberedEmail', email.trim());
        } else {
          localStorage.removeItem('gretelRememberedEmail');
        }
        sessionStorage.setItem('needsGoogleRefresh', 'true');
        onLoginSuccess(data.session);
      }
    } catch (err) {
      setError('An unexpected error occurred during login.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg sm:shadow-2xl p-4 max-[360px]:p-3 min-[414px]:p-5 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
      <div className="space-y-4 sm:space-y-5">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-black tracking-wider uppercase" style={{ color: 'var(--primary-600)' }}>
            G.R.E.T.E.L
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Welcome
          </p>
        </div>
        
        <form className="space-y-4 sm:space-y-6" onSubmit={handleLogin}>
            <div>
              <label
                htmlFor="email"
                className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
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
              <label
                htmlFor="password"
                className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2"
              >
                Password
              </label>
              <div className="relative w-full">
                  <input
                    type={isPasswordVisible ? 'text' : 'password'}
                    id="password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-2.5 sm:p-3 pr-10 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition duration-300"
                    style={{ '--tw-ring-color': 'var(--primary-300)' } as React.CSSProperties}
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                  />
                  <button
                      type="button"
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 rounded-full transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-700"
                      style={{ 
                        '--tw-ring-color': 'var(--primary-600)' 
                      } as React.CSSProperties}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary-700)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                      onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                      aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                      disabled={isLoading}
                  >
                      {isPasswordVisible ? (
                        <EyeOffIcon size={20} />
                      ) : (
                        <EyeIcon size={20} />
                      )}
                  </button>
              </div>
            </div>
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="cursor-pointer"
                disabled={isLoading}
              />
              <label 
                htmlFor="remember-me" 
                className="ml-3 block text-sm text-gray-700 dark:text-gray-300 font-medium cursor-pointer"
              >
                Remember Me
              </label>
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
                className="w-full flex justify-center items-center text-white font-bold py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white disabled:bg-gray-400 disabled:transform-none disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isLoading ? undefined : 'var(--primary-600)',
                  '--tw-ring-color': 'var(--primary-600)'
                } as React.CSSProperties}
                onMouseEnter={(e) => !isLoading && (e.currentTarget.style.backgroundColor = 'var(--primary-700)')}
                onMouseLeave={(e) => !isLoading && (e.currentTarget.style.backgroundColor = 'var(--primary-600)')}
              >
                {isLoading && <div className="custom-loader-sm"></div>}
                {isLoading ? 'Logging in...' : 'Login'}
              </button>
            </div>
          </form>
          <div className="space-y-4">
              <div className="text-center">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (!isLoading) onForgotPasswordClick();
                  }}
                  className={`text-sm text-gray-600 dark:text-gray-400 hover:underline transition duration-300 rounded focus:outline-none focus-visible:ring-2 ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  style={{ '--tw-ring-color': 'var(--primary-600)' } as React.CSSProperties}
                  onMouseEnter={(e) => !isLoading && (e.currentTarget.style.color = 'var(--primary-700)')}
                  onMouseLeave={(e) => !isLoading && (e.currentTarget.style.color = '')}
                >
                  Forgot Password?
                </a>
              </div>

              <button
                type="button"
                onClick={onCreateAccountClick}
                disabled={isLoading}
                className="w-full bg-white dark:bg-gray-800 border font-bold py-2.5 sm:py-3 px-4 rounded-lg transition-colors duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  borderColor: 'var(--primary-600)',
                  color: 'var(--primary-600)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--primary-50)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '';
                }}
              >
                Create an Account
              </button>
            </div>
      </div>
      <div className="pt-6 mt-6 sm:pt-8 sm:mt-8 border-t border-gray-200 dark:border-gray-700 text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Copyright © 2025 | G.R.E.T.E.L by Hanzel
        </p>
        <div className="mt-2 flex flex-wrap justify-center items-center gap-2 sm:gap-4 text-xs text-gray-500 dark:text-gray-400">
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); onNavigateToPrivacy(); }} 
              className="hover:underline transition-colors duration-300 rounded focus:outline-none focus-visible:ring-2"
              style={{ '--tw-ring-color': 'var(--primary-600)' } as React.CSSProperties}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary-700)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '')}
            >
              Privacy Policy
            </a>
            <span className="hidden sm:inline">|</span>
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); onNavigateToTerms(); }} 
              className="hover:underline transition-colors duration-300 rounded focus:outline-none focus-visible:ring-2"
              style={{ '--tw-ring-color': 'var(--primary-600)' } as React.CSSProperties}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary-700)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '')}
            >
              Terms of Service
            </a>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
