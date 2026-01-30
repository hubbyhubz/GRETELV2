import type { OKRCheckinFrequency, OKRKeyResultRow } from './okrTypes';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const safeDiv = (num: number, den: number) => {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  return num / den;
};

export function computeKrProgress(kr: OKRKeyResultRow): number {
  const start = Number(kr.start_value);
  const target = Number(kr.target_value);
  const current = Number(kr.current_value);

  if (![start, target, current].every(Number.isFinite)) return 0;

  if (kr.direction === 'increase_to') {
    return clamp01(safeDiv(current - start, target - start));
  }

  if (kr.direction === 'decrease_to') {
    return clamp01(safeDiv(start - current, start - target));
  }

  if (kr.direction === 'complete') {
    const denom = target === 0 ? 1 : target;
    return clamp01(safeDiv(current, denom));
  }

  const denom = Math.max(1, Math.abs(target));
  return clamp01(1 - Math.abs(current - target) / denom);
}

export function computeObjectiveProgress(krs: OKRKeyResultRow[]): number {
  if (!krs.length) return 0;
  const weights = krs.map((kr) => (Number.isFinite(Number(kr.weight)) ? Number(kr.weight) : 1));
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return 0;
  const score = krs.reduce((sum, kr, i) => sum + computeKrProgress(kr) * Math.max(0, weights[i]), 0);
  return clamp01(score / total);
}

const toYmdLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export function isCheckinDue(params: { frequency: OKRCheckinFrequency; lastCheckinAt?: string | null; now: Date }): boolean {
  const { frequency, lastCheckinAt, now } = params;
  if (!lastCheckinAt) return true;

  const last = new Date(lastCheckinAt);
  if (Number.isNaN(last.getTime())) return true;

  if (frequency === 'daily') {
    return toYmdLocal(last) !== toYmdLocal(now);
  }

  const diffMs = now.getTime() - last.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 7;
}

export function formatPercent(value01: number): string {
  const v = Math.round(clamp01(value01) * 100);
  return `${v}%`;
}

