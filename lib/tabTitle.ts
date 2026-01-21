export type GretelTabKey = 'login' | 'setup' | 'dashboard' | 'settings';

const TITLE_PREFIX = 'G.R.E.T.E.L';

export const TAB_TITLE_MAP: Record<GretelTabKey, string> = {
  login: `${TITLE_PREFIX} Login`,
  setup: `${TITLE_PREFIX} Setup`,
  dashboard: `${TITLE_PREFIX} Dashboard`,
  settings: `${TITLE_PREFIX} Settings`,
};

export function resolveTabTitle(key: string | undefined): string {
  if (key && key in TAB_TITLE_MAP) {
    return TAB_TITLE_MAP[key as GretelTabKey];
  }
  if (key) {
    console.warn(`[tabTitle] Unrecognized route key: ${key}`);
  } else {
    console.warn('[tabTitle] Missing route key');
  }
  return TITLE_PREFIX;
}

export function applyTabTitle(key: string | undefined): string {
  const title = resolveTabTitle(key);
  if (typeof document !== 'undefined') {
    document.title = title;
  }
  return title;
}

export function getTabKeyFromTopLevelView(view: string | undefined): GretelTabKey | undefined {
  switch (view) {
    case 'login':
    case 'createAccount':
    case 'forgotPassword':
    case 'resetPassword':
    case 'twoFactor':
      return 'login';
    case 'setupWizard':
      return 'setup';
    case 'dashboard':
      return 'dashboard';
    default:
      return undefined;
  }
}

export function getTabKeyFromDashboardContextView(view: string | undefined): GretelTabKey {
  return view === 'settings' ? 'settings' : 'dashboard';
}

