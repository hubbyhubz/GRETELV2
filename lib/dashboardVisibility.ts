export const DASHBOARD_COMPONENT_KEYS = [
  'delegated_tasks',
  'briefing_notes',
  'morning_briefing_nav',
  'afternoon_briefing_nav',
  'briefing_pointers',
  'coaching_note',
  'log_information',
] as const;

export type DashboardComponentKey = (typeof DASHBOARD_COMPONENT_KEYS)[number];
export type DashboardVisibilityMap = Record<DashboardComponentKey, boolean>;

export const DEFAULT_DASHBOARD_VISIBILITY: DashboardVisibilityMap = {
  delegated_tasks: false,
  briefing_notes: false,
  morning_briefing_nav: false,
  afternoon_briefing_nav: false,
  briefing_pointers: false,
  coaching_note: false,
  log_information: false,
}

export function coerceDashboardVisibilityMap(input: unknown): DashboardVisibilityMap {
  const value = (input ?? {}) as Record<string, unknown>;
  const out: DashboardVisibilityMap = { ...DEFAULT_DASHBOARD_VISIBILITY };
  DASHBOARD_COMPONENT_KEYS.forEach((key) => {
    if (typeof value[key] === 'boolean') out[key] = value[key] as boolean;
  });
  return out;
}
