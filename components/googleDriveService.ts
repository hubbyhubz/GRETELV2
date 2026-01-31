import { supabase } from './supabaseClient';
// FIX: Update import path from '../App' to './types' to resolve module export errors.
import type { DashboardState } from './types';
import { syncAssistantBrainDashboardState } from './assistantBrainService';
import { mergeDashboardStateForCrossDeviceSync } from '../lib/dashboardStateMerge';

const TABLE_NAME = 'dashboard_states';

const getOutboxKey = (userId: string) => `gretel:dashboardStateOutbox:${userId}`;

const queueOutboxState = (userId: string, state: DashboardState) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const payload = { ts: Date.now(), state };
    window.localStorage.setItem(getOutboxKey(userId), JSON.stringify(payload));
  } catch {
    return;
  }
};

const readOutboxState = (userId: string): { ts: number; state: DashboardState } | null => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(getOutboxKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.ts !== 'number' || !parsed.state) return null;
    return { ts: parsed.ts, state: parsed.state as DashboardState };
  } catch {
    return null;
  }
};

const clearOutboxState = (userId: string) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(getOutboxKey(userId));
  } catch {
    return;
  }
};

export const flushQueuedDashboardState = async (userId: string): Promise<boolean> => {
  const queued = readOutboxState(userId);
  if (!queued) return false;
  await saveDashboardState(userId, queued.state);
  const stillQueued = readOutboxState(userId);
  if (!stillQueued) return true;
  return false;
};

/**
 * Gets the dashboard state from the Supabase table for the logged-in user.
 * @param userId The ID of the currently authenticated user.
 * @returns A promise that resolves to the user's DashboardState or null if none exists.
 */
export const getDashboardState = async (userId: string): Promise<DashboardState | null> => {
  // Use .maybeSingle() to return null instead of an error if no row is found.
  // Only select the 'state' column for efficiency.
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('state')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (error.message.includes('AbortError')) {
      console.warn('⚠️ Dashboard state fetch aborted (benign):', error.message);
      return null;
    }
    console.error('Error fetching dashboard state from Supabase:', error);
    throw new Error(error.message);
  }

  return data ? (data.state as DashboardState) : null;
};

/**
 * Saves the dashboard state using an explicit check-then-act pattern.
 * This function first checks if a record exists. If it does, it updates it.
 * If not, it inserts a new record. This approach is implemented to address
 * persistent 409 Conflict errors that were not resolved by using a simple upsert.
 * @param userId The ID of the currently authenticated user.
 * @param state The complete DashboardState object to save.
 */
export const saveDashboardState = async (userId: string, state: DashboardState): Promise<void> => {
  // First, check if a record for the user already exists to decide whether to update or insert.
  const { data: existingRecord, error: checkError } = await supabase
    .from(TABLE_NAME)
    .select('user_id, state')
    .eq('user_id', userId)
    .maybeSingle();

  if (checkError) {
    console.error('Error checking for existing dashboard state:', checkError);
    throw new Error(checkError.message);
  }

  if (existingRecord) {
    let stateToPersist = state;
    const remoteState = (existingRecord as any)?.state as DashboardState | undefined;
    if (remoteState) {
      const merged = mergeDashboardStateForCrossDeviceSync(
        {
          reminders: remoteState.reminders,
          briefingInputs: remoteState.briefingInputs,
          delegatedTasks: remoteState.delegatedTasks,
          staffPerformanceLog: remoteState.staffPerformanceLog,
          dismissedDelegatedReminderTaskIds: remoteState.dismissedDelegatedReminderTaskIds,
        },
        {
          reminders: state.reminders,
          briefingInputs: state.briefingInputs,
          delegatedTasks: state.delegatedTasks,
          staffPerformanceLog: state.staffPerformanceLog,
          dismissedDelegatedReminderTaskIds: state.dismissedDelegatedReminderTaskIds,
        },
        { prefer: 'remote' },
      );

      stateToPersist = {
        ...state,
        reminders: merged.reminders,
        briefingInputs: merged.briefingInputs,
        delegatedTasks: merged.delegatedTasks,
        staffPerformanceLog: merged.staffPerformanceLog,
        dismissedDelegatedReminderTaskIds: merged.dismissedDelegatedReminderTaskIds,
      };
    }

    // A record exists, so we perform an UPDATE.
    const { error: updateError } = await supabase
      .from(TABLE_NAME)
      .update({ state: stateToPersist })
      .eq('user_id', userId);

    if (updateError) {
      // Check if it's a network error (TypeError: Failed to fetch)
      if (updateError.message && updateError.message.includes('Failed to fetch')) {
          console.warn('Network error saving to Supabase (offline?):', updateError);
          queueOutboxState(userId, state);
          return;
      }
      console.error('Error updating dashboard state to Supabase:', updateError);
      throw new Error(updateError.message);
    }

    clearOutboxState(userId);

    syncAssistantBrainDashboardState(userId, stateToPersist).catch(() => {});
  } else {
    // No record exists, so we perform an INSERT.
    const { error: insertError } = await supabase
      .from(TABLE_NAME)
      .insert({ user_id: userId, state: state });

    if (insertError) {
      if (insertError.message && insertError.message.includes('Failed to fetch')) {
        console.warn('Network error saving to Supabase (offline?):', insertError);
        queueOutboxState(userId, state);
        return;
      }
      // A 409 Conflict here would indicate a race condition where another process
      // inserted a row between our check and our insert.
      console.error('Error inserting dashboard state to Supabase:', insertError);
      throw new Error(insertError.message);
    }

    clearOutboxState(userId);

    syncAssistantBrainDashboardState(userId, state).catch(() => {});
  }
};
