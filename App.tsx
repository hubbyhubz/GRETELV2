import { useState, useEffect, useRef, useLayoutEffect, useCallback, lazy, Suspense } from 'react';
import LoginPage from './components/LoginPage';
import ThemeToggleButton from './components/ThemeToggleButton';
import { isSupabaseConfigured, supabase, supabaseConfigError } from './components/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import type {
  UserProfile,
  WizardData,
  View,
  LegalPageSource,
  DashboardView,
  CreateAccountFormData
} from './components/types';
import { NotificationManager } from './components/NotificationManager';
import { applyTabTitle, getTabKeyFromTopLevelView } from './lib/tabTitle.ts';
import { syncAssistantBrainProfile } from './components/assistantBrainService';
import { useAuthListener } from './hooks/useAuthListener';
import { useProfileData } from './hooks/useProfileData';
import { useInactivityLock } from './hooks/useInactivityLock';

// Lazy load components to improve performance
const CreateAccountPage = lazy(() => import('./components/CreateAccountPage'));
const ForgotPasswordPage = lazy(() => import('./components/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./components/ResetPasswordPage'));
const SetupWizardPage = lazy(() => import('./components/SetupWizardPage'));
const MainDashboardPage = lazy(() => import('./components/MainDashboardPage').then(module => ({ default: module.MainDashboardPage })));
const PrivacyPolicyPage = lazy(() => import('./components/PrivacyPolicyPage'));
const TermsOfServicePage = lazy(() => import('./components/TermsOfServicePage'));
const SimulationIntroPage = lazy(() => import('./components/SimulationIntroPage'));
const LockScreenPage = lazy(() => import('./components/LockScreenPage'));
const TwoFactorAuthPage = lazy(() => import('./components/TwoFactorAuthPage'));
const GoogleRefreshPage = lazy(() => import('./components/GoogleRefreshPage'));
const TestPage = lazy(() => import('./components/TestPage'));

const APP_VERSION = "1.5.3"; // Version for patch notes

// Extend the View type locally to include 'test'
type ExtendedView = View | 'test';

const normalizeAvatarUrl = (url: string) => {
  if (!url) return url;
  if (url.startsWith('/AVATAR/')) return url.replace('/AVATAR/', '/avatars/');
  if (url.startsWith('AVATAR/')) return url.replace('AVATAR/', '/avatars/');
  return url.replace('/AVATAR/', '/avatars/');
};

