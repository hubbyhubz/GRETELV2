import { useState, useEffect, useRef, useLayoutEffect, lazy, Suspense } from 'react';
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
import { perfMark, perfMeasure } from './lib/perf';

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

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
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
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLoadingHint, setShowLoadingHint] = useState(false);
  
  // Early check for session to reduce initial loading time
  useEffect(() => {
    let mounted = true;
    const checkInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!mounted) return;
        
        if (error || !session) {
          // No session - show login immediately
          setIsLoading(false);
          setCurrentView('login');
        }
        // If session exists, let the auth listener handle it (don't set loading false here)
      } catch (error) {
        if (!mounted) return;
        console.error('Error checking initial session:', error);
        setIsLoading(false);
        setCurrentView('login');
      }
    };
    
    // Quick check with timeout
    const timeout = setTimeout(() => {
      if (mounted && isLoading && !session) {
        setIsLoading(false);
        setCurrentView('login');
      }
    }, 2000); // 2 second fallback
    
    checkInitialSession();
    
    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, []); // Only run once on mount
  const [isLocked, setIsLocked] = useState(() => {
    // Initialize lock state from storage
    const storedLock = localStorage.getItem('gretel_is_locked');
    return storedLock === 'true';
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [requiresGoogleRefresh, setRequiresGoogleRefresh] = useState(false);
  const [shouldShowPatchNotes, setShouldShowPatchNotes] = useState(false);
  const [createAccountFormData, setCreateAccountFormData] = useState<CreateAccountFormData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreedToTerms: false,
  });

  const userProfileRef = useRef<UserProfile | null>(null);
  const currentViewRef = useRef<ExtendedView>(currentView);
  const inactivityTimer = useRef<number | null>(null);
  const isFetchingProfile = useRef(false);
  const patchNotesClosedRef = useRef(false); // Track if user has explicitly closed patch notes

  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);

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

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-100 text-gray-900 p-6">
        <div className="w-full max-w-xl bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-bold mb-2">G.R.E.T.E.L Configuration Error</h1>
          <p className="text-sm text-gray-700 mb-4">{supabaseConfigError}</p>
          <div className="text-sm text-gray-700 space-y-1">
            <div className="font-semibold">Cloudflare Pages → Environment Variables</div>
            <div>VITE_SUPABASE_URL</div>
            <div>VITE_SUPABASE_ANON_KEY</div>
          </div>
        </div>
      </div>
    );
  }

  const resetInactivityTimer = () => {
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
    }
    // Update last activity timestamp
    localStorage.setItem('gretel_last_activity', Date.now().toString());
    
    inactivityTimer.current = window.setTimeout(() => {
      // Only lock if there is a logged-in user on the dashboard
      if (userProfileRef.current && userProfileRef.current.setup_complete) {
        console.log('🔒 Inactivity timeout - Locking App');
        setIsLocked(true);
        localStorage.setItem('gretel_is_locked', 'true');
        
        // Sync lock state to Supabase
        if (session?.user?.id) {
            supabase.from('profiles').update({ is_app_locked: true }).eq('id', session.user.id).then(({ error }) => {
                if (error) console.error('Error syncing lock state:', error);
            });
        }
      }
    }, INACTIVITY_TIMEOUT);
  };

  // Check for inactivity on mount (in case user refreshed after timeout)
  useEffect(() => {
    const checkInactivity = () => {
        const lastActivity = localStorage.getItem('gretel_last_activity');
        if (lastActivity) {
            const elapsed = Date.now() - parseInt(lastActivity, 10);
            if (elapsed > INACTIVITY_TIMEOUT && userProfileRef.current?.setup_complete) {
                setIsLocked(true);
                localStorage.setItem('gretel_is_locked', 'true');
            }
        }
    };
    checkInactivity();
    
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(event => window.addEventListener(event, resetInactivityTimer));
    resetInactivityTimer(); // Initial timer start

    return () => {
      events.forEach(event => window.removeEventListener(event, resetInactivityTimer));
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
      }
    };
  }, []);

  // Removed old fetchUserProfile function - replaced with useEffect-based profile loading

  // FIXED: Consolidated auth state logic into a single onAuthStateChange listener
  // to prevent race conditions on email confirmation redirects.
  useEffect(() => {
    let mounted = true;
    console.log('🔧 Initializing app auth listener...');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Prevent processing if we're already in the correct state (e.g., after password change refresh)
        if (session?.user?.id === userProfileRef.current?.id && currentViewRef.current === 'dashboard') {
          console.log('🛡️ Auth state change ignored: already on dashboard with correct user.');
          return;
        }

        console.log('🎯 Auth state change:', event, 'Session valid:', !!session?.user);
        
        if (!mounted) return;

        try {
          // Handle session establishment (initial load, sign in, token refresh)
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
            if (session?.user) {
              console.log(`✅ Session established via ${event}`);
              setSession(session);
              // The profile-loading useEffect will handle the rest, including the loading spinner.
            } else if (event === 'INITIAL_SESSION') {
              // This is the crucial part: Supabase has loaded and confirmed there's NO session.
              console.log('❌ No initial session. Directing to login.');
              setIsLoading(false);
              setCurrentView('login');
            }
          }
          // Handle user signing out
          else if (event === 'SIGNED_OUT') {
            console.log('🚪 User signed out');
            setSession(null);
            setUserProfile(null);
            userProfileRef.current = null;
            setCurrentView('login');
            setIsLoading(false);
            setIsLocked(false);
          }
          // Handle user data being updated (e.g., email change)
          else if (event === 'USER_UPDATED') {
            if (session?.user) {
              console.log('👤 User updated');
              const { data: { user }, error: userError } = await supabase.auth.getUser();
              if (userError) {
                console.error('Error fetching updated user:', userError);
                setSession(session); // Fallback to the session from the event
              } else if (user) {
                const freshSession = { ...session, user };
                setSession(freshSession);
              } else {
                console.log('🚪 User is null after update, signing out.');
                setSession(null);
                setUserProfile(null);
                setCurrentView('login');
              }
            }
          }
          // Handle password recovery flow
          else if (event === 'PASSWORD_RECOVERY') {
            if (session?.user) {
              console.log('🔑 Password recovery mode.');
              setSession(session);
              setCurrentView('resetPassword');
              setIsLoading(false);
            }
          }
          else {
            console.log('⚡ Other auth event:', event);
          }
        } catch (error) {
          console.error('❌ Error in auth state change listener:', error);
          if (mounted) {
            setIsLoading(false);
            setCurrentView('login');
          }
        }
      }
    );

    return () => {
      console.log('🧹 Cleaning up App auth subscription');
      mounted = false;
      subscription.unsubscribe();
    };
  }, []); // FIX: Removed currentView dependency. This listener should only run once on mount.


  // Handle profile loading and page navigation
  useEffect(() => {
    if (!session) {
        if (!isLoading) {
            // Only force login view if we are not in special views like test
            if (currentView !== 'test') {
                setCurrentView('login');
            }
        }
        return;
    }

    const loadUserProfile = async () => {
      if (!session || !session.user || !session.user.id) {
        setIsLoading(false);
        return;
      }

      if (isFetchingProfile.current) return;
      if (userProfileRef.current && userProfileRef.current.id === session.user.id) {
        setIsLoading(false);
        return;
      }

      isFetchingProfile.current = true;
      setIsLoading(true);
      perfMark('profile:load-start');

      try {
        console.log('👤 Loading profile for user:', session.user.id);
        
        let hasMfa = false;
        let isAal2 = false;

        // MFA check - make it non-blocking with timeout
        try {
            const mfaController = new AbortController();
            const mfaTimeout = setTimeout(() => mfaController.abort(), 3000); // 3 second timeout
            
            const { data: mfaData, error: mfaError } = await supabase.auth.mfa.listFactors();
            clearTimeout(mfaTimeout);
            
            if (mfaError) {
                // If network error or timeout, log warning but don't block login
                if (mfaError.message && (mfaError.message.includes('Failed to fetch') || mfaError.message.includes('AbortError') || mfaError.name === 'AuthRetryableFetchError')) {
                    console.warn('⚠️ MFA check skipped due to network/timeout:', mfaError.message);
                } else {
                    console.error('❌ MFA check error:', mfaError);
                }
            } else {
                hasMfa = mfaData && mfaData.totp && mfaData.totp.length > 0;
                const userAal = (session.user as any).aal;
                isAal2 = userAal === 'aal2';
            }
        } catch (mfaCatchError) {
             console.warn('⚠️ MFA check exception (likely network/timeout):', mfaCatchError);
        }

        if (hasMfa && !isAal2) {
          setCurrentView('twoFactor');
          return;
        }

        // Profile fetch with timeout
        const profilePromise = supabase.from('profiles').select('*').eq('id', session.user.id).single();
        let profileTimeout: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
          profileTimeout = setTimeout(() => {
            resolve({ data: null, error: { message: 'Profile fetch timeout after 8 seconds' } });
          }, 8000);
        });
        
        const result = await Promise.race([profilePromise, timeoutPromise]);
        clearTimeout(profileTimeout!);
        const { data: profileData, error } = result;
        if (error && 'code' in error && error.code !== 'PGRST116') {
          // Ignore AbortError as it's likely due to rapid component unmounting/re-mounting
          if (error.message.includes('AbortError')) {
            console.warn('⚠️ Profile fetch aborted (benign):', error.message);
            return;
          }

          // If network error, treat as critical but don't crash, maybe show offline mode in future
          if (error.message.includes('Failed to fetch')) {
             console.warn('⚠️ Network error fetching profile - defaulting to fallback.', error.message);
          } else {
             console.error('❌ Error fetching profile:', error.message);
          }
          // Fallback: allow login with a minimal local profile if profile fetch fails.
          const fallbackProfile: UserProfile = {
            id: session.user.id,
            name: session.user.user_metadata.full_name || 'New User',
            nickname: session.user.user_metadata.username || '',
            email: session.user.email ?? '',
            companyId: '',
            mobileNumber: '',
            avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=2080&auto=format&fit=crop',
            assistantAvatar: 'https://static.thenounproject.com/png/1132733-200.png',
            assistantName: 'G.R.E.T.E.L',
            role: 'Supervisor',
            responsibilities: '',
            dailyTasks: '',
            deepFocusProjects: '',
            metrics: '',
            meetings: '',
            timeChallenge: '',
            commStyle: '',
            successDefinition: '',
            setup_complete: true,
            assistantMemory: '',
            team: [],
            passiveMemory: [],
            relationalMemory: { nodes: [], edges: [] },
          };
          setUserProfile(fallbackProfile);
          userProfileRef.current = fallbackProfile;
          setCurrentView('dashboard');
          return;
        }

        let finalProfileData = profileData;
        if (!finalProfileData) {
            console.warn('⚠️ No profile found for user, creating one on-the-fly.');
            const storedMetadataRaw = localStorage.getItem('gretel_signup_metadata');
            let signupData = { name: '' };
            if (storedMetadataRaw) {
              try { signupData = JSON.parse(storedMetadataRaw); } catch (e) { console.error('Failed to parse signup metadata', e); }
            }
            const fullName = signupData.name || session.user.user_metadata.full_name || '';
            const { data: newProfile, error: insertError } = await supabase.from('profiles').insert({ id: session.user.id, full_name: fullName }).select().single();
            if (insertError) {
              console.error('❌ Error creating profile:', insertError.message);
              await supabase.auth.signOut();
              return;
            }
            if (storedMetadataRaw) localStorage.removeItem('gretel_signup_metadata');
            finalProfileData = newProfile;
        }

        // Preserve last_seen_version from userProfileRef if it exists and matches APP_VERSION
        // OR if patchNotesClosedRef is true (user closed modal in this session)
        // OR if sessionStorage indicates patch notes were closed in this session
        // This handles the case where user closed patch notes but Supabase update hasn't completed yet
        const existingLastSeenVersion = userProfileRef.current?.last_seen_version;
        const shouldPreserveFromRef = existingLastSeenVersion === APP_VERSION;
        const shouldPreserveFromClosedRef = patchNotesClosedRef.current === true;
        const sessionStorageClosed = sessionStorage.getItem('gretel_patch_notes_closed') === 'true';
        const sessionStorageVersion = sessionStorage.getItem('gretel_patch_notes_closed_version');
        const shouldPreserveFromSessionStorage = sessionStorageClosed && sessionStorageVersion === APP_VERSION;
        const shouldPreserveVersion = shouldPreserveFromRef || shouldPreserveFromClosedRef || shouldPreserveFromSessionStorage;
        const dbLastSeenVersion = finalProfileData.last_seen_version || null;
        const localLastSeenVersion = localStorage.getItem('gretel_last_seen_version');

        // Migration: If we have a local version but nothing in DB, sync it up
        if (localLastSeenVersion && !dbLastSeenVersion) {
            console.log('🔄 Migrating last_seen_version from local storage to Supabase...');
            supabase.from('profiles').update({ last_seen_version: localLastSeenVersion }).eq('id', session.user.id).then(({ error }) => {
                if (error) console.error('❌ Background migration of last_seen_version failed:', error);
                else console.log('✅ Background migration of last_seen_version complete.');
            });
        }
        
        // Use Supabase version if available, otherwise check localStorage (migration path)
        const storedLastSeenVersion = dbLastSeenVersion || localLastSeenVersion;
        
        const preservedVersion = shouldPreserveVersion ? APP_VERSION : storedLastSeenVersion;
        const profile: UserProfile = {
          id: finalProfileData.id,
          name: finalProfileData.full_name || session.user.user_metadata.full_name || 'New User',
          nickname: finalProfileData.username || '',
          email: session.user.email ?? '',
          companyId: finalProfileData.company_id || '',
          mobileNumber: finalProfileData.mobile_number || '',
          avatar: normalizeAvatarUrl(finalProfileData.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=2080&auto=format&fit=crop'),
          assistantAvatar: normalizeAvatarUrl(finalProfileData.assistant_avatar || 'https://static.thenounproject.com/png/1132733-200.png'),
          assistantName: finalProfileData.assistant_name || 'G.R.E.T.E.L',
          role: finalProfileData.role || 'Supervisor',
          responsibilities: finalProfileData.responsibilities || '',
          dailyTasks: finalProfileData.daily_tasks || '',
          deepFocusProjects: finalProfileData.deep_focus_projects || '',
          metrics: finalProfileData.metrics || '',
          meetings: finalProfileData.meetings || '',
          timeChallenge: finalProfileData.time_challenge || '',
          commStyle: finalProfileData.comm_style || '',
          successDefinition: finalProfileData.success_definition || '',
          setup_complete: finalProfileData.setup_complete || false,
          assistantMemory: finalProfileData.assistant_memory || '',
          team: finalProfileData.team || [],
          last_seen_version: preservedVersion,
          tour_completed: finalProfileData.tour_completed || false,
          passiveMemory: finalProfileData.passive_memory || [],
          relationalMemory: finalProfileData.relational_memory || { nodes: [], edges: [] },
          is_app_locked: finalProfileData.is_app_locked || false,
        };
        
        setUserProfile(profile);
        userProfileRef.current = profile;
        
        // Sync lock state: If Supabase says locked, force lock locally.
        if (finalProfileData.is_app_locked) {
            console.log('🔒 Remote lock detected from Supabase.');
            setIsLocked(true);
            localStorage.setItem('gretel_is_locked', 'true');
        }
        
        if (currentView === 'privacyPolicy' || currentView === 'termsOfService') {
          console.log('🔒 Preserving legal page navigation.');
          return;
        }
        
        const needsRefresh = sessionStorage.getItem('needsGoogleRefresh') === 'true';

        if (profile.setup_complete) {
            if (needsRefresh) {
                console.log('🔧 Initial login detected. Forcing Google Account connection.');
                sessionStorage.removeItem('needsGoogleRefresh'); // Consume the flag
                setRequiresGoogleRefresh(true);
            } else {
                setRequiresGoogleRefresh(false);
                console.log('✅ Setup complete and Google connection flow finished. Directing to dashboard.');
                // Check version from profile instead of localStorage (per-account tracking)
                // BUT: Don't override if user has already closed patch notes in this session
                // profile.last_seen_version should already be preserved from userProfileRef if it existed
                const lastSeenVersion = profile.last_seen_version || null;
                // Also check local storage for this device as fallback
                const localLastSeen = localStorage.getItem('gretel_last_seen_version');
                
                // Show if: 
                // 1. Version in DB is old (or null)
                // 2. Version in LocalStorage is old (or null)
                // 3. User hasn't closed it in this session
                const hasNewVersion = (lastSeenVersion !== APP_VERSION) && (localLastSeen !== APP_VERSION);
                
                const profileHasSeenVersion = lastSeenVersion === APP_VERSION;
                // CRITICAL: Also check sessionStorage in case ref was reset due to component remount
                const sessionStorageClosed = sessionStorage.getItem('gretel_patch_notes_closed') === 'true';
                const sessionStorageVersion = sessionStorage.getItem('gretel_patch_notes_closed_version');
                const sessionStorageHasSeenVersion = sessionStorageClosed && sessionStorageVersion === APP_VERSION;
                
                const userHasClosedInSession = patchNotesClosedRef.current || profileHasSeenVersion || sessionStorageHasSeenVersion || (localLastSeen === APP_VERSION);
                // Only set shouldShowPatchNotes if user hasn't explicitly closed it in this session
                // Check patchNotesClosedRef, profile.last_seen_version, AND sessionStorage
                if (!userHasClosedInSession) {
                  setShouldShowPatchNotes(hasNewVersion);
                } else {
                  // User already closed patch notes - keep it closed (ref, profile version, or sessionStorage check passed)
                  setShouldShowPatchNotes(false);
                }
                setCurrentView('dashboard');
                perfMark('profile:load-success');
                perfMeasure('profile load', 'profile:load-start', 'profile:load-success');
            }
        } else {
            setRequiresGoogleRefresh(false);
            console.log('⏳ New user - setup not complete. Directing to setupWizard first.');
            setCurrentView('setupWizard');
            perfMark('profile:load-success');
            perfMeasure('profile load', 'profile:load-start', 'profile:load-success');
        }
      } catch (error: any) {
        console.error('❌ Error loading profile:', error);
        // Instead of redirecting to login immediately, show error state
        setProfileLoadError(error?.message || 'Failed to load profile. Please check your connection.');
        setIsLoading(false);
        perfMark('profile:load-error');
        perfMeasure('profile load', 'profile:load-start', 'profile:load-error');
      } finally {
        isFetchingProfile.current = false;
      }
    };
    
    loadUserProfile();

  }, [session]);

  // FIXED: Add safety timeout to break loading loops
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isLoading) {
        console.warn('⚠️ Loading timeout reached - breaking loop and resetting to login');
        setIsLoading(false);
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
    setIsLoading(false);
  };
  
  const navigateToTermsOfService = (source: LegalPageSource) => {
    console.log('🔗 Navigating to Terms of Service from:', source);
    setLegalPageSource(source);
    setCurrentView('termsOfService');
    // Ensure loading state is cleared when navigating to legal pages
    setIsLoading(false);
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
        setUserProfile(normalizedProfile);
        userProfileRef.current = normalizedProfile;
    }
  };
  
  // FIXED: Update handleLoginSuccess to explicitly set the session.
  // This makes the login flow more robust and immediately triggers the profile loading effect.
  const handleLoginSuccess = (session: Session | null) => {
    setAuthError(null);
    setProfileLoadError(null); // Clear any previous errors
    if (session) {
        setSession(session);
    }
    resetInactivityTimer();
  };

  const handleLogout = async () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    // Optimistically reset UI so logout feels immediate.
    setIsLocked(false);
    localStorage.removeItem('gretel_is_locked');
    localStorage.removeItem('gretel_last_activity');
    setProfileLoadError(null);
    setSession(null);
    setUserProfile(null);
    setCurrentView('login');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
          console.error("Error logging out:", error.message);
      }
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };
  
  const handleUnlock = () => {
    setIsLocked(false);
    localStorage.removeItem('gretel_is_locked');
    localStorage.setItem('gretel_last_activity', Date.now().toString());
    
    // Sync unlock state to Supabase
    if (session?.user?.id) {
        supabase.from('profiles').update({ is_app_locked: false }).eq('id', session.user.id).then(({ error }) => {
            if (error) console.error('Error syncing unlock state:', error);
        });
    }
    
    resetInactivityTimer();
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
      setUserProfile(updatedProfile);
      userProfileRef.current = updatedProfile;
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
        setUserProfile(updatedProfile);
        userProfileRef.current = updatedProfile;
        
        // Clean up the flag in case it's still present from the initial login
        sessionStorage.removeItem('needsGoogleRefresh'); 
        
        console.log('✅ New user setup complete. Forcing Google Account connection flow.');
        setRequiresGoogleRefresh(true);
    }
  };
  
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
                            className="w-full py-2 px-4 bg-[#DC143C] hover:bg-[#b81030] text-white rounded-lg font-medium transition-colors"
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

  const isDashboardView = session && userProfile?.setup_complete && !requiresGoogleRefresh && !['privacyPolicy', 'termsOfService', 'resetPassword', 'twoFactor'].includes(currentView);

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
            onUnlock={handleUnlock}
            onLogout={handleLogout}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
