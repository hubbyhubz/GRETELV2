import { useState, useEffect, useRef, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../components/supabaseClient';
import type { UserProfile } from '../components/types';

export function useInactivityLock(session: Session | null, userProfile: UserProfile | null) {
    const [isLockedInternal, setIsLockedInternal] = useState(false);
    const inactivityTimer = useRef<number | null>(null);

    const clearLockState = useCallback(() => {
        localStorage.removeItem('gretel_is_locked');
        localStorage.removeItem('gretel_locked_at');
        localStorage.removeItem('gretel_last_activity');
        if (inactivityTimer.current) {
            clearTimeout(inactivityTimer.current);
            inactivityTimer.current = null;
        }
    }, []);

    const setIsLocked = useCallback(
        (_next: any) => {
            setIsLockedInternal(false);
            clearLockState();
        },
        [clearLockState]
    );

    const lockNow = useCallback(() => {
        setIsLockedInternal(false);
        clearLockState();

        if (session?.user?.id) {
            supabase.from('profiles').update({ is_app_locked: false }).eq('id', session.user.id).then(({ error }) => {
                if (error) console.error('Error syncing unlock state:', error);
            });
        }
    }, [clearLockState, session?.user?.id]);

    const resetInactivityTimer = useCallback(() => {
        setIsLockedInternal(false);
        clearLockState();
    }, [clearLockState]);

    useEffect(() => {
        setIsLockedInternal(false);
        clearLockState();
    }, [clearLockState, session?.user?.id, userProfile?.id]);

    const handleUnlock = useCallback(() => {
        setIsLockedInternal(false);
        clearLockState();

        if (session?.user?.id) {
            supabase.from('profiles').update({ is_app_locked: false }).eq('id', session.user.id).then(({ error }) => {
                if (error) console.error('Error syncing unlock state:', error);
            });
        }
    }, [clearLockState, session?.user?.id]);

    return { isLocked: isLockedInternal, setIsLocked, handleUnlock, resetInactivityTimer, lockNow };
}
