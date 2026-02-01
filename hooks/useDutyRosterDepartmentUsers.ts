import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../components/supabaseClient';
import type { DepartmentRole } from '../components/types';

export type DutyRosterDepartmentUser = {
  user_id: string;
  full_name: string;
  role: DepartmentRole;
};

type DepartmentUsersResult = {
  department_id: string;
  users: DutyRosterDepartmentUser[];
};

const coerceResult = (value: any): DepartmentUsersResult | null => {
  if (!value || typeof value !== 'object') return null;
  const department_id = String(value.department_id ?? '');
  const usersRaw = Array.isArray(value.users) ? value.users : [];
  const users = usersRaw
    .map((u: any) => ({
      user_id: String(u?.user_id ?? ''),
      full_name: String(u?.full_name ?? ''),
      role: (u?.role as DepartmentRole) ?? 'rank_and_file',
    }))
    .filter((u: DutyRosterDepartmentUser) => Boolean(u.user_id));
  if (!department_id) return null;
  return { department_id, users };
};

export function useDutyRosterDepartmentUsers() {
  const [isLoading, setIsLoading] = useState(false);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [users, setUsers] = useState<DutyRosterDepartmentUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_my_department_users');
      if (rpcError) throw rpcError;
      const coerced = coerceResult(data);
      if (!coerced) throw new Error('Failed to load department users.');
      setDepartmentId(coerced.department_id);
      setUsers(coerced.users);
    } catch (e: any) {
      setDepartmentId(null);
      setUsers([]);
      setError(e?.message || 'Failed to load department users.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await reload();
    })();
    return () => {
      mounted = false;
    };
  }, [reload]);

  return { isLoading, departmentId, users, error, reload };
}
