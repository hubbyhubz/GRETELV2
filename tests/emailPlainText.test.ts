import { describe, expect, it } from 'vitest';
import { normalizeEmailPlainText } from '../lib/emailPlainText';

describe('normalizeEmailPlainText', () => {
  it('strips markdown bold/italic markers', () => {
    const input = 'This is **bold** and *italic* and __also bold__ and _also italic_.';
    const output = normalizeEmailPlainText(input);
    expect(output).toBe('This is bold and italic and also bold and also italic.');
  });

  it('normalizes markdown bullets and removes emphasis within list items', () => {
    const input = [
      'Challenges:',
      '* **Operational Oversight Impairment**: Direct involvement in **event setup** limited broader checks.',
      '  * **Weather-Related Rework**: Rain post-**beachfront setup** required relocation.',
      '- **Team Morale**: Averaged 3.3 for the week.',
    ].join('\n');

    const output = normalizeEmailPlainText(input);
    expect(output).toContain('Challenges:');
    expect(output).toContain('• Operational Oversight Impairment: Direct involvement in event setup limited broader checks.');
    expect(output).toContain('  • Weather-Related Rework: Rain post-beachfront setup required relocation.');
    expect(output).toContain('• Team Morale: Averaged 3.3 for the week.');
    expect(output).not.toMatch(/\*\*/);
  });

  it('strips markdown headings and code formatting', () => {
    const input = [
      '# Title',
      '```',
      'Subject: Weekly Report',
      '```',
      'Use `inline code` in text.',
    ].join('\n');

    const output = normalizeEmailPlainText(input);
    expect(output).toBe(['Title', 'Subject: Weekly Report', '', 'Use inline code in text.'].join('\n'));
  });

  it('handles empty input', () => {
    expect(normalizeEmailPlainText('')).toBe('');
  });

  it('handles large content volumes without leaving markdown markers', () => {
    const lines: string[] = ['Subject: Weekly Report'];
    for (let i = 0; i < 1500; i++) {
      lines.push(`* **Item ${i}**: Something happened with **details**.`);
    }
    const input = lines.join('\n');
    const output = normalizeEmailPlainText(input);
    expect(output).not.toMatch(/\*\*/);
    expect(output.split('\n').length).toBeGreaterThan(1000);
  });
});
