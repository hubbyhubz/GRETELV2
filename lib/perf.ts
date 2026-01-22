type PerfName =
  | 'boot:start'
  | 'boot:react-render'
  | 'boot:app-mounted'
  | 'login:view-mounted'
  | 'login:submit'
  | 'login:auth-success'
  | 'login:auth-error'
  | 'profile:load-start'
  | 'profile:load-success'
  | 'profile:load-error';

const isPerfEnabled = () => {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('perf') === '1') return true;
    return window.localStorage.getItem('gretel_perf') === '1';
  } catch {
    return false;
  }
};

export const perfMark = (name: PerfName) => {
  if (!isPerfEnabled()) return;
  try {
    performance.mark(name);
  } catch {
    return;
  }
};

export const perfMeasure = (name: string, start: PerfName, end: PerfName) => {
  if (!isPerfEnabled()) return;
  try {
    const entry = performance.measure(name, start, end);
    if (typeof entry.duration === 'number') {
      console.log(`[perf] ${name}: ${Math.round(entry.duration)}ms`);
    }
  } catch {
    return;
  }
};

