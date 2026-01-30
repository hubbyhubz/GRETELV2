import { supabase } from '../supabaseClient';
import type {
  OKRCheckinFrequency,
  OKRCheckinRow,
  OKRCycleRow,
  OKRDirection,
  OKRHealth,
  OKRKeyResultRow,
  OKRMetricType,
  OKRObjectiveRow,
} from '../okrTypes';
import { computeObjectiveProgress } from '../okrUtils';
import type { ObjectiveWithKrs } from './okrShared';
import { isMissingTableError } from './okrShared';

function asNumber(input: string): number {
  const n = Number(input);
  return Number.isFinite(n) ? n : 0;
}

export async function createDefaultCycle(params: {
  userId: string;
  name: string;
  cadence: OKRCycleRow['cadence'];
  start_date: string;
  end_date: string;
  reminder_time: string;
}) {
  const { userId, name, cadence, start_date, end_date, reminder_time } = params;
  const payload = {
    user_id: userId,
    name,
    cadence,
    start_date,
    end_date,
    status: 'active',
    reminder_time,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('okr_cycles').insert(payload).select('*').single();
  if (error) return { ok: false as const, error: error.message, missingTable: isMissingTableError(error) };
  return { ok: true as const, cycle: data as OKRCycleRow };
}

export async function createCycle(params: {
  userId: string;
  draft: { name: string; cadence: OKRCycleRow['cadence']; start_date: string; end_date: string; reminder_time: string };
}) {
  const { userId, draft } = params;
  const payload = {
    user_id: userId,
    name: draft.name.trim(),
    cadence: draft.cadence,
    start_date: draft.start_date,
    end_date: draft.end_date,
    status: 'active',
    reminder_time: draft.reminder_time,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('okr_cycles').insert(payload).select('*').single();
  if (error) return { ok: false as const, error: error.message, missingTable: isMissingTableError(error) };
  return { ok: true as const, cycle: data as OKRCycleRow };
}

export async function createObjective(params: {
  userId: string;
  cycleId: string;
  draft: { title: string; description: string; priority: number };
}) {
  const { userId, cycleId, draft } = params;
  const payload = {
    user_id: userId,
    cycle_id: cycleId,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    status: 'active',
    priority: draft.priority,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('okr_objectives').insert(payload).select('*').single();
  if (error) return { ok: false as const, error: error.message, missingTable: isMissingTableError(error) };
  return { ok: true as const, objective: data as OKRObjectiveRow };
}

export async function createKeyResult(params: {
  userId: string;
  objectiveId: string;
  draft: { title: string; metric_type: OKRMetricType; direction: OKRDirection; unit: string; start_value: string; target_value: string; due_date: string; checkin_frequency: OKRCheckinFrequency };
}) {
  const { userId, objectiveId, draft } = params;
  const start = asNumber(draft.start_value);
  const payload = {
    user_id: userId,
    objective_id: objectiveId,
    title: draft.title.trim(),
    metric_type: draft.metric_type,
    unit: draft.unit.trim() || null,
    direction: draft.direction,
    start_value: start,
    target_value: asNumber(draft.target_value),
    current_value: start,
    due_date: draft.due_date,
    weight: 1,
    status: 'active',
    checkin_frequency: draft.checkin_frequency,
    reminder_enabled: true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('okr_key_results').insert(payload).select('*').single();
  if (error) return { ok: false as const, error: error.message, missingTable: isMissingTableError(error) };
  return { ok: true as const, kr: data as OKRKeyResultRow };
}

export async function logCheckin(params: {
  userId: string;
  kr: OKRKeyResultRow;
  value: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  health: OKRHealth;
  note: string;
}) {
  const { userId, kr, value, confidence, health, note } = params;
  const nextValue = asNumber(value);

  const { data: updatedKr, error: upErr } = await supabase
    .from('okr_key_results')
    .update({ current_value: nextValue, updated_at: new Date().toISOString() })
    .eq('id', kr.id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (upErr) return { ok: false as const, error: upErr.message };

  const { data: checkin, error: chkErr } = await supabase
    .from('okr_checkins')
    .insert({ user_id: userId, key_result_id: kr.id, value: nextValue, confidence, health, note: note.trim() || null })
    .select('*')
    .single();

  if (chkErr) return { ok: false as const, error: chkErr.message };
  return { ok: true as const, kr: updatedKr as OKRKeyResultRow, checkin: checkin as OKRCheckinRow };
}

export async function deleteObjectiveCascade(params: {
  userId: string;
  objectiveId: string;
}) {
  const { userId, objectiveId } = params;

  const { data: krRows, error: krListErr } = await supabase
    .from('okr_key_results')
    .select('id')
    .eq('user_id', userId)
    .eq('objective_id', objectiveId);

  if (krListErr) return { ok: false as const, error: krListErr.message };

  const krIds = ((krRows as Array<{ id: string }>) || []).map((r) => r.id);
  if (krIds.length) {
    const { error: chkDelErr } = await supabase
      .from('okr_checkins')
      .delete()
      .eq('user_id', userId)
      .in('key_result_id', krIds);

    if (chkDelErr) return { ok: false as const, error: chkDelErr.message };
  }

  const { error: krDelErr } = await supabase
    .from('okr_key_results')
    .delete()
    .eq('user_id', userId)
    .eq('objective_id', objectiveId);

  if (krDelErr) return { ok: false as const, error: krDelErr.message };

  const { error: objDelErr } = await supabase
    .from('okr_objectives')
    .delete()
    .eq('user_id', userId)
    .eq('id', objectiveId);

  if (objDelErr) return { ok: false as const, error: objDelErr.message };
  return { ok: true as const, deletedKrIds: krIds };
}

export async function deleteCycleCascade(params: {
  userId: string;
  cycleId: string;
}) {
  const { userId, cycleId } = params;

  const { data: objRows, error: objListErr } = await supabase
    .from('okr_objectives')
    .select('id')
    .eq('user_id', userId)
    .eq('cycle_id', cycleId);

  if (objListErr) return { ok: false as const, error: objListErr.message };

  const objectiveIds = ((objRows as Array<{ id: string }>) || []).map((r) => r.id);
  const { data: krRows, error: krListErr } = objectiveIds.length
    ? await supabase
        .from('okr_key_results')
        .select('id')
        .eq('user_id', userId)
        .in('objective_id', objectiveIds)
    : { data: [], error: null };

  if (krListErr) return { ok: false as const, error: krListErr.message };

  const krIds = ((krRows as Array<{ id: string }>) || []).map((r) => r.id);
  if (krIds.length) {
    const { error: chkDelErr } = await supabase
      .from('okr_checkins')
      .delete()
      .eq('user_id', userId)
      .in('key_result_id', krIds);

    if (chkDelErr) return { ok: false as const, error: chkDelErr.message };
  }

  if (objectiveIds.length) {
    const { error: krDelErr } = await supabase
      .from('okr_key_results')
      .delete()
      .eq('user_id', userId)
      .in('objective_id', objectiveIds);

    if (krDelErr) return { ok: false as const, error: krDelErr.message };

    const { error: objDelErr } = await supabase
      .from('okr_objectives')
      .delete()
      .eq('user_id', userId)
      .eq('cycle_id', cycleId);

    if (objDelErr) return { ok: false as const, error: objDelErr.message };
  }

  const { error: cycDelErr } = await supabase
    .from('okr_cycles')
    .delete()
    .eq('user_id', userId)
    .eq('id', cycleId);

  if (cycDelErr) return { ok: false as const, error: cycDelErr.message };
  return { ok: true as const, deletedObjectiveIds: objectiveIds, deletedKrIds: krIds };
}

export function upsertObjectiveInState(params: {
  objectives: ObjectiveWithKrs[];
  objective: ObjectiveWithKrs;
}) {
  const { objectives, objective } = params;
  const idx = objectives.findIndex((o) => o.id === objective.id);
  if (idx < 0) return [objective, ...objectives];
  const next = objectives.slice();
  next[idx] = objective;
  return next;
}

export function applyKrToObjectives(params: {
  objectives: ObjectiveWithKrs[];
  objectiveId: string;
  kr: OKRKeyResultRow;
}) {
  const { objectives, objectiveId, kr } = params;
  return objectives.map((o) => {
    if (o.id !== objectiveId) return o;
    const krs = [...o.krs, kr];
    return { ...o, krs, progress01: computeObjectiveProgress(krs) };
  });
}

export function applyUpdatedKrToObjectives(params: {
  objectives: ObjectiveWithKrs[];
  kr: OKRKeyResultRow;
}) {
  const { objectives, kr } = params;
  return objectives.map((o) => {
    const idx = o.krs.findIndex((x) => x.id === kr.id);
    if (idx < 0) return o;
    const krs = o.krs.slice();
    krs[idx] = kr;
    return { ...o, krs, progress01: computeObjectiveProgress(krs) };
  });
}
