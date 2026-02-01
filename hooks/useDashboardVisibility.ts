import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../components/supabaseClient';
import {
  DEFAULT_DASHBOARD_VISIBILITY,
  coerceDashboardVisibilityMap,
  type DashboardVisibilityMap,
} from '../lib/dashboardVisibility';

type DashboardVisibilityResult = {
  visibility?: unknown;
  can_manage?: unknown;
};

export function useDashboardVisibility(userId: string | null | undefined) {
  const [isLoading, setIsLoading] = useState(false);
  const [visibility, setVisibility] = useState<DashboardVisibilityMap>(DEFAULT_DASHBOARD_VISIBILITY);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      setVisibility(DEFAULT_DASHBOARD_VISIBILITY);
      setCanManage(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_dashboard_visibility', {
        p_user_id: userId,
      });

      if (rpcError) throw rpcError;

      const result = (data ?? {}) as DashboardVisibilityResult | DashboardVisibilityMap;
      const maybeMap =
        typeof (result as DashboardVisibilityResult)?.visibility === 'object'
          ? (result as DashboardVisibilityResult).visibility
          : result;

      setVisibility(coerceDashboardVisibilityMap(maybeMap));
      setCanManage(Boolean((result as DashboardVisibilityResult)?.can_manage));
    } catch (e: any) {
      setError(e?.message || 'Failed to load dashboard visibility settings.');
      setVisibility(DEFAULT_DASHBOARD_VISIBILITY);
      setCanManage(false);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await load();
    })();
    return () => {
      mounted = false;
    };
  }, [load]);

  return { isLoading, visibility, canManage, error, reload: load };
}
