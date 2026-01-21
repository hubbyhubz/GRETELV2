import { supabase } from './supabaseClient';
// FIX: Update import path from '../App' to './types' to resolve module export errors.
import type { DashboardState } from './types';

const TABLE_NAME = 'dashboard_states';

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
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (checkError) {
    console.error('Error checking for existing dashboard state:', checkError);
    throw new Error(checkError.message);
  }

  if (existingRecord) {
    // A record exists, so we perform an UPDATE.
    const { error: updateError } = await supabase
      .from(TABLE_NAME)
      .update({ state: state })
      .eq('user_id', userId);

    if (updateError) {
      // Check if it's a network error (TypeError: Failed to fetch)
      if (updateError.message && updateError.message.includes('Failed to fetch')) {
          console.warn('Network error saving to Supabase (offline?):', updateError);
          // Do NOT throw. Just log and continue. The local state is still valid.
          return;
      }
      console.error('Error updating dashboard state to Supabase:', updateError);
      throw new Error(updateError.message);
    }
  } else {
    // No record exists, so we perform an INSERT.
    const { error: insertError } = await supabase
      .from(TABLE_NAME)
      .insert({ user_id: userId, state: state });

    if (insertError) {
      // A 409 Conflict here would indicate a race condition where another process
      // inserted a row between our check and our insert.
      console.error('Error inserting dashboard state to Supabase:', insertError);
      throw new Error(insertError.message);
    }
  }
};