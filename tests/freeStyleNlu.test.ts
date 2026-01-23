import { describe, expect, it } from 'vitest';
import { bestFuzzyMatch, inferFinalizePlan, inferFreeStyle, normalizeText } from '../components/freeStyleNlu';

describe('freeStyleNlu', () => {
  it('normalizeText lowercases and removes punctuation noise', () => {
    expect(normalizeText("Please—Finalize!  ")).toBe('please-finalize');
  });

  it('inferFinalizePlan accepts free-form confirmations', () => {
    expect(inferFinalizePlan('Looks good, finalize the plan.')).toBe(true);
    expect(inferFinalizePlan('ok proceed')).toBe(true);
    expect(inferFinalizePlan('go ahead and lock it in')).toBe(true);
    expect(inferFinalizePlan("don't finalize yet")).toBe(false);
  });

  it('bestFuzzyMatch finds approximate matches', () => {
    const candidates = [{ id: 'e1', name: 'POWOW' }, { id: 'e2', name: 'Training Room Setup' }];
    const match = bestFuzzyMatch('powow already done', candidates);
    expect(match).not.toBeNull();
    expect(match?.item.id).toBe('e1');
    expect(match?.score).toBeGreaterThanOrEqual(0.45);
  });

  it('inferFreeStyle detects exclusion of an Event Ops item by name', () => {
    const res = inferFreeStyle({
      messageText: "please block the schedule don't include the POWOW because its already done",
      pendingScheduleClarification: true,
      eventOpsItems: [{ id: 'e1', name: 'POWOW' }],
      scheduleItems: [],
      reminders: [],
    });
    expect(res.intent).toBe('exclude_item');
    expect(res.entities.length).toBeGreaterThan(0);
    expect(res.entities[0].kind).toBe('event_ops_item');
    expect(res.entities[0].id).toBe('e1');
  });

  it('inferFreeStyle detects proceed intent from informal confirmations', () => {
    const res = inferFreeStyle({
      messageText: "No worries about this its already set up so we can proceed on creating my schedule",
      pendingScheduleClarification: false,
      eventOpsItems: [],
      scheduleItems: [],
      reminders: [],
    });
    expect(res.intent).toBe('proceed');
    expect(res.confidence).toBeGreaterThanOrEqual(0.6);
  });
});

