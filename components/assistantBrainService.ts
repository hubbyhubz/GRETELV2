import { supabase } from './supabaseClient';
import type { DashboardState, UserProfile } from './types';

const TABLE_NAME = 'assistant_brains';
const UPSERT_RPC_NAME = 'assistant_brain_upsert';

const nowMs = () => Date.now();

type BrainPatch = Record<string, unknown>;

const buildProfileSnapshot = (profile: UserProfile) => ({
  id: profile.id,
  name: profile.name,
  nickname: profile.nickname,
  email: profile.email,
  companyId: profile.companyId,
  mobileNumber: profile.mobileNumber,
  assistantName: profile.assistantName,
  role: profile.role,
  responsibilities: profile.responsibilities,
  dailyTasks: profile.dailyTasks,
  deepFocusProjects: profile.deepFocusProjects,
  metrics: profile.metrics,
  meetings: profile.meetings,
  timeChallenge: profile.timeChallenge,
  commStyle: profile.commStyle,
  successDefinition: profile.successDefinition,
  assistantMemory: profile.assistantMemory,
  team: profile.team,
  passiveMemory: profile.passiveMemory,
  relationalMemory: profile.relationalMemory,
});

const mergeTopLevel = (base: unknown, patch: BrainPatch): Record<string, unknown> => {
  const baseObj = base && typeof base === 'object' && !Array.isArray(base) ? (base as Record<string, unknown>) : {};
  return { ...baseObj, ...patch };
};

export const ensureAssistantBrain = async (userId: string): Promise<void> => {
  const { data: existing, error: checkError } = await supabase
    .from(TABLE_NAME)
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (checkError) {
    console.warn('[AssistantBrain] Error checking assistant brain:', checkError);
    return;
  }

  if (existing) return;

  const { error: insertError } = await supabase
    .from(TABLE_NAME)
    .insert({ user_id: userId, brain: { version: 1, created_at_ms: nowMs() } });

  if (insertError) {
    console.warn('[AssistantBrain] Error creating assistant brain:', insertError);
  }
};

export const upsertAssistantBrainPatch = async (userId: string, patch: BrainPatch): Promise<void> => {
  const safePatch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};

  const { error: rpcError } = await supabase.rpc(UPSERT_RPC_NAME, { p_patch: safePatch });
  if (!rpcError) return;

  const { data: existing, error: getError } = await supabase
    .from(TABLE_NAME)
    .select('brain')
    .eq('user_id', userId)
    .maybeSingle();

  if (getError) {
    console.warn('[AssistantBrain] Error reading assistant brain for fallback upsert:', getError, rpcError);
    return;
  }

  const mergedBrain = mergeTopLevel(existing?.brain, safePatch);

  const { error: updateError } = await supabase
    .from(TABLE_NAME)
    .upsert({ user_id: userId, brain: mergedBrain }, { onConflict: 'user_id' });

  if (updateError) {
    console.warn('[AssistantBrain] Error fallback-upserting assistant brain:', updateError, rpcError);
  }
};

export const syncAssistantBrainProfile = async (userId: string, profile: UserProfile): Promise<void> => {
  await upsertAssistantBrainPatch(userId, {
    version: 1,
    profile: buildProfileSnapshot(profile),
    profile_updated_at_ms: nowMs(),
  });
};

export const syncAssistantBrainDashboardState = async (userId: string, state: DashboardState): Promise<void> => {
  await upsertAssistantBrainPatch(userId, {
    version: 1,
    dashboard_state: state,
    dashboard_state_updated_at_ms: nowMs(),
  });
};

