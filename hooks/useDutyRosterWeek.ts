import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../components/supabaseClient';
import type { DutyRosterEntry, DutyRosterWeek } from '../components/dutyRosterTypes';

const coerceEntries = (value: unknown): DutyRosterEntry[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((e: any) => ({
      id: String(e?.id ?? ''),
      duty_date: String(e?.duty_date ?? ''),
      week_start_sunday: String(e?.week_start_sunday ?? ''),
      slot_key: String(e?.slot_key ?? ''),
      assignee_user_id: e?.assignee_user_id ? String(e.assignee_user_id) : null,
      notes: e?.notes == null ? null : String(e.notes),
      sort_order: Number.isFinite(Number(e?.sort_order)) ? Number(e.sort_order) : 0,
      updated_at: e?.updated_at ? String(e.updated_at) : undefined,
      updated_by: e?.updated_by ? String(e.updated_by) : undefined,
    }))
    .filter((e) => !!e.duty_date && !!e.slot_key);
};

const coerceWeek = (value: any): DutyRosterWeek | null => {
  if (!value || typeof value !== 'object') return null;
  const week_start_sunday = String((value as any).week_start_sunday ?? '');
  const department_id = String((value as any).department_id ?? '');
  const can_edit = Boolean((value as any).can_edit);
  if (!week_start_sunday || !department_id) return null;
  return {
    week_start_sunday,
    department_id,
    can_edit,
    entries: coerceEntries((value as any).entries),
  };
};

export function useDutyRosterWeek(weekStartSundayYmd: string | null | undefined) {
  const [isLoading, setIsLoading] = useState(false);
  const [week, setWeek] = useState<DutyRosterWeek | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!weekStartSundayYmd) {
      setWeek(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_my_duty_roster_week', {
        p_week_start_sunday: weekStartSundayYmd,
      });
      if (rpcError) throw rpcError;
      const coerced = coerceWeek(data);
      if (!coerced) throw new Error('Failed to load duty roster week.');
      setWeek(coerced);
    } catch (e: any) {
      setWeek(null);
      setError(e?.message || 'Failed to load duty roster week.');
    } finally {
      setIsLoading(false);
    }
  }, [weekStartSundayYmd]);

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

  return { isLoading, week, error, reload };
}

