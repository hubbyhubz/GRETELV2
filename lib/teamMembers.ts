import type { TeamMember } from '../components/types';

const safeRandomId = () => {
  const anyCrypto = (globalThis as any)?.crypto;
  const uuid = typeof anyCrypto?.randomUUID === 'function' ? anyCrypto.randomUUID() : '';
  return uuid || `team-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const normalizeTeamMembers = (raw: unknown): TeamMember[] => {
  const normalizeOne = (m: any): TeamMember | null => {
    if (!m) return null;
    const id = String(m.id ?? '').trim();
    const name = String(m.name ?? '').trim();
    const role = String(m.role ?? '').trim();
    const email = String(m.email ?? '').trim();
    if (!name) return null;
    return { id: id || safeRandomId(), name, role, email };
  };

  let value: any = raw;
  if (typeof value === 'string' && value.trim()) {
    try {
      value = JSON.parse(value);
    } catch {
      value = raw;
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map(normalizeOne).filter(Boolean) as TeamMember[];
};

const normalizeKey = (m: TeamMember): string => {
  const email = String(m.email ?? '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = String(m.name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name ? `name:${name}` : '';
};

export const mergeTeamMembers = (primary: TeamMember[], secondary: TeamMember[]): TeamMember[] => {
  const merged: TeamMember[] = [];
  const seen = new Set<string>();
  const add = (m: TeamMember) => {
    const key = normalizeKey(m);
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(m);
  };

  (Array.isArray(primary) ? primary : []).forEach(add);
  (Array.isArray(secondary) ? secondary : []).forEach(add);
  return merged;
};

