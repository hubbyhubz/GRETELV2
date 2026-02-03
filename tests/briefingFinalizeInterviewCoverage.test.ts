import { describe, expect, it } from 'vitest';
import { deriveAfternoonInterviewCoverage } from '../lib/briefingFinalizeInterviewCoverage';

describe('briefingFinalizeInterviewCoverage', () => {
  it('extracts afternoon interview coverage bullets with key detail sentences', () => {
    const notes = `AFTERNOON BRIEFING - CONSOLIDATED NOTES - Tuesday, February 3, 2026

1. INTERVIEW ANSWERS:
Q1: What progress was made against today’s plan?
A1: Progress: The OPEQ Master Spreadsheet is 100% complete and verified. I am ready for the meeting with Chef Andrew tomorrow. Delegated Task Status:
Paulino Ramirez (Trigger Sprayer): OPEN. Paulino has not yet returned with the collected sprayers. I need to radio him immediately to close this loop before the shift ends.
Justine (Rubik's Cube): Issue addressed. No recurrences seen this afternoon.
Test Event Setup: Mark confirms the staging area is set. We are 15 minutes ahead of schedule

Q2: Any incidents, constraints, or blockers the next shift must know?
A2: "Constraint: The Clean Towel Supply is holding steady, but we have zero buffer stock. Evening shift must be extremely disciplined with usage. Incident: A minor spill in the chemical store during Rico's audit. It was cleaned up properly, but check the floor for slick spots."

Q3: What handoff items must be completed before end of shift?
A3: "Mandatory: The Evening Shift Leader must sign off on the Dishwasher Temperature Log every hour. If the Banquet machine fluctuates again, switch to manual sanitizing immediately. Task: Ensure the Enye Digital Handover is completed at 10:45 PM. I will be checking the timestamp."

Q4: What should be prioritized first tomorrow morning?
A4: "First Priority: OPEQ Budget Meeting Prep. I need all supporting documents printed and organized by 2:00 PM. Operational: Monitor the Chemical Delivery. Since we audited today, the new stock arriving tomorrow must be logged accurately."

2. COACHING NOTES:
- (none)
`;

    const coverage = deriveAfternoonInterviewCoverage(notes);
    const ops = coverage.ops.join('\n');
    const risks = coverage.risks.join('\n');

    expect(ops).toContain('Chef Andrew');
    expect(ops).toMatch(/radio him immediately/i);
    expect(ops).toMatch(/has not yet returned with the collected sprayers/i);
    expect(ops).toContain("Justine (Rubik's Cube): Issue addressed.");
    expect(ops).toMatch(/15\s+minutes\s+ahead/i);
    expect(ops).toMatch(/printed and organized by 2:00 PM/i);
    expect(ops).toMatch(/logged accurately/i);

    expect(risks).toMatch(/Constraint:\s+The Clean Towel Supply/i);
    expect(risks).toMatch(/Evening shift must be extremely disciplined with usage/i);
    expect(risks).toMatch(/Incident:\s+A minor spill/i);
    expect(risks).toMatch(/switch to manual sanitizing/i);
  });
});
