import { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '../components/types';
import { supabase } from '../components/supabaseClient';
import { ensureAssistantBrain, syncAssistantBrainProfile } from '../components/assistantBrainService';
import { perfMark, perfMeasure } from '../lib/perf';
import { normalizeTeamMembers } from '../lib/teamMembers';

// Helper to normalize avatar URLs
const normalizeAvatarUrl = (url: string) => {
    if (!url) return url;
    if (url.startsWith('/AVATAR/')) return url.replace('/AVATAR/', '/avatars/');
    if (url.startsWith('AVATAR/')) return url.replace('AVATAR/', '/avatars/');
    return url.replace('/AVATAR/', '/avatars/');
};

const APP_VERSION = "1.5.5";

export function useProfileData(session: Session | null) {
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const userProfileRef = useRef<UserProfile | null>(null);

    // Track if we've already loaded the profile for this session to avoid loops
    const loadedSessionId = useRef<string | null>(null);

    useEffect(() => {
        let mounted = true;

        if (session) {
            // Wrap fetchProfile to respect mounted state
            const load = async () => {
                if (!session.user?.id) return;

                const impersonatedId = sessionStorage.getItem('impersonating_user_id');
                const targetUserId = impersonatedId || session.user.id;

                // Prevent duplicate fetches
                if (loadedSessionId.current === targetUserId && userProfileRef.current) {
                    return;
                }

                if (mounted) {
                    setIsFetching(true);
                    setError(null);
                }

                perfMark('profile:load-start');

                try {
                    console.log(`👤 Loading profile for ${impersonatedId ? 'IMPERSONATED ' : ''}user:`, targetUserId);
                    loadedSessionId.current = targetUserId;

                    // Profile fetch with timeout
                    const profilePromise = supabase.from('profiles').select('*').eq('id', targetUserId).single();
                    let profileTimeout: ReturnType<typeof setTimeout>;
                    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
                        profileTimeout = setTimeout(() => {
                            resolve({ data: null, error: { message: 'Profile fetch timeout after 8 seconds' } });
                        }, 8000);
                    });

                    const result = await Promise.race([profilePromise, timeoutPromise]);
                    clearTimeout(profileTimeout!);

                    if (!mounted) return;

                    const { data: profileData, error: apiError } = result;

                    if (apiError && 'code' in apiError && apiError.code !== 'PGRST116') {
                        throw new Error(apiError.message);
                    }

                    let finalProfileData = profileData;

                    // Create on-the-fly if missing
                    if (!finalProfileData) {
                        console.warn('⚠️ No profile found for user, creating one on-the-fly.');
                        const storedMetadataRaw = localStorage.getItem('gretel_signup_metadata');
                        let signupData = { name: '' };
                        if (storedMetadataRaw) {
                            try { signupData = JSON.parse(storedMetadataRaw); } catch (e) { }
                        }
                        const fullName = signupData.name || session.user.user_metadata.full_name || '';
                        const { data: newProfile, error: insertError } = await supabase.from('profiles').insert({ id: session.user.id, full_name: fullName }).select().single();
                        if (insertError) throw insertError;

                        if (storedMetadataRaw) localStorage.removeItem('gretel_signup_metadata');
                        finalProfileData = newProfile;
                    }

                    if (!mounted) return;

                    const profile: UserProfile = {
                        id: finalProfileData.id,
                        name: finalProfileData.full_name || 'New User',
                        nickname: finalProfileData.username || '',
                        email: finalProfileData.email || session.user.email || '',
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
                        standardScheduleStart: finalProfileData.standard_schedule_start || '',
                        standardScheduleEnd: finalProfileData.standard_schedule_end || '',
                        standardScheduleDays: finalProfileData.standard_schedule_days || '',
                        setup_complete: finalProfileData.setup_complete || false,
                        assistantMemory: finalProfileData.assistant_memory || '',
                        team: normalizeTeamMembers(finalProfileData.team),
                        last_seen_version: finalProfileData.last_seen_version || APP_VERSION,
                        tour_completed: finalProfileData.tour_completed || false,
                        passiveMemory: finalProfileData.passive_memory || [],
                        relationalMemory: finalProfileData.relational_memory || { nodes: [], edges: [] },
                        is_app_locked: finalProfileData.is_app_locked || false,
                    };

                    if (mounted) {
                        setUserProfile(profile);
                        userProfileRef.current = profile;
                    }

                    // Background sync tasks
                    ensureAssistantBrain(profile.id).catch(() => { });
                    syncAssistantBrainProfile(profile.id, profile).catch(() => { });

                    perfMark('profile:load-success');
                    perfMeasure('profile load', 'profile:load-start', 'profile:load-success');

                } catch (err: any) {
                    if (!mounted) return;
                    // Ignore abort errors
                    if (err.name === 'AbortError' || err.message?.includes('AbortError')) return;

                    console.error('❌ Error loading profile:', err);
                    const rawMessage = String(err?.message || '');
                    const isNetworkFetchFailure =
                      err instanceof TypeError &&
                      (rawMessage.includes('Failed to fetch') || rawMessage.includes('NetworkError') || rawMessage.includes('Load failed'));
                    if (isNetworkFetchFailure) {
                      const offline = typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
                      setError(
                        offline
                          ? 'You appear to be offline. Please check your internet connection and try again.'
                          : 'Unable to reach the Supabase backend (network/DNS). Check your network, firewall/VPN, and confirm VITE_SUPABASE_URL is correct.'
                      );
                    } else {
                      setError(rawMessage || 'Failed to load profile');
                    }
                    perfMark('profile:load-error');
                } finally {
                    if (mounted) {
                        setIsFetching(false);
                    }
                }
            };
            
            load();
        } else {
            setUserProfile(null);
            userProfileRef.current = null;
            loadedSessionId.current = null;
        }

        return () => {
            mounted = false;
        };
    }, [session]);

    const updateProfileLocal = (updated: UserProfile) => {
        setUserProfile(updated);
        userProfileRef.current = updated;
    };

    return { userProfile, isFetching, error, updateProfileLocal, userProfileRef };
}
