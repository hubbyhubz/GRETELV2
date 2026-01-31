import type {
  DashboardState,
  ReminderItem,
  BriefingInputItem,
  DelegatedTaskItem,
  StaffPerformanceLogEntry,
  ScheduleItem,
} from '../components/types';

const mergeById = <T extends { id: string }>(local: T[] = [], remote: T[] = []) => {
  const byId = new Map<string, T>();
  for (const item of local) byId.set(item.id, item);
  for (const item of remote) byId.set(item.id, item);
  return Array.from(byId.values());
};

const mergeScheduleItems = (first: ScheduleItem[] = [], second: ScheduleItem[] = []) => {
  const byId = new Map<string, ScheduleItem>();
  const upsert = (item: ScheduleItem) => {
    const prev = byId.get(item.id);
    if (!prev) {
      byId.set(item.id, item);
      return;
    }
    const prevTs = typeof prev.updatedAt === 'number' ? prev.updatedAt : 0;
    const nextTs = typeof item.updatedAt === 'number' ? item.updatedAt : 0;
    if (nextTs > prevTs) {
      byId.set(item.id, item);
      return;
    }
    if (nextTs === prevTs) {
      byId.set(item.id, item);
    }
  };

  for (const item of first) upsert(item);
  for (const item of second) upsert(item);

  const secondOrder = second.map(i => i.id);
  const out: ScheduleItem[] = [];
  for (const id of secondOrder) {
    const item = byId.get(id);
    if (item) out.push(item);
  }
  for (const item of Array.from(byId.values())) {
    if (!secondOrder.includes(item.id)) out.push(item);
  }
  return out;
};

export const mergeDashboardStateForCrossDeviceSync = (
  local: Pick<DashboardState, 'scheduleItems' | 'reminders' | 'briefingInputs' | 'delegatedTasks' | 'staffPerformanceLog' | 'dismissedDelegatedReminderTaskIds'>,
  remote: Pick<DashboardState, 'scheduleItems' | 'reminders' | 'briefingInputs' | 'delegatedTasks' | 'staffPerformanceLog' | 'dismissedDelegatedReminderTaskIds'>,
  opts?: { prefer?: 'local' | 'remote' },
) => {
  const prefer = opts?.prefer ?? 'remote';
  const first = prefer === 'remote' ? local : remote;
  const second = prefer === 'remote' ? remote : local;
  return {
    scheduleItems: mergeScheduleItems(first.scheduleItems, second.scheduleItems),
    reminders: mergeById<ReminderItem>(first.reminders, second.reminders),
    briefingInputs: mergeById<BriefingInputItem>(first.briefingInputs, second.briefingInputs),
    delegatedTasks: mergeById<DelegatedTaskItem>(first.delegatedTasks, second.delegatedTasks),
    staffPerformanceLog: mergeById<StaffPerformanceLogEntry>(first.staffPerformanceLog || [], second.staffPerformanceLog || []),
    dismissedDelegatedReminderTaskIds: Array.from(
      new Set<string>([
        ...(first.dismissedDelegatedReminderTaskIds || []),
        ...(second.dismissedDelegatedReminderTaskIds || []),
      ]),
    ),
  };
};
