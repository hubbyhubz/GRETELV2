import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const GoogleRefreshPage: React.FC = () => {
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleConnect = async () => {
    if (isRedirecting) return;
    setIsRedirecting(true);
    // FIX: Replaced the incorrect `linkIdentity` with `signInWithOAuth`.
    // This is the correct, robust method for both first-time connections and
    // re-authenticating an existing user to refresh an expired token. It correctly
    // triggers the Google sign-in flow and returns a valid session.
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send',
        // redirectTo is removed to default to Site URL in Supabase settings
      },
    });
    // The page will redirect, so no need to set isRedirecting back to false.
  };

  useEffect(() => {
    handleConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full max-w-md text-center animate__animated animate__bounceIn">
      <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg sm:shadow-2xl p-4 max-[360px]:p-3 min-[414px]:p-5 sm:p-6 border border-gray-200 dark:border-gray-700">
        <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-black text-primary-600 tracking-wider uppercase">
                G.R.E.T.E.L
            </h1>
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">Connect Your Google Account</h2>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-8">
          G.R.E.T.E.L requires a connection to your Google Account to sync your calendar, tasks, and dashboard.
          <br /><br />
          This is a one-time, mandatory step to begin using your assistant.
        </p>
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
