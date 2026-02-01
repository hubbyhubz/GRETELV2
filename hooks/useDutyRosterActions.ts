import { useCallback, useState } from 'react';
import { supabase } from '../components/supabaseClient';
import type { DutyRosterUpsertEntryInput, DutyRosterWeek } from '../components/dutyRosterTypes';

const coerceWeek = (value: any): DutyRosterWeek | null => {
  if (!value || typeof value !== 'object') return null;
  const week_start_sunday = String((value as any).week_start_sunday ?? '');
  const department_id = String((value as any).department_id ?? '');
  const can_edit = Boolean((value as any).can_edit);
  const entries = Array.isArray((value as any).entries) ? (value as any).entries : [];
  if (!week_start_sunday || !department_id) return null;
  return { week_start_sunday, department_id, can_edit, entries } as any;
};

export function useDutyRosterActions() {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upsertWeekEntries = useCallback(
    async (weekStartSundayYmd: string, entries: DutyRosterUpsertEntryInput[]) => {
      setIsSaving(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc('upsert_my_duty_roster_entries', {
          p_week_start_sunday: weekStartSundayYmd,
          p_entries: entries,
        });
        if (rpcError) throw rpcError;
        const coerced = coerceWeek(data);
        if (!coerced) throw new Error('Failed to save duty roster.');
        return coerced;
      } catch (e: any) {
        const message = e?.message || 'Failed to save duty roster.';
        setError(message);
        throw new Error(message);
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const deleteEntry = useCallback(async (entryId: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('delete_my_duty_roster_entry', { p_entry_id: entryId });
      if (rpcError) throw rpcError;
    } catch (e: any) {
      const message = e?.message || 'Failed to delete roster entry.';
      setError(message);
      throw new Error(message);
    } finally {
      setIsSaving(false);
    }
  }, []);

  return { isSaving, error, upsertWeekEntries, deleteEntry };
}

