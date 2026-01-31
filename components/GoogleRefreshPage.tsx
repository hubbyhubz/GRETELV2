import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { getGoogleEmailStorageKey } from '../lib/googleUserInfo';

type GoogleRefreshMode = 'connect' | 'refresh';

const GoogleRefreshPage: React.FC<{ mode?: GoogleRefreshMode }> = ({ mode = 'connect' }) => {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (isRedirecting) return;
    setIsRedirecting(true);
    setError(null);

    const scopes = [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/gmail.send',
    ].join(' ');

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    const loginHint = session?.user?.id
      ? window.localStorage.getItem(getGoogleEmailStorageKey(session.user.id))
      : null;
    const queryParams: Record<string, string> = {
      prompt: 'select_account consent',
      ...(loginHint ? { login_hint: loginHint } : {}),
    };

    if (mode === 'connect' && session) {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          scopes,
          queryParams,
        },
      });
      if (error) {
        const msg = String(error.message || 'Unknown error');
        if (msg.toLowerCase().includes('manual linking is disabled')) {
          setIsRedirecting(false);
          setError('Google linking is disabled in Supabase settings. Enable Manual Linking in Supabase Auth settings, then try again.');
          return;
        }
        setIsRedirecting(false);
        setError(`Google Connection Error: ${msg}`);
        return;
      }
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes,
        queryParams,
      },
    });
    if (error) {
      setIsRedirecting(false);
      setError(`Google Connection Error: ${error.message || 'Unknown error'}`);
    }
    // The page will redirect, so no need to set isRedirecting back to false.

  };

  return (
    <div className="w-full max-w-md text-center animate__animated animate__bounceIn">
      <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg sm:shadow-2xl p-4 max-[360px]:p-3 min-[414px]:p-5 sm:p-6 border border-gray-200 dark:border-gray-700">
        <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-black text-primary-600 tracking-wider uppercase">
                G.R.E.T.E.L
            </h1>
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">
          {mode === 'refresh' ? 'Reconnect Your Google Account' : 'Connect Your Google Account'}
        </h2>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-8">
          {mode === 'refresh'
            ? 'Your Google connection needs to be refreshed to sync your calendar, tasks, and dashboard.'
            : 'G.R.E.T.E.L requires a connection to your Google Account to sync your calendar, tasks, and dashboard.'}
          <br /><br />
          {mode === 'refresh'
            ? 'This keeps your Google sync working securely.'
            : 'This is a one-time, mandatory step to begin using your assistant.'}
        </p>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
        )}
        <button
          onClick={handleConnect}
          disabled={isRedirecting}
          className="w-full flex justify-center items-center bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-primary-600 disabled:bg-gray-400 disabled:transform-none disabled:cursor-not-allowed"
        >
          {isRedirecting ? (
            <>
              <div className="custom-loader-sm"></div>
              Redirecting to Google...
            </>
          ) : (
            'Connect with Google'
          )}
        </button>
      </div>
    </div>
  );
};

export default GoogleRefreshPage;
