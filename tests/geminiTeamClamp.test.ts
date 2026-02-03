import { describe, expect, it } from 'vitest';
import { clampSystemInstruction } from '../components/geminiService';

describe('clampSystemInstruction team preservation', () => {
  it('keeps team section when required substring is provided', () => {
    const teamBlock = [
      '**TEAM MANAGEMENT (FROM ACCOUNT SETTINGS)**',
      '**Team Members (2 total):**',
      '1. **Paulino Ramirez** - Supervisor (p@example.com)',
      '2. **John Hanzel Enriquez** - Rank and File (j@example.com)',
    ].join('\n');

    const longText = `${'A'.repeat(8000)}\n${teamBlock}\n${'B'.repeat(8000)}`;
    const clamped = clampSystemInstruction(longText, 4000, ['TEAM MANAGEMENT (FROM ACCOUNT SETTINGS)']);

    expect(clamped.length).toBeLessThanOrEqual(4000);
    expect(clamped).toContain('TEAM MANAGEMENT (FROM ACCOUNT SETTINGS)');
    expect(clamped).toContain('Paulino Ramirez');
    expect(clamped).toContain('John Hanzel Enriquez');
  });
});

