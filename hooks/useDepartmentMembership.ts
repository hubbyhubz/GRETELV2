import { useEffect, useState } from 'react';
import { supabase } from '../components/supabaseClient';
import type { DepartmentRole } from '../components/types';

export function useDepartmentMembership(userId: string | null | undefined) {
  const [isChecking, setIsChecking] = useState(false);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [role, setRole] = useState<DepartmentRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsChecking(false);
      setDepartmentId(null);
      setRole(null);
      setError(null);
      return;
    }

    let mounted = true;
    (async () => {
      setIsChecking(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('department_memberships')
          .select('department_id, role')
          .eq('user_id', userId)
          .maybeSingle();

        if (!mounted) return;
        if (fetchError) throw fetchError;

        setDepartmentId((data as any)?.department_id ?? null);
        setRole(((data as any)?.role as DepartmentRole) ?? null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load department membership.');
        setDepartmentId(null);
        setRole(null);
      } finally {
        if (!mounted) return;
        setIsChecking(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId]);

  return { isChecking, departmentId, role, error };
}

