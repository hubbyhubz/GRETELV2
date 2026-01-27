import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../components/supabaseClient';

export function useAuthListener() {
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        // Quick check to avoid long loading states if no session
        const checkInitialSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (!mounted) return;

                if (error || !session) {
                    setIsLoading(false);
                    setSession(null);
                }
                // If session exists, the onAuthStateChange will catch it (INITIAL_SESSION)
            } catch (error: any) {
                if (!mounted) return;
                // Ignore AbortError which happens on rapid navigation/reloads
                if (error.name === 'AbortError' || error.message?.includes('AbortError')) return;
                
                console.error('Error checking initial session:', error);
                setIsLoading(false);
                setSession(null);
            }
        };

        checkInitialSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!mounted) return;

                console.log('Auth state change:', event, !!session);

                if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
                    if (session) {
                        setSession(session);
                        setIsLoading(false);
                    } else if (event === 'INITIAL_SESSION') {
                        // Explicitly handling no session
                        setSession(null);
                        setIsLoading(false);
                    }
                } else if (event === 'SIGNED_OUT') {
                    setSession(null);
                    setIsLoading(false);
                } else if (event === 'USER_UPDATED') {
                    if (session) {
                        setSession(session);
                    } else {
                        setSession(null);
                    }
                } else if (event === 'PASSWORD_RECOVERY') {
                    // Handle recovery flow by keeping session if present, 
                    // but let consumer handle navigation based on event?
                    // For now, just sync session.
                    if (session) setSession(session);
                }
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    return { session, isLoading, setSession, setIsLoading };
}
