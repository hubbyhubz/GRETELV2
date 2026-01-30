import type { OKRKeyResultRow, OKRObjectiveRow } from '../okrTypes';

export type ObjectiveWithKrs = OKRObjectiveRow & { krs: OKRKeyResultRow[]; progress01: number };

export const isMissingTableError = (error: any) => {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('could not find the table') || msg.includes('schema cache') || (msg.includes('relation') && msg.includes('does not exist'));
};

export const isMissingColumnError = (error: any) => {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('column') && msg.includes('does not exist');
};
