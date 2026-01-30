import { supabase } from '../supabaseClient';
import type { OKRCheckinRow, OKRCycleRow, OKRKeyResultRow, OKRObjectiveRow } from '../okrTypes';
import { isCheckinDue } from '../okrUtils';

export type OkrDueItem = {
  objective_id: string;
  objective_title: string;
  objective_component: string | null;
  key_result_id: string;
  key_result_title: string;
  target_operator: OKRKeyResultRow['target_operator'] | null;
  target_value: number;
  current_value: number;
  achieved_value: number | null;
  checkin_frequency: OKRKeyResultRow['checkin_frequency'];
  last_checkin_at: string | null;
  end_date: string | null;
  due_date: string;
  tracking_status: OKRKeyResultRow['tracking_status'] | null;
};

export type OkrSnapshot = {
  cycle: Pick<OKRCycleRow, 'id' | 'name' | 'start_date' | 'end_date' | 'cadence'>;
  due_count: number;
  due_items: OkrDueItem[];
  top_objectives: Array<Pick<OKRObjectiveRow, 'id' | 'title' | 'objective_component' | 'weightage' | 'tracking_status' | 'achievement_score'>>;
};

function asNumber(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function fetchOkrSnapshot(params: {
  userId: string;
  now: Date;
  maxDueItems?: number;
}) {
  const { userId, now, maxDueItems = 6 } = params;

  const { data: cycles, error: cycErr } = await supabase
    .from('okr_cycles')
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
    .limit(25);

  if (cycErr) return { ok: false as const, error: cycErr.message };
  const cycleRows = (cycles as OKRCycleRow[]) || [];
  const activeCycle = cycleRows.find((c) => c.status === 'active') || cycleRows[0] || null;
  if (!activeCycle) return { ok: true as const, snapshot: null as OkrSnapshot | null };

  const { data: objRows, error: objErr } = await supabase
    .from('okr_objectives')
    .select('*')
    .eq('user_id', userId)
    .eq('cycle_id', activeCycle.id)
    .order('created_at', { ascending: false })
    .limit(40);

  if (objErr) return { ok: false as const, error: objErr.message };
  const objectives = (objRows as OKRObjectiveRow[]) || [];
  const objectiveIds = objectives.map((o) => o.id);
  if (!objectiveIds.length) {
    return {
      ok: true as const,
      snapshot: {
        cycle: { id: activeCycle.id, name: activeCycle.name, start_date: activeCycle.start_date, end_date: activeCycle.end_date, cadence: activeCycle.cadence },
        due_count: 0,
        due_items: [],
        top_objectives: [],
      } satisfies OkrSnapshot,
    };
  }

  const { data: krRows, error: krErr } = await supabase
    .from('okr_key_results')
    .select('*')
    .eq('user_id', userId)
    .in('objective_id', objectiveIds)
    .eq('reminder_enabled', true)
    .order('due_date', { ascending: true })
    .limit(250);

  if (krErr) return { ok: false as const, error: krErr.message };
  const krs = (krRows as OKRKeyResultRow[]) || [];
  const krIds = krs.map((k) => k.id);
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
      const { data: chkRows, error: chkErr } = await supabase
        .from('okr_checkins')
        .select('*')
        .eq('user_id', userId)
        .in('key_result_id', krIds)
        .order('created_at', { ascending: false })
        .limit(600);

      if (!chkErr) {
        ((chkRows as OKRCheckinRow[]) || []).forEach((row) => {
          if (!latestByKr[row.key_result_id]) latestByKr[row.key_result_id] = row;
        });
      }
    }
  }

  const objectiveTitleById = new Map(objectives.map((o) => [o.id, o.title] as const));
  const objectiveComponentById = new Map(objectives.map((o) => [o.id, o.objective_component || null] as const));

  const dueItemsAll: OkrDueItem[] = [];
  krs.forEach((kr) => {
    const last = latestByKr[kr.id]?.created_at ?? null;
    if (!isCheckinDue({ frequency: kr.checkin_frequency, lastCheckinAt: last, now })) return;
    dueItemsAll.push({
      objective_id: kr.objective_id,
      objective_title: objectiveTitleById.get(kr.objective_id) || 'Objective',
      objective_component: objectiveComponentById.get(kr.objective_id) || null,
      key_result_id: kr.id,
      key_result_title: kr.title,
      target_operator: kr.target_operator || null,
      target_value: asNumber(kr.target_value, 0),
      current_value: asNumber(kr.current_value, 0),
      achieved_value: kr.achieved_value == null ? null : asNumber(kr.achieved_value, 0),
      checkin_frequency: kr.checkin_frequency,
      last_checkin_at: last,
      end_date: kr.end_date || null,
      due_date: kr.due_date,
      tracking_status: kr.tracking_status || null,
    });
  });

  const dueItems = dueItemsAll.slice(0, maxDueItems);

  const topObjectives = objectives
    .slice()
    .sort((a, b) => asNumber(b.weightage, 0) - asNumber(a.weightage, 0))
    .slice(0, 5)
    .map((o) => ({
      id: o.id,
      title: o.title,
      objective_component: o.objective_component || null,
      weightage: o.weightage ?? null,
      tracking_status: o.tracking_status ?? null,
      achievement_score: o.achievement_score ?? null,
    }));

  return {
    ok: true as const,
    snapshot: {
      cycle: { id: activeCycle.id, name: activeCycle.name, start_date: activeCycle.start_date, end_date: activeCycle.end_date, cadence: activeCycle.cadence },
      due_count: dueItemsAll.length,
      due_items: dueItems,
      top_objectives: topObjectives,
    } satisfies OkrSnapshot,
  };
}

export function formatOkrSnapshotForPrompt(snapshot: OkrSnapshot | null): string {
  if (!snapshot) return 'No active OKR cycle found.';
  const lines: string[] = [];
  lines.push(`Active cycle: ${snapshot.cycle.name} (${snapshot.cycle.start_date} to ${snapshot.cycle.end_date})`);
  lines.push(`Check-ins due: ${snapshot.due_count}`);
  if (snapshot.due_items.length) {
    lines.push('Due items (top):');
    snapshot.due_items.slice(0, 6).forEach((d, idx) => {
      const op = d.target_operator || 'target';
      lines.push(
        `${idx + 1}. [${d.objective_component || 'Objective'}] ${d.objective_title} → KR: ${d.key_result_title} | ${op} ${d.target_value} | current ${d.current_value} | achieved ${d.achieved_value ?? 'n/a'} | cadence ${d.checkin_frequency}`
      );
    });
  }
  if (snapshot.top_objectives.length) {
    lines.push('Top objectives (by weightage):');
    snapshot.top_objectives.forEach((o, idx) => {
      lines.push(`${idx + 1}. ${o.title} | weightage ${o.weightage ?? 'n/a'} | status ${o.tracking_status ?? 'n/a'} | score ${o.achievement_score ?? 'n/a'}`);
    });
  }
  return lines.join('\n');
}
