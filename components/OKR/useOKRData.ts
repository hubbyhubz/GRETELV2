import React from 'react';
import { supabase } from '../supabaseClient';
import type {
  OKRCheckinRow,
  OKRCheckinFrequency,
  OKRCycleRow,
  OKRDirection,
  OKRHealth,
  OKRKeyResultRow,
  OKRMetricType,
  OKRObjectiveRow,
} from '../okrTypes';
import { computeObjectiveProgress } from '../okrUtils';
import {
  applyKrToObjectives,
  applyUpdatedKrToObjectives,
  createCycle,
  createDefaultCycle,
  createKeyResult,
  createObjective,
  deleteAllObjectivesInCycleCascade,
  deleteCycleCascade,
  deleteObjectivesByComponentCascade,
  deleteObjectiveCascade,
  logCheckin,
} from './okrMutations';

import type { ObjectiveWithKrs } from './okrShared';

 

export function useOKRData(userId: string | null) {
  const [cycles, setCycles] = React.useState<OKRCycleRow[]>([]);
  const [selectedCycleId, setSelectedCycleId] = React.useState<string | null>(null);
  const [objectives, setObjectives] = React.useState<ObjectiveWithKrs[]>([]);
  const [latestCheckinByKr, setLatestCheckinByKr] = React.useState<Record<string, OKRCheckinRow | undefined>>({});
  const [isCyclesLoading, setIsCyclesLoading] = React.useState(false);
  const [isObjectivesLoading, setIsObjectivesLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selectedObjectiveId, setSelectedObjectiveId] = React.useState<string | null>(null);

  const cyclesReqIdRef = React.useRef(0);
  const objectivesReqIdRef = React.useRef(0);

  const isLoading = isCyclesLoading || isObjectivesLoading;

  const refreshCycles = React.useCallback(async () => {
    if (!userId) return;
    const reqId = (cyclesReqIdRef.current += 1);
    setIsCyclesLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('okr_cycles')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: false });

    if (reqId !== cyclesReqIdRef.current) return;

    if (error) {
      setCycles([]);
      setSelectedCycleId(null);
      setObjectives([]);
      setLatestCheckinByKr({});
      setLoadError(error.message);
      setIsCyclesLoading(false);
      return;
    }

    const rows = (data as OKRCycleRow[]) || [];
    setCycles(rows);
    const nextSelected = selectedCycleId && rows.some((c) => c.id === selectedCycleId)
      ? selectedCycleId
      : rows.find((c) => c.status === 'active')?.id || rows[0]?.id || null;
    setSelectedCycleId(nextSelected);
    setIsCyclesLoading(false);
  }, [userId, selectedCycleId]);

  const refreshObjectives = React.useCallback(async () => {
    if (!userId || !selectedCycleId) return;
    const reqId = (objectivesReqIdRef.current += 1);
    setIsObjectivesLoading(true);
    setLoadError(null);

    const { data: objRows, error: objErr } = await supabase
      .from('okr_objectives')
      .select('*')
      .eq('user_id', userId)
      .eq('cycle_id', selectedCycleId)
      .order('created_at', { ascending: false });

    if (objErr) {
      if (reqId !== objectivesReqIdRef.current) return;
      setObjectives([]);
      setLatestCheckinByKr({});
      setLoadError(objErr.message);
      setIsObjectivesLoading(false);
      return;
    }

    const objList = (objRows as OKRObjectiveRow[]) || [];
    const objectiveIds = objList.map((o) => o.id);
    if (!objectiveIds.length) {
      if (reqId !== objectivesReqIdRef.current) return;
      setObjectives([]);
      setLatestCheckinByKr({});
      setIsObjectivesLoading(false);
      return;
    }

    const { data: krRows, error: krErr } = await supabase
      .from('okr_key_results')
      .select('*')
      .eq('user_id', userId)
      .in('objective_id', objectiveIds)
      .order('created_at', { ascending: true });

    if (krErr) {
      if (reqId !== objectivesReqIdRef.current) return;
      setObjectives([]);
      setLatestCheckinByKr({});
      setLoadError(krErr.message);
      setIsObjectivesLoading(false);
      return;
    }

    const krs = (krRows as OKRKeyResultRow[]) || [];
    const krsByObj: Record<string, OKRKeyResultRow[]> = {};
    krs.forEach((kr) => {
      krsByObj[kr.objective_id] = krsByObj[kr.objective_id] || [];
      krsByObj[kr.objective_id].push(kr);
    });

    const krIds = krs.map((kr) => kr.id);
    const latestByKr: Record<string, OKRCheckinRow | undefined> = {};
    if (krIds.length) {
      const { data: latestRows, error: latestErr } = await supabase.rpc('okr_latest_checkins', {
        p_user_id: userId,
        p_kr_ids: krIds,
      });
      if (!latestErr) {
        ((latestRows as OKRCheckinRow[]) || []).forEach((row) => {
          latestByKr[row.key_result_id] = row;
        });
      } else {
        const { data: checkinsRows, error: chkErr } = await supabase
          .from('okr_checkins')
          .select('*')
          .eq('user_id', userId)
          .in('key_result_id', krIds)
          .order('created_at', { ascending: false })
          .limit(500);
        if (!chkErr) {
          ((checkinsRows as OKRCheckinRow[]) || []).forEach((row) => {
            if (!latestByKr[row.key_result_id]) latestByKr[row.key_result_id] = row;
          });
        }
      }
    }

    if (reqId !== objectivesReqIdRef.current) return;

    setLatestCheckinByKr(latestByKr);
    const merged: ObjectiveWithKrs[] = objList.map((o) => {
      const objKrs = krsByObj[o.id] || [];
      return { ...o, krs: objKrs, progress01: computeObjectiveProgress(objKrs) };
    });
    setObjectives(merged);
    setIsObjectivesLoading(false);
  }, [userId, selectedCycleId]);

  const createDefaultCycleForUser = React.useCallback(async (payload: { name: string; cadence: OKRCycleRow['cadence']; start_date: string; end_date: string; reminder_time: string }) => {
    if (!userId) return { ok: false as const, error: 'Missing user id.', missingTable: false };
    setIsSaving(true);
    const result = await createDefaultCycle({ userId, ...payload });
    if (!result.ok) {
      setIsSaving(false);
      return result;
    }
    setCycles((prev) => [result.cycle, ...prev]);
    setSelectedCycleId(result.cycle.id);
    setIsSaving(false);
    return result;
  }, [userId]);

  const createCycleForUser = React.useCallback(async (draft: { name: string; cadence: OKRCycleRow['cadence']; start_date: string; end_date: string; reminder_time: string }) => {
    if (!userId) return { ok: false as const, error: 'Missing user id.', missingTable: false };
    setIsSaving(true);
    const result = await createCycle({ userId, draft });
    if (!result.ok) {
      setIsSaving(false);
      return result;
    }
    setCycles((prev) => [result.cycle, ...prev]);
    setSelectedCycleId(result.cycle.id);
    setIsSaving(false);
    return result;
  }, [userId]);

  const createObjectiveForCycle = React.useCallback(async (draft: { title: string; description: string; priority: number } & Record<string, any>) => {
    if (!userId || !selectedCycleId) return { ok: false as const, error: 'Missing cycle or user id.', missingTable: false };
    setIsSaving(true);
    const result = await createObjective({ userId, cycleId: selectedCycleId, draft });
    if (!result.ok) {
      setIsSaving(false);
      return result;
    }
    const next: ObjectiveWithKrs = { ...result.objective, krs: [], progress01: 0 };
    setObjectives((prev) => [next, ...prev]);
    setIsSaving(false);
    return result;
  }, [userId, selectedCycleId]);

  const createKeyResultForObjective = React.useCallback(async (objectiveId: string, draft: { title: string; metric_type: OKRMetricType; direction: OKRDirection; unit: string; start_value: string; target_value: string; due_date: string; checkin_frequency: OKRCheckinFrequency } & Record<string, any>) => {
    if (!userId) return { ok: false as const, error: 'Missing user id.', missingTable: false };
    setIsSaving(true);
    const result = await createKeyResult({ userId, objectiveId, draft });
    if (!result.ok) {
      setIsSaving(false);
      return result;
    }
    setObjectives((prev) => applyKrToObjectives({ objectives: prev, objectiveId, kr: result.kr }));
    setIsSaving(false);
    return result;
  }, [userId]);

  const updateObjectiveById = React.useCallback(async (objectiveId: string, patch: Partial<OKRObjectiveRow>) => {
    if (!userId) return { ok: false as const, error: 'Missing user id.' };
    setIsSaving(true);
    const { data, error } = await supabase
      .from('okr_objectives')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', objectiveId)
      .select('*')
      .single();
    if (error) {
      setIsSaving(false);
      return { ok: false as const, error: error.message };
    }
    const updated = data as OKRObjectiveRow;
    setObjectives((prev) => prev.map((o) => (o.id === objectiveId ? { ...o, ...updated } : o)));
    setIsSaving(false);
    return { ok: true as const, objective: updated };
  }, [userId]);

  const updateKeyResultById = React.useCallback(async (krId: string, patch: Partial<OKRKeyResultRow>) => {
    if (!userId) return { ok: false as const, error: 'Missing user id.' };
    setIsSaving(true);
    const { data, error } = await supabase
      .from('okr_key_results')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', krId)
      .select('*')
      .single();
    if (error) {
      setIsSaving(false);
      return { ok: false as const, error: error.message };
    }
    const updated = data as OKRKeyResultRow;
    setObjectives((prev) => applyUpdatedKrToObjectives({ objectives: prev, kr: updated }));
    setIsSaving(false);
    return { ok: true as const, kr: updated };
  }, [userId]);

  const logCheckinForKr = React.useCallback(async (kr: OKRKeyResultRow, params: { value: string; confidence: 1 | 2 | 3 | 4 | 5; health: OKRHealth; note: string }) => {
    if (!userId) return { ok: false as const, error: 'Missing user id.' };
    setIsSaving(true);
    const result = await logCheckin({ userId, kr, value: params.value, confidence: params.confidence, health: params.health, note: params.note });
    if (!result.ok) {
      setIsSaving(false);
      return result;
    }
    setLatestCheckinByKr((prev) => ({ ...prev, [kr.id]: result.checkin }));
    setObjectives((prev) => applyUpdatedKrToObjectives({ objectives: prev, kr: result.kr }));
    setIsSaving(false);
    return result;
  }, [userId]);

  const deleteObjectiveById = React.useCallback(async (objectiveId: string) => {
    if (!userId) return { ok: false as const, error: 'Missing user id.' };
    setIsSaving(true);
    const result = await deleteObjectiveCascade({ userId, objectiveId });
    if (!result.ok) {
      setIsSaving(false);
      return result;
    }
    setObjectives((prev) => prev.filter((o) => o.id !== objectiveId));
    if (result.deletedKrIds?.length) {
      setLatestCheckinByKr((prev) => {
        const next = { ...prev };
        result.deletedKrIds.forEach((id: string) => {
          delete next[id];
        });
        return next;
      });
    }
    if (selectedObjectiveId === objectiveId) setSelectedObjectiveId(null);
    setIsSaving(false);
    return result;
  }, [userId, selectedObjectiveId]);

  const deleteCycleById = React.useCallback(async (cycleId: string) => {
    if (!userId) return { ok: false as const, error: 'Missing user id.' };
    setIsSaving(true);
    const result = await deleteCycleCascade({ userId, cycleId });
    if (!result.ok) {
      setIsSaving(false);
      return result;
    }

    const remainingCycles = cycles.filter((c) => c.id !== cycleId);

    setCycles((prev) => prev.filter((c) => c.id !== cycleId));
    const deletedObjectiveIdSet = new Set<string>(result.deletedObjectiveIds || []);
    setObjectives((prev) => prev.filter((o) => !deletedObjectiveIdSet.has(o.id)));
    if (result.deletedKrIds?.length) {
      setLatestCheckinByKr((prev) => {
        const next = { ...prev };
        result.deletedKrIds.forEach((id: string) => {
          delete next[id];
        });
        return next;
      });
    }

    setSelectedObjectiveId(null);
    setSelectedCycleId((prevSelected) => {
      if (prevSelected !== cycleId) return prevSelected;
      return remainingCycles.find((c) => c.status === 'active')?.id || remainingCycles[0]?.id || null;
    });

    setIsSaving(false);
    return result;
  }, [userId, cycles]);

  const deleteObjectivesByComponent = React.useCallback(async (objectiveComponent: string) => {
    if (!userId || !selectedCycleId) return { ok: false as const, error: 'Missing cycle or user id.' };
    setIsSaving(true);
    const result = await deleteObjectivesByComponentCascade({ userId, cycleId: selectedCycleId, objectiveComponent });
    if (!result.ok) {
      setIsSaving(false);
      return result;
    }
    const deletedObjectiveIdSet = new Set<string>(result.deletedObjectiveIds || []);
    setObjectives((prev) => prev.filter((o) => !deletedObjectiveIdSet.has(o.id)));
    if (result.deletedKrIds?.length) {
      setLatestCheckinByKr((prev) => {
        const next = { ...prev };
        result.deletedKrIds.forEach((id: string) => {
          delete next[id];
        });
        return next;
      });
    }
    if (selectedObjectiveId && deletedObjectiveIdSet.has(selectedObjectiveId)) setSelectedObjectiveId(null);
    setIsSaving(false);
    return result;
  }, [userId, selectedCycleId, selectedObjectiveId]);

  const deleteAllObjectivesInSelectedCycle = React.useCallback(async () => {
    if (!userId || !selectedCycleId) return { ok: false as const, error: 'Missing cycle or user id.' };
    setIsSaving(true);
    const result = await deleteAllObjectivesInCycleCascade({ userId, cycleId: selectedCycleId });
    if (!result.ok) {
      setIsSaving(false);
      return result;
    }
    setObjectives([]);
    if (result.deletedKrIds?.length) {
      setLatestCheckinByKr((prev) => {
        const next = { ...prev };
        result.deletedKrIds.forEach((id: string) => {
          delete next[id];
        });
        return next;
      });
    }
    setSelectedObjectiveId(null);
    setIsSaving(false);
    return result;
  }, [userId, selectedCycleId]);

  React.useEffect(() => {
    refreshCycles();
  }, [refreshCycles]);

  React.useEffect(() => {
    refreshObjectives();
  }, [refreshObjectives]);

  return {
    cycles,
    selectedCycleId,
    setSelectedCycleId,
    objectives,
    latestCheckinByKr,
    isLoading,
    isSaving,
    loadError,
    selectedObjectiveId,
    setSelectedObjectiveId,
    refreshCycles,
    refreshObjectives,
    createDefaultCycleForUser,
    createCycleForUser,
    createObjectiveForCycle,
    createKeyResultForObjective,
    logCheckinForKr,
    deleteObjectiveById,
    deleteCycleById,
    deleteObjectivesByComponent,
    deleteAllObjectivesInSelectedCycle,
    updateObjectiveById,
    updateKeyResultById,
  };
}
