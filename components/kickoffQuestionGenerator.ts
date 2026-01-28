import type { UserProfile } from './types';

type KickoffProfileLike = Partial<UserProfile> & {
  key_metrics?: unknown;
  deep_focus_projects?: unknown;
  success_definition?: unknown;
};

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(v => String(v ?? '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[\r\n,;]+/)
      .map(v => v.trim())
      .filter(Boolean);
  }
  return [];
};

const includesAny = (haystack: string, needles: string[]): boolean => {
  const lowered = haystack.toLowerCase();
  return needles.some(n => lowered.includes(n.toLowerCase()));
};

export const generateKickoffQuestions = (userProfile: KickoffProfileLike | null | undefined): string[] => {
  const roleRaw = String(userProfile?.role ?? '').trim();
  const roleLower = roleRaw.toLowerCase();
  const isSupervisorOrManager = includesAny(roleLower, ['supervisor', 'manager']);

  const questions: string[] = [];

  if (isSupervisorOrManager) {
    questions.push(`What are your Top 3 Objectives for ${roleRaw || 'your'} operations today?`);
  } else {
    questions.push('What are your Top 3 Priorities for today?');
  }

  const metricsRaw = (userProfile as any)?.key_metrics ?? (userProfile as any)?.metrics ?? '';
  const metricsList = asStringArray(metricsRaw).join(' ').toLowerCase();
  const metricQuestions: string[] = [];
  if (metricsList.includes('breakage')) {
    metricQuestions.push('What was the Total Breakage Cost from yesterday that needs attention?');
  }
  if (metricsList.includes('inventory')) {
    metricQuestions.push('Are there any critical Inventory Tasks or Requisitions needed today?');
  }
  questions.push(...metricQuestions);

  const projectsRaw = (userProfile as any)?.deep_focus_projects ?? (userProfile as any)?.deepFocusProjects ?? '';
  const projects = asStringArray(projectsRaw);
  const firstProject = projects[0]?.trim();
  if (firstProject) {
    questions.push(`Do you have a deep focus block for ${firstProject} today? What outcome defines success?`);
  }

  const successDefinition = String((userProfile as any)?.success_definition ?? (userProfile as any)?.successDefinition ?? '').trim();
  if (successDefinition.toLowerCase() === 'team grow') {
    questions.push('Do you have any Team Development or Coaching points for your briefings?');
  }
  if (successDefinition.toLowerCase() === 'clearing to-do list') {
    questions.push('What operational bottlenecks need to be cleared before lunch?');
  }

  questions.push('What additional admin blocks are needed today? (Note: Waste, Checklist, & Breakage are auto-included).');

  return questions;
};

