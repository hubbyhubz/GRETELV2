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

export const generateKickoffQuestions = (userProfile: KickoffProfileLike | null | undefined): string[] => {
  const questions: string[] = [];

  questions.push('What are your Top 3 Priorities for today?');
  questions.push('What is your energy level today (low/medium/high), and when is it highest?');
  questions.push('What time window are you available to work today? (start/end, plus any hard stops)');

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
  questions.push('Afternoon admin is mandatory (Waste, Checklist, Breakage). What additional admin blocks are needed today?');

  return questions;
};
