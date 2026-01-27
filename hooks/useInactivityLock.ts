import { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../components/supabaseClient';
import type { UserProfile } from '../components/types';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export function useInactivityLock(session: Session | null, userProfile: UserProfile | null) {
    const [isLocked, setIsLocked] = useState(() => {
        const storedLock = localStorage.getItem('gretel_is_locked');
        return storedLock === 'true';
    });

    const inactivityTimer = useRef<number | null>(null);

    const resetInactivityTimer = () => {
        if (inactivityTimer.current) {
            clearTimeout(inactivityTimer.current);
        }
        localStorage.setItem('gretel_last_activity', Date.now().toString());

        inactivityTimer.current = window.setTimeout(() => {
            // Only lock if there is a logged-in user on the dashboard who has completed setup
            if (userProfile && userProfile.setup_complete) {
                console.log('🔒 Inactivity timeout - Locking App');
                setIsLocked(true);
                localStorage.setItem('gretel_is_locked', 'true');
                localStorage.setItem('gretel_locked_at', Date.now().toString());

                // Sync lock state to Supabase
                if (session?.user?.id) {
                    supabase.from('profiles').update({ is_app_locked: true }).eq('id', session.user.id).then(({ error }) => {
                        if (error) console.error('Error syncing lock state:', error);
                    });
                }
            }
        }, INACTIVITY_TIMEOUT);
    };

    const checkInactivity = () => {
        const lastActivity = localStorage.getItem('gretel_last_activity');
        if (lastActivity) {
            const elapsed = Date.now() - parseInt(lastActivity, 10);
            if (elapsed > INACTIVITY_TIMEOUT && userProfile?.setup_complete) {
                setIsLocked(true);
                localStorage.setItem('gretel_is_locked', 'true');
            }
        }
    };

    useEffect(() => {
        checkInactivity();

        // Listen for events
        const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
        const handleActivity = () => resetInactivityTimer();

        events.forEach(event => window.addEventListener(event, handleActivity));
        resetInactivityTimer(); // Initial timer start

        return () => {
            events.forEach(event => window.removeEventListener(event, handleActivity));
            if (inactivityTimer.current) {
                clearTimeout(inactivityTimer.current);
            }
        };
    }, [userProfile?.setup_complete]); // Re-bind if setup status changes

    // Also sync from profile if it says locked remotely
    useEffect(() => {
        if (userProfile?.is_app_locked) {
            setIsLocked(true);
            localStorage.setItem('gretel_is_locked', 'true');
        }
    }, [userProfile?.is_app_locked]);

    const handleUnlock = () => {
        setIsLocked(false);
        localStorage.removeItem('gretel_is_locked');
        localStorage.removeItem('gretel_locked_at');
        localStorage.setItem('gretel_last_activity', Date.now().toString());

        if (session?.user?.id) {
            supabase.from('profiles').update({ is_app_locked: false }).eq('id', session.user.id).then(({ error }) => {
                if (error) console.error('Error syncing unlock state:', error);
            });
        }
        resetInactivityTimer();
    };

    return { isLocked, setIsLocked, handleUnlock, resetInactivityTimer };
}
