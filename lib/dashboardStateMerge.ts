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
) => {
  return {
    reminders: mergeById<ReminderItem>(local.reminders, remote.reminders),
    briefingInputs: mergeById<BriefingInputItem>(local.briefingInputs, remote.briefingInputs),
    delegatedTasks: mergeById<DelegatedTaskItem>(local.delegatedTasks, remote.delegatedTasks),
    staffPerformanceLog: mergeById<StaffPerformanceLogEntry>(local.staffPerformanceLog || [], remote.staffPerformanceLog || []),
    dismissedDelegatedReminderTaskIds: Array.from(
      new Set<string>([
        ...(local.dismissedDelegatedReminderTaskIds || []),
        ...(remote.dismissedDelegatedReminderTaskIds || []),
      ]),
    ),
  };
};

