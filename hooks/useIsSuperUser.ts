import { useEffect, useState } from 'react';
import { supabase } from '../components/supabaseClient';

export function useIsSuperUser(userId: string | null | undefined) {
  const [isChecking, setIsChecking] = useState(false);
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsChecking(false);
      setIsSuperUser(false);
      setError(null);
      return;
    }

    let mounted = true;
    (async () => {
      setIsChecking(true);
      setError(null);
      try {
        const { data, error: checkError } = await supabase
          .from('company_users')
          .select('is_super_user')
          .eq('user_id', userId)
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
  }, [userId]);

  return { isChecking, isSuperUser, error };
}

