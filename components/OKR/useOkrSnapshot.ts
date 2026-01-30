import React from 'react';
import type { OkrSnapshot } from './okrSnapshot';
import { fetchOkrSnapshot } from './okrSnapshot';

export function useOkrSnapshot(params: {
  userId: string | null;
  refreshMs?: number;
}) {
  const { userId, refreshMs = 2 * 60 * 1000 } = params;
  const [snapshot, setSnapshot] = React.useState<OkrSnapshot | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchOkrSnapshot({ userId, now: new Date(), maxDueItems: 6 });
      if (!res.ok) {
        setSnapshot(null);
        setError(res.error);
      } else {
        setSnapshot(res.snapshot);
      }
    } catch (err: any) {
      setSnapshot(null);
      setError(String(err?.message || err));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    if (!userId) return;
    refresh();
    const t = window.setInterval(refresh, refreshMs);
    return () => window.clearInterval(t);
  }, [userId, refresh, refreshMs]);

  return { snapshot, isLoading, error, refresh };
}