function App() {
  const [currentView, setCurrentView] = useState<ExtendedView>('login');
  const [showIntro, setShowIntro] = useState(false);
  const [legalPageSource, setLegalPageSource] = useState<LegalPageSource>('login');
  const [activeDashboard, setActiveDashboard] = useState<DashboardView>('main');

  // Custom Hooks
  const { session, isLoading: authLoading, setSession } = useAuthListener();
  const { userProfile, isFetching: profileLoading, error: profileError, updateProfileLocal } = useProfileData(session);
  const { isLocked, setIsLocked, handleUnlock, resetInactivityTimer } = useInactivityLock(session, userProfile);

  const isLoading = authLoading || (!!session && profileLoading && !userProfile);
  const [showLoadingHint, setShowLoadingHint] = useState(false);

  // Track profile load errors locally for UI
  const profileLoadError = profileError;

  // Early check for session to reduce initial loading time


  const [authError, setAuthError] = useState<string | null>(null);
  const [requiresGoogleRefresh, setRequiresGoogleRefresh] = useState(false);
  const [requiresGoogleConnect, setRequiresGoogleConnect] = useState(false);
  const [shouldShowPatchNotes, setShouldShowPatchNotes] = useState(false);
  const [createAccountFormData, setCreateAccountFormData] = useState<CreateAccountFormData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreedToTerms: false,
  });

  const currentViewRef = useRef<ExtendedView>(currentView);
  const patchNotesClosedRef = useRef(false); // Track if user has explicitly closed patch notes

  useEffect(() => {
    if (!isLoading) {
      setShowLoadingHint(false);
      return;
    }
    const timer = window.setTimeout(() => setShowLoadingHint(true), 6000);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  // Restore patch notes closed state from sessionStorage on mount
  useEffect(() => {
    // Check if user has explicitly closed patch notes for this version
    // Check localStorage (persistent) AND sessionStorage (session only)
    const localLastSeen = localStorage.getItem('gretel_last_seen_version');
    const sessionStorageClosed = sessionStorage.getItem('gretel_patch_notes_closed') === 'true';
    const sessionStorageVersion = sessionStorage.getItem('gretel_patch_notes_closed_version');

    // If they've seen this version before (locally stored) OR closed it in this session
    if (localLastSeen === APP_VERSION || (sessionStorageClosed && sessionStorageVersion === APP_VERSION)) {
      patchNotesClosedRef.current = true;
      setShouldShowPatchNotes(false);
    }
  }, []); // Only run once on mount

  useLayoutEffect(() => {
    if (currentView === 'dashboard' && requiresGoogleRefresh) {
      applyTabTitle(undefined);
      return;
    }
    if (currentView === 'dashboard' && userProfile && !userProfile.setup_complete) {
      applyTabTitle('setup');
      return;
    }
    applyTabTitle(getTabKeyFromTopLevelView(currentView, activeDashboard));
  }, [currentView, requiresGoogleRefresh, userProfile?.setup_complete, activeDashboard]);

  const handleUnlockWithTokenRefresh = useCallback(async () => {
    const lockedAtRaw = localStorage.getItem('gretel_locked_at');
    const lockedAt = lockedAtRaw ? Number(lockedAtRaw) : null;
    const lockedMs = lockedAt && Number.isFinite(lockedAt) ? Date.now() - lockedAt : null;

    handleUnlock();

    if (lockedMs != null && lockedMs < 45 * 60 * 1000) {
      return;
    }

    try {
      await supabase.auth.refreshSession();
    } catch {
    }
  }, [handleUnlock]);

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-100 text-gray-900 p-6">
        <div className="w-full max-w-xl bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-bold mb-2">G.R.E.T.E.L Configuration Error</h1>
          <p className="text-sm text-gray-700 mb-4">{supabaseConfigError}</p>
          <div className="text-sm text-gray-700 space-y-1">
            <div className="font-semibold">Vercel → Project → Settings → Environment Variables</div>
            <div>VITE_SUPABASE_URL</div>
            <div>VITE_SUPABASE_ANON_KEY</div>
          </div>
        </div>
      </div>
    );
  }

  // Inactivity logic is handled by useInactivityLock hook

  // Removed old fetchUserProfile function - replaced with useEffect-based profile loading

  // FIXED: Consolidated auth state logic into a single onAuthStateChange listener
  // to prevent race conditions on email confirmation redirects.





  // FIXED: Add safety timeout to break loading loops
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isLoading) {
        console.warn('⚠️ Loading timeout reached - breaking loop and resetting to login');
        // setIsLoading is not available here, handled by authListener
        setAuthError("Login timed out. Please try again.");
        setCurrentView('login');
      }
    }, 10000); // 10 second timeout (reduced from 15s)

    return () => clearTimeout(timeout);
  }, [isLoading]);

  // Check for OAuth callback errors
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    if (error) {
      console.error('❌ OAuth error from URL:', error, errorDescription);
      // Clean up the URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const resetCreateAccountForm = () => {
    setCreateAccountFormData({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      agreedToTerms: false,
    });
  };

  const navigateToCreateAccount = () => {
    setCurrentView('createAccount');
  };

  const navigateToLogin = () => {
    setCurrentView('login');
    resetCreateAccountForm();
  };

  const navigateToForgotPassword = () => setCurrentView('forgotPassword');

  const navigateToPrivacyPolicy = (source: LegalPageSource) => {
    console.log('🔗 Navigating to Privacy Policy from:', source);
    setLegalPageSource(source);
    setCurrentView('privacyPolicy');
    // Ensure loading state is cleared when navigating to legal pages

  };

  const navigateToTermsOfService = (source: LegalPageSource) => {
    console.log('🔗 Navigating to Terms of Service from:', source);
    setLegalPageSource(source);
    setCurrentView('termsOfService');
    // Ensure loading state is cleared when navigating to legal pages

  };

  const handleBackFromLegal = () => {
    setCurrentView(legalPageSource);
  };

  const handleStartSimulation = () => {
    setShowIntro(false);
  };

  const handleAccountCreated = () => {
    setCurrentView('login');
    resetCreateAccountForm();
  };

  const handleCreateAccountFormChange = (updatedData: Partial<CreateAccountFormData>) => {
    setCreateAccountFormData(prev => ({ ...prev, ...updatedData }));
  };

  const handleProfileUpdate = async (updatedProfile: UserProfile) => {
    if (!userProfile) return;

    const normalizedProfile = {
      ...updatedProfile,
      avatar: normalizeAvatarUrl(updatedProfile.avatar),
      assistantAvatar: normalizeAvatarUrl(updatedProfile.assistantAvatar),
    };

    // NOTE: The fields 'assistant_avatar', 'assistant_memory', and 'team' have been
    // RE-ENABLED in this update payload. If the application errors with a "column not found"
    // message, the corresponding columns must be added to the 'profiles' table in Supabase.
    // The application will now display this error instead of crashing.
    const updates: { [key: string]: any } = {
      full_name: normalizedProfile.name,
      username: normalizedProfile.nickname,
      company_id: normalizedProfile.companyId,
      mobile_number: normalizedProfile.mobileNumber,
      avatar_url: normalizedProfile.avatar,
      assistant_name: normalizedProfile.assistantName,
      assistant_avatar: normalizedProfile.assistantAvatar,
      assistant_memory: normalizedProfile.assistantMemory,
      team: normalizedProfile.team,
      passive_memory: normalizedProfile.passiveMemory,
      relational_memory: normalizedProfile.relationalMemory,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userProfile.id);

    if (error) {
      console.error("Error updating profile:", error.message);
      // Check for the specific schema mismatch error from Supabase
      if (error.message.includes("Could not find the") && error.message.includes("column")) {
        // This is a specific schema mismatch error. Throw a custom error object
        // so the UI can display a user-friendly message.
        throw {
          name: 'SchemaMismatchError',
          message: 'Your database table is missing required columns. The update failed.',
          details: error.message, // Pass original error for debugging in the UI component
        };
      }
      // Re-throw any other types of errors
      throw error;
    } else {
      // If successful, update the app's central user profile state.
      updateProfileLocal(normalizedProfile);
      syncAssistantBrainProfile(normalizedProfile.id, normalizedProfile).catch(() => { });
    }
  };

  const handleLoginSuccess = (_nextSession: Session | null) => {
    setAuthError(null);
    resetInactivityTimer();
    setRequiresGoogleConnect(false);
  };

  const handleLogout = async () => {
    // Optimistically reset UI so logout feels immediate.
    setIsLocked(false);
    localStorage.removeItem('gretel_is_locked');
    localStorage.removeItem('gretel_last_activity');
    setSession(null);
    setCurrentView('login');
    setRequiresGoogleRefresh(false);
    setRequiresGoogleConnect(false);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error logging out:", error.message);
      }
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };



  const handleGoogleAuthError = () => {
    console.warn('⚠️ Google Auth Error detected, prompting for refresh.');
    setRequiresGoogleRefresh(true);
  };

  const handlePatchNotesViewed = async () => {
    // Mark that user explicitly closed patch notes (both ref AND sessionStorage for persistence across remounts)
    patchNotesClosedRef.current = true;
    sessionStorage.setItem('gretel_patch_notes_closed', 'true');
    sessionStorage.setItem('gretel_patch_notes_closed_version', APP_VERSION);

    // Store in localStorage for long-term persistence across sessions/restarts (Fallback)
    localStorage.setItem('gretel_last_seen_version', APP_VERSION);

    // Update local state FIRST (synchronously) to prevent modal from reopening
    // Even if Supabase update fails, we still want the modal to stay closed
    if (userProfile) {
      const updatedProfile = { ...userProfile, last_seen_version: APP_VERSION };
      updateProfileLocal(updatedProfile);
    }
    setShouldShowPatchNotes(false);
    // Save last_seen_version to Supabase per account (async, non-blocking)
    if (userProfile && session) {
      const { error } = await supabase
        .from('profiles')
        .update({ last_seen_version: APP_VERSION })
        .eq('id', userProfile.id);

      if (error) {
        console.error('Error updating last_seen_version (non-critical):', error);
        // Don't revert state - modal should stay closed even if DB update fails
      }
    }
  };

  const handleSetupComplete = async (wizardData: WizardData) => {
    if (!userProfile || !session) return;

    const updates = {
      role: wizardData.role,
      responsibilities: wizardData.responsibilities,
      daily_tasks: wizardData.dailyTasks,
      deep_focus_projects: wizardData.deepFocusProjects,
      metrics: wizardData.metrics,
      meetings: wizardData.meetings,
      time_challenge: wizardData.timeChallenge,
      comm_style: wizardData.commStyle,
      success_definition: wizardData.successDefinition,
      assistant_name: wizardData.assistantName,
      setup_complete: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userProfile.id);

    if (error) {
      console.error("Error finalizing setup:", error);
    } else {
      const updatedProfile = { ...userProfile, ...updates, setup_complete: true };
      updateProfileLocal(updatedProfile);

      syncAssistantBrainProfile(updatedProfile.id, updatedProfile).catch(() => { });

      // Clean up the flag in case it's still present from the initial login
      sessionStorage.removeItem('needsGoogleRefresh');

      console.log('✅ New user setup complete. Forcing Google Account connection flow.');
      setRequiresGoogleRefresh(true);
    }
  };

  useEffect(() => {
    if (!session || !userProfile?.setup_complete) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error) {
        setRequiresGoogleConnect(true);
        return;
      }
      const identities = ((data?.user as any)?.identities ?? []) as any[];
      const hasLinkedGoogle = identities.some((i: any) => i?.provider === 'google');
      if (!hasLinkedGoogle) {
        setRequiresGoogleConnect(true);
        setRequiresGoogleRefresh(false);
        return;
      }
      if (requiresGoogleConnect) setRequiresGoogleConnect(false);
      const hasProviderToken = Boolean((session as any)?.provider_token);
      setRequiresGoogleRefresh(!hasProviderToken);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, userProfile?.setup_complete]);

  const renderView = () => {
    if (currentView === 'test') {
      return <TestPage onExit={() => setCurrentView('login')} />;
    }

    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <div className="custom-loader-lg"></div>
          {showLoadingHint && (
            <div className="text-center px-6">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Still loading…</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                This can happen on slower mobile networks. If it reaches 15 seconds, we’ll stop and return you to login.
              </div>
            </div>
          )}
        </div>
      );
    }

    // New Error View to prevent Login Loops
    if (profileLoadError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg text-center border border-gray-200 dark:border-gray-700">
            <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Unable to Load Profile</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{profileLoadError}</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
              >
                Retry
              </button>
              <button
                onClick={handleLogout}
                className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (requiresGoogleRefresh) {
      return <GoogleRefreshPage />;
    }
    if (requiresGoogleConnect) {
      return <GoogleRefreshPage />;
    }

    if (session && !userProfile && currentView === 'twoFactor') {
      return <TwoFactorAuthPage onBackToLogin={handleLogout} />;
    }

    if (currentView === 'resetPassword') {
      return <ResetPasswordPage onResetSuccess={navigateToLogin} />;
    }

    if (!session || !userProfile) {
      switch (currentView) {
        case 'createAccount':
          return <CreateAccountPage
            onBackToLogin={navigateToLogin}
            onAccountCreated={handleAccountCreated}
            onNavigateToPrivacy={() => navigateToPrivacyPolicy('createAccount')}
            onNavigateToTerms={() => navigateToTermsOfService('createAccount')}
            formData={createAccountFormData}
            onFormChange={handleCreateAccountFormChange}
          />;
        case 'forgotPassword':
          return <ForgotPasswordPage
            onBackToLogin={navigateToLogin}
            onNavigateToPrivacy={() => navigateToPrivacyPolicy('login')}
            onNavigateToTerms={() => navigateToTermsOfService('login')}
          />;
        case 'privacyPolicy':
          return <PrivacyPolicyPage onBack={handleBackFromLegal} source={legalPageSource} />;
        case 'termsOfService':
          return <TermsOfServicePage onBack={handleBackFromLegal} source={legalPageSource} />;
        case 'login':
        default:
          return <LoginPage
            onCreateAccountClick={navigateToCreateAccount}
            onForgotPasswordClick={navigateToForgotPassword}
            onLoginSuccess={handleLoginSuccess}
            onNavigateToPrivacy={() => navigateToPrivacyPolicy('login')}
            onNavigateToTerms={() => navigateToTermsOfService('login')}
            authError={authError}
            onLoginStart={() => setAuthError(null)}
          />;
      }
    }

    if (!userProfile.setup_complete) {
      return <SetupWizardPage onSetupComplete={handleSetupComplete} />;
    }

    switch (currentView) {
      case 'dashboard':
      case 'login':
      case 'setupWizard':
        return <MainDashboardPage
          onLogout={handleLogout}
          userProfile={userProfile}
          onProfileUpdate={handleProfileUpdate}
          onNavigateToPrivacy={() => navigateToPrivacyPolicy('dashboard')}
          onNavigateToTerms={() => navigateToTermsOfService('dashboard')}
          activeDashboard={activeDashboard}
          setActiveDashboard={setActiveDashboard}
          appVersion={APP_VERSION}
          onGoogleAuthError={handleGoogleAuthError}
          shouldShowPatchNotes={shouldShowPatchNotes}
          onPatchNotesViewed={handlePatchNotesViewed}
          session={session}
        />;
      case 'privacyPolicy':
        return <PrivacyPolicyPage onBack={handleBackFromLegal} source="dashboard" />;
      case 'termsOfService':
        return <TermsOfServicePage onBack={handleBackFromLegal} source="dashboard" />;
      default:
        return <MainDashboardPage
          onLogout={handleLogout}
          userProfile={userProfile}
          onProfileUpdate={handleProfileUpdate}
          onNavigateToPrivacy={() => navigateToPrivacyPolicy('dashboard')}
          onNavigateToTerms={() => navigateToTermsOfService('dashboard')}
          activeDashboard={activeDashboard}
          setActiveDashboard={setActiveDashboard}
          appVersion={APP_VERSION}
          onGoogleAuthError={handleGoogleAuthError}
          shouldShowPatchNotes={shouldShowPatchNotes}
          onPatchNotesViewed={handlePatchNotesViewed}
          session={session}
        />;
    }
  };

  const isDashboardView = session && userProfile?.setup_complete && !requiresGoogleRefresh && !requiresGoogleConnect && !['privacyPolicy', 'termsOfService', 'resetPassword', 'twoFactor'].includes(currentView);

  if (showIntro) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
        <ThemeToggleButton />
        <SimulationIntroPage onStartSimulation={handleStartSimulation} />
      </div>
    );
  }

  return (
    <div className={!isDashboardView && currentView !== 'test' ? 'min-h-screen flex items-center justify-center p-4 sm:p-6' : ''}>
      {!isDashboardView && currentView !== 'resetPassword' && currentView !== 'test' && <ThemeToggleButton />}
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="custom-loader-lg"></div>
        </div>
      }>
        {renderView()}
      </Suspense>
      {isDashboardView && <NotificationManager />}
      {isLocked && userProfile && (
        <Suspense fallback={null}>
          <LockScreenPage
            userProfile={userProfile}
            accessToken={session?.access_token || ''}
            onUnlock={handleUnlockWithTokenRefresh}
            onLogout={handleLogout}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
