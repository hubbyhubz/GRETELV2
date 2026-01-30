export function Pill({ label, tone }: { label: string; tone: 'primary' | 'success' | 'warn' | 'danger' | 'neutral' }) {
  const cls =
    tone === 'primary'
      ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-200 border-primary-200/70 dark:border-primary-800/40'
      : tone === 'success'
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200 border-emerald-200/70 dark:border-emerald-800/40'
        : tone === 'warn'
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200 border-amber-200/70 dark:border-amber-800/40'
          : tone === 'danger'
            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200 border-rose-200/70 dark:border-rose-800/40'
            : 'bg-gray-50 text-gray-700 dark:bg-gray-900/60 dark:text-gray-200 border-gray-200/70 dark:border-gray-700/50';

  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export function ProgressBar({ value01 }: { value01: number }) {
  const w = `${Math.round(Math.max(0, Math.min(1, value01)) * 100)}%`;
  return (
    <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
      <div className="h-full rounded-full bg-primary-600" style={{ width: w }} />
    </div>
  );
}
