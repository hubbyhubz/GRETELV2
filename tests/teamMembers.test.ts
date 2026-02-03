import { describe, expect, it } from 'vitest';
import { mergeTeamMembers, normalizeTeamMembers } from '../lib/teamMembers';

describe('teamMembers', () => {
  it('normalizes team members from array', () => {
    const team = normalizeTeamMembers([{ id: '1', name: 'Paulino Ramirez', role: 'Supervisor', email: 'p@example.com' }]);
    expect(team).toHaveLength(1);
    expect(team[0].name).toBe('Paulino Ramirez');
    expect(team[0].email).toBe('p@example.com');
  });

  it('normalizes team members from JSON string', () => {
    const raw = JSON.stringify([{ name: 'John Hanzel Enriquez', role: 'Rank and File', email: 'j@example.com' }]);
    const team = normalizeTeamMembers(raw);
    expect(team).toHaveLength(1);
    expect(team[0].name).toBe('John Hanzel Enriquez');
    expect(team[0].id).toBeTruthy();
  });

  it('returns empty list for invalid inputs', () => {
    expect(normalizeTeamMembers(null)).toEqual([]);
    expect(normalizeTeamMembers({})).toEqual([]);
    expect(normalizeTeamMembers('not-json')).toEqual([]);
  });

  it('drops entries missing name', () => {
    const team = normalizeTeamMembers([{ id: '1', role: 'X', email: 'x@example.com' } as any]);
    expect(team).toEqual([]);
  });

  it('merges and dedupes by email then name', () => {
    const primary = normalizeTeamMembers([{ id: 'a', name: 'Paulino Ramirez', role: 'Supervisor', email: 'p@example.com' }]);
    const secondary = normalizeTeamMembers([
      { id: 'b', name: 'PAULINO RAMIREZ', role: 'Other', email: 'p@example.com' },
      { id: 'c', name: 'Jane Doe', role: 'Lead', email: '' },
      { id: 'd', name: 'Jane   Doe', role: 'Lead', email: '' },
    ]);
    const merged = mergeTeamMembers(primary, secondary);
    expect(merged).toHaveLength(2);
    expect(merged[0].name).toBe('Paulino Ramirez');
    expect(merged[1].name).toBe('Jane Doe');
  });
});

