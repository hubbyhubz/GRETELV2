import { useEffect, useMemo, useState } from 'react';
import type { UserProfile } from './types';
import { supabase } from './supabaseClient';
import { SuperUserConsole } from './SuperUserConsole';

type SuperUserConsolePageProps = {
  userProfile: UserProfile;
  onBackToDashboard: () => void;
  onBackToSuperLogin: () => void;
};

export default function SuperUserConsolePage({ userProfile, onBackToDashboard, onBackToSuperLogin }: SuperUserConsolePageProps) {
  const [isChecking, setIsChecking] = useState(true);
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companyId = userProfile.companyId;

  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsChecking(true);
      setError(null);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const authUserId = authData?.user?.id;

        if (!authUserId) {
          throw new Error('No authenticated session found.');
        }

        const { data, error: checkError } = await supabase
          .from('company_users')
          .select('is_super_user')
          .eq('user_id', authUserId)
          .maybeSingle();

        if (!mounted) return;
        if (checkError) throw checkError;
        setIsSuperUser(Boolean((data as any)?.is_super_user));
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to check Super User permissions.');
        setIsSuperUser(false);
      } finally {
        if (!mounted) return;
        setIsChecking(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userProfile.id]);

  const showCompanyIdWarning = useMemo(() => {
    return !companyId || companyId.trim().length === 0;
  }, [companyId]);

  if (isChecking) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-6">
        <div className="w-full max-w-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-bold">Super User Console</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Checking permissions…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-6">
        <div className="w-full max-w-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-bold">Super User Console</h1>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">If this mentions missing tables, apply `supabase/migrations/0001_super_user_departments.sql` in Supabase.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={onBackToSuperLogin} className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-semibold">Back</button>
          </div>
        </div>
      </div>
    );
  }

  if (!isSuperUser) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-6">
        <div className="w-full max-w-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-bold">Access Denied</h1>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">Your account is not marked as a Super User.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={onBackToSuperLogin} className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-semibold">Back</button>
            <button onClick={onBackToDashboard} className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold">Go to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#F7F9FC] dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans">
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black tracking-wide text-primary-600 dark:text-primary-400">Admin Console</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Company: {companyId || '—'}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onBackToDashboard} className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold">Back to Dashboard</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {showCompanyIdWarning && (
          <div className="mb-4 p-3 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-800 text-sm">
            Your profile is missing `companyId`. Set it in Account Settings → Profile before managing departments.
          </div>
        )}
        <SuperUserConsole userProfile={userProfile} />
      </main>
    </div>
  );
}
