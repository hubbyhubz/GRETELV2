import type { DashboardState, ReminderItem, BriefingInputItem, DelegatedTaskItem, StaffPerformanceLogEntry } from '../components/types';

const mergeById = <T extends { id: string }>(local: T[] = [], remote: T[] = []) => {
  const byId = new Map<string, T>();
  for (const item of local) byId.set(item.id, item);
  for (const item of remote) byId.set(item.id, item);
  return Array.from(byId.values());
};

export const mergeDashboardStateForCrossDeviceSync = (
  local: Pick<DashboardState, 'reminders' | 'briefingInputs' | 'delegatedTasks' | 'staffPerformanceLog' | 'dismissedDelegatedReminderTaskIds'>,
  remote: Pick<DashboardState, 'reminders' | 'briefingInputs' | 'delegatedTasks' | 'staffPerformanceLog' | 'dismissedDelegatedReminderTaskIds'>,
  opts?: { prefer?: 'local' | 'remote' },
) => {
  const prefer = opts?.prefer ?? 'remote';
  const first = prefer === 'remote' ? local : remote;
  const second = prefer === 'remote' ? remote : local;
  return {
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
